/**
 * Compiled rule types — output of LLM-powered rule compilation.
 * Rules are evaluated as a decision tree before action execution.
 */

/** A compiled rule set for one rule file (e.g. permissions.md → permissions) */
export interface CompiledRuleSet {
  /** Rule file name (without .md) */
  name: string;
  /** Category (permissions, validation, rate-limits, custom) */
  category: RuleCategory;
  /** Individual rules compiled from the file */
  rules: CompiledRule[];
  /** Hash of source file for cache invalidation */
  sourceHash: string;
}

export type RuleCategory =
  | "permissions"
  | "validation"
  | "rate-limits"
  | "custom";

/** A single compiled rule */
export interface CompiledRule {
  /** Human-readable description of the rule */
  description: string;
  /** Which actions this rule applies to (tool names, or "*" for all) */
  appliesTo: string[];
  /** Conditions that must ALL be true for this rule to pass */
  conditions: RuleCondition[];
  /** Error to return if the rule fails */
  onFailure: {
    code: string;
    message: string;
  };
}

/** A single condition within a rule */
export interface RuleCondition {
  /** What to check */
  type: RuleConditionType;
  /** Detailed config */
  config: Record<string, unknown>;
}

export type RuleConditionType =
  | "role_is"
  | "role_in"
  | "is_owner"
  | "field_equals"
  | "field_not_equals"
  | "field_exists"
  | "field_unique_in"
  | "not_self"
  | "rate_limit"
  | "custom";
