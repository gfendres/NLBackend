/**
 * Lazy in-memory index manager.
 * Builds indexes on startup by scanning collection files.
 * Maintains indexes in-memory on writes.
 * Persists to _index.json periodically for warm-start.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CollectionIndexes,
  FieldIndex,
  PersistedIndex,
  Record,
} from "../types/database.ts";
import type { CompiledSchema, FieldDefinition } from "../types/schema.ts";

/** Fields that should be indexed based on schema */
function getIndexableFields(schema: CompiledSchema): string[] {
  return schema.fields
    .filter((f) => shouldIndex(f))
    .map((f) => f.name);
}

function shouldIndex(field: FieldDefinition): boolean {
  return field.indexed || field.type === "reference" || field.type === "enum" || field.type === "boolean";
}

export class IndexManager {
  /** collection name → field indexes */
  private indexes = new Map<string, CollectionIndexes>();
  /** collection name → record count */
  private counts = new Map<string, number>();
  /** collection name → last record ID */
  private lastIds = new Map<string, string | null>();

  /** Build indexes for a collection by scanning all record files */
  async buildForCollection(
    collectionDir: string,
    collectionName: string,
    schema: CompiledSchema,
  ): Promise<void> {
    const indexableFields = getIndexableFields(schema);
    if (indexableFields.length === 0) {
      this.indexes.set(collectionName, new Map());
      this.counts.set(collectionName, 0);
      return;
    }

    // Try loading persisted index first
    const loaded = await this.tryLoadPersisted(collectionDir, collectionName);
    if (loaded) {
      // Verify count matches actual file count
      const actualCount = await this.countRecordFiles(collectionDir);
      const persistedCount = this.counts.get(collectionName) ?? 0;
      if (actualCount === persistedCount) return; // Warm start
    }

    // Full rebuild
    const collectionIndexes: CollectionIndexes = new Map();
    for (const field of indexableFields) {
      collectionIndexes.set(field, new Map());
    }

    let count = 0;
    let lastId: string | null = null;

    try {
      const files = await readdir(collectionDir);
      const recordFiles = files.filter(
        (f) => f.endsWith(".json") && !f.startsWith("_"),
      );

      for (const file of recordFiles) {
        const content = await readFile(join(collectionDir, file), "utf-8");
        const record = JSON.parse(content) as Record;
        const recordId = record._id;

        for (const field of indexableFields) {
          const value = record[field];
          if (value === undefined || value === null) continue;

          const fieldIndex = collectionIndexes.get(field)!;
          const key = String(value);
          const existing = fieldIndex.get(key) ?? [];
          existing.push(recordId);
          fieldIndex.set(key, existing);
        }

        count++;
        lastId = recordId;
      }
    } catch {
      // Collection directory might not exist yet
    }

    this.indexes.set(collectionName, collectionIndexes);
    this.counts.set(collectionName, count);
    this.lastIds.set(collectionName, lastId);
  }

  /** Update indexes after a record is created */
  onRecordCreated(collection: string, record: Record): void {
    const collectionIndexes = this.indexes.get(collection);
    if (!collectionIndexes) return;

    for (const [field, fieldIndex] of collectionIndexes) {
      const value = record[field];
      if (value === undefined || value === null) continue;

      const key = String(value);
      const existing = fieldIndex.get(key) ?? [];
      existing.push(record._id);
      fieldIndex.set(key, existing);
    }

    this.counts.set(collection, (this.counts.get(collection) ?? 0) + 1);
    this.lastIds.set(collection, record._id);
  }

