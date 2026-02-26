/**
 * Compiled workflow types — output of LLM-powered workflow compilation.
 * Workflows execute as sagas with compensation on failure.
 */

/** A compiled workflow definition */
export interface CompiledWorkflow {
  /** Workflow name (from filename) */
  name: string;
  /** Human-readable title (from H1) */
  title: string;
  /** Trigger condition */
  trigger: WorkflowTrigger;
  /** Ordered execution steps */
  steps: WorkflowStep[];
  /** Compensation handlers keyed by step index or "*" for catch-all */
  compensations: WorkflowCompensation[];
  /** Hash of source file for cache invalidation */
  sourceHash: string;
}

/** When a workflow is triggered */
export interface WorkflowTrigger {
  /** Type of trigger */
  type: "action_success" | "field_change" | "manual";
  /** For action_success: tool name that triggers this */
  action?: string;
  /** For field_change: entity and field */
  entity?: string;
  field?: string;
  value?: unknown;
}

/** A single step in a workflow */
export interface WorkflowStep {
  /** Step index (1-based to match markdown) */
  index: number;
  /** Step type */
  type: WorkflowStepType;
  /** Description from the markdown */
  description: string;
  /** Step configuration */
  config: Record<string, unknown>;
}

export type WorkflowStepType =
  | "validate"
  | "db_read"
  | "db_write"
  | "db_delete"
  | "call_action"
  | "call_integration"
  | "parallel"
  | "decision"
  | "wait";

/** Compensation handler for workflow failures */
export interface WorkflowCompensation {
  /** Which step(s) this compensates for ("*" for catch-all) */
  forStep: number | "*";
  /** Condition description */
  condition: string;
  /** What to do */
  action: string;
}
