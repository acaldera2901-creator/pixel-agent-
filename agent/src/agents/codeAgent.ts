/**
 * codeAgent — sub-agent for code analysis, generation, and explanation.
 * Uses the configured AI provider with code-related tools.
 */

import { TranscriptWriter } from "../transcript.js";
import { AIProvider, ToolDefinition } from "../providers/index.js";

const CODE_TOOLS: ToolDefinition[] = [
  {
    name: "analyze_code",
    description:
      "Analyse a code snippet for bugs, quality issues, and improvements",
    input_schema: {
      type: "object",
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
      type: "object",
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
      type: "object",
      properties: {
        code: { type: "string", description: "Code to explain" },
      },
      required: ["code"],
    },
  },
];

/** Meta-tool executor — Claude answers from its own knowledge */
function executeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "analyze_code":
      return `Analysing ${input.language as string} code:\n${input.code as string}`;
    case "generate_code":
      return `Generating ${input.language as string} code for: ${input.description as string}`;
    case "explain_code":
      return `Explaining code:\n${input.code as string}`;
    default:
      return "Unknown tool";
  }
}

export async function runCodeAgent(
  task: string,
  transcript: TranscriptWriter,
  provider: AIProvider
): Promise<string> {
  const turnStart = Date.now();

  const finalText = await provider.runAgent({
    system:
      "You are an expert software engineer agent. Analyse, generate, and explain code with precision. Use the provided tools to structure your work. Produce clean, well-documented output.",
    task,
    tools: CODE_TOOLS,
    executeTool,
    maxTokens: 8192,
    logPrefix: "[CodeAgent] ",
    onToolUse: (id, name, input) => {
      transcript.writeToolUse(id, name, input);
    },
    onToolResult: (id, result) => {
      transcript.writeToolResult(id, result);
    },
  });

  transcript.writeAssistantText(finalText);
  transcript.writeTurnEnd(Date.now() - turnStart);

  return finalText;
}
