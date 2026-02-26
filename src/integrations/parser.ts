/**
 * Integration parser — extracts integration config from markdown files.
 * Parses Provider, Authentication, Available Actions, and Error Handling sections.
 */

import type {
  CompiledIntegration,
  IntegrationAuth,
  IntegrationAction,
  IntegrationInput,
  ErrorPolicy,
} from "../types/integration.ts";

/** Parse an integration markdown file into a CompiledIntegration */
export function parseIntegration(
  content: string,
  name: string,
): CompiledIntegration {
  const provider = parseProvider(content);
  const auth = parseAuth(content);
  const actions = parseActions(content);
  const errorHandling = parseErrorHandling(content);

  return {
    name,
    provider: provider.name,
    baseUrl: provider.baseUrl,
    auth,
    actions,
    errorHandling,
  };
}

// --- Provider section ---

function parseProvider(content: string): { name: string; baseUrl: string } {
  const section = extractSection(content, "Provider");
  if (!section) return { name: "Unknown", baseUrl: "" };

  // First non-empty line is "Name (url)" or just "Name"
  const line = section.split("\n").find((l) => l.trim().length > 0) ?? "";
  const urlMatch = line.match(/\(?(https?:\/\/[^\s)]+)\)?/);
  const name = line.replace(/\(.*\)/, "").trim();

  return {
    name: name || "Unknown",
    baseUrl: urlMatch?.[1] ?? "",
  };
}

// --- Authentication section ---

function parseAuth(content: string): IntegrationAuth {
  const section = extractSection(content, "Authentication");
  if (!section) {
    return { method: "none", envVar: "", location: "header" };
  }

  const lower = section.toLowerCase();

  // Extract env var name — look for all-caps word (API key env var pattern)
  const envVarMatch = section.match(
    /(?:environment variable|env\b)\s+([A-Z][A-Z0-9_]+)/i,
  );
  const envVar = envVarMatch?.[1] ?? "";

  // Determine auth method
  let method: IntegrationAuth["method"] = "api_key";
  if (lower.includes("bearer")) method = "bearer";
  else if (lower.includes("basic")) method = "basic";
  else if (lower.includes("oauth")) method = "bearer";

  // Default header/prefix based on method
  const prefix = method === "bearer" ? "Bearer" : method === "api_key" ? "" : "";
  const headerName = method === "bearer" ? "Authorization" : "Authorization";

  return {
    method,
    envVar,
    location: "header",
    headerName,
    prefix,
  };
}

// --- Available Actions section ---

function parseActions(content: string): IntegrationAction[] {
  const section = extractSection(content, "Available Actions");
  if (!section) return [];

  const actions: IntegrationAction[] = [];

  // Split by H3 headings (### Action Name)
  const actionBlocks = section.split(/^###\s+/m).filter((b) => b.trim());

  for (const block of actionBlocks) {
    const lines = block.split("\n");
    const actionName = lines[0]?.trim() ?? "Unknown";

    const inputs: IntegrationInput[] = [];
    for (const line of lines.slice(1)) {
      const inputMatch = line.match(
        /^-\s+\*\*(\w+)\*\*\s*:\s*(.+)/,
      );
      if (inputMatch?.[1] && inputMatch[2]) {
        const desc = inputMatch[2].trim();
        const required =
          desc.toLowerCase().includes("(required)") ||
          desc.toLowerCase().includes("required");
        inputs.push({
          name: inputMatch[1],
          required,
          description: desc.replace(/\(required\)/gi, "").trim(),
        });
      }
    }

    // Derive HTTP method from action name
    const method = deriveMethod(actionName);
    const path = derivePath(actionName);

    actions.push({
      name: actionName,
      method,
      path,
      inputs,
      responseType: "json",
    });
  }

  return actions;
}

/** Derive HTTP method from action name */
function deriveMethod(
  name: string,
): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" {
  const lower = name.toLowerCase();
  if (lower.startsWith("delete") || lower.startsWith("remove")) return "DELETE";
  if (lower.startsWith("update") || lower.startsWith("edit")) return "PATCH";
  if (lower.startsWith("get") || lower.startsWith("list") || lower.startsWith("check"))
    return "GET";
  return "POST";
}

/** Derive API path from action name */
function derivePath(name: string): string {
  return (
    "/" +
    name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
  );
}

// --- Error Handling section ---

function parseErrorHandling(content: string): ErrorPolicy[] {
  const section = extractSection(content, "Error Handling");
  if (!section) return [];

  const policies: ErrorPolicy[] = [];
  const lines = section.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("-")) continue;

    const lower = trimmed.toLowerCase();

    // Match status codes
    const statusMatch = trimmed.match(/(\d{3}|[45]xx)/i);
    const condition = statusMatch?.[1] ?? "error";

    // Determine action
    let action: ErrorPolicy["action"] = "fail";
    let retryDelayMs: number | undefined;
    let maxRetries: number | undefined;

    if (lower.includes("retry")) {
      action = "retry";
      maxRetries = 1;
      const delayMatch = lower.match(/wait\s+(\d+)\s*seconds?/);
      if (delayMatch?.[1]) {
        retryDelayMs = parseInt(delayMatch[1], 10) * 1000;
      } else {
        retryDelayMs = 1000;
      }
      const retryCountMatch = lower.match(/retry\s+(\d+)\s*times?/);
      if (retryCountMatch?.[1]) {
        maxRetries = parseInt(retryCountMatch[1], 10);
      }
    } else if (lower.includes("log") || lower.includes("ignore")) {
      action = "ignore";
    }

    policies.push({ condition, action, retryDelayMs, maxRetries });
  }

  return policies;
}

// --- Helpers ---

/** Extract content of a markdown section by heading */
function extractSection(content: string, heading: string): string | null {
  const regex = new RegExp(
    `^##\\s+${escapeRegex(heading)}\\s*$`,
    "mi",
  );
  const match = regex.exec(content);
  if (!match) return null;

  const start = match.index + match[0].length;
  const nextSection = content.slice(start).search(/^##\s+/m);
  const end = nextSection === -1 ? content.length : start + nextSection;

  return content.slice(start, end).trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
