/**
 * System tools — built-in MCP tools for project management and introspection.
 */

import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Project } from "../types/project.ts";
import type { DatabaseEngine } from "../database/engine.ts";

/** Register all system tools on the MCP server */
export function registerSystemTools(
  server: McpServer,
  project: Project,
  db: DatabaseEngine,
): void {
  registerDescribeApi(server, project, db);
  registerQueryDb(server, db);
  registerMutateDb(server, db);
  registerInspect(server, project);
}

/** describe_api — returns the full list of available tools and schemas */
function registerDescribeApi(
  server: McpServer,
  project: Project,
  db: DatabaseEngine,
): void {
  server.registerTool("describe_api", {
    title: "Describe API",
    description:
      "Returns the full API surface: all schemas, their fields, and available CRUD tools.",
  }, async (): Promise<CallToolResult> => {
    const schemas = Array.from(project.schemas.values()).map((s) => ({
      entity: s.entity,
      description: s.description,
      fields: s.fields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required,
        ...(f.enumValues && { enum: f.enumValues }),
        ...(f.referenceTo && { referenceTo: f.referenceTo }),
        ...(f.auto && { auto: f.auto }),
        ...(f.unique && { unique: true }),
        ...(f.indexed && { indexed: true }),
        ...(f.default !== undefined && { default: f.default }),
      })),
      relationships: s.relationships,
    }));

    const collections = db.getCollectionNames();

    const tools = collections.flatMap((c) => [
      `${c}_create`,
      `${c}_get`,
      `${c}_list`,
      `${c}_update`,
      `${c}_delete`,
    ]);

    return ok({
      project: { name: project.name, description: project.description },
      schemas,
      collections,
      tools: [...tools, "describe_api", "query_db", "mutate_db", "inspect"],
    });
  });
}

/** query_db — read data from the file database */
function registerQueryDb(server: McpServer, db: DatabaseEngine): void {
  server.registerTool("query_db", {
    title: "Query Database",
    description:
      "Read data from the database. Supports filtering, sorting, and pagination.",
    inputSchema: z.object({
      collection: z.string().describe("Collection name (plural, e.g. 'users')"),
      id: z.string().optional().describe("Specific record ID to retrieve"),
      filters: z.record(z.string(), z.unknown()).optional().describe("Field-value filter pairs"),
      sort_by: z.string().optional(),
      sort_order: z.enum(["asc", "desc"]).optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }),
  }, async (args: {
    collection: string;
    id?: string;
    filters?: Record<string, unknown>;
    sort_by?: string;
    sort_order?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }): Promise<CallToolResult> => {
    try {
      if (args.id) {
        const record = await db.read(args.collection, args.id);
        if (!record) return err(`Record "${args.id}" not found in ${args.collection}`);
        return ok(record);
      }

      const result = await db.list(args.collection, {
        filters: args.filters,
        sort_by: args.sort_by,
        sort_order: args.sort_order,
        limit: args.limit,
        offset: args.offset,
      });
      return ok(result);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  });
}

/** mutate_db — write data to the file database */
function registerMutateDb(server: McpServer, db: DatabaseEngine): void {
  server.registerTool("mutate_db", {
    title: "Mutate Database",
    description: "Write data to the database. Supports create, update, and delete operations.",
    inputSchema: z.object({
      collection: z.string().describe("Collection name (plural)"),
      operation: z.enum(["create", "update", "delete"]).describe("The operation to perform"),
      id: z.string().optional().describe("Record ID (required for update and delete)"),
      data: z.record(z.string(), z.unknown()).optional().describe("Record data (for create and update)"),
    }),
  }, async (args: {
    collection: string;
    operation: "create" | "update" | "delete";
    id?: string;
    data?: Record<string, unknown>;
  }): Promise<CallToolResult> => {
    try {
      switch (args.operation) {
        case "create": {
          const record = await db.create(args.collection, args.data ?? {});
          return ok(record);
        }
        case "update": {
          if (!args.id) return err("'id' is required for update");
          const record = await db.update(args.collection, args.id, args.data ?? {});
          if (!record) return err(`Record "${args.id}" not found`);
          return ok(record);
        }
        case "delete": {
          if (!args.id) return err("'id' is required for delete");
          const deleted = await db.delete(args.collection, args.id);
          if (!deleted) return err(`Record "${args.id}" not found`);
          return ok({ deleted: true, id: args.id });
        }
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  });
}

/** inspect — view compiled state for debugging */
function registerInspect(server: McpServer, project: Project): void {
  server.registerTool("inspect", {
    title: "Inspect",
    description: "View the compiled state of a schema, action, or rule for debugging.",
    inputSchema: z.object({
      type: z.enum(["schema", "action", "rule"]).describe("What type of entity to inspect"),
      name: z.string().describe("Entity name (e.g. 'recipe', 'permissions')"),
    }),
  }, async ({ type, name }: { type: "schema" | "action" | "rule"; name: string }): Promise<CallToolResult> => {
    switch (type) {
      case "schema": {
        const schema = project.schemas.get(name.toLowerCase());
        if (!schema) return err(`Schema "${name}" not found`);
        return ok(schema);
      }
      case "action": {
        const action = project.actions.get(name);
        if (!action) return err(`Action "${name}" not found. Action compilation is not yet implemented (Phase 2).`);
        return ok(action);
      }
      case "rule": {
        const rule = project.rules.get(name);
        if (!rule) return err(`Rule "${name}" not found`);
        return ok({ name, content: rule });
      }
    }
  });
}

// --- Helpers ---

function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function err(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: { code: "error", message } }) }],
    isError: true,
  };
}
