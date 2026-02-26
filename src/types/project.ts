import type { CompiledSchema } from "./schema.ts";
import type { CompiledAction } from "./action.ts";
import type { ExecutionPlan } from "./execution-plan.ts";
import type { CompiledRuleSet } from "./rule.ts";
import type { CompiledWorkflow } from "./workflow.ts";

/** The loaded state of an NLBackend project */
export interface Project {
  /** Absolute path to the project root folder */
  rootPath: string;
  /** Project metadata from project.md */
  name: string;
  description: string;
  /** Compiled schemas, keyed by entity name (lowercase) */
  schemas: Map<string, CompiledSchema>;
  /** Parsed actions (pre-LLM compilation), keyed by tool name */
  actions: Map<string, CompiledAction>;
  /** LLM-compiled execution plans, keyed by tool name */
  executionPlans: Map<string, ExecutionPlan>;
  /** LLM-compiled rule sets, keyed by rule file name */
  compiledRules: Map<string, CompiledRuleSet>;
  /** LLM-compiled workflows, keyed by workflow name */
  compiledWorkflows: Map<string, CompiledWorkflow>;
  /** Raw rule file contents, keyed by filename (without .md) */
  rules: Map<string, string>;
  /** Raw workflow file contents, keyed by filename (without .md) */
  workflows: Map<string, string>;
  /** Raw integration file contents, keyed by filename (without .md) */
  integrations: Map<string, string>;
}

/** Recognized top-level folders in a project */
export const PROJECT_FOLDERS = [
  "schema",
  "actions",
  "rules",
  "workflows",
  "integrations",
  "db",
  "tests",
  "config",
  "agents",
] as const;

export type ProjectFolder = (typeof PROJECT_FOLDERS)[number];
