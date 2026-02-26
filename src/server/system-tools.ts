/**
 * System tools — built-in MCP tools for project management and introspection.
 */

import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Project } from "../types/project.ts";
import type { DatabaseEngine } from "../database/engine.ts";
import type { LLMClient } from "../llm/client.ts";
import type { ServerConfig } from "../types/config.ts";
import { compileAllActions } from "../compiler/action-compiler.ts";
import { compileAllRules } from "../compiler/rule-compiler.ts";
import { compileAllWorkflows } from "../compiler/workflow-compiler.ts";
import { executeWorkflow } from "../runtime/workflow-executor.ts";

/** Register all system tools on the MCP server */
export function registerSystemTools(
  server: McpServer,
  project: Project,
  db: DatabaseEngine,
  llm: LLMClient,
  _config: ServerConfig,
): void {
  registerDescribeApi(server, project, db);
  registerQueryDb(server, db);
  registerMutateDb(server, db);
  registerInspect(server, project);
  registerCompile(server, project, llm);
  registerExplain(server, project);
  registerRunWorkflow(server, project, db, llm);
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
      "Returns the full API surface: all schemas, their fields, available CRUD tools, and custom actions.",
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

    const crudTools = collections.flatMap((c) => [
      `${c}_create`, `${c}_get`, `${c}_list`, `${c}_update`, `${c}_delete`,
    ]);

    const actionTools = Array.from(project.actions.keys());
    const systemTools = [
      "describe_api", "query_db", "mutate_db", "inspect",
      "compile", "explain", "run_workflow",
    ];

    return ok({
      project: { name: project.name, description: project.description },
      schemas,
      collections,
      tools: [...crudTools, ...actionTools, ...systemTools],
      actions: Array.from(project.actions.values()).map((a) => ({
        toolName: a.toolName,
        title: a.title,
        entity: a.entity,
        tier: a.tier,
        auth: a.auth,
        compiled: project.executionPlans.has(a.toolName),
      })),
      compilationStatus: {
        actions: `${project.executionPlans.size}/${project.actions.size} compiled`,
        rules: `${project.compiledRules.size}/${project.rules.size} compiled`,
        workflows: `${project.compiledWorkflows.size}/${project.workflows.size} compiled`,
      },
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
    description: "View the compiled state of a schema, action, rule, or workflow for debugging.",
    inputSchema: z.object({
      type: z.enum(["schema", "action", "rule", "workflow", "plan"]).describe("What type of entity to inspect"),
      name: z.string().describe("Entity name (e.g. 'recipe', 'permissions', 'publish-recipe')"),
    }),
  }, async ({ type, name }: { type: string; name: string }): Promise<CallToolResult> => {
    switch (type) {
      case "schema": {
        const schema = project.schemas.get(name.toLowerCase());
        if (!schema) return err(`Schema "${name}" not found`);
        return ok(schema);
      }
      case "action": {
        const action = project.actions.get(name);
        if (!action) return err(`Action "${name}" not found`);
        return ok(action);
      }
      case "plan": {
        const plan = project.executionPlans.get(name);
        if (!plan) return err(`Execution plan "${name}" not found. Run 'compile' first.`);
        return ok(plan);
      }
      case "rule": {
        const compiled = project.compiledRules.get(name);
        if (compiled) return ok(compiled);
        const raw = project.rules.get(name);
        if (!raw) return err(`Rule "${name}" not found`);
        return ok({ name, raw: true, content: raw });
      }
      case "workflow": {
        const compiled = project.compiledWorkflows.get(name);
        if (compiled) return ok(compiled);
        const raw = project.workflows.get(name);
        if (!raw) return err(`Workflow "${name}" not found`);
        return ok({ name, raw: true, content: raw });
      }
      default:
        return err(`Unknown type "${type}". Use: schema, action, plan, rule, workflow`);
    }
  });
}

