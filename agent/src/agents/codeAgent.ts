/**
 * codeAgent — sub-agent for code analysis, generation, and explanation.
 */

import Anthropic from "@anthropic-ai/sdk";
import { TranscriptWriter } from "../transcript.js";
import { v4 as uuidv4 } from "uuid";

const client = new Anthropic();

const CODE_TOOLS: Anthropic.Tool[] = [
  {
    name: "analyze_code",
    description:
      "Analyse a code snippet for bugs, quality issues, and improvements",
    input_schema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "The code to analyse" },
        language: {
          type: "string",
          description: "Programming language (e.g. TypeScript, Python)",
        },
      },
      required: ["code", "language"],
    },
  },
  {
    name: "generate_code",
    description: "Generate code based on a description",
    input_schema: {
      type: "object" as const,
      properties: {
        description: {
          type: "string",
          description: "What the code should do",
        },
        language: {
          type: "string",
          description: "Programming language to use",
        },
      },
      required: ["description", "language"],
    },
  },
  {
    name: "explain_code",
    description: "Explain what a piece of code does in plain language",
    input_schema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Code to explain" },
      },
      required: ["code"],
    },
  },
];

/** Simple local tool executor (code analysis is done by Claude itself) */
function executeTool(name: string, input: Record<string, string>): string {
  // These tools are meta-tools — Claude answers them from its own knowledge
  switch (name) {
    case "analyze_code":
      return `Analysing ${input.language} code:\n${input.code}`;
    case "generate_code":
      return `Generating ${input.language} code for: ${input.description}`;
    case "explain_code":
      return `Explaining code:\n${input.code}`;
    default:
      return "Unknown tool";
  }
}

export async function runCodeAgent(
  task: string,
  transcript: TranscriptWriter
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: task },
  ];

  const turnStart = Date.now();
  let finalText = "";

  while (true) {
    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      system:
        "You are an expert software engineer agent. Analyse, generate, and explain code with precision. Use the provided tools to structure your work. Produce clean, well-documented output.",
      tools: CODE_TOOLS,
      messages,
    });

    process.stdout.write("[CodeAgent] ");
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
      transcript.writeAssistantText(finalText);
      transcript.writeTurnEnd(Date.now() - turnStart);
      process.stdout.write("\n");
      break;
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      for (const tb of toolUseBlocks) {
        const toolId = uuidv4().slice(0, 24);
        transcript.writeToolUse(
          toolId,
          tb.name,
          tb.input as Record<string, unknown>
        );
        const result = executeTool(tb.name, tb.input as Record<string, string>);
        transcript.writeToolResult(toolId, result);
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map(
        (tb) => ({
          type: "tool_result",
          tool_use_id: tb.id,
          content: executeTool(tb.name, tb.input as Record<string, string>),
        })
      );
      messages.push({ role: "user", content: toolResults });
    }
  }

  return finalText;
}
