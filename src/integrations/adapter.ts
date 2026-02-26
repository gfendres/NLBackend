/**
 * Integration adapter — executes integration calls (HTTP, Email, Webhooks).
 * Uses the parsed integration config to make real HTTP requests.
 */

import type {
  CompiledIntegration,
  IntegrationAction,
  IntegrationCallResult,
  ErrorPolicy,
} from "../types/integration.ts";

/**
 * Call an integration action with the given parameters.
 */
export async function callIntegration(
  integration: CompiledIntegration,
  actionName: string,
  params: Record<string, unknown>,
): Promise<IntegrationCallResult> {
  const action = integration.actions.find(
    (a) => a.name.toLowerCase() === actionName.toLowerCase(),
  );

  if (!action) {
    return {
      success: false,
      error: `Action "${actionName}" not found in integration "${integration.name}". Available: ${integration.actions.map((a) => a.name).join(", ")}`,
    };
  }

  return executeWithRetry(integration, action, params);
}

/** Execute an integration call with error policy retry handling */
async function executeWithRetry(
  integration: CompiledIntegration,
  action: IntegrationAction,
  params: Record<string, unknown>,
): Promise<IntegrationCallResult> {
  const maxAttempts = getMaxAttempts(integration.errorHandling);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await executeOnce(integration, action, params);

    if (result.success) return result;

    // Check error policies for retry
    const policy = findMatchingPolicy(integration.errorHandling, result.status);
    if (policy?.action === "retry" && attempt < maxAttempts) {
      const delay = policy.retryDelayMs ?? 1000;
      console.error(
        `[integration] ${integration.name}/${action.name} failed (status ${result.status}), retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`,
      );
      await sleep(delay);
      continue;
    }

    if (policy?.action === "ignore") {
      console.error(
        `[integration] ${integration.name}/${action.name} failed (status ${result.status}), ignoring per error policy`,
      );
      return { success: true, status: result.status, data: null };
    }

    return result;
  }

  return { success: false, error: "Max retry attempts exceeded" };
}

/** Make a single HTTP request */
async function executeOnce(
  integration: CompiledIntegration,
  action: IntegrationAction,
  params: Record<string, unknown>,
): Promise<IntegrationCallResult> {
  const url = buildUrl(integration.baseUrl, action.path, action.method, params);
  const headers = buildHeaders(integration);
  const body = buildBody(action.method, params);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: action.method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data: unknown;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        data,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return { success: true, status: response.status, data };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, error: "Request timed out after 10s" };
    }

    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- Helpers ---

function buildUrl(
  baseUrl: string,
  path: string,
  method: string,
  params: Record<string, unknown>,
): string {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");

  // For GET requests, add params as query strings
  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

function buildHeaders(integration: CompiledIntegration): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (integration.auth.method === "none") return headers;

  const apiKey = process.env[integration.auth.envVar];
  if (!apiKey) {
    console.error(
      `[integration] Warning: ${integration.auth.envVar} not set for ${integration.name}`,
    );
    return headers;
  }

  const headerName = integration.auth.headerName ?? "Authorization";
  const prefix = integration.auth.prefix;
  headers[headerName] = prefix ? `${prefix} ${apiKey}` : apiKey;

  return headers;
}

function buildBody(
  method: string,
  params: Record<string, unknown>,
): string | undefined {
  if (method === "GET" || method === "DELETE") return undefined;
  return JSON.stringify(params);
}

function findMatchingPolicy(
  policies: ErrorPolicy[],
  status?: number,
): ErrorPolicy | undefined {
  if (!status) return undefined;

  return policies.find((p) => {
    if (p.condition === `${status}`) return true;
    if (p.condition === "5xx" && status >= 500 && status < 600) return true;
    if (p.condition === "4xx" && status >= 400 && status < 500) return true;
    return false;
  });
}

function getMaxAttempts(policies: ErrorPolicy[]): number {
  const retryPolicy = policies.find((p) => p.action === "retry");
  return (retryPolicy?.maxRetries ?? 0) + 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
