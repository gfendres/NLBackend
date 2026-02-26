import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseEngine } from "../engine.ts";
import { compileSchema } from "../../compiler/schema-compiler.ts";

const TASK_SCHEMA_MD = `# Task

A simple task item.

## Fields

- **id**: auto uuid, immutable
- **title**: required string, min 1, max 200
- **done**: optional boolean, default false
- **priority**: optional enum ("low", "medium", "high"), default "medium"
- **created_at**: auto timestamp, immutable
- **updated_at**: auto timestamp on change

## Relationships
`;

let testDir: string;
let db: DatabaseEngine;

beforeEach(async () => {
  testDir = join(tmpdir(), `nlbackend-test-${crypto.randomUUID()}`);
  await mkdir(testDir, { recursive: true });

  const schema = compileSchema(TASK_SCHEMA_MD, "schema/task.md");
  const schemas = new Map([["task", schema]]);

  db = new DatabaseEngine(testDir);
  await db.init(schemas);
});

afterEach(async () => {
  await db.shutdown();
  await rm(testDir, { recursive: true, force: true });
});

describe("DatabaseEngine", () => {
  test("creates a record with auto-generated fields", async () => {
    const record = await db.create("tasks", { title: "Buy milk" });

    expect(record._id).toBeDefined();
    expect(record._created_at).toBeDefined();
    expect(record._version).toBe(1);
    expect(record.title).toBe("Buy milk");
    expect(record.done).toBe(false); // default value
    expect(record.priority).toBe("medium"); // default value
  });

  test("reads a record by ID", async () => {
    const created = await db.create("tasks", { title: "Read test" });
    const found = await db.read("tasks", created._id);

    expect(found).not.toBeNull();
    expect(found!.title).toBe("Read test");
    expect(found!._id).toBe(created._id);
  });

  test("returns null for non-existent record", async () => {
    const found = await db.read("tasks", "non-existent-id");
    expect(found).toBeNull();
  });

  test("lists all records with pagination", async () => {
    await db.create("tasks", { title: "Task 1" });
    await db.create("tasks", { title: "Task 2" });
    await db.create("tasks", { title: "Task 3" });

    const result = await db.list("tasks", { limit: 2 });

    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.has_more).toBe(true);
  });

  test("filters records", async () => {
    await db.create("tasks", { title: "A", priority: "high" });
    await db.create("tasks", { title: "B", priority: "low" });
    await db.create("tasks", { title: "C", priority: "high" });

    const result = await db.list("tasks", {
      filters: { priority: "high" },
    });

    expect(result.data).toHaveLength(2);
    expect(result.data.every((r) => r.priority === "high")).toBe(true);
  });

  test("sorts records", async () => {
    await db.create("tasks", { title: "Banana" });
    await db.create("tasks", { title: "Apple" });
    await db.create("tasks", { title: "Cherry" });

    const result = await db.list("tasks", {
      sort_by: "title",
      sort_order: "asc",
    });

    expect(result.data.map((r) => r.title)).toEqual([
      "Apple",
      "Banana",
      "Cherry",
    ]);
  });

  test("updates a record, respecting immutable fields", async () => {
    const created = await db.create("tasks", { title: "Original" });
    const updated = await db.update("tasks", created._id, {
      title: "Updated",
      done: true,
      id: "should-be-ignored", // immutable
    });

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Updated");
    expect(updated!.done).toBe(true);
    expect(updated!._version).toBe(2);
    expect(updated!.id).toBe(created.id); // immutable, unchanged
  });

  test("deletes a record", async () => {
    const created = await db.create("tasks", { title: "To delete" });
    const deleted = await db.delete("tasks", created._id);

    expect(deleted).toBe(true);

    const found = await db.read("tasks", created._id);
    expect(found).toBeNull();
  });

  test("delete returns false for non-existent record", async () => {
    const deleted = await db.delete("tasks", "non-existent");
    expect(deleted).toBe(false);
  });

  test("throws on unknown collection", () => {
    expect(db.create("nonexistent", {})).rejects.toThrow("not found");
  });
});
