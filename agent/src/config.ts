/**
 * config.ts — reads environment variables and returns provider configuration.
 *
 * Set AI_PROVIDER to one of: anthropic | openai | ollama | gemini
 * Default: anthropic
 *
 * Usage: copy .env.example to .env and fill in your keys.
 */

import * as dotenv from "dotenv";
dotenv.config();

export type ProviderName = "anthropic" | "openai" | "ollama" | "gemini";

export interface ProviderConfig {
  provider: ProviderName;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openaiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  geminiApiKey?: string;
  geminiModel: string;
}

export function getConfig(): ProviderConfig {
  const provider = (process.env.AI_PROVIDER ?? "anthropic") as ProviderName;

  return {
    provider,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-1.5-flash",
  };
}
