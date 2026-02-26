/** Configuration types parsed from config/server.md */

export interface LLMConfig {
  /** Provider name (e.g. "anthropic") */
  provider: string;
  /** Model for compilation (actions, rules, workflows) */
  compilationModel: string;
  /** Model for runtime Tier 3 calls */
  runtimeModel: string;
  /** Environment variable name holding the API key */
  apiKeyEnvVar: string;
  /** Temperature for LLM calls (default 0) */
  temperature: number;
}

export interface ServerConfig {
  llm: LLMConfig;
}

/** Default LLM config when no server.md is found */
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: "anthropic",
  compilationModel: "claude-sonnet-4-5-20250929",
  runtimeModel: "claude-sonnet-4-5-20250929",
  apiKeyEnvVar: "ANTHROPIC_API_KEY",
  temperature: 0,
};
