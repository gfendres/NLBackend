/**
 * Compiled cache — persists LLM-compiled execution plans, rules, and workflows
 * to disk so the server can warm-start without re-calling the LLM.
 */

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import type { ExecutionPlan } from "../types/execution-plan.ts";
import type { CompiledRuleSet } from "../types/rule.ts";
import type { CompiledWorkflow } from "../types/workflow.ts";

const CACHE_DIR = ".compiled";

export class CompiledCache {
  private cacheDir: string;

  constructor(projectPath: string) {
    this.cacheDir = join(projectPath, CACHE_DIR);
  }

  // --- Execution Plans ---

  async saveExecutionPlan(toolName: string, plan: ExecutionPlan): Promise<void> {
    const dir = join(this.cacheDir, "plans");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${sanitize(toolName)}.json`),
      JSON.stringify(plan, null, 2),
    );
  }

  async loadExecutionPlans(): Promise<Map<string, ExecutionPlan>> {
    return this.loadJsonFiles<ExecutionPlan>(join(this.cacheDir, "plans"));
  }

  // --- Compiled Rules ---

  async saveRuleSet(name: string, ruleSet: CompiledRuleSet): Promise<void> {
    const dir = join(this.cacheDir, "rules");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${sanitize(name)}.json`),
      JSON.stringify(ruleSet, null, 2),
    );
  }

  async loadRuleSets(): Promise<Map<string, CompiledRuleSet>> {
    return this.loadJsonFiles<CompiledRuleSet>(join(this.cacheDir, "rules"));
  }

  // --- Compiled Workflows ---

  async saveWorkflow(name: string, workflow: CompiledWorkflow): Promise<void> {
    const dir = join(this.cacheDir, "workflows");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${sanitize(name)}.json`),
      JSON.stringify(workflow, null, 2),
    );
  }

  async loadWorkflows(): Promise<Map<string, CompiledWorkflow>> {
    return this.loadJsonFiles<CompiledWorkflow>(join(this.cacheDir, "workflows"));
  }

  // --- Bulk Operations ---

  /** Save all compiled artifacts to disk */
  async saveAll(
    plans: Map<string, ExecutionPlan>,
    rules: Map<string, CompiledRuleSet>,
    workflows: Map<string, CompiledWorkflow>,
  ): Promise<void> {
    const saves: Promise<void>[] = [];
    for (const [name, plan] of plans) {
      saves.push(this.saveExecutionPlan(name, plan));
    }
    for (const [name, ruleSet] of rules) {
      saves.push(this.saveRuleSet(name, ruleSet));
    }
    for (const [name, workflow] of workflows) {
      saves.push(this.saveWorkflow(name, workflow));
    }
    await Promise.all(saves);
  }

  /** Load all cached compiled artifacts from disk */
  async loadAll(): Promise<{
    plans: Map<string, ExecutionPlan>;
    rules: Map<string, CompiledRuleSet>;
    workflows: Map<string, CompiledWorkflow>;
    loaded: boolean;
  }> {
    try {
      const [plans, rules, workflows] = await Promise.all([
        this.loadExecutionPlans(),
        this.loadRuleSets(),
        this.loadWorkflows(),
      ]);

      const loaded = plans.size > 0 || rules.size > 0 || workflows.size > 0;
      return { plans, rules, workflows, loaded };
    } catch {
      return {
        plans: new Map(),
        rules: new Map(),
        workflows: new Map(),
        loaded: false,
      };
    }
  }

  /** Clear all cached compilations */
  async clear(): Promise<void> {
    try {
      await rm(this.cacheDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist — nothing to clear
    }
  }

  // --- Helpers ---

  private async loadJsonFiles<T>(dir: string): Promise<Map<string, T>> {
    const result = new Map<string, T>();

    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return result; // Directory doesn't exist
    }

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const key = basename(file, ".json");
      try {
        const content = await readFile(join(dir, file), "utf-8");
        result.set(key, JSON.parse(content) as T);
      } catch (err) {
        console.error(`[cache] Failed to load ${file}:`, err);
      }
    }

    return result;
  }
}

/** Sanitize a name for use as a filename */
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}
