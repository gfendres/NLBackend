/**
 * Tool registrar — dynamically registers MCP tools from compiled schemas.
 * For Phase 1, auto-generates CRUD tools for each entity.
 * Phase 2 will add LLM-compiled action tools.
 */

import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { CompiledSchema } from "../types/schema.ts";
import type { DatabaseEngine } from "../database/engine.ts";
import {
  buildCreateInputSchema,
  buildUpdateInputSchema,
} from "./schema-to-zod.ts";

/** Register auto-generated CRUD tools for all schemas */
export function registerCrudTools(
  server: McpServer,
  schemas: Map<string, CompiledSchema>,
  db: DatabaseEngine,
): void {
  for (const [_entityKey, schema] of schemas) {
    const entity = schema.entity.toLowerCase();
    const plural = pluralize(entity);

    registerCreateTool(server, plural, schema, db);
    registerGetTool(server, plural, schema, db);
    registerListTool(server, plural, db);
    registerUpdateTool(server, plural, schema, db);
    registerDeleteTool(server, plural, db);
  }
}

function registerCreateTool(
  server: McpServer,
  plural: string,
  schema: CompiledSchema,
  db: DatabaseEngine,
): void {
  const inputSchema = buildCreateInputSchema(schema);

  server.registerTool(`${plural}_create`, {
    title: `Create ${schema.entity}`,
    description: `Create a new ${schema.entity} record. Validates all fields against the ${schema.entity} schema.`,
    inputSchema,
  }, async (args: Record<string, unknown>): Promise<CallToolResult> => {
    try {
      const record = await db.create(plural, args);
      return ok(record);
    } catch (err) {
      return error(err);
    }
  });
}

function registerGetTool(
  server: McpServer,
  plural: string,
  schema: CompiledSchema,
  db: DatabaseEngine,
): void {
  server.registerTool(`${plural}_get`, {
    title: `Get ${schema.entity}`,
    description: `Retrieve a single ${schema.entity} by its ID.`,
    inputSchema: z.object({
      id: z.string().describe(`The ${schema.entity} ID`),
    }),
  }, async ({ id }: { id: string }): Promise<CallToolResult> => {
    const record = await db.read(plural, id);
    if (!record) {
      return error(new Error(`${schema.entity} with id "${id}" not found`));
    }
    return ok(record);
  });
}

function registerListTool(
  server: McpServer,
  plural: string,
  db: DatabaseEngine,
): void {
  server.registerTool(`${plural}_list`, {
    title: `List ${plural}`,
    description: `List ${plural} with optional filtering, sorting, and pagination.`,
    inputSchema: z.object({
      limit: z.number().min(1).max(100).optional().describe("Max records to return (default 20)"),
      offset: z.number().min(0).optional().describe("Records to skip (default 0)"),
      sort_by: z.string().optional().describe("Field name to sort by"),
      sort_order: z.enum(["asc", "desc"]).optional().describe("Sort direction (default asc)"),
      filters: z.record(z.string(), z.unknown()).optional().describe("Field-value pairs to filter by"),
    }),
  }, async (args: {
    limit?: number;
    offset?: number;
    sort_by?: string;
    sort_order?: "asc" | "desc";
    filters?: Record<string, unknown>;
  }): Promise<CallToolResult> => {
    try {
      const result = await db.list(plural, args);
      return ok(result);
    } catch (err) {
      return error(err);
    }
  });
}

function registerUpdateTool(
  server: McpServer,
  plural: string,
  schema: CompiledSchema,
  db: DatabaseEngine,
): void {
  const dataSchema = buildUpdateInputSchema(schema);
  const inputSchema = z.object({
    id: z.string().describe(`The ${schema.entity} ID to update`),
    data: dataSchema.describe("Fields to update"),
  });

  server.registerTool(`${plural}_update`, {
    title: `Update ${schema.entity}`,
    description: `Update an existing ${schema.entity}. Only provided fields are changed. Immutable fields are ignored.`,
    inputSchema,
  }, async ({ id, data }: { id: string; data: Record<string, unknown> }): Promise<CallToolResult> => {
    try {
      const record = await db.update(plural, id, data);
      if (!record) {
        return error(new Error(`${schema.entity} with id "${id}" not found`));
      }
      return ok(record);
    } catch (err) {
      return error(err);
    }
  });
}

function registerDeleteTool(
  server: McpServer,
  plural: string,
  db: DatabaseEngine,
): void {
  server.registerTool(`${plural}_delete`, {
    title: `Delete ${plural.slice(0, -1)}`,
    description: `Delete a ${plural.slice(0, -1)} by its ID.`,
    inputSchema: z.object({
      id: z.string().describe("The record ID to delete"),
    }),
  }, async ({ id }: { id: string }): Promise<CallToolResult> => {
    const deleted = await db.delete(plural, id);
    if (!deleted) {
      return error(new Error(`Record with id "${id}" not found`));
    }
    return ok({ deleted: true, id });
  });
}

// --- Helpers ---

function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function error(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: JSON.stringify({ error: { code: "error", message } }) }],
    isError: true,
  };
}

function pluralize(name: string): string {
  if (name.endsWith("s")) return name;
  if (name.endsWith("y")) return name.slice(0, -1) + "ies";
  return name + "s";
}
