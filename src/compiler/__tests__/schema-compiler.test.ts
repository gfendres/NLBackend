import { describe, expect, test } from "bun:test";
import { compileSchema } from "../schema-compiler.ts";

const RECIPE_SCHEMA = `# Recipe

A recipe is a set of instructions for preparing a dish, submitted
by a registered user.

## Fields

- **id**: auto uuid, immutable
- **title**: required string, min 3, max 200
- **description**: optional string, max 2000
- **ingredients**: required array of objects, each with:
    - name (required string)
    - quantity (required string, e.g. "2 cups")
- **steps**: required array of strings, min 1 item
- **difficulty**: optional enum ("easy", "medium", "hard"), default "medium"
- **author_id**: required reference to User, indexed
- **tags**: optional array of strings
- **created_at**: auto timestamp, immutable
- **updated_at**: auto timestamp on change

## Relationships

- Belongs to a User (via author_id)
- Has many Reviews
- Has many Favorites (users who saved it)
`;

describe("compileSchema", () => {
  const schema = compileSchema(RECIPE_SCHEMA, "schema/recipe.md");

  test("extracts entity name", () => {
    expect(schema.entity).toBe("Recipe");
  });

  test("extracts description", () => {
    expect(schema.description).toContain(
      "set of instructions for preparing a dish",
    );
  });

  test("parses id field as auto uuid", () => {
    const id = schema.fields.find((f) => f.name === "id");
    expect(id).toBeDefined();
    expect(id!.type).toBe("uuid");
    expect(id!.auto).toBe("uuid");
    expect(id!.immutable).toBe(true);
    expect(id!.required).toBe(true);
  });

  test("parses title field with constraints", () => {
    const title = schema.fields.find((f) => f.name === "title");
    expect(title).toBeDefined();
    expect(title!.type).toBe("string");
    expect(title!.required).toBe(true);
    expect(title!.min).toBe(3);
    expect(title!.max).toBe(200);
  });

  test("parses optional description field", () => {
    const desc = schema.fields.find((f) => f.name === "description");
    expect(desc).toBeDefined();
    expect(desc!.required).toBe(false);
    expect(desc!.max).toBe(2000);
  });

  test("parses enum field with default", () => {
    const diff = schema.fields.find((f) => f.name === "difficulty");
    expect(diff).toBeDefined();
    expect(diff!.type).toBe("enum");
    expect(diff!.enumValues).toEqual(["easy", "medium", "hard"]);
    expect(diff!.default).toBe("medium");
  });

  test("parses reference field and auto-indexes it", () => {
    const ref = schema.fields.find((f) => f.name === "author_id");
    expect(ref).toBeDefined();
    expect(ref!.type).toBe("reference");
    expect(ref!.referenceTo).toBe("User");
    expect(ref!.indexed).toBe(true);
  });

  test("parses array field with sub-items", () => {
    const ingredients = schema.fields.find((f) => f.name === "ingredients");
    expect(ingredients).toBeDefined();
    expect(ingredients!.type).toBe("array");
    expect(ingredients!.required).toBe(true);
    expect(ingredients!.items).toBeDefined();
    expect(ingredients!.items!.length).toBe(2);
    expect(ingredients!.items![0]!.name).toBe("name");
    expect(ingredients!.items![1]!.name).toBe("quantity");
  });

  test("parses auto timestamp fields", () => {
    const created = schema.fields.find((f) => f.name === "created_at");
    expect(created).toBeDefined();
    expect(created!.auto).toBe("timestamp");
    expect(created!.type).toBe("date");
    expect(created!.immutable).toBe(true);
  });

  test("parses relationships", () => {
    expect(schema.relationships).toHaveLength(3);

    const belongsTo = schema.relationships.find(
      (r) => r.type === "belongs_to",
    );
    expect(belongsTo).toBeDefined();
    expect(belongsTo!.entity).toBe("User");
    expect(belongsTo!.via).toBe("author_id");

    const hasMany = schema.relationships.filter((r) => r.type === "has_many");
    expect(hasMany).toHaveLength(2);
    expect(hasMany.map((r) => r.entity)).toContain("Reviews");
    expect(hasMany.map((r) => r.entity)).toContain("Favorites");
  });

  test("stores source path", () => {
    expect(schema.sourcePath).toBe("schema/recipe.md");
  });
});

describe("compileSchema edge cases", () => {
  test("minimal schema with only required sections", () => {
    const minimal = `# Task

A simple task item.

## Fields

- **id**: auto uuid
- **title**: required string

## Relationships
`;
    const schema = compileSchema(minimal, "schema/task.md");
    expect(schema.entity).toBe("Task");
    expect(schema.fields).toHaveLength(2);
    expect(schema.relationships).toHaveLength(0);
  });

  test("throws on missing H1", () => {
    expect(() => compileSchema("No heading here", "test.md")).toThrow(
      "must have an H1 heading",
    );
  });
});
