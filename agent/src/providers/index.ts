/**
 * providers/index.ts — common AIProvider interface and factory.
 *
 * Supported providers:
 *   anthropic  — Anthropic Claude (requires ANTHROPIC_API_KEY)
 *   openai     — OpenAI GPT (requires OPENAI_API_KEY)
 *   ollama     — Ollama local models (free, no key needed)
 *   gemini     — Google Gemini (requires GEMINI_API_KEY, has free tier)
 */

import { getConfig, ProviderConfig, ProviderName } from "../config.js";

/** Tool definition (Anthropic-compatible format, also converted for OpenAI) */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

/** Parameters for running a full agentic loop */
export interface AgentRunParams {
  system: string;
  task: string;
  tools?: ToolDefinition[];
  executeTool?: (name: string, input: Record<string, unknown>) => string | Promise<string>;
  maxTokens?: number;
  logPrefix?: string;
  onToolUse?: (id: string, name: string, input: Record<string, unknown>) => void;
  onToolResult?: (id: string, result: string) => void;
}

/** Common interface for all AI providers */
export interface AIProvider {
  /** Provider name (anthropic | openai | ollama | gemini) */
  readonly name: ProviderName;

  /**
   * Run a full agentic loop: send the task, handle tool calls, return final text.
   * Streams text to stdout with optional logPrefix.
   */
  runAgent(params: AgentRunParams): Promise<string>;

  /**
   * One-shot completion (no tools). Used for planning and synthesis.
   */
  complete(params: {
    system: string;
    userMessage: string;
    maxTokens?: number;
  }): Promise<string>;
}

/** Create the appropriate provider based on config */
export async function getProvider(config?: ProviderConfig): Promise<AIProvider> {
  const cfg = config ?? getConfig();

  switch (cfg.provider) {
    case "anthropic": {
      const { AnthropicProvider } = await import("./anthropic.js");
      if (!cfg.anthropicApiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY is not set. Set it in your environment or .env file."
        );
      }
      return new AnthropicProvider(cfg.anthropicApiKey);
    }

    case "openai": {
      const { OpenAICompatibleProvider } = await import("./openai-compatible.js");
      if (!cfg.openaiApiKey) {
        throw new Error(
          "OPENAI_API_KEY is not set. Set it in your environment or .env file."
        );
      }
      return new OpenAICompatibleProvider("openai", cfg.openaiApiKey, cfg.openaiModel);
    }

    case "ollama": {
      const { OpenAICompatibleProvider } = await import("./openai-compatible.js");
      return new OpenAICompatibleProvider(
        "ollama",
        "ollama",
        cfg.ollamaModel,
        `${cfg.ollamaBaseUrl}/v1`
      );
    }

    case "gemini": {
      const { OpenAICompatibleProvider } = await import("./openai-compatible.js");
      if (!cfg.geminiApiKey) {
        throw new Error(
          "GEMINI_API_KEY is not set. Set it in your environment or .env file."
        );
      }
      return new OpenAICompatibleProvider(
        "gemini",
        cfg.geminiApiKey,
        cfg.geminiModel,
        "https://generativelanguage.googleapis.com/v1beta/openai/"
      );
    }

    default:
      throw new Error(`Unknown provider: ${cfg.provider}. Use: anthropic | openai | ollama | gemini`);
  }
}
