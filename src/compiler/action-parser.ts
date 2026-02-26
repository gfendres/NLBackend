/**
 * Action parser — extracts structured metadata from action markdown files.
 * Parses title, auth, tier, description, inputs, outputs, and errors.
 * This is a pre-processing step before LLM compilation.
 */

import type {
  CompiledAction,
  AuthRequirement,
  TierLevel,
  ActionInput,
  ActionError,
} from "../types/action.ts";

/** Parse an action markdown file into a pre-compiled action structure */
export function parseAction(
  content: string,
  filePath: string,
  entity: string,
  operation: string,
): CompiledAction {
  const lines = content.split("\n");

  const title = extractTitle(lines);
  const toolNameOverride = extractDirective(lines, "Tool");
  const toolName = toolNameOverride ?? `${entity}_${operation}`;
  const auth = extractAuth(lines);
  const tier = extractTier(lines);
  const description = extractSection(lines, "What it does");
  const inputs = extractInputs(lines);
  const outputDescription = extractSection(lines, "Output");
  const errors = extractErrors(lines);

  return {
    toolName,
    title,
    description,
    tier,
    auth,
    inputs,
    outputDescription,
    errors,
    entity,
    sourcePath: filePath,
  };
}

/** Extract the H1 title */
function extractTitle(lines: string[]): string {
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match?.[1]) return match[1].trim();
  }
  return "Untitled Action";
}

/** Extract a **Key:** directive value */
function extractDirective(lines: string[], key: string): string | undefined {
  const pattern = new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`, "i");
  for (const line of lines) {
    const match = line.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

/** Extract auth requirement from **Auth:** directive */
function extractAuth(lines: string[]): AuthRequirement {
  const raw = extractDirective(lines, "Auth");
  if (!raw) return { level: "public" };

  const lower = raw.toLowerCase().trim();

  if (lower === "public" || lower === "none") {
    return { level: "public" };
  }
  if (lower === "authenticated" || lower === "auth" || lower === "required") {
    return { level: "authenticated" };
  }

  // Check for role-based: "Admin only", "Editor", etc.
  const roleMatch = lower.match(/^(\w+)\s*(?:only)?$/);
  if (roleMatch?.[1]) {
    return { level: "role", role: roleMatch[1].toLowerCase() };
  }

  return { level: "authenticated" };
}

/** Extract tier from **Tier:** directive */
function extractTier(lines: string[]): TierLevel {
  const raw = extractDirective(lines, "Tier");
  if (!raw) return 1; // Default to Tier 1
  const num = parseInt(raw, 10);
  if (num === 1 || num === 2 || num === 3) return num;
  return 1;
}

/**
 * Extract content from a markdown section.
 * Looks for a ## heading matching the name, captures everything until the next ## heading.
 */
function extractSection(lines: string[], sectionName: string): string {
  let capturing = false;
  const captured: string[] = [];
  const namePattern = new RegExp(`^##\\s+${escapeRegex(sectionName)}`, "i");

  for (const line of lines) {
    if (namePattern.test(line)) {
      capturing = true;
      continue;
    }
    if (capturing && line.match(/^##\s+/)) break;
    if (capturing) captured.push(line);
  }

  return captured
    .join("\n")
    .trim();
}

/** Extract input parameters from the ## Input section */
function extractInputs(lines: string[]): ActionInput[] {
  const inputText = extractSection(lines, "Input");
  if (!inputText) return [];

  const inputs: ActionInput[] = [];
  const inputLines = inputText.split("\n");

  for (const line of inputLines) {
    // Match: - **name** (required/optional): description
    const match = line.match(
      /^-\s+\*\*(\w+)\*\*\s*\((\w+)\):\s*(.+)$/,
    );
    if (match) {
      const [, name, reqType, desc] = match;
      if (!name || !reqType || !desc) continue;

      const required = reqType.toLowerCase() === "required";

      // Try to extract type from description
      const typeMatch = desc.match(
        /^(?:The\s+)?(?:(?:a|an|the)\s+)?(\w+)/i,
      );
      const type = inferType(typeMatch?.[1] ?? "string", desc);

      inputs.push({
        name,
        type,
        required,
        description: desc.trim(),
      });
      continue;
    }

    // Simpler format: - **name**: description
    const simpleMatch = line.match(/^-\s+\*\*(\w+)\*\*:\s*(.+)$/);
    if (simpleMatch) {
      const [, name, desc] = simpleMatch;
      if (!name || !desc) continue;

      const required = !desc.toLowerCase().includes("optional");
      const type = inferType("string", desc);

      inputs.push({
        name,
        type,
        required,
        description: desc.trim(),
      });
    }
  }

  return inputs;
}

/** Extract errors from the ## Errors section */
function extractErrors(lines: string[]): ActionError[] {
  const errorText = extractSection(lines, "Errors");
  if (!errorText) return [];

  const errors: ActionError[] = [];
  const errorLines = errorText.split("\n");

  for (const line of errorLines) {
    // Match: - **error_code**: description
    const match = line.match(/^-\s+\*\*(\w+)\*\*:\s*(.+)$/);
    if (match) {
      const [, code, desc] = match;
      if (!code || !desc) continue;
      errors.push({ code, description: desc.trim() });
    }
  }

  return errors;
}

/** Infer a parameter type from description context */
function inferType(firstWord: string, description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes("array of") || lower.includes("list of")) return "array";
  if (lower.includes("number") || lower.includes("integer")) return "number";
  if (lower.includes("boolean") || lower.includes("true/false")) return "boolean";
  if (lower.includes("object")) return "object";

  const word = firstWord.toLowerCase();
  if (["number", "integer", "int", "count", "amount"].includes(word))
    return "number";
  if (["boolean", "bool", "flag"].includes(word)) return "boolean";
  if (["array", "list"].includes(word)) return "array";
  if (["object", "map", "record"].includes(word)) return "object";

  return "string";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
