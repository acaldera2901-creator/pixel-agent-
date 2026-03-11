/**
 * providers/openai-compatible.ts — OpenAI-compatible provider.
 *
 * Works for:
 *   openai  — OpenAI GPT (standard baseURL)
 *   ollama  — Ollama local models (baseURL = http://localhost:11434/v1, apiKey = "ollama")
 *   gemini  — Google Gemini (baseURL = https://generativelanguage.googleapis.com/v1beta/openai/)
 *
 * All three use the same OpenAI SDK, just with different baseURL and model names.
 */

import OpenAI from "openai";
import { AIProvider, AgentRunParams } from "./index.js";
import { ProviderName } from "../config.js";

export class OpenAICompatibleProvider implements AIProvider {
  public readonly name: ProviderName;
  private client: OpenAI;
  private model: string;

  constructor(
    name: ProviderName,
    apiKey: string,
    model: string,
    baseURL?: string
  ) {
    this.name = name;
    this.model = model;
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async complete(params: {
    system: string;
    userMessage: string;
    maxTokens?: number;
  }): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: params.maxTokens ?? 2048,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.userMessage },
      ],
    });
    return response.choices[0]?.message?.content ?? "";
  }

  async runAgent(params: AgentRunParams): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: params.system },
      { role: "user", content: params.task },
    ];

    const tools: OpenAI.ChatCompletionTool[] | undefined =
      params.tools?.length
        ? params.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.input_schema,
            },
          }))
        : undefined;

    let finalText = "";

    while (true) {
      if (params.logPrefix) process.stdout.write(params.logPrefix);

      const stream = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: params.maxTokens ?? 4096,
        stream: true,
        messages,
        tools,
        tool_choice: tools ? "auto" : undefined,
      });

      let currentText = "";
      const toolCallsAccum = new Map<
        number,
        { id: string; name: string; args: string }
      >();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          process.stdout.write(delta.content);
          currentText += delta.content;
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCallsAccum.get(tc.index) ?? {
              id: "",
              name: "",
              args: "",
            };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.args += tc.function.arguments;
            toolCallsAccum.set(tc.index, existing);
          }
        }
      }

      const toolCalls = Array.from(toolCallsAccum.values());

      if (toolCalls.length === 0) {
        finalText = currentText;
        if (params.logPrefix) process.stdout.write("\n");
        break;
      }

      // Append assistant message with tool calls
      messages.push({
        role: "assistant",
        content: currentText || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.args },
        })),
      });

      // Execute each tool and append results
      for (const tc of toolCalls) {
        let input: Record<string, unknown>;
        try {
          input = JSON.parse(tc.args) as Record<string, unknown>;
        } catch {
          input = {};
        }

        const result =
          (await params.executeTool?.(tc.name, input)) ?? `Tool not found: ${tc.name}`;
        params.onToolUse?.(tc.id, tc.name, input);
        params.onToolResult?.(tc.id, result);

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
    }

    return finalText;
  }
}
