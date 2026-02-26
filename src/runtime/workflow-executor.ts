/**
 * Workflow executor — runs compiled workflows using the saga pattern.
 * Each step commits independently; on failure, compensation steps run.
 */

import type {
  CompiledWorkflow,
  WorkflowStep,
  WorkflowCompensation,
} from "../types/workflow.ts";
import type { DatabaseEngine } from "../database/engine.ts";
import type { LLMClient } from "../llm/client.ts";

/** Result of a workflow execution */
export interface WorkflowResult {
  success: boolean;
  /** Results from each step, keyed by step index */
  stepResults: Map<number, StepResult>;
  /** Error info if workflow failed */
  error?: {
    step: number;
    message: string;
  };
  /** Compensation results if any ran */
  compensationResults?: CompensationResult[];
}

export interface StepResult {
  index: number;
  status: "completed" | "failed" | "skipped";
  data?: unknown;
  error?: string;
}

export interface CompensationResult {
  forStep: number | "*";
  success: boolean;
  action: string;
  error?: string;
}

/**
 * Execute a compiled workflow with saga-pattern compensation.
 */
export async function executeWorkflow(
  workflow: CompiledWorkflow,
  input: Record<string, unknown>,
  db: DatabaseEngine,
  llm: LLMClient,
): Promise<WorkflowResult> {
  const stepResults = new Map<number, StepResult>();
  const context: Record<string, unknown> = { input };

  for (const step of workflow.steps) {
    try {
      const result = await executeWorkflowStep(step, context, db, llm);
      stepResults.set(step.index, {
        index: step.index,
        status: "completed",
        data: result,
      });

      // Store step result in context for subsequent steps
      context[`step${step.index}`] = result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      stepResults.set(step.index, {
        index: step.index,
        status: "failed",
        error: errorMessage,
      });

      // Run compensation steps
      const compensationResults = await runCompensations(
        workflow.compensations,
        step.index,
        context,
        db,
      );

      return {
        success: false,
        stepResults,
        error: { step: step.index, message: errorMessage },
        compensationResults,
      };
    }
  }

  return { success: true, stepResults };
}

/** Execute a single workflow step */
async function executeWorkflowStep(
  step: WorkflowStep,
  context: Record<string, unknown>,
  db: DatabaseEngine,
  llm: LLMClient,
): Promise<unknown> {
  const config = step.config;

  switch (step.type) {
    case "validate": {
      const condition = config.condition as string;
      if (!condition) {
        throw new Error(`Validation failed: ${config.errorMessage ?? step.description}`);
      }
      return { validated: true };
    }

    case "db_read": {
      const collection = config.collection as string;
      const query = (config.query as Record<string, unknown>) ?? {};

      if (query.id) {
        const id = resolveWorkflowValue(query.id as string, context);
        return await db.read(collection, id as string);
      }

      const filters: Record<string, unknown> = {};
      const rawFilters = (query.filters as Record<string, string>) ?? {};
      for (const [key, source] of Object.entries(rawFilters)) {
        filters[key] = resolveWorkflowValue(source, context);
      }

      return await db.list(collection, {
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        limit: query.limit as number | undefined,
      });
    }

    case "db_write": {
      const collection = config.collection as string;
      const operation = (config.operation as string) ?? "create";
      const fieldMappings = (config.fields as Record<string, string>) ?? {};

      const data: Record<string, unknown> = {};
      for (const [field, source] of Object.entries(fieldMappings)) {
        data[field] = resolveWorkflowValue(source, context);
      }

      if (operation === "update" && config.id) {
        const id = resolveWorkflowValue(config.id as string, context);
        return await db.update(collection, id as string, data);
      }

      return await db.create(collection, data);
    }

    case "db_delete": {
      const collection = config.collection as string;
      const id = resolveWorkflowValue(config.id as string, context);
      await db.delete(collection, id as string);
      return { deleted: true };
    }

    case "call_action": {
      // Placeholder — in full implementation this calls back into the action executor
      return { called: config.toolName, status: "placeholder" };
    }

    case "call_integration": {
      // Placeholder — integrations are Phase 4
      console.error(`[workflow] Integration call not yet implemented: ${config.integration}`);
      return { integration: config.integration, status: "not_implemented" };
    }

    case "parallel": {
      const subSteps = (config.steps as WorkflowStep[]) ?? [];
      const results = await Promise.allSettled(
        subSteps.map((s) => executeWorkflowStep(s, context, db, llm)),
      );
      return results.map((r) =>
        r.status === "fulfilled" ? r.value : { error: r.reason?.message },
      );
    }

    case "decision": {
      const condition = config.condition as string;
      const resolved = resolveWorkflowValue(condition, context);
      const branch = resolved
        ? (config.ifTrue as WorkflowStep[])
        : (config.ifFalse as WorkflowStep[]);

      if (branch && Array.isArray(branch)) {
        const results = [];
        for (const s of branch) {
          results.push(await executeWorkflowStep(s, context, db, llm));
        }
        return results;
      }
      return null;
    }

    case "wait": {
      const duration = config.duration as number;
      if (duration) {
        await new Promise((r) => setTimeout(r, duration));
      }
      return { waited: duration ?? 0 };
    }

    default:
      console.error(`[workflow] Unknown step type: ${step.type}`);
      return null;
  }
}

/** Run compensation steps for a failed workflow step */
async function runCompensations(
  compensations: WorkflowCompensation[],
  failedStep: number,
  _context: Record<string, unknown>,
  _db: DatabaseEngine,
): Promise<CompensationResult[]> {
  const applicable = compensations.filter(
    (c) => c.forStep === failedStep || c.forStep === "*",
  );

  const results: CompensationResult[] = [];

  for (const comp of applicable) {
    try {
      // Compensation actions are described in natural language
      // For now, log them (full implementation would interpret via LLM)
      console.error(
        `[workflow] Running compensation for step ${comp.forStep}: ${comp.action}`,
      );
      results.push({
        forStep: comp.forStep,
        success: true,
        action: comp.action,
      });
    } catch (err) {
      results.push({
        forStep: comp.forStep,
        success: false,
        action: comp.action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

/** Resolve a value reference in workflow context */
function resolveWorkflowValue(
  source: string,
  context: Record<string, unknown>,
): unknown {
  if (!source || typeof source !== "string") return source;

  // context.var.field
  if (source.startsWith("context.")) {
    const parts = source.slice(8).split(".");
    let value: unknown = context;
    for (const part of parts) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  // input.field
  if (source.startsWith("input.")) {
    const field = source.slice(6);
    const input = context.input as Record<string, unknown> | undefined;
    return input?.[field];
  }

  // stepN.field
  const stepMatch = source.match(/^step(\d+)\.(.+)$/);
  if (stepMatch?.[1] && stepMatch[2]) {
    const stepResult = context[`step${stepMatch[1]}`];
    if (stepResult && typeof stepResult === "object") {
      return (stepResult as Record<string, unknown>)[stepMatch[2]];
    }
    return undefined;
  }

  return source;
}