/** compile — trigger LLM compilation of actions, rules, and workflows */
function registerCompile(
  server: McpServer,
  project: Project,
  llm: LLMClient,
): void {
  server.registerTool("compile", {
    title: "Compile",
    description:
      "Trigger LLM-powered compilation of actions, rules, and workflows into execution plans. Requires ANTHROPIC_API_KEY.",
    inputSchema: z.object({
      target: z
        .enum(["all", "actions", "rules", "workflows"])
        .optional()
        .describe("What to compile (default: all)"),
    }),
  }, async ({ target = "all" }: { target?: string }): Promise<CallToolResult> => {
    if (!llm.isConfigured()) {
      return err(
        "LLM API key not configured. Set the ANTHROPIC_API_KEY environment variable.",
      );
    }

    const results: Record<string, string> = {};

    try {
      if (target === "all" || target === "actions") {
        const plans = await compileAllActions(
          project.actions,
          project.schemas,
          project.rules,
          llm,
          (name, i, total) =>
            console.error(`[compile] Action ${i}/${total}: ${name}`),
        );
        for (const [name, plan] of plans) {
          project.executionPlans.set(name, plan);
        }
        results.actions = `${plans.size} action(s) compiled`;
      }

      if (target === "all" || target === "rules") {
        const ruleSets = await compileAllRules(
          project.rules,
          project.schemas,
          llm,
          (name, i, total) =>
            console.error(`[compile] Rule ${i}/${total}: ${name}`),
        );
        for (const [name, ruleSet] of ruleSets) {
          project.compiledRules.set(name, ruleSet);
        }
        results.rules = `${ruleSets.size} rule set(s) compiled`;
      }

      if (target === "all" || target === "workflows") {
        const workflows = await compileAllWorkflows(
          project.workflows,
          project.schemas,
          llm,
          (name, i, total) =>
            console.error(`[compile] Workflow ${i}/${total}: ${name}`),
        );
        for (const [name, workflow] of workflows) {
          project.compiledWorkflows.set(name, workflow);
        }
        results.workflows = `${workflows.size} workflow(s) compiled`;
      }

      return ok({ status: "compiled", ...results });
    } catch (e) {
      return err(`Compilation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

/** explain — dry-run inspection of an action's execution plan */
function registerExplain(server: McpServer, project: Project): void {
  server.registerTool("explain", {
    title: "Explain",
    description:
      "Dry-run a tool call: shows which tier, execution plan, rules, and workflows would apply. Does NOT execute.",
    inputSchema: z.object({
      toolName: z.string().describe("The tool name to explain (e.g. 'recipes_create')"),
      input: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Sample input arguments for context"),
    }),
  }, async ({ toolName, input }: { toolName: string; input?: Record<string, unknown> }): Promise<CallToolResult> => {
    const action = project.actions.get(toolName);
    const plan = project.executionPlans.get(toolName);

    // Check which rules apply
    const applicableRules: Array<{ ruleSet: string; description: string }> = [];
    for (const [name, ruleSet] of project.compiledRules) {
      for (const rule of ruleSet.rules) {
        if (
          rule.appliesTo.includes("*") ||
          rule.appliesTo.includes(toolName)
        ) {
          applicableRules.push({ ruleSet: name, description: rule.description });
        }
      }
    }

    // Check which workflows would trigger
    const triggeredWorkflows: string[] = [];
    for (const [name, workflow] of project.compiledWorkflows) {
      if (
        workflow.trigger.action === toolName ||
        workflow.trigger.type === "manual"
      ) {
        triggeredWorkflows.push(name);
      }
    }

    return ok({
      toolName,
      found: !!action,
      tier: action?.tier ?? "unknown",
      auth: action?.auth ?? "unknown",
      entity: action?.entity ?? "unknown",
      hasPlan: !!plan,
      planSteps: plan?.steps.map((s) => ({
        type: s.type,
        description: s.description,
      })),
      applicableRules,
      triggeredWorkflows,
      sampleInput: input ?? null,
    });
  });
}

/** run_workflow — execute a named workflow */
function registerRunWorkflow(
  server: McpServer,
  project: Project,
  db: DatabaseEngine,
  llm: LLMClient,
): void {
  server.registerTool("run_workflow", {
    title: "Run Workflow",
    description: "Execute a named workflow. The workflow must be compiled first.",
    inputSchema: z.object({
      name: z.string().describe("Workflow name (e.g. 'publish-recipe')"),
      input: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Input data for the workflow"),
    }),
  }, async ({ name, input }: { name: string; input?: Record<string, unknown> }): Promise<CallToolResult> => {
    const workflow = project.compiledWorkflows.get(name);
    if (!workflow) {
      return err(
        `Workflow "${name}" not found or not compiled. Run 'compile' first.`,
      );
    }

    try {
      const result = await executeWorkflow(workflow, input ?? {}, db, llm);
      return ok({
        workflow: name,
        success: result.success,
        steps: Array.from(result.stepResults.entries()).map(([i, r]) => ({
          index: i,
          status: r.status,
          ...(r.error && { error: r.error }),
        })),
        ...(result.error && { error: result.error }),
        ...(result.compensationResults && {
          compensations: result.compensationResults,
        }),
      });
    } catch (e) {
      return err(`Workflow execution failed: ${e instanceof Error ? e.message : String(e)}`);
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
