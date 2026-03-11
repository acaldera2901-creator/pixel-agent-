/**
 * searchAgent — sub-agent for research and information lookup.
 * Uses Claude's built-in web search tool.
 */

import Anthropic from "@anthropic-ai/sdk";
import { TranscriptWriter } from "../transcript.js";
import { v4 as uuidv4 } from "uuid";

const client = new Anthropic();

export async function runSearchAgent(
  task: string,
  transcript: TranscriptWriter
): Promise<string> {
  const turnStart = Date.now();

  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system:
      "You are a research expert agent. Analyse the task and provide a thorough, well-structured answer. Cite sources where relevant. Be concise.",
    tools: [
      { type: "web_search_20260209" as const, name: "web_search" },
    ],
    messages: [{ role: "user", content: task }],
  });

  process.stdout.write("[SearchAgent] ");
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      process.stdout.write(event.delta.text);
    }
  }
  process.stdout.write("\n");

  const response = await stream.finalMessage();

  // Log tool uses (web_search calls) to transcript
  for (const block of response.content) {
    if (block.type === "tool_use") {
      const toolId = uuidv4().slice(0, 24);
      transcript.writeToolUse(toolId, block.name, block.input as Record<string, unknown>);
      transcript.writeToolResult(toolId, "(web search results)");
    }
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const finalText = textBlock?.type === "text" ? textBlock.text : "";

  transcript.writeAssistantText(finalText);
  transcript.writeTurnEnd(Date.now() - turnStart);

  return finalText;
}
