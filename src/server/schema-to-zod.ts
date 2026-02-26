/**
 * Converts a CompiledSchema's fields into Zod schemas for MCP tool input validation.
 */

import { z } from "zod/v4";
import type {
  CompiledSchema,
  FieldDefinition,
  FieldType,
} from "../types/schema.ts";

/** Build a Zod object schema for creating a new record (writable fields only) */
export function buildCreateInputSchema(
  schema: CompiledSchema,
): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};

  for (const field of schema.fields) {
    // Skip auto-generated fields — not user-provided
    if (field.auto) continue;
    // Skip system fields
    if (field.name.startsWith("_")) continue;

    const zodType = fieldToZod(field);
    shape[field.name] = field.required ? zodType : zodType.optional();
  }

  return z.object(shape);
}

/** Build a Zod object schema for updating a record (all fields optional) */
export function buildUpdateInputSchema(
  schema: CompiledSchema,
): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};

  for (const field of schema.fields) {
    if (field.auto) continue;
    if (field.immutable) continue;
    if (field.name.startsWith("_")) continue;

    shape[field.name] = fieldToZod(field).optional();
  }

  return z.object(shape);
}

/** Convert a single FieldDefinition to a Zod type */
function fieldToZod(field: FieldDefinition): z.ZodType {
  return baseTypeToZod(field);
}

function baseTypeToZod(field: FieldDefinition): z.ZodType {
  const type: FieldType = field.type;

  switch (type) {
    case "string": {
      let s = z.string();
      if (field.min !== undefined) s = s.min(field.min);
      if (field.max !== undefined) s = s.max(field.max);
      return s;
    }

    case "number": {
      let n = z.number();
      if (field.min !== undefined) n = n.min(field.min);
      if (field.max !== undefined) n = n.max(field.max);
      return n;
    }

    case "boolean":
      return z.boolean();

    case "date":
      return z.string(); // ISO 8601 string

    case "enum":
      if (field.enumValues && field.enumValues.length > 0) {
        return z.enum(field.enumValues as [string, ...string[]]);
      }
      return z.string();

    case "array":
      if (field.items && field.items.length > 0) {
        const itemShape = buildObjectShape(field.items);
        return z.array(z.object(itemShape));
      }
      return z.array(z.unknown());

    case "object":
      if (field.items && field.items.length > 0) {
        const objShape = buildObjectShape(field.items);
        return z.object(objShape);
      }
      return z.record(z.string(), z.unknown());

    case "reference":
      return z.string(); // ID string

    case "uuid":
      return z.string().uuid();

    default:
      return z.unknown();
  }
}

/** Build a shape record from a list of sub-field definitions */
function buildObjectShape(
  items: FieldDefinition[],
): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  for (const item of items) {
    const itemZod = fieldToZod(item);
    shape[item.name] = item.required ? itemZod : itemZod.optional();
  }
  return shape;
}
