/**
 * Workflow compiler — LLM-powered compilation of workflow markdown files
 * into structured step sequences with saga-pattern compensation.
 */

import { createHash } from "node:crypto";
import type {
  CompiledWorkflow,
  WorkflowTrigger,
  WorkflowStep,
  WorkflowCompensation,
} from "../types/workflow.ts";
import type { CompiledSchema } from "../types/schema.ts";
import type { LLMClient } from "../llm/client.ts";
import {
  buildWorkflowCompilationSystem,
  buildWorkflowCompilationPrompt,
} from "../llm/prompts.ts";

/**
 * Compile a single workflow file.
 */
export async function compileWorkflow(
  name: string,
  content: string,
  schemas: Map<string, CompiledSchema>,
  llm: LLMClient,
): Promise<CompiledWorkflow> {
  const system = buildWorkflowCompilationSystem();
  const prompt = buildWorkflowCompilationPrompt(name, content, schemas);

  const response = await llm.compile({
    system,
    prompt,
    jsonMode: true,
    maxTokens: 4096,
  });

  if (!response.json) {
    throw new Error(
      `Workflow compilation failed for ${name}: LLM did not return valid JSON`,
    );
  }

  const raw = response.json as Record<string, unknown>;

  return {
    name,
    title: (raw.title as string) ?? name,
    trigger: parseTrigger(raw.trigger),
    steps: parseSteps(raw.steps),
    compensations: parseCompensations(raw.compensations),
    sourceHash: computeHash(content),
  };
}

/**
 * Compile all workflow files in a project.
 */
export async function compileAllWorkflows(
  workflowFiles: Map<string, string>,
  schemas: Map<string, CompiledSchema>,
  llm: LLMClient,
  onProgress?: (name: string, index: number, total: number) => void,
): Promise<Map<string, CompiledWorkflow>> {
  const compiled = new Map<string, CompiledWorkflow>();
  const entries = Array.from(workflowFiles.entries());

  for (let i = 0; i < entries.length; i++) {
    const [name, content] = entries[i]!;
    onProgress?.(name, i + 1, entries.length);

    try {
      const workflow = await compileWorkflow(name, content, schemas, llm);
      compiled.set(name, workflow);
    } catch (err) {
      console.error(
        `[compiler] Failed to compile workflow ${name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return compiled;
}

function parseTrigger(raw: unknown): WorkflowTrigger {
  if (!raw || typeof raw !== "object") {
    return { type: "manual" };
  }
  const t = raw as Record<string, unknown>;
  return {
    type: (t.type as WorkflowTrigger["type"]) ?? "manual",
    action: t.action as string | undefined,
    entity: t.entity as string | undefined,
    field: t.field as string | undefined,
    value: t.value,
  };
}

function parseSteps(raw: unknown): WorkflowStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: Record<string, unknown>, i: number) => ({
    index: (s.index as number) ?? i + 1,
    type: (s.type as WorkflowStep["type"]) ?? "validate",
    description: (s.description as string) ?? "",
    config: (s.config as Record<string, unknown>) ?? {},
  }));
}

function parseCompensations(raw: unknown): WorkflowCompensation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: Record<string, unknown>) => ({
    forStep: (c.forStep as number | "*") ?? "*",
    condition: (c.condition as string) ?? "",
    action: (c.action as string) ?? "",
  }));
}

function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