  /** Update indexes after a record is updated */
  onRecordUpdated(
    collection: string,
    oldRecord: Record,
    newRecord: Record,
  ): void {
    const collectionIndexes = this.indexes.get(collection);
    if (!collectionIndexes) return;

    for (const [field, fieldIndex] of collectionIndexes) {
      const oldValue = oldRecord[field];
      const newValue = newRecord[field];

      // Remove old index entry
      if (oldValue !== undefined && oldValue !== null) {
        const oldKey = String(oldValue);
        const existing = fieldIndex.get(oldKey);
        if (existing) {
          const filtered = existing.filter((id) => id !== oldRecord._id);
          if (filtered.length > 0) {
            fieldIndex.set(oldKey, filtered);
          } else {
            fieldIndex.delete(oldKey);
          }
        }
      }

      // Add new index entry
      if (newValue !== undefined && newValue !== null) {
        const newKey = String(newValue);
        const existing = fieldIndex.get(newKey) ?? [];
        existing.push(newRecord._id);
        fieldIndex.set(newKey, existing);
      }
    }
  }

  /** Update indexes after a record is deleted */
  onRecordDeleted(collection: string, record: Record): void {
    const collectionIndexes = this.indexes.get(collection);
    if (!collectionIndexes) return;

    for (const [field, fieldIndex] of collectionIndexes) {
      const value = record[field];
      if (value === undefined || value === null) continue;

      const key = String(value);
      const existing = fieldIndex.get(key);
      if (existing) {
        const filtered = existing.filter((id) => id !== record._id);
        if (filtered.length > 0) {
          fieldIndex.set(key, filtered);
        } else {
          fieldIndex.delete(key);
        }
      }
    }

    const count = (this.counts.get(collection) ?? 1) - 1;
    this.counts.set(collection, Math.max(0, count));
  }

  /** Look up record IDs by an indexed field value */
  lookup(collection: string, field: string, value: unknown): string[] | null {
    const collectionIndexes = this.indexes.get(collection);
    if (!collectionIndexes) return null;

    const fieldIndex = collectionIndexes.get(field);
    if (!fieldIndex) return null; // Field is not indexed

    return fieldIndex.get(String(value)) ?? [];
  }

  /** Get collection record count */
  getCount(collection: string): number {
    return this.counts.get(collection) ?? 0;
  }

  /** Persist indexes to _index.json for warm-start */
  async persist(collectionDir: string, collectionName: string): Promise<void> {
    const collectionIndexes = this.indexes.get(collectionName);
    if (!collectionIndexes) return;

    const persisted: PersistedIndex = {
      count: this.counts.get(collectionName) ?? 0,
      last_id: this.lastIds.get(collectionName) ?? null,
      indexes: {},
    };

    for (const [field, fieldIndex] of collectionIndexes) {
      persisted.indexes[field] = {};
      for (const [value, ids] of fieldIndex) {
        persisted.indexes[field]![value] = ids;
      }
    }

    await writeFile(
      join(collectionDir, "_index.json"),
      JSON.stringify(persisted, null, 2),
    );
  }

  /** Try loading a persisted index file */
  private async tryLoadPersisted(
    collectionDir: string,
    collectionName: string,
  ): Promise<boolean> {
    try {
      const content = await readFile(
        join(collectionDir, "_index.json"),
        "utf-8",
      );
      const persisted = JSON.parse(content) as PersistedIndex;

      const collectionIndexes: CollectionIndexes = new Map();
      for (const [field, values] of Object.entries(persisted.indexes)) {
        const fieldIndex: FieldIndex = new Map();
        for (const [value, ids] of Object.entries(values)) {
          fieldIndex.set(value, ids);
        }
        collectionIndexes.set(field, fieldIndex);
      }

      this.indexes.set(collectionName, collectionIndexes);
      this.counts.set(collectionName, persisted.count);
      this.lastIds.set(collectionName, persisted.last_id);
      return true;
    } catch {
      return false;
    }
  }

  /** Count actual record files in a collection directory */
  private async countRecordFiles(collectionDir: string): Promise<number> {
    try {
      const files = await readdir(collectionDir);
      return files.filter(
        (f) => f.endsWith(".json") && !f.startsWith("_"),
      ).length;
    } catch {
      return 0;
    }
  }
}
