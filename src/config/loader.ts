/**
 * Config loader — parses config/server.md for LLM provider settings.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LLMConfig, ServerConfig } from "../types/config.ts";
import { DEFAULT_LLM_CONFIG } from "../types/config.ts";

/** Load server configuration from config/server.md */
export async function loadServerConfig(
  projectPath: string,
): Promise<ServerConfig> {
  const llm = await loadLLMConfig(projectPath);
  return { llm };
}

/** Parse LLM provider settings from config/server.md */
async function loadLLMConfig(projectPath: string): Promise<LLMConfig> {
  try {
    const content = await readFile(
      join(projectPath, "config", "server.md"),
      "utf-8",
    );
    return parseLLMConfig(content);
  } catch {
    return { ...DEFAULT_LLM_CONFIG };
  }
}

/** Extract LLM settings from markdown content */
function parseLLMConfig(content: string): LLMConfig {
  const config = { ...DEFAULT_LLM_CONFIG };

  const providerMatch = content.match(
    /\*\*Provider:\*\*\s*(.+)/i,
  );
  if (providerMatch?.[1]) {
    config.provider = providerMatch[1].trim().toLowerCase();
  }

  const compilationModelMatch = content.match(
    /\*\*Model for compilation:\*\*\s*(.+)/i,
  );
  if (compilationModelMatch?.[1]) {
    config.compilationModel = compilationModelMatch[1].trim();
  }

  const runtimeModelMatch = content.match(
    /\*\*Model for runtime[^:]*:\*\*\s*(.+)/i,
  );
  if (runtimeModelMatch?.[1]) {
    config.runtimeModel = runtimeModelMatch[1].trim();
  }

  const apiKeyMatch = content.match(
    /\*\*API key:\*\*\s*(?:Environment variable\s+)?(\w+)/i,
  );
  if (apiKeyMatch?.[1]) {
    config.apiKeyEnvVar = apiKeyMatch[1].trim();
  }

  const tempMatch = content.match(
    /\*\*Temperature:\*\*\s*(\d+(?:\.\d+)?)/i,
  );
  if (tempMatch?.[1]) {
    config.temperature = parseFloat(tempMatch[1]);
  }

  return config;
}
