import { describe, test, expect } from "bun:test";
import { parseAction } from "../action-parser.ts";

const SAMPLE_ACTION = `# Create Recipe

**Auth:** Authenticated
**Tier:** 1

## What it does

Creates a new recipe. The authenticated user is automatically set
as the author. Validates all fields against the Recipe schema.

## Input

- **title** (required): The recipe name
- **description** (optional): A short summary
- **ingredients** (required): Array of {name, quantity} objects
- **steps** (required): Array of instruction strings
- **difficulty** (optional): "easy", "medium", or "hard"
- **tags** (optional): Array of tag strings

## Output

Returns the full recipe object with generated id, author_id,
and timestamps.

## Errors

- **invalid_input**: Missing required fields or validation failures
- **not_authenticated**: No valid auth token provided
- **conflict**: A recipe with the same title by this author exists
`;

describe("parseAction", () => {
  const action = parseAction(SAMPLE_ACTION, "actions/recipes/create.md", "recipes", "create");

  test("extracts title", () => {
    expect(action.title).toBe("Create Recipe");
  });

  test("derives tool name from entity and operation", () => {
    expect(action.toolName).toBe("recipes_create");
  });

  test("parses auth requirement", () => {
    expect(action.auth.level).toBe("authenticated");
  });

  test("parses tier", () => {
    expect(action.tier).toBe(1);
  });

  test("extracts description", () => {
    expect(action.description).toContain("Creates a new recipe");
    expect(action.description).toContain("Recipe schema");
  });

  test("extracts input parameters", () => {
    expect(action.inputs).toHaveLength(6);

    const title = action.inputs.find((i) => i.name === "title");
    expect(title).toBeDefined();
    expect(title!.required).toBe(true);
    expect(title!.type).toBe("string");

    const description = action.inputs.find((i) => i.name === "description");
    expect(description).toBeDefined();
    expect(description!.required).toBe(false);

    const ingredients = action.inputs.find((i) => i.name === "ingredients");
    expect(ingredients).toBeDefined();
    expect(ingredients!.required).toBe(true);
    expect(ingredients!.type).toBe("array");
  });

  test("extracts output description", () => {
    expect(action.outputDescription).toContain("full recipe object");
  });

  test("extracts errors", () => {
    expect(action.errors).toHaveLength(3);

    const codes = action.errors.map((e) => e.code);
    expect(codes).toContain("invalid_input");
    expect(codes).toContain("not_authenticated");
    expect(codes).toContain("conflict");
  });

  test("stores entity and source path", () => {
    expect(action.entity).toBe("recipes");
    expect(action.sourcePath).toBe("actions/recipes/create.md");
  });
});

describe("parseAction edge cases", () => {
  test("defaults to tier 1 when no tier directive", () => {
    const action = parseAction("# Test\n## What it does\nDoes things.", "test.md", "tests", "do");
    expect(action.tier).toBe(1);
  });

  test("defaults to public auth when no auth directive", () => {
    const action = parseAction("# Test\n## What it does\nDoes things.", "test.md", "tests", "do");
    expect(action.auth.level).toBe("public");
  });

  test("respects tool name override", () => {
    const md = `# My Action\n**Tool:** custom_tool_name\n## What it does\nDoes things.`;
    const action = parseAction(md, "test.md", "things", "do");
    expect(action.toolName).toBe("custom_tool_name");
  });

  test("parses admin role auth", () => {
    const md = `# Admin Action\n**Auth:** Admin only\n## What it does\nAdmin stuff.`;
    const action = parseAction(md, "test.md", "admin", "action");
    expect(action.auth.level).toBe("role");
    expect(action.auth.role).toBe("admin");
  });

  test("handles tier 3", () => {
    const md = `# Smart Search\n**Tier:** 3\n## What it does\nInterprets queries.`;
    const action = parseAction(md, "test.md", "search", "smart");
    expect(action.tier).toBe(3);
  });
});
