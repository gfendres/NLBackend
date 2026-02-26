/**
 * LLM compilation prompts — structured prompts sent to the LLM
 * for compiling actions, rules, and workflows into execution plans.
 */

import type { CompiledSchema } from "../types/schema.ts";
import type { CompiledAction } from "../types/action.ts";

/**
 * Build the system prompt for action compilation.
 */
export function buildActionCompilationSystem(): string {
  return `You are the NLBackend compiler. Your job is to convert a natural language action definition into a deterministic JSON execution plan that the runtime can execute without further LLM involvement.

You will receive:
1. The action definition (markdown)
2. Referenced schema definitions (JSON)
3. Any applicable rule definitions (markdown)

You must return a JSON object with this exact structure:

{
  "steps": [
    {
      "type": "<step_type>",
      "description": "<what this step does>",
      "config": { <step-specific configuration> }
    }
  ],
  "errors": [
    {
      "code": "<snake_case_error_code>",
      "message": "<human-readable error message>"
    }
  ],
  "outputDescription": "<what the action returns on success>"
}

## Step Types

### "validate"
Check an input field against a rule. Config:
{ "type": "validate", "field": "<input field name>", "rule": "<validation expression>", "errorCode": "<code>", "errorMessage": "<msg>" }

### "db_read"
Read from the database. Config:
{ "type": "db_read", "collection": "<plural collection name>", "resultVar": "<variable name>", "query": { "id": "<source>", "filters": { "<field>": "<source>" }, "sort_by": "<field>", "sort_order": "asc|desc", "limit": <n>, "offset": <n> } }

### "db_write"
Create or update a record. Config:
{ "type": "db_write", "collection": "<plural collection>", "operation": "create|update", "id": "<source for updates>", "fields": { "<field>": "<source>" }, "resultVar": "<variable name>" }

### "db_delete"
Delete a record. Config:
{ "type": "db_delete", "collection": "<plural collection>", "id": "<source>" }

### "check"
Evaluate a condition and fail with error if false. Config:
{ "type": "check", "condition": "<condition expression>", "errorCode": "<code>", "errorMessage": "<msg>" }

### "set_field"
Set a field on a context variable. Config:
{ "type": "set_field", "targetVar": "<var>", "field": "<field name>", "value": "<source>" }

### "transform"
Apply a transformation. Config:
{ "type": "transform", "sourceVar": "<var>", "resultVar": "<var>", "operation": "<description>" }

## Source References

In config values, use these prefixes to reference data:
- "input.<field>" — references an input parameter
- "context.<var>" — references a variable set by a previous step
- "context.<var>.<field>" — references a field within a context variable
- Literal values: use the value directly (strings, numbers, booleans)

## Rules

1. Each step executes in order. If a validate or check step fails, execution stops and the error is returned.
2. The last db_write or db_read resultVar is typically what gets returned.
3. Be precise: use exact collection names (plural), exact field names from the schema.
4. For "create" operations, map each input field to the corresponding schema field. Auto-generated fields (id, timestamps) are handled by the runtime — do NOT include them.
5. Return ONLY the JSON object, no markdown wrapping, no explanation.`;
}

/**
 * Build the user prompt for compiling a single action.
 */
export function buildActionCompilationPrompt(
  action: CompiledAction,
  schemas: Map<string, CompiledSchema>,
  rules: Map<string, string>,
): string {
  const parts: string[] = [];

  parts.push("## Action Definition\n");
  parts.push(`Tool: ${action.toolName}`);
  parts.push(`Title: ${action.title}`);
  parts.push(`Entity: ${action.entity}`);
  parts.push(`Auth: ${formatAuth(action.auth)}`);
  parts.push(`Tier: ${action.tier}`);
  parts.push(`\n### What it does\n${action.description}`);

  if (action.inputs.length > 0) {
    parts.push("\n### Input Parameters");
    for (const input of action.inputs) {
      parts.push(
        `- ${input.name} (${input.type}, ${input.required ? "required" : "optional"}): ${input.description}`,
      );
    }
  }

  if (action.outputDescription) {
    parts.push(`\n### Output\n${action.outputDescription}`);
  }

  if (action.errors.length > 0) {
    parts.push("\n### Errors");
    for (const err of action.errors) {
      parts.push(`- ${err.code}: ${err.description}`);
    }
  }

  // Add referenced schemas
  const referencedSchemas = findReferencedSchemas(action, schemas);
  if (referencedSchemas.length > 0) {
    parts.push("\n## Referenced Schemas\n");
    for (const schema of referencedSchemas) {
      parts.push(`### ${schema.entity}`);
      parts.push(`Collection: ${pluralize(schema.entity.toLowerCase())}`);
      parts.push("Fields:");
      for (const field of schema.fields) {
        const attrs: string[] = [field.type];
        if (field.required) attrs.push("required");
        if (field.auto) attrs.push(`auto ${field.auto}`);
        if (field.unique) attrs.push("unique");
        if (field.indexed) attrs.push("indexed");
        if (field.immutable) attrs.push("immutable");
        if (field.default !== undefined) attrs.push(`default: ${JSON.stringify(field.default)}`);
        if (field.enumValues) attrs.push(`enum: [${field.enumValues.join(", ")}]`);
        if (field.referenceTo) attrs.push(`reference to ${field.referenceTo}`);
        if (field.min !== undefined) attrs.push(`min: ${field.min}`);
        if (field.max !== undefined) attrs.push(`max: ${field.max}`);
        parts.push(`  - ${field.name}: ${attrs.join(", ")}`);
      }
      parts.push("");
    }
  }

  // Add applicable rules
  const applicableRules = findApplicableRules(action, rules);
  if (applicableRules.length > 0) {
    parts.push("\n## Applicable Rules\n");
    for (const [name, content] of applicableRules) {
      parts.push(`### ${name}\n${content}\n`);
    }
  }

  return parts.join("\n");
}

