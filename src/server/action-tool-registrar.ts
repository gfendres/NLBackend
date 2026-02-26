/**
 * Action tool registrar — registers MCP tools from compiled action definitions.
 * These are custom actions defined in the actions/ folder,
 * as opposed to the auto-generated CRUD tools.
 */

import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Project } from "../types/project.ts";
import type { DatabaseEngine } from "../database/engine.ts";
import type { LLMClient } from "../llm/client.ts";
import { executeAction } from "../runtime/action-executor.ts";
import { evaluateRules } from "../runtime/rule-engine.ts";

/**
 * Register MCP tools for all compiled action execution plans.
 * Only actions that have been LLM-compiled are registered.
 */
export function registerActionTools(
  server: McpServer,
  project: Project,
  db: DatabaseEngine,
  llm: LLMClient,
): number {
  let count = 0;

  for (const [toolName, plan] of project.executionPlans) {
    const action = project.actions.get(toolName);
    if (!action) continue;

    // Build Zod input schema from plan inputs
    const shape: Record<string, z.ZodType> = {};
    for (const input of plan.inputs) {
      let zodType = inputTypeToZod(input.type, input.constraints);
      if (!input.required) zodType = zodType.optional();
      shape[input.name] = zodType;
    }

    server.registerTool(toolName, {
      title: plan.title,
      description: plan.description,
      inputSchema: z.object(shape),
    }, async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        // 1. Evaluate rules before execution
        if (project.compiledRules.size > 0) {
          const violation = await evaluateRules(
            project.compiledRules,
            {
              toolName,
              input: args,
              user: null, // TODO: extract from auth context
            },
            db,
          );
          if (violation) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  error: {
                    code: violation.code,
                    message: violation.message,
                    rule: violation.ruleName,
                  },
                }),
              }],
              isError: true,
            };
          }
        }

        // 2. Execute the compiled plan
        const result = await executeAction(plan, args, db, llm);

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: result.error ?? { code: "error", message: "Action failed" },
              }),
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result.data, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: { code: "internal_error", message } }),
          }],
          isError: true,
        };
      }
    });

    count++;
  }

  return count;
}

/** Convert plan input type to Zod schema */
function inputTypeToZod(
  type: string,
  constraints?: Record<string, unknown>,
): z.ZodType {
  switch (type) {
    case "number": {
      let n = z.number();
      if (constraints?.min !== undefined) n = n.min(constraints.min as number);
      if (constraints?.max !== undefined) n = n.max(constraints.max as number);
      return n;
    }
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(z.unknown());
    case "object":
      return z.record(z.string(), z.unknown());
    case "string":
    default: {
      let s = z.string();
      if (constraints?.minLength !== undefined) s = s.min(constraints.minLength as number);
      if (constraints?.maxLength !== undefined) s = s.max(constraints.maxLength as number);
      if (constraints?.enum && Array.isArray(constraints.enum)) {
        return z.enum(constraints.enum as [string, ...string[]]);
      }
      return s;
    }
  }
}
