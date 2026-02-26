/**
 * Database engine — the main facade for all database operations.
 * Manages collections, locks, WAL, and indexes.
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CompiledSchema } from "../types/schema.ts";
import type { QueryOptions } from "../types/database.ts";
import { Collection, type ListResult } from "./collection.ts";
import { CollectionLock } from "./lock.ts";
import { WriteAheadLog } from "./wal.ts";
import { IndexManager } from "./index-manager.ts";
import type { Record } from "../types/database.ts";

const INDEX_PERSIST_INTERVAL_MS = 30_000;

interface DatabaseMeta {
  created_at: string;
  version: number;
}

export class DatabaseEngine {
  private dbPath: string;
  private collections = new Map<string, Collection>();
  private lock = new CollectionLock();
  private wal: WriteAheadLog;
  private indexManager = new IndexManager();
  private persistTimer: ReturnType<typeof setInterval> | null = null;

  constructor(projectPath: string) {
    this.dbPath = join(projectPath, "db");
    this.wal = new WriteAheadLog(this.dbPath);
  }

  /** Initialize the database: ensure dirs exist, load metadata, build indexes */
  async init(schemas: Map<string, CompiledSchema>): Promise<void> {
    await mkdir(this.dbPath, { recursive: true });
    await this.wal.init();
    await this.ensureMeta();

    // Initialize a Collection for each schema
    for (const [name, schema] of schemas) {
      const pluralName = this.pluralize(name);
      const collection = new Collection(
        pluralName,
        this.dbPath,
        schema,
        this.lock,
        this.wal,
        this.indexManager,
      );
      await collection.init();
      this.collections.set(pluralName, collection);
    }

    // Start periodic index persistence
    this.startIndexPersistence();
  }

  /** Get a collection by name */
  getCollection(name: string): Collection | undefined {
    return this.collections.get(name);
  }

  /** List all collection names */
  getCollectionNames(): string[] {
    return Array.from(this.collections.keys());
  }

  /** Create a record in a collection */
  async create(
    collectionName: string,
    data: { [key: string]: unknown },
  ): Promise<Record> {
    const collection = this.requireCollection(collectionName);
    return collection.create(data);
  }

  /** Read a record by ID */
  async read(collectionName: string, id: string): Promise<Record | null> {
    const collection = this.requireCollection(collectionName);
    return collection.read(id);
  }

  /** List records with optional filtering, sorting, pagination */
  async list(
    collectionName: string,
    options?: QueryOptions,
  ): Promise<ListResult> {
    const collection = this.requireCollection(collectionName);
    return collection.list(options);
  }

  /** Update a record */
  async update(
    collectionName: string,
    id: string,
    data: { [key: string]: unknown },
  ): Promise<Record | null> {
    const collection = this.requireCollection(collectionName);
    return collection.update(id, data);
  }

  /** Delete a record */
  async delete(collectionName: string, id: string): Promise<boolean> {
    const collection = this.requireCollection(collectionName);
    return collection.delete(id);
  }

  /** Gracefully shut down: persist indexes, stop timers */
  async shutdown(): Promise<void> {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    await this.persistAllIndexes();
  }

  // --- Private helpers ---

  private requireCollection(name: string): Collection {
    const collection = this.collections.get(name);
    if (!collection) {
      throw new Error(
        `Collection "${name}" not found. Available: ${this.getCollectionNames().join(", ")}`,
      );
    }
    return collection;
  }

  private async ensureMeta(): Promise<void> {
    const metaPath = join(this.dbPath, "_meta.json");
    try {
      await readFile(metaPath, "utf-8");
    } catch {
      const meta: DatabaseMeta = {
        created_at: new Date().toISOString(),
        version: 1,
      };
      await writeFile(metaPath, JSON.stringify(meta, null, 2));
    }
  }

  /** Naive pluralization: add 's' if not already plural */
  private pluralize(name: string): string {
    const lower = name.toLowerCase();
    if (lower.endsWith("s")) return lower;
    if (lower.endsWith("y")) return lower.slice(0, -1) + "ies";
    return lower + "s";
  }

  private startIndexPersistence(): void {
    this.persistTimer = setInterval(async () => {
      await this.persistAllIndexes();
    }, INDEX_PERSIST_INTERVAL_MS);

    // Don't prevent process exit
    if (this.persistTimer.unref) {
      this.persistTimer.unref();
    }
  }

  private async persistAllIndexes(): Promise<void> {
    for (const [name] of this.collections) {
      try {
        await this.indexManager.persist(join(this.dbPath, name), name);
      } catch {
        // Non-fatal: index persistence is best-effort
      }
    }
  }
}