/**
 * Build the system prompt for rule compilation.
 */
export function buildRuleCompilationSystem(): string {
  return `You are the NLBackend rule compiler. Your job is to convert natural language business rules into a structured JSON rule set that the runtime can evaluate deterministically.

You will receive:
1. A rule file (markdown) containing business rules
2. Available schema definitions for context

You must return a JSON object with this structure:

{
  "category": "permissions|validation|rate-limits|custom",
  "rules": [
    {
      "description": "<human-readable rule description>",
      "appliesTo": ["<tool_name>", ...] or ["*"] for all actions,
      "conditions": [
        {
          "type": "<condition_type>",
          "config": { <condition-specific config> }
        }
      ],
      "onFailure": {
        "code": "<error_code>",
        "message": "<error message>"
      }
    }
  ]
}

## Condition Types

- "role_is": { "role": "<role_name>" } — user must have this role
- "role_in": { "roles": ["<role1>", "<role2>"] } — user must have one of these roles
- "is_owner": { "field": "<field_name>" } — the record's field must match the authenticated user's ID
- "field_equals": { "field": "<field>", "value": "<expected>" } — a field equals a value
- "field_not_equals": { "field": "<field>", "value": "<expected>" } — a field does not equal a value
- "field_exists": { "field": "<field>" } — a field is present and not null
- "field_unique_in": { "field": "<field>", "collection": "<collection>", "scope": { "<field>": "<source>" } } — field value is unique within a scoped query
- "not_self": { "ownerField": "<field>", "targetField": "<field>" } — the action target is not the user themselves
- "rate_limit": { "requests": <n>, "windowSeconds": <n> } — rate limiting
- "custom": { "expression": "<description>" } — fallback for rules that don't fit standard types

## Rules

1. Each rule in the "rules" array is evaluated independently.
2. ALL conditions in a rule must be true for the rule to pass.
3. If any condition fails, the onFailure error is returned.
4. Be specific about which actions each rule applies to. Use tool names like "recipes_create", "users_update", etc.
5. For ownership rules, use "is_owner" with a fallback "role_is" for admin override. Structure these as separate rules if needed.
6. Return ONLY the JSON object.`;
}

/**
 * Build the user prompt for compiling rules.
 */
export function buildRuleCompilationPrompt(
  name: string,
  content: string,
  schemas: Map<string, CompiledSchema>,
): string {
  const parts: string[] = [];

  parts.push(`## Rule File: ${name}.md\n`);
  parts.push(content);

  parts.push("\n## Available Schemas\n");
  for (const [, schema] of schemas) {
    parts.push(`### ${schema.entity}`);
    parts.push(`Collection: ${pluralize(schema.entity.toLowerCase())}`);
    const fields = schema.fields.map(
      (f) => `${f.name} (${f.type}${f.required ? ", required" : ""})`,
    );
    parts.push(`Fields: ${fields.join(", ")}\n`);
  }

  return parts.join("\n");
}

/**
 * Build the system prompt for workflow compilation.
 */
