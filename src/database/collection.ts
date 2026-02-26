/**
 * Collection — handles CRUD operations for a single entity type.
 * Uses atomic file rename for writes and in-memory indexes for queries.
 */

import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import type {
  Record,
  QueryOptions,
  PaginationMeta,
} from "../types/database.ts";
import type { CompiledSchema } from "../types/schema.ts";
import type { CollectionLock } from "./lock.ts";
import type { WriteAheadLog } from "./wal.ts";
import type { IndexManager } from "./index-manager.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListResult {
  data: Record[];
  pagination: PaginationMeta;
}

export class Collection {
  readonly name: string;
  private dir: string;
  private schema: CompiledSchema;
  private lock: CollectionLock;
  private wal: WriteAheadLog;
  private indexManager: IndexManager;

  constructor(
    name: string,
    dbPath: string,
    schema: CompiledSchema,
    lock: CollectionLock,
    wal: WriteAheadLog,
    indexManager: IndexManager,
  ) {
    this.name = name;
    this.dir = join(dbPath, name);
    this.schema = schema;
    this.lock = lock;
    this.wal = wal;
    this.indexManager = indexManager;
  }

  /** Ensure the collection directory exists */
  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.indexManager.buildForCollection(
      this.dir,
      this.name,
      this.schema,
    );
  }

  /** Create a new record */
  async create(data: { [key: string]: unknown }): Promise<Record> {
    const ownerId = crypto.randomUUID();

    try {
      await this.lock.acquire(this.name, ownerId);

      const record = this.buildRecord(data);
      const filename = `${this.name.slice(0, -1)}-${record._id}.json`;

      // Check uniqueness constraints
      await this.enforceUniqueness(record);

      // WAL first
      await this.wal.log("create", this.name, record._id, null, record);

      // Atomic write: temp file → rename
      await this.atomicWrite(filename, record);

      // Update in-memory indexes
      this.indexManager.onRecordCreated(this.name, record);

      return record;
    } finally {
      this.lock.release(this.name, ownerId);
    }
  }

  /** Read a single record by ID */
  async read(id: string): Promise<Record | null> {
    try {
      const filename = this.findRecordFile(id);
      const content = await readFile(join(this.dir, filename), "utf-8");
      const record = JSON.parse(content) as Record;
      return this.applySchemaEvolution(record);
    } catch {
      return null;
    }
  }

  /** List records with filtering, sorting, and pagination */
  async list(options: QueryOptions = {}): Promise<ListResult> {
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = options.offset ?? 0;

    let records = await this.getAllRecords();

    // Apply filters
    if (options.filters) {
      records = this.applyFilters(records, options.filters);
    }

    const total = records.length;

    // Apply sorting
    if (options.sort_by) {
      records = this.applySort(
        records,
        options.sort_by,
        options.sort_order ?? "asc",
      );
    }

    // Apply pagination
    const paginated = records.slice(offset, offset + limit);

    return {
      data: paginated,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + limit < total,
      },
    };
  }

  /** Update an existing record */
  async update(
    id: string,
    data: { [key: string]: unknown },
  ): Promise<Record | null> {
    const ownerId = crypto.randomUUID();

    try {
      await this.lock.acquire(this.name, ownerId);

      const existing = await this.read(id);
      if (!existing) return null;

      const updated = this.applyUpdate(existing, data);

      // Check uniqueness constraints (excluding self)
      await this.enforceUniqueness(updated, id);

      // WAL first
      await this.wal.log("update", this.name, id, existing, updated);

      // Atomic write
      const filename = this.findRecordFile(id);
      await this.atomicWrite(filename, updated);

      // Update indexes
      this.indexManager.onRecordUpdated(this.name, existing, updated);

      return updated;
    } finally {
      this.lock.release(this.name, ownerId);
    }
  }

  /** Delete a record by ID */
  async delete(id: string): Promise<boolean> {
    const ownerId = crypto.randomUUID();

    try {
      await this.lock.acquire(this.name, ownerId);

      const existing = await this.read(id);
      if (!existing) return false;

      // WAL first
      await this.wal.log("delete", this.name, id, existing, null);

      const filename = this.findRecordFile(id);
      await unlink(join(this.dir, filename));

      // Update indexes
      this.indexManager.onRecordDeleted(this.name, existing);

      return true;
    } finally {
      this.lock.release(this.name, ownerId);
    }
  }

  // --- Private helpers ---

  /** Build a new record with system fields and auto-generated values */
  private buildRecord(data: { [key: string]: unknown }): Record {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const record: Record = {
      _id: id,
      _created_at: now,
      _updated_at: now,
      _version: 1,
    };

    // Apply schema field defaults and auto-values
    for (const field of this.schema.fields) {
      if (field.auto === "uuid") {
        record[field.name] = id;
      } else if (field.auto === "timestamp") {
        record[field.name] = now;
      } else if (field.name in data) {
        record[field.name] = data[field.name];
      } else if (field.default !== undefined) {
        record[field.name] = field.default;
      }
    }

    return record;
  }

  /** Apply an update, respecting immutable fields */
  private applyUpdate(
    existing: Record,
    data: { [key: string]: unknown },
  ): Record {
    const updated = { ...existing };
    const immutableFields = new Set(
      this.schema.fields.filter((f) => f.immutable).map((f) => f.name),
    );

    for (const [key, value] of Object.entries(data)) {
      if (immutableFields.has(key)) continue;
      if (key.startsWith("_")) continue; // System fields are immutable
      updated[key] = value;
    }

    updated._updated_at = new Date().toISOString();
    updated._version = (existing._version ?? 0) + 1;

    // Update auto-timestamp fields marked "on change"
    for (const field of this.schema.fields) {
      if (field.auto === "timestamp" && !field.immutable) {
        updated[field.name] = updated._updated_at;
      }
    }

    return updated;
  }

  /** Lazy schema evolution: patch record to match current schema on read */
  private applySchemaEvolution(record: Record): Record {
    for (const field of this.schema.fields) {
      if (!(field.name in record)) {
        record[field.name] = field.default ?? null;
      }
    }
    return record;
  }

  /** Write a record atomically using temp file + rename */
  private async atomicWrite(filename: string, record: Record): Promise<void> {
    const tempPath = join(this.dir, `${filename}.tmp`);
    const finalPath = join(this.dir, filename);

    await writeFile(tempPath, JSON.stringify(record, null, 2));
    await rename(tempPath, finalPath);
  }

  /** Find the filename for a record ID */
  private findRecordFile(id: string): string {
    // Convention: {singular-entity}-{id}.json
    // But the ID is a UUID, so we search by _id in filename
    const prefix = this.name.slice(0, -1); // singular form (naive: drop trailing 's')
    return `${prefix}-${id}.json`;
  }

  /** Read all records from disk */
  private async getAllRecords(): Promise<Record[]> {
    try {
      const files = await readdir(this.dir);
      const recordFiles = files.filter(
        (f) => f.endsWith(".json") && !f.startsWith("_"),
      );

      const records: Record[] = [];
      for (const file of recordFiles) {
        const content = await readFile(join(this.dir, file), "utf-8");
        const record = this.applySchemaEvolution(
          JSON.parse(content) as Record,
        );
        records.push(record);
      }
      return records;
    } catch {
      return [];
    }
  }

  /** Filter records based on query filters, using indexes when available */
  private applyFilters(
    records: Record[],
    filters: { [field: string]: unknown },
  ): Record[] {
    // Try to use indexes for the first filter to narrow the candidate set
    for (const [field, value] of Object.entries(filters)) {
      const indexed = this.indexManager.lookup(this.name, field, value);
      if (indexed !== null) {
        const idSet = new Set(indexed);
        records = records.filter((r) => idSet.has(r._id));
        // Remove this filter from further processing
        const remaining = { ...filters };
        delete remaining[field];
        if (Object.keys(remaining).length === 0) return records;
        return this.linearFilter(records, remaining);
      }
    }

    // Fall back to linear scan
    return this.linearFilter(records, filters);
  }

  /** Linear scan filter */
  private linearFilter(
    records: Record[],
    filters: { [field: string]: unknown },
  ): Record[] {
    return records.filter((record) =>
      Object.entries(filters).every(
        ([field, value]) => record[field] === value,
      ),
    );
  }

  /** Sort records by a field */
  private applySort(
    records: Record[],
    sortBy: string,
    order: "asc" | "desc",
  ): Record[] {
    return [...records].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];

      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return order === "asc" ? comparison : -comparison;
    });
  }

  /** Check uniqueness constraints against existing records */
  private async enforceUniqueness(
    record: Record,
    excludeId?: string,
  ): Promise<void> {
    const uniqueFields = this.schema.fields.filter((f) => f.unique);
    if (uniqueFields.length === 0) return;

    const allRecords = await this.getAllRecords();

    for (const field of uniqueFields) {
      const value = record[field.name];
      if (value === undefined || value === null) continue;

      const conflict = allRecords.find(
        (r) => r[field.name] === value && r._id !== excludeId,
      );

      if (conflict) {
        throw new UniqueConstraintError(field.name, value);
      }
    }
  }
}

export class UniqueConstraintError extends Error {
  readonly field: string;
  readonly value: unknown;

  constructor(field: string, value: unknown) {
    super(
      `Unique constraint violation: field "${field}" with value "${String(value)}" already exists`,
    );
    this.name = "UniqueConstraintError";
    this.field = field;
    this.value = value;
  }
}
