/**
 * Action executor — runs compiled execution plans against the database.
 * Handles step sequencing, context propagation, and error handling.
 */

import type { ExecutionPlan, PlanStep } from "../types/execution-plan.ts";
import type { DatabaseEngine } from "../database/engine.ts";
import type { LLMClient } from "../llm/client.ts";

/** Context built up as steps execute */
export interface ExecutionContext {
  /** Input arguments from the tool call */
  input: Record<string, unknown>;
  /** Variables set by steps (db_read resultVar, etc.) */
  vars: Record<string, unknown>;
  /** Authenticated user info (if available) */
  user?: { id: string; role: string };
}

export interface ExecutionResult {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  /** Which step was executing when an error occurred */
  failedStep?: number;
}

/**
 * Execute a compiled action plan.
 */
export async function executeAction(
  plan: ExecutionPlan,
  input: Record<string, unknown>,
  db: DatabaseEngine,
  llm: LLMClient,
  user?: { id: string; role: string },
): Promise<ExecutionResult> {
  const context: ExecutionContext = {
    input,
    vars: {},
    user,
  };

  let lastResultVar: string | undefined;

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;

    try {
      const resultVar = await executeStep(step, context, db, llm);
      if (resultVar) lastResultVar = resultVar;
    } catch (err) {
      if (err instanceof StepError) {
        return {
          success: false,
          error: { code: err.code, message: err.message },
          failedStep: i,
        };
      }
      return {
        success: false,
        error: {
          code: "internal_error",
          message: err instanceof Error ? err.message : String(err),
        },
        failedStep: i,
      };
    }
  }

  // Return the last written/read result
  const data = lastResultVar
    ? context.vars[lastResultVar]
    : context.vars;

  return { success: true, data };
}

/**
 * Execute a single step. Returns the resultVar name if one was set.
 */
async function executeStep(
  step: PlanStep,
  context: ExecutionContext,
  db: DatabaseEngine,
  llm: LLMClient,
): Promise<string | undefined> {
  const config = step.config as unknown as Record<string, unknown>;
  const type = (config.type as string) ?? step.type;

  switch (type) {
    case "validate":
      return executeValidate(config, context);

    case "check":
      return executeCheck(config, context);

    case "db_read":
      return executeDbRead(config, context, db);

    case "db_write":
      return executeDbWrite(config, context, db);

    case "db_delete":
      return executeDbDelete(config, context, db);

    case "set_field":
      return executeSetField(config, context);

    case "transform":
      return executeTransform(config, context);

    case "llm_interpret":
      return executeLlmInterpret(config, context, llm);

    default:
      console.error(`[executor] Unknown step type: ${type}`);
      return undefined;
  }
}

// --- Step implementations ---

function executeValidate(
  config: Record<string, unknown>,
  context: ExecutionContext,
): undefined {
  const field = config.field as string;
  const rule = config.rule as string;
  const value = resolveValue(`input.${field}`, context);

  // Simple rule evaluation
  if (rule === "required" && (value === undefined || value === null || value === "")) {
    throw new StepError(
      (config.errorCode as string) ?? "invalid_input",
      (config.errorMessage as string) ?? `Field "${field}" is required`,
    );
  }

  if (rule === "not_empty" && (!value || (Array.isArray(value) && value.length === 0))) {
    throw new StepError(
      (config.errorCode as string) ?? "invalid_input",
      (config.errorMessage as string) ?? `Field "${field}" must not be empty`,
    );
  }

  return undefined;
}

function executeCheck(
  config: Record<string, unknown>,
  context: ExecutionContext,
): undefined {
  const condition = config.condition as string;
  const result = evaluateCondition(condition, context);

  if (!result) {
    throw new StepError(
      (config.errorCode as string) ?? "check_failed",
      (config.errorMessage as string) ?? `Check failed: ${condition}`,
    );
  }
  return undefined;
}

async function executeDbRead(
  config: Record<string, unknown>,
  context: ExecutionContext,
  db: DatabaseEngine,
): Promise<string | undefined> {
  const collection = config.collection as string;
  const resultVar = config.resultVar as string;
  const query = (config.query as Record<string, unknown>) ?? {};

  // Read by ID
  const idSource = query.id as string | undefined;
  if (idSource) {
    const id = resolveValue(idSource, context) as string;
    const record = await db.read(collection, id);
    if (record) {
      context.vars[resultVar] = record;
    } else {
      context.vars[resultVar] = null;
    }
    return resultVar;
  }

  // Read by filters
  const rawFilters = (query.filters as Record<string, string>) ?? {};
  const filters: Record<string, unknown> = {};
  for (const [key, source] of Object.entries(rawFilters)) {
    filters[key] = resolveValue(source, context);
  }

  const result = await db.list(collection, {
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    sort_by: query.sort_by as string | undefined,
    sort_order: query.sort_order as "asc" | "desc" | undefined,
    limit: query.limit as number | undefined,
    offset: query.offset as number | undefined,
  });

  context.vars[resultVar] = result;
  return resultVar;
}

async function executeDbWrite(
  config: Record<string, unknown>,
  context: ExecutionContext,
  db: DatabaseEngine,
): Promise<string | undefined> {
  const collection = config.collection as string;
  const operation = (config.operation as string) ?? "create";
  const resultVar = config.resultVar as string;
  const fieldMappings = (config.fields as Record<string, string>) ?? {};

  // Resolve field values from context
  const data: Record<string, unknown> = {};
  for (const [field, source] of Object.entries(fieldMappings)) {
    data[field] = resolveValue(source, context);
  }

  if (operation === "create") {
    const record = await db.create(collection, data);
    context.vars[resultVar] = record;
  } else if (operation === "update") {
    const idSource = config.id as string;
    const id = resolveValue(idSource, context) as string;
    const record = await db.update(collection, id, data);
    context.vars[resultVar] = record;
  }

  return resultVar;
}

