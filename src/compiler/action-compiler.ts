/**
 * Action compiler — LLM-powered compilation of action markdown files
 * into deterministic JSON execution plans.
 */

import { createHash } from "node:crypto";
import type { CompiledAction } from "../types/action.ts";
import type { CompiledSchema } from "../types/schema.ts";
import type { ExecutionPlan, PlanStep, PlanError } from "../types/execution-plan.ts";
import type { LLMClient } from "../llm/client.ts";
import {
  buildActionCompilationSystem,
  buildActionCompilationPrompt,
} from "../llm/prompts.ts";

export interface ActionCompilationResult {
  plan: ExecutionPlan;
  /** Raw LLM response for debugging */
  rawResponse?: string;
  /** Token usage */
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Compile a single action into an execution plan using the LLM.
 */
export async function compileAction(
  action: CompiledAction,
  schemas: Map<string, CompiledSchema>,
  rules: Map<string, string>,
  llm: LLMClient,
): Promise<ActionCompilationResult> {
  const system = buildActionCompilationSystem();
  const prompt = buildActionCompilationPrompt(action, schemas, rules);

  const response = await llm.compile({
    system,
    prompt,
    jsonMode: true,
    maxTokens: 4096,
  });

  if (!response.json) {
    throw new CompilationError(
      action.toolName,
      "LLM did not return valid JSON",
      response.text,
    );
  }

  const raw = response.json as Record<string, unknown>;

  // Build the execution plan from the LLM response
  const plan: ExecutionPlan = {
    toolName: action.toolName,
    title: action.title,
    description: action.description,
    tier: action.tier,
    auth: action.auth,
    entity: action.entity,
    inputs: action.inputs.map((i) => ({
      name: i.name,
      type: i.type as "string" | "number" | "boolean" | "array" | "object",
      required: i.required,
      description: i.description,
    })),
    steps: parseSteps(raw.steps),
    errors: parseErrors(raw.errors),
    outputDescription:
      (raw.outputDescription as string) ?? action.outputDescription,
    sourceHash: computeSourceHash(action, schemas, rules),
  };

  return {
    plan,
    rawResponse: response.text,
    usage: response.usage,
  };
}

/**
 * Compile all actions in a project.
 */
export async function compileAllActions(
  actions: Map<string, CompiledAction>,
  schemas: Map<string, CompiledSchema>,
  rules: Map<string, string>,
  llm: LLMClient,
  onProgress?: (toolName: string, index: number, total: number) => void,
): Promise<Map<string, ExecutionPlan>> {
  const plans = new Map<string, ExecutionPlan>();
  const entries = Array.from(actions.entries());

  for (let i = 0; i < entries.length; i++) {
    const [toolName, action] = entries[i]!;
    onProgress?.(toolName, i + 1, entries.length);

    try {
      const result = await compileAction(action, schemas, rules, llm);
      plans.set(toolName, result.plan);
    } catch (err) {
      console.error(
        `[compiler] Failed to compile action ${toolName}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return plans;
}

/** Parse steps array from LLM response */
function parseSteps(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((step: Record<string, unknown>): PlanStep => ({
    type: ((step.type as string) ?? "validate") as PlanStep["type"],
    description: (step.description as string) ?? "",
    config: ((step.config as Record<string, unknown>) ?? step) as unknown as PlanStep["config"],
  }));
}

/** Parse errors array from LLM response */
function parseErrors(raw: unknown): PlanError[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((err: Record<string, unknown>) => ({
    code: (err.code as string) ?? "error",
    message: (err.message as string) ?? "",
  }));
}

/**
 * Compute a hash of all source files that affect this action's compilation.
 * Used for Tier 2 cache invalidation.
 */
function computeSourceHash(
  action: CompiledAction,
  schemas: Map<string, CompiledSchema>,
  rules: Map<string, string>,
): string {
  const hash = createHash("sha256");

  // Hash the action definition
  hash.update(`action:${action.toolName}:${action.description}`);
  for (const input of action.inputs) {
    hash.update(`input:${input.name}:${input.type}:${input.required}`);
  }

  // Hash referenced schemas
  const entitySchema = schemas.get(action.entity.toLowerCase());
  if (entitySchema) {
    hash.update(`schema:${entitySchema.entity}`);
    for (const field of entitySchema.fields) {
      hash.update(`field:${field.name}:${field.type}`);
    }
  }

  // Hash applicable rules
  for (const [name, content] of rules) {
    if (
      content.toLowerCase().includes(action.entity.toLowerCase()) ||
      name === "permissions" ||
      name === "validation"
    ) {
      hash.update(`rule:${name}:${content}`);
    }
  }

  return hash.digest("hex").slice(0, 16);
}

export class CompilationError extends Error {
  readonly toolName: string;
  readonly rawResponse: string;

  constructor(toolName: string, message: string, rawResponse: string) {
    super(`Compilation failed for ${toolName}: ${message}`);
    this.name = "CompilationError";
    this.toolName = toolName;
    this.rawResponse = rawResponse;
  }
}
