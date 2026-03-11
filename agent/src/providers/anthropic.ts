/**
 * providers/anthropic.ts — Anthropic Claude provider.
 *
 * Features:
 * - Extended thinking (adaptive)
 * - Built-in web_search_20260209 tool (used by searchAgent)
 * - Full streaming support
 */

import Anthropic from "@anthropic-ai/sdk";
import { AIProvider, AgentRunParams, ToolDefinition } from "./index.js";
import { ProviderName } from "../config.js";

export class AnthropicProvider implements AIProvider {
  public readonly name: ProviderName = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(params: {
    system: string;
    userMessage: string;
    maxTokens?: number;
  }): Promise<string> {
    const response = await this.client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: params.maxTokens ?? 2048,
      thinking: { type: "adaptive" },
      system: params.system,
      messages: [{ role: "user", content: params.userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.type === "text" ? textBlock.text : "";
  }

  async runAgent(params: AgentRunParams): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: params.task },
    ];

    let finalText = "";

    while (true) {
      const stream = this.client.messages.stream({
        model: "claude-opus-4-6",
        max_tokens: params.maxTokens ?? 4096,
        thinking: { type: "adaptive" },
        system: params.system,
        tools: (params.tools ?? []).map((t: ToolDefinition) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })),
        messages,
      });

      if (params.logPrefix) process.stdout.write(params.logPrefix);
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          process.stdout.write(event.delta.text);
        }
      }

      const response = await stream.finalMessage();

      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b) => b.type === "text");
        finalText = textBlock?.type === "text" ? textBlock.text : "";
        if (params.logPrefix) process.stdout.write("\n");
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        messages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const tb of toolUseBlocks) {
          const input = tb.input as Record<string, unknown>;
          const result =
            (await params.executeTool?.(tb.name, input)) ?? `Tool not found: ${tb.name}`;
          params.onToolUse?.(tb.id, tb.name, input);
          params.onToolResult?.(tb.id, result);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tb.id,
            content: result,
          });
        }
        messages.push({ role: "user", content: toolResults });
      }
    }

    return finalText;
  }

  /**
   * Run the search agent with Anthropic's built-in web_search tool.
   * Called directly by searchAgent when provider is anthropic.
   */
  async runSearchAgent(params: {
    system: string;
    task: string;
    maxTokens?: number;
    logPrefix?: string;
    onToolUse?: (id: string, name: string, input: Record<string, unknown>) => void;
    onToolResult?: (id: string, result: string) => void;
  }): Promise<string> {
    const stream = this.client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: params.maxTokens ?? 4096,
      thinking: { type: "adaptive" },
      system: params.system,
      tools: [{ type: "web_search_20260209" as const, name: "web_search" }],
      messages: [{ role: "user", content: params.task }],
    });

    if (params.logPrefix) process.stdout.write(params.logPrefix);
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        process.stdout.write(event.delta.text);
      }
    }
    if (params.logPrefix) process.stdout.write("\n");

    const response = await stream.finalMessage();

    for (const block of response.content) {
      if (block.type === "tool_use") {
        params.onToolUse?.(block.id, block.name, block.input as Record<string, unknown>);
        params.onToolResult?.(block.id, "(web search results)");
      }
    }

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.type === "text" ? textBlock.text : "";
  }
}
