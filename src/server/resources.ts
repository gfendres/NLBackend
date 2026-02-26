/**
 * MCP Resources — expose project information as read-only resources
 * so the consuming LLM gets immediate context when it connects.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type { Project } from "../types/project.ts";
import type { DatabaseEngine } from "../database/engine.ts";

/** Register MCP resources that give the consuming LLM project context */
export function registerResources(
  server: McpServer,
  project: Project,
  db: DatabaseEngine,
): void {
  // 1. Project overview — the first thing an LLM reads
  server.registerResource(
    "project-info",
    "nlbackend://project",
    {
      title: `${project.name} — Project Overview`,
      description:
        "Project identity, data model summary, available tools, and how to get started. Read this first.",
      mimeType: "application/json",
    },
    async (uri): Promise<ReadResourceResult> => {
      const schemas = Array.from(project.schemas.values()).map((s) => ({
        entity: s.entity,
        description: s.description,
        fieldCount: s.fields.length,
        fields: s.fields.map((f) => `${f.name} (${f.type}${f.required ? ", required" : ""})`),
        relationships: s.relationships,
      }));

      const collections = db.getCollectionNames();

      const crudTools = collections.flatMap((c) => [
        `${c}_create`,
        `${c}_get`,
        `${c}_list`,
        `${c}_update`,
        `${c}_delete`,
      ]);

      const actionTools = Array.from(project.actions.values()).map((a) => ({
        toolName: a.toolName,
        title: a.title,
        description: a.description,
        auth: a.auth,
      }));

      const workflows = Array.from(project.workflows.keys());

      const info = {
        name: project.name,
        description: project.description,
        gettingStarted: [
          "Call 'describe_api' to see all available tools and their parameters.",
          "Use CRUD tools (e.g. users_create, recipes_list) to manage data.",
          "Use 'query_db' for complex queries with filters, sorting, and pagination.",
          "Use 'inspect' to view schema details for any entity.",
          ...(workflows.length > 0
            ? [`Workflows available: ${workflows.join(", ")}. Use 'run_workflow' to execute.`]
            : []),
        ],
        dataModel: schemas,
        availableTools: {
          crud: crudTools,
          actions: actionTools,
          system: [
            "describe_api — full API surface listing",
            "query_db — read data with filters/sort/pagination",
            "mutate_db — create/update/delete records",
            "inspect — view compiled schema/action/rule/workflow",
            "compile — trigger LLM compilation",
            "explain — dry-run a tool call",
            "run_workflow — execute a named workflow",
          ],
        },
        compilationStatus: {
          actions: `${project.executionPlans.size}/${project.actions.size}`,
          rules: `${project.compiledRules.size}/${project.rules.size}`,
          workflows: `${project.compiledWorkflows.size}/${project.workflows.size}`,
        },
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    },
  );

  // 2. Schema detail resources — one per entity
  for (const [entityName, schema] of project.schemas) {
    server.registerResource(
      `schema-${entityName}`,
      `nlbackend://schema/${entityName}`,
      {
        title: `${schema.entity} Schema`,
        description: `Data model definition for ${schema.entity}: fields, types, constraints, and relationships.`,
        mimeType: "application/json",
      },
      async (uri): Promise<ReadResourceResult> => {
        const detail = {
          entity: schema.entity,
          description: schema.description,
          fields: schema.fields.map((f) => ({
            name: f.name,
            type: f.type,
            required: f.required,
            ...(f.enumValues && { enum: f.enumValues }),
            ...(f.referenceTo && { referenceTo: f.referenceTo }),
            ...(f.auto && { auto: f.auto }),
            ...(f.unique && { unique: true }),
            ...(f.indexed && { indexed: true }),
            ...(f.immutable && { immutable: true }),
            ...(f.default !== undefined && { default: f.default }),
            ...(f.min !== undefined && { min: f.min }),
            ...(f.max !== undefined && { max: f.max }),
          })),
          relationships: schema.relationships,
          crudTools: [
            `${db.getCollectionNames().find((c) => c === entityName + "s" || c === entityName) ?? entityName + "s"}_create`,
            `${db.getCollectionNames().find((c) => c === entityName + "s" || c === entityName) ?? entityName + "s"}_get`,
            `${db.getCollectionNames().find((c) => c === entityName + "s" || c === entityName) ?? entityName + "s"}_list`,
            `${db.getCollectionNames().find((c) => c === entityName + "s" || c === entityName) ?? entityName + "s"}_update`,
            `${db.getCollectionNames().find((c) => c === entityName + "s" || c === entityName) ?? entityName + "s"}_delete`,
          ],
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(detail, null, 2),
            },
          ],
        };
      },
    );
  }
}
