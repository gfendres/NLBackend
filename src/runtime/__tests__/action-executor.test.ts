import { describe, test, expect } from "bun:test";
import { resolveValue, type ExecutionContext } from "../action-executor.ts";

describe("resolveValue", () => {
  const context: ExecutionContext = {
    input: { title: "Pasta", count: 5, active: true },
    vars: {
      record: { id: "abc", name: "Test", nested: { val: 42 } },
      list: [1, 2, 3],
    },
    user: { id: "user-1", role: "editor" },
  };

  test("resolves input references", () => {
    expect(resolveValue("input.title", context)).toBe("Pasta");
    expect(resolveValue("input.count", context)).toBe(5);
    expect(resolveValue("input.active", context)).toBe(true);
    expect(resolveValue("input.missing", context)).toBeUndefined();
  });

  test("resolves context variable references", () => {
    expect(resolveValue("context.record", context)).toEqual({
      id: "abc",
      name: "Test",
      nested: { val: 42 },
    });
  });

  test("resolves nested context references", () => {
    expect(resolveValue("context.record.id", context)).toBe("abc");
    expect(resolveValue("context.record.name", context)).toBe("Test");
    expect(resolveValue("context.record.nested.val", context)).toBe(42);
  });

  test("resolves user references", () => {
    expect(resolveValue("user.id", context)).toBe("user-1");
    expect(resolveValue("user.role", context)).toBe("editor");
  });

  test("resolves literal strings", () => {
    expect(resolveValue("hello", context)).toBe("hello");
  });

  test("resolves literal numbers", () => {
    expect(resolveValue("42", context)).toBe(42);
    expect(resolveValue("3.14", context)).toBe(3.14);
  });

  test("resolves literal booleans", () => {
    expect(resolveValue("true", context)).toBe(true);
    expect(resolveValue("false", context)).toBe(false);
  });

  test("resolves null", () => {
    expect(resolveValue("null", context)).toBeNull();
  });

  test("passes through non-string types", () => {
    expect(resolveValue(42, context)).toBe(42);
    expect(resolveValue(true, context)).toBe(true);
    expect(resolveValue(null, context)).toBeNull();
    expect(resolveValue(undefined, context)).toBeUndefined();
  });
});
