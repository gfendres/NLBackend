/**
 * Rule compiler — LLM-powered compilation of rule markdown files
 * into structured decision trees for the rule engine.
 */

import { createHash } from "node:crypto";
import type { CompiledRuleSet, CompiledRule, RuleCategory } from "../types/rule.ts";
import type { CompiledSchema } from "../types/schema.ts";
import type { LLMClient } from "../llm/client.ts";
import {
  buildRuleCompilationSystem,
  buildRuleCompilationPrompt,
} from "../llm/prompts.ts";

/**
 * Compile a single rule file into a structured rule set.
 */
export async function compileRules(
  name: string,
  content: string,
  schemas: Map<string, CompiledSchema>,
  llm: LLMClient,
): Promise<CompiledRuleSet> {
  const system = buildRuleCompilationSystem();
  const prompt = buildRuleCompilationPrompt(name, content, schemas);

  const response = await llm.compile({
    system,
    prompt,
    jsonMode: true,
    maxTokens: 4096,
  });

  if (!response.json) {
    throw new Error(`Rule compilation failed for ${name}: LLM did not return valid JSON`);
  }

  const raw = response.json as Record<string, unknown>;
  const category = (raw.category as RuleCategory) ?? inferCategory(name);
  const rules = parseRules(raw.rules);

  return {
    name,
    category,
    rules,
    sourceHash: computeHash(content),
  };
}

/**
 * Compile all rule files in a project.
 */
export async function compileAllRules(
  ruleFiles: Map<string, string>,
  schemas: Map<string, CompiledSchema>,
  llm: LLMClient,
  onProgress?: (name: string, index: number, total: number) => void,
): Promise<Map<string, CompiledRuleSet>> {
  const compiled = new Map<string, CompiledRuleSet>();
  const entries = Array.from(ruleFiles.entries());

  for (let i = 0; i < entries.length; i++) {
    const [name, content] = entries[i]!;
    onProgress?.(name, i + 1, entries.length);

    try {
      const ruleSet = await compileRules(name, content, schemas, llm);
      compiled.set(name, ruleSet);
    } catch (err) {
      console.error(
        `[compiler] Failed to compile rules ${name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return compiled;
}

function parseRules(raw: unknown): CompiledRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: Record<string, unknown>) => ({
    description: (r.description as string) ?? "",
    appliesTo: Array.isArray(r.appliesTo) ? (r.appliesTo as string[]) : ["*"],
    conditions: Array.isArray(r.conditions)
      ? (r.conditions as CompiledRule["conditions"])
      : [],
    onFailure: (r.onFailure as CompiledRule["onFailure"]) ?? {
      code: "rule_violation",
      message: "Rule check failed",
    },
  }));
}

function inferCategory(name: string): RuleCategory {
  const lower = name.toLowerCase();
  if (lower.includes("permission") || lower.includes("auth")) return "permissions";
  if (lower.includes("validation") || lower.includes("valid")) return "validation";
  if (lower.includes("rate") || lower.includes("limit")) return "rate-limits";
  return "custom";
}

function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
