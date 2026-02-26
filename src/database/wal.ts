/**
 * Write-ahead log — append-only log of all database write operations.
 * Entries are written BEFORE the actual database mutation.
 */

import { mkdir, writeFile, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { WalEntry, Record } from "../types/database.ts";
import type { DbOperation } from "../types/database.ts";

const DEFAULT_RETENTION_DAYS = 30;

export class WriteAheadLog {
  private logDir: string;
  private retentionDays: number;

  constructor(dbPath: string, retentionDays = DEFAULT_RETENTION_DAYS) {
    this.logDir = join(dbPath, "_log");
    this.retentionDays = retentionDays;
  }

  /** Ensure the log directory exists */
  async init(): Promise<void> {
    await mkdir(this.logDir, { recursive: true });
  }

  /** Write a log entry before performing a mutation */
  async log(
    operation: DbOperation,
    collection: string,
    recordId: string,
    previousState: Record | null,
    newState: Record | null,
  ): Promise<string> {
    const operationId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const entry: WalEntry = {
      operation_id: operationId,
      operation,
      collection,
      record_id: recordId,
      previous_state: previousState,
      new_state: newState,
      timestamp,
    };

    const filename = `${timestamp.replace(/[:.]/g, "-")}-${operation}-${collection}-${recordId}.json`;
    await writeFile(
      join(this.logDir, filename),
      JSON.stringify(entry, null, 2),
    );

    return operationId;
  }

  /** Read all log entries (for debugging/recovery) */
  async readAll(): Promise<WalEntry[]> {
    try {
      const files = await readdir(this.logDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();

      const entries: WalEntry[] = [];
      for (const file of jsonFiles) {
        const content = await readFile(join(this.logDir, file), "utf-8");
        entries.push(JSON.parse(content) as WalEntry);
      }
      return entries;
    } catch {
      return [];
    }
  }

  /** Archive log entries older than retention period */
  async cleanup(): Promise<number> {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    try {
      const files = await readdir(this.logDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const content = await readFile(join(this.logDir, file), "utf-8");
        const entry = JSON.parse(content) as WalEntry;
        const entryTime = new Date(entry.timestamp).getTime();

        if (entryTime < cutoff) {
          await unlink(join(this.logDir, file));
          removed++;
        }
      }
    } catch {
      // Log dir might not exist yet
    }

    return removed;
  }
}
