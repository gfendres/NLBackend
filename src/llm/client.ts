/**
 * LLM client — abstraction layer for calling language models.
 * Currently supports Anthropic. Designed for easy extension to other providers.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LLMConfig } from "../types/config.ts";

export interface LLMRequest {
  /** System prompt */
  system: string;
  /** User message */
  prompt: string;
  /** Expected JSON output — instructs the model to return valid JSON */
  jsonMode?: boolean;
  /** Max tokens for response */
  maxTokens?: number;
  /** Override temperature (uses config default otherwise) */
  temperature?: number;
}

export interface LLMResponse {
  /** Raw text response from the model */
  text: string;
  /** Parsed JSON if jsonMode was true and response was valid JSON */
  json?: unknown;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export class LLMClient {
  private config: LLMConfig;
  private anthropic: Anthropic | null = null;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /** Call the LLM with the compilation model */
  async compile(request: LLMRequest): Promise<LLMResponse> {
    return this.call(this.config.compilationModel, request);
  }

  /** Call the LLM with the runtime model (for Tier 3 operations) */
  async interpret(request: LLMRequest): Promise<LLMResponse> {
    return this.call(this.config.runtimeModel, request);
  }

  /** Check if the LLM client is configured and ready */
  isConfigured(): boolean {
    const apiKey = process.env[this.config.apiKeyEnvVar];
    return !!apiKey && apiKey.length > 0;
  }

  private async call(
    model: string,
    request: LLMRequest,
  ): Promise<LLMResponse> {
    if (this.config.provider !== "anthropic") {
      throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
    }

    const client = this.getAnthropicClient();
    const temperature = request.temperature ?? this.config.temperature;

    const response = await client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 4096,
      temperature,
      system: request.system,
      messages: [
        { role: "user", content: request.prompt },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    let json: unknown;
    if (request.jsonMode) {
      json = extractJSON(text);
    }

    return {
      text,
      json,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private getAnthropicClient(): Anthropic {
    if (!this.anthropic) {
      const apiKey = process.env[this.config.apiKeyEnvVar];
      if (!apiKey) {
        throw new Error(
          `Missing API key: environment variable ${this.config.apiKeyEnvVar} is not set`,
        );
      }
      this.anthropic = new Anthropic({ apiKey });
    }
    return this.anthropic;
  }
}

/**
 * Extract JSON from LLM text response.
 * Handles cases where the JSON is wrapped in markdown code blocks.
 */
function extractJSON(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch {
    // ignore
  }

  // Try extracting from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch?.[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // ignore
    }
  }

  // Try finding the first { ... } or [ ... ] block
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch?.[1]) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      // ignore
    }
  }

  return undefined;
}
