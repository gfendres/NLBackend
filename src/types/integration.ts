/** Integration types — parsed from integrations/*.md files */

/** A parsed integration definition */
export interface CompiledIntegration {
  /** Integration name (from filename) */
  name: string;
  /** Provider name (e.g. "Resend", "Stripe") */
  provider: string;
  /** Base URL for the API */
  baseUrl: string;
  /** Authentication config */
  auth: IntegrationAuth;
  /** Available actions (e.g. "Send Email") */
  actions: IntegrationAction[];
  /** Error handling policies */
  errorHandling: ErrorPolicy[];
}

export interface IntegrationAuth {
  /** Auth method (api_key, bearer, oauth, basic) */
  method: "api_key" | "bearer" | "basic" | "none";
  /** Environment variable holding the credential */
  envVar: string;
  /** Where to send the credential (header, query) */
  location: "header" | "query";
  /** Header name (default: "Authorization") */
  headerName?: string;
  /** Prefix (e.g. "Bearer", "Key") */
  prefix?: string;
}

export interface IntegrationAction {
  /** Action name (e.g. "Send Email") */
  name: string;
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** URL path (appended to baseUrl) */
  path: string;
  /** Input parameter definitions */
  inputs: IntegrationInput[];
  /** Expected content type of the response */
  responseType?: "json" | "text";
}

export interface IntegrationInput {
  name: string;
  required: boolean;
  description: string;
  defaultValue?: string;
}

export interface ErrorPolicy {
  /** HTTP status code or range (e.g. 429, "5xx") */
  condition: string;
  /** What to do: "retry", "fail", "ignore" */
  action: "retry" | "fail" | "ignore";
  /** Retry delay in ms (for retry action) */
  retryDelayMs?: number;
  /** Max retries */
  maxRetries?: number;
}

/** Result from calling an integration */
export interface IntegrationCallResult {
  success: boolean;
  status?: number;
  data?: unknown;
  error?: string;
}