async function executeDbDelete(
  config: Record<string, unknown>,
  context: ExecutionContext,
  db: DatabaseEngine,
): Promise<undefined> {
  const collection = config.collection as string;
  const idSource = config.id as string;
  const id = resolveValue(idSource, context) as string;

  const deleted = await db.delete(collection, id);
  if (!deleted) {
    throw new StepError("not_found", `Record "${id}" not found in ${collection}`);
  }
  return undefined;
}

function executeSetField(
  config: Record<string, unknown>,
  context: ExecutionContext,
): undefined {
  const targetVar = config.targetVar as string;
  const field = config.field as string;
  const value = resolveValue(config.value as string, context);

  const target = context.vars[targetVar];
  if (target && typeof target === "object") {
    (target as Record<string, unknown>)[field] = value;
  }
  return undefined;
}

function executeTransform(
  config: Record<string, unknown>,
  context: ExecutionContext,
): string | undefined {
  const sourceVar = config.sourceVar as string;
  const resultVar = config.resultVar as string;
  const operation = config.operation as string;

  const source = context.vars[sourceVar];

  // Simple built-in transforms
  if (operation === "count" && Array.isArray(source)) {
    context.vars[resultVar] = source.length;
  } else if (operation === "first" && Array.isArray(source)) {
    context.vars[resultVar] = source[0] ?? null;
  } else if (operation === "flatten" && source && typeof source === "object") {
    const list = (source as Record<string, unknown>);
    context.vars[resultVar] = list.data ?? source;
  } else {
    // Pass through
    context.vars[resultVar] = source;
  }

  return resultVar;
}

async function executeLlmInterpret(
  config: Record<string, unknown>,
  context: ExecutionContext,
  llm: LLMClient,
): Promise<string | undefined> {
  const promptTemplate = config.prompt as string;
  const resultVar = config.resultVar as string;

  // Replace {{variable}} placeholders in the prompt
  const prompt = promptTemplate.replace(
    /\{\{(\w+(?:\.\w+)*)\}\}/g,
    (_, path: string) => {
      const value = resolveValue(path, context);
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  );

  const response = await llm.interpret({
    system: "You are a helpful assistant. Return concise, structured responses.",
    prompt,
    jsonMode: true,
    maxTokens: 2048,
  });

  context.vars[resultVar] = response.json ?? response.text;
  return resultVar;
}

// --- Value resolution ---

/**
 * Resolve a value reference from execution context.
 * Supports: "input.field", "context.var", "context.var.field", or literal values.
 */
export function resolveValue(
  source: string | number | boolean | null | undefined,
  context: ExecutionContext,
): unknown {
  if (source === null || source === undefined) return source;
  if (typeof source === "number" || typeof source === "boolean") return source;

  const str = source as string;

  // input.field — reference to tool call input
  if (str.startsWith("input.")) {
    const field = str.slice(6); // remove "input."
    return context.input[field];
  }

  // context.var or context.var.field — reference to step variable
  if (str.startsWith("context.")) {
    const parts = str.slice(8).split("."); // remove "context."
    let value: unknown = context.vars;
    for (const part of parts) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  // user.id, user.role
  if (str.startsWith("user.")) {
    const field = str.slice(5);
    if (!context.user) return undefined;
    return (context.user as Record<string, unknown>)[field];
  }

  // Literal value: try parsing as JSON, else return as string
  if (str === "true") return true;
  if (str === "false") return false;
  if (str === "null") return null;
  const num = Number(str);
  if (!isNaN(num) && str.trim() !== "") return num;

  return str;
}

/**
 * Evaluate a simple condition string against the context.
 * Supports: "var exists", "var == value", "var != value", "var > value"
 */
function evaluateCondition(
  condition: string,
  context: ExecutionContext,
): boolean {
  // "context.var exists" or "context.var != null"
  const existsMatch = condition.match(/^(.+?)\s+exists$/i);
  if (existsMatch?.[1]) {
    const val = resolveValue(existsMatch[1].trim(), context);
    return val !== null && val !== undefined;
  }

  const notNullMatch = condition.match(/^(.+?)\s*!=\s*null$/i);
  if (notNullMatch?.[1]) {
    const val = resolveValue(notNullMatch[1].trim(), context);
    return val !== null && val !== undefined;
  }

  // "context.var == value"
  const eqMatch = condition.match(/^(.+?)\s*==\s*(.+)$/);
  if (eqMatch?.[1] && eqMatch[2] !== undefined) {
    const left = resolveValue(eqMatch[1].trim(), context);
    const right = resolveValue(eqMatch[2].trim(), context);
    return left === right;
  }

  // "context.var != value"
  const neqMatch = condition.match(/^(.+?)\s*!=\s*(.+)$/);
  if (neqMatch?.[1] && neqMatch[2] !== undefined) {
    const left = resolveValue(neqMatch[1].trim(), context);
    const right = resolveValue(neqMatch[2].trim(), context);
    return left !== right;
  }

  // "context.var > value"
  const gtMatch = condition.match(/^(.+?)\s*>\s*(.+)$/);
  if (gtMatch?.[1] && gtMatch[2] !== undefined) {
    const left = resolveValue(gtMatch[1].trim(), context) as number;
    const right = resolveValue(gtMatch[2].trim(), context) as number;
    return left > right;
  }

  // Default: truthy check
  const val = resolveValue(condition, context);
  return !!val;
}

/** Error thrown by a step to signal an expected failure */
export class StepError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StepError";
    this.code = code;
  }
}
