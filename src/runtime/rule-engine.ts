/**
 * Rule engine — evaluates compiled rules before action execution.
 * Rules are checked in priority order: permissions → validation → rate-limits → custom.
 */

import type { CompiledRuleSet, CompiledRule, RuleCondition } from "../types/rule.ts";
import type { DatabaseEngine } from "../database/engine.ts";

/** Context available to the rule engine for evaluation */
export interface RuleContext {
  /** The tool being called */
  toolName: string;
  /** Input arguments */
  input: Record<string, unknown>;
  /** Authenticated user (null if unauthenticated) */
  user: { id: string; role: string } | null;
  /** The target record (for update/delete operations, if pre-fetched) */
  targetRecord?: Record<string, unknown> | null;
}

export interface RuleViolation {
  code: string;
  message: string;
  ruleName: string;
  ruleDescription: string;
}

/** Priority order for rule categories */
const CATEGORY_PRIORITY = [
  "permissions",
  "validation",
  "rate-limits",
  "custom",
] as const;

/**
 * Evaluate all applicable rules for a tool call.
 * Returns null if all rules pass, or the first violation.
 */
export async function evaluateRules(
  ruleSets: Map<string, CompiledRuleSet>,
  context: RuleContext,
  db: DatabaseEngine,
): Promise<RuleViolation | null> {
  // Sort rule sets by category priority
  const sorted = Array.from(ruleSets.values()).sort((a, b) => {
    const aIdx = CATEGORY_PRIORITY.indexOf(a.category as typeof CATEGORY_PRIORITY[number]);
    const bIdx = CATEGORY_PRIORITY.indexOf(b.category as typeof CATEGORY_PRIORITY[number]);
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  for (const ruleSet of sorted) {
    for (const rule of ruleSet.rules) {
      // Check if this rule applies to the current tool
      if (!ruleApplies(rule, context.toolName)) continue;

      const violation = await evaluateRule(rule, ruleSet.name, context, db);
      if (violation) return violation;
    }
  }

  return null;
}

/** Check if a rule applies to a given tool name */
function ruleApplies(rule: CompiledRule, toolName: string): boolean {
  if (rule.appliesTo.includes("*")) return true;
  return rule.appliesTo.some((pattern) => {
    if (pattern === toolName) return true;
    // Support prefix matching: "recipes_*" matches "recipes_create"
    if (pattern.endsWith("*")) {
      return toolName.startsWith(pattern.slice(0, -1));
    }
    return false;
  });
}

/** Evaluate a single rule against the context */
async function evaluateRule(
  rule: CompiledRule,
  ruleSetName: string,
  context: RuleContext,
  db: DatabaseEngine,
): Promise<RuleViolation | null> {
  // ALL conditions must be true for the rule to pass
  for (const condition of rule.conditions) {
    const passes = await evaluateCondition(condition, context, db);
    if (!passes) {
      return {
        code: rule.onFailure.code,
        message: rule.onFailure.message,
        ruleName: ruleSetName,
        ruleDescription: rule.description,
      };
    }
  }
  return null;
}

/** Evaluate a single condition */
async function evaluateCondition(
  condition: RuleCondition,
  context: RuleContext,
  db: DatabaseEngine,
): Promise<boolean> {
  const config = condition.config;

  switch (condition.type) {
    case "role_is": {
      const requiredRole = config.role as string;
      return context.user?.role === requiredRole;
    }

    case "role_in": {
      const roles = config.roles as string[];
      return !!context.user && roles.includes(context.user.role);
    }

    case "is_owner": {
      const field = config.field as string;
      if (!context.user) return false;
      // Check in the target record
      if (context.targetRecord) {
        return context.targetRecord[field] === context.user.id;
      }
      // Check in input (for create operations)
      return context.input[field] === context.user.id;
    }

    case "field_equals": {
      const field = config.field as string;
      const expected = config.value;
      const actual = context.input[field] ?? context.targetRecord?.[field];
      return actual === expected;
    }

    case "field_not_equals": {
      const field = config.field as string;
      const expected = config.value;
      const actual = context.input[field] ?? context.targetRecord?.[field];
      return actual !== expected;
    }

    case "field_exists": {
      const field = config.field as string;
      const value = context.input[field];
      return value !== undefined && value !== null;
    }

    case "field_unique_in": {
      const field = config.field as string;
      const collection = config.collection as string;
      const scope = (config.scope as Record<string, string>) ?? {};
      const value = context.input[field];
      if (!value) return true; // Nothing to check

      const filters: Record<string, unknown> = { [field]: value };
      for (const [scopeField, source] of Object.entries(scope)) {
        filters[scopeField] = context.input[source] ?? context.user?.id;
      }

      const result = await db.list(collection, { filters, limit: 1 });
      return result.data.length === 0;
    }

    case "not_self": {
      const ownerField = config.ownerField as string;
      const targetField = config.targetField as string;
      const owner = context.input[ownerField] ?? context.user?.id;
      const target = context.input[targetField] ?? context.targetRecord?.[targetField];
      return owner !== target;
    }

    case "rate_limit": {
      // Rate limiting is tracked in-memory (simplified for v1)
      // TODO: implement proper rate limiting with sliding window
      return true;
    }

    case "custom": {
      // Custom conditions require runtime interpretation
      // For now, pass them through (they'll be enforced at Tier 2/3)
      return true;
    }

    default:
      return true;
  }
}
