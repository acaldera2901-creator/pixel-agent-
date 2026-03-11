/**
 * searchAgent — sub-agent for research and information lookup.
 *
 * - Anthropic: uses the built-in web_search_20260209 tool (no extra setup needed)
 * - Other providers: uses DuckDuckGo Instant Answer API (free, no API key)
 */

import { TranscriptWriter } from "../transcript.js";
import { v4 as uuidv4 } from "uuid";
import { AIProvider, ToolDefinition } from "../providers/index.js";
import { AnthropicProvider } from "../providers/anthropic.js";

const SYSTEM =
  "You are a research expert agent. Analyse the task and provide a thorough, well-structured answer. Cite sources where relevant. Be concise.";

/** DuckDuckGo Instant Answer API — free, no key required */
async function duckDuckGoSearch(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url);
    if (!res.ok) return `Search request failed: ${res.status}`;
    const data = (await res.json()) as {
      Abstract?: string;
      AbstractText?: string;
      RelatedTopics?: Array<{ Text?: string }>;
      Answer?: string;
    };

    const parts: string[] = [];
    if (data.Answer) parts.push(`Answer: ${data.Answer}`);
    if (data.AbstractText) parts.push(data.AbstractText);
    const related = (data.RelatedTopics ?? [])
      .slice(0, 5)
      .map((t) => t.Text)
      .filter(Boolean)
      .join("\n");
    if (related) parts.push(`Related:\n${related}`);

    return parts.join("\n\n") || "No results found for this query.";
  } catch (err) {
    return `Search error: ${(err as Error).message}`;
  }
}

const WEB_SEARCH_TOOL: ToolDefinition = {
  name: "web_search",
  description: "Search the web for information on a topic",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
};

export async function runSearchAgent(
  task: string,
  transcript: TranscriptWriter,
  provider: AIProvider
): Promise<string> {
  const turnStart = Date.now();

  let finalText: string;

  if (provider instanceof AnthropicProvider) {
    // Use Anthropic's built-in web search
    finalText = await provider.runSearchAgent({
      system: SYSTEM,
      task,
      maxTokens: 4096,
      logPrefix: "[SearchAgent] ",
      onToolUse: (id, name, input) => {
        transcript.writeToolUse(id, name, input);
      },
      onToolResult: (id, result) => {
        transcript.writeToolResult(id, result);
      },
    });
  } else {
    // Use DuckDuckGo fallback for all other providers
    finalText = await provider.runAgent({
      system: SYSTEM,
      task,
      tools: [WEB_SEARCH_TOOL],
      executeTool: (_name, input) => duckDuckGoSearch(input.query as string),
      maxTokens: 4096,
      logPrefix: "[SearchAgent] ",
      onToolUse: (id, name, input) => {
        transcript.writeToolUse(id, name, input);
      },
      onToolResult: (id, result) => {
        transcript.writeToolResult(id, result);
      },
    });
  }

  transcript.writeAssistantText(finalText);
  transcript.writeTurnEnd(Date.now() - turnStart);

  return finalText;
}
