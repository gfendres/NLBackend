import { describe, test, expect } from "bun:test";
import { parseTestFile } from "../test-parser.ts";

const SAMPLE_TEST_MD = `# Create Recipe Tests

## Successful creation
- Given an authenticated user with role "editor"
- When calling recipes_create with:
    - title: "Pasta Carbonara"
    - ingredients: [{name: "spaghetti", quantity: "400g"}]
    - steps: ["Boil pasta", "Mix eggs and cheese", "Combine"]
- Then response contains field "id"
- And response field "title" equals "Pasta Carbonara"

## Missing title
- Given an authenticated user
- When calling recipes_create with:
    - ingredients: [{name: "flour", quantity: "2 cups"}]
- Then error code is "invalid_input"
- And error message mentions "title"

## Not authenticated
- Given no authentication
- When calling recipes_create with valid data
- Then error code is "not_authenticated"
`;

describe("parseTestFile", () => {
  test("extracts file title", () => {
    const result = parseTestFile(SAMPLE_TEST_MD);
    expect(result.title).toBe("Create Recipe Tests");
  });

  test("parses all scenarios", () => {
    const result = parseTestFile(SAMPLE_TEST_MD);
    expect(result.scenarios).toHaveLength(3);
  });

  test("parses scenario names", () => {
    const result = parseTestFile(SAMPLE_TEST_MD);
    expect(result.scenarios[0]!.name).toBe("Successful creation");
    expect(result.scenarios[1]!.name).toBe("Missing title");
    expect(result.scenarios[2]!.name).toBe("Not authenticated");
  });

  test("parses Given clauses with auth", () => {
    const result = parseTestFile(SAMPLE_TEST_MD);
    const given = result.scenarios[0]!.given[0]!;
    expect(given.type).toBe("auth");
    expect(given.authenticated).toBe(true);
    expect(given.role).toBe("editor");
  });

  test("parses Given with no auth", () => {
    const result = parseTestFile(SAMPLE_TEST_MD);
    const given = result.scenarios[2]!.given[0]!;
    expect(given.type).toBe("auth");
    expect(given.authenticated).toBe(false);
  });

  test("parses When clause with tool name and arguments", () => {
    const result = parseTestFile(SAMPLE_TEST_MD);
    const when = result.scenarios[0]!.when!;
    expect(when.toolName).toBe("recipes_create");
    expect(when.arguments.title).toBe("Pasta Carbonara");
  });

  test("parses JSON array arguments", () => {
    const result = parseTestFile(SAMPLE_TEST_MD);
    const when = result.scenarios[0]!.when!;
    expect(Array.isArray(when.arguments.ingredients)).toBe(true);
    expect(Array.isArray(when.arguments.steps)).toBe(true);
  });

  test("parses Then contains field assertion", () => {
    const result = parseTestFile(SAMPLE_TEST_MD);
    const then = result.scenarios[0]!.then[0]!;
    expect(then.type).toBe("contains_field");
    expect(then.field).toBe("id");
  });

  test("parses Then field equals assertion", () => {
    const result = parseTestFile(SAMPLE_TEST_MD);
    const then = result.scenarios[0]!.then[1]!;
    expect(then.type).toBe("field_equals");
    expect(then.field).toBe("title");
    expect(then.value).toBe("Pasta Carbonara");
  });

  test("parses Then error code assertion", () => {
    const result = parseTestFile(SAMPLE_TEST_MD);
    const then = result.scenarios[1]!.then[0]!;
    expect(then.type).toBe("error_code");
    expect(then.errorCode).toBe("invalid_input");
  });

  test("parses Then error message assertion", () => {
    const result = parseTestFile(SAMPLE_TEST_MD);
    const then = result.scenarios[1]!.then[1]!;
    expect(then.type).toBe("error_message");
    expect(then.errorContains).toBe("title");
  });
});
