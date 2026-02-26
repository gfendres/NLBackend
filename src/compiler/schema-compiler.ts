/**
 * Schema compiler — the main entry point that compiles a schema markdown file
 * into a CompiledSchema JSON definition. This is fully rule-based (no LLM).
 */

import type { CompiledSchema } from "../types/schema.ts";
import { parseSchemaMarkdown } from "./schema-parser.ts";
import { parseField } from "./field-parser.ts";
import { parseRelationships } from "./relationship-parser.ts";

/** Compile a schema markdown string into a CompiledSchema */
export function compileSchema(
  content: string,
  sourcePath: string,
): CompiledSchema {
  const raw = parseSchemaMarkdown(content);

  const fields = raw.rawFields.map(parseField);
  const relationships = parseRelationships(raw.rawRelationships);

  // Auto-index reference fields (foreign keys)
  for (const field of fields) {
    if (field.type === "reference" && !field.indexed) {
      field.indexed = true;
    }
  }

  return {
    entity: raw.entityName,
    description: raw.description,
    fields,
    relationships,
    sourcePath,
  };
}
