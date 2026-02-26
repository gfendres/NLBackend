/**
 * Execution plan types — the JSON output of LLM-powered compilation.
 * An execution plan fully describes how an action runs at runtime
 * without needing further LLM interpretation (Tier 1).
 */

import type { TierLevel, AuthRequirement } from "./action.ts";

/** A compiled execution plan for one action */
export interface ExecutionPlan {
  /** MCP tool name */
  toolName: string;
  /** Human-readable title */
  title: string;
  /** Description for LLM consumers */
  description: string;
  /** Tier classification */
  tier: TierLevel;
  /** Auth requirement */
  auth: AuthRequirement;
  /** The entity this action operates on */
  entity: string;
  /** Input parameters with validation */
  inputs: PlanInput[];
  /** Ordered execution steps */
  steps: PlanStep[];
  /** Error definitions */
  errors: PlanError[];
  /** Output shape description */
  outputDescription: string;
  /** Hash of source files for cache invalidation */
  sourceHash: string;
}

/** An input parameter in a plan */
export interface PlanInput {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  required: boolean;
  description: string;
  constraints?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    enum?: string[];
    pattern?: string;
  };
}

/** A single step in an execution plan */
export interface PlanStep {
  /** Step type */
  type: PlanStepType;
  /** Human-readable description of what this step does */
  description: string;
  /** Detailed config depending on step type */
  config: PlanStepConfig;
}

export type PlanStepType =
  | "validate"
  | "db_read"
  | "db_write"
  | "db_delete"
  | "transform"
  | "check"
  | "set_field"
  | "call_action"
  | "llm_interpret";

/** Union of step configs keyed by step type */
export type PlanStepConfig =
  | ValidateStepConfig
  | DbReadStepConfig
  | DbWriteStepConfig
  | DbDeleteStepConfig
  | TransformStepConfig
  | CheckStepConfig
  | SetFieldStepConfig
  | CallActionStepConfig
  | LlmInterpretStepConfig;

export interface ValidateStepConfig {
  type: "validate";
  /** Field name to validate */
  field: string;
  /** Validation rule */
  rule: string;
  /** Error code if validation fails */
  errorCode: string;
  /** Error message if validation fails */
  errorMessage: string;
}

export interface DbReadStepConfig {
  type: "db_read";
  /** Collection to read from */
  collection: string;
  /** Variable name to store result in step context */
  resultVar: string;
  /** How to find the record(s) */
  query: {
    /** Read by ID (from input field or literal) */
    id?: string;
    /** Filter criteria (field -> input source or literal) */
    filters?: Record<string, string>;
    /** Sort */
    sort_by?: string;
    sort_order?: "asc" | "desc";
    limit?: number;
    offset?: number;
  };
}

export interface DbWriteStepConfig {
  type: "db_write";
  /** Collection to write to */
  collection: string;
  /** "create" or "update" */
  operation: "create" | "update";
  /** For update: how to get the record ID */
  id?: string;
  /** Field mappings: record field -> source (input.fieldName, context.var, literal) */
  fields: Record<string, string>;
  /** Variable name to store result */
  resultVar: string;
}

export interface DbDeleteStepConfig {
  type: "db_delete";
  /** Collection to delete from */
  collection: string;
  /** Source of the ID to delete */
  id: string;
}

export interface TransformStepConfig {
  type: "transform";
  /** Source variable */
  sourceVar: string;
  /** Target variable */
  resultVar: string;
  /** Transformation to apply */
  operation: string;
}

export interface CheckStepConfig {
  type: "check";
  /** Condition to check (references step context) */
  condition: string;
  /** Error code if check fails */
  errorCode: string;
  /** Error message if check fails */
  errorMessage: string;
}

export interface SetFieldStepConfig {
  type: "set_field";
  /** Variable to modify */
  targetVar: string;
  /** Field name */
  field: string;
  /** Value source */
  value: string;
}

export interface CallActionStepConfig {
  type: "call_action";
  /** Tool name to call */
  toolName: string;
  /** Arguments mapping */
  arguments: Record<string, string>;
  /** Variable name for result */
  resultVar: string;
}

export interface LlmInterpretStepConfig {
  type: "llm_interpret";
  /** Prompt template (with {{variable}} placeholders) */
  prompt: string;
  /** Variable name for LLM response */
  resultVar: string;
}

/** Error definition in a plan */
export interface PlanError {
  code: string;
  message: string;
  /** HTTP-like status hint for severity */
  status?: number;
}