export function buildWorkflowCompilationSystem(): string {
  return `You are the NLBackend workflow compiler. Your job is to convert natural language workflow definitions into structured JSON execution plans using the saga pattern.

You must return a JSON object with this structure:

{
  "title": "<workflow title>",
  "trigger": {
    "type": "action_success|field_change|manual",
    "action": "<tool_name if action_success>",
    "entity": "<entity if field_change>",
    "field": "<field if field_change>",
    "value": <value if field_change>
  },
  "steps": [
    {
      "index": <1-based>,
      "type": "validate|db_read|db_write|db_delete|call_action|call_integration|parallel|decision|wait",
      "description": "<what this step does>",
      "config": { <step-specific configuration> }
    }
  ],
  "compensations": [
    {
      "forStep": <step_index or "*">,
      "condition": "<when to compensate>",
      "action": "<what to do>"
    }
  ]
}

## Step Types

- "validate": Check a condition, fail workflow if false. Config: { "condition": "<expr>", "errorMessage": "<msg>" }
- "db_write": Create or update a record. Config: { "collection": "<name>", "operation": "create|update", "id": "<source>", "fields": { ... }, "resultVar": "<var>" }
- "db_read": Read records. Config: { "collection": "<name>", "query": { ... }, "resultVar": "<var>" }
- "db_delete": Delete a record. Config: { "collection": "<name>", "id": "<source>" }
- "call_action": Call another action tool. Config: { "toolName": "<name>", "arguments": { ... }, "resultVar": "<var>" }
- "call_integration": Call external service. Config: { "integration": "<name>", "action": "<action>", "params": { ... } }
- "parallel": Execute sub-steps concurrently. Config: { "steps": [<sub-steps>] }
- "decision": Branch based on condition. Config: { "condition": "<expr>", "ifTrue": [<steps>], "ifFalse": [<steps>] }
- "wait": Wait for condition or time. Config: { "duration": <ms> } or { "condition": "<expr>" }

## Rules

1. Steps execute in order. Each step commits independently (saga pattern).
2. Compensations define what to undo if a step fails.
3. Use "context.<var>" to reference results from previous steps.
4. Return ONLY the JSON object.`;
}

/**
 * Build the user prompt for compiling a workflow.
 */
export function buildWorkflowCompilationPrompt(
  name: string,
  content: string,
  schemas: Map<string, CompiledSchema>,
): string {
  const parts: string[] = [];

  parts.push(`## Workflow File: ${name}.md\n`);
  parts.push(content);

  parts.push("\n## Available Schemas\n");
  for (const [, schema] of schemas) {
    parts.push(`### ${schema.entity}`);
    parts.push(`Collection: ${pluralize(schema.entity.toLowerCase())}`);
    const fields = schema.fields.map(
      (f) => `${f.name} (${f.type}${f.required ? ", required" : ""})`,
    );
    parts.push(`Fields: ${fields.join(", ")}\n`);
  }

  return parts.join("\n");
}

// --- Helpers ---

function formatAuth(auth: { level: string; role?: string }): string {
  if (auth.level === "public") return "Public";
  if (auth.level === "role" && auth.role) return `Role: ${auth.role}`;
  return "Authenticated";
}

function findReferencedSchemas(
  action: CompiledAction,
  schemas: Map<string, CompiledSchema>,
): CompiledSchema[] {
  const results: CompiledSchema[] = [];

  // Always include the entity's own schema
  const entitySchema = schemas.get(action.entity.toLowerCase());
  if (entitySchema) results.push(entitySchema);

  // Check for referenced entities in inputs and description
  for (const [, schema] of schemas) {
    if (schema === entitySchema) continue;
    const name = schema.entity.toLowerCase();
    const mentioned =
      action.description.toLowerCase().includes(name) ||
      action.inputs.some(
        (i) => i.description.toLowerCase().includes(name),
      );
    if (mentioned) results.push(schema);
  }

  return results;
}

function findApplicableRules(
  action: CompiledAction,
  rules: Map<string, string>,
): [string, string][] {
  const results: [string, string][] = [];

  for (const [name, content] of rules) {
    // Include rules that mention the entity or the tool name
    const lower = content.toLowerCase();
    if (
      lower.includes(action.entity.toLowerCase()) ||
      lower.includes(action.toolName)
    ) {
      results.push([name, content]);
    }
  }

  // Always include permissions and validation rules
  for (const always of ["permissions", "validation"]) {
    const rule = rules.get(always);
    if (rule && !results.some(([n]) => n === always)) {
      results.push([always, rule]);
    }
  }

  return results;
}

function pluralize(name: string): string {
  if (name.endsWith("s")) return name;
  if (name.endsWith("y")) return name.slice(0, -1) + "ies";
  return name + "s";
}
