/**
 * fileAgent — sub-agent for file system operations.
 * Uses Claude API with file-related tools to read, create, and analyse files.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { TranscriptWriter } from "../transcript.js";
import { v4 as uuidv4 } from "uuid";

const client = new Anthropic();

const FILE_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Read the contents of a file from the filesystem",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "Absolute or relative path to the file",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "list_directory",
    description: "List the contents of a directory",
    input_schema: {
      type: "object" as const,
      properties: {
        dir_path: {
          type: "string",
          description: "Path to the directory to list",
        },
      },
      required: ["dir_path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file (creates or overwrites)",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Path to write the file" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "file_info",
    description: "Get metadata about a file (size, modification time, etc.)",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Path to the file" },
      },
      required: ["file_path"],
    },
  },
];

function executeTool(
  name: string,
  input: Record<string, string>
): string {
  try {
    switch (name) {
      case "read_file": {
        const content = fs.readFileSync(input.file_path, "utf-8");
        return content.slice(0, 8000); // cap output
      }
      case "list_directory": {
        const entries = fs.readdirSync(input.dir_path, { withFileTypes: true });
        return entries
          .map((e) => `${e.isDirectory() ? "[dir] " : "      "}${e.name}`)
          .join("\n");
      }
      case "write_file": {
        const dir = path.dirname(input.file_path);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(input.file_path, input.content, "utf-8");
        return `File written successfully: ${input.file_path}`;
      }
      case "file_info": {
        const stat = fs.statSync(input.file_path);
        return JSON.stringify(
          {
            size_bytes: stat.size,
            modified: stat.mtime.toISOString(),
            is_directory: stat.isDirectory(),
          },
          null,
          2
        );
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

export async function runFileAgent(
  task: string,
  transcript: TranscriptWriter
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: task,
    },
  ];

  const turnStart = Date.now();
  let finalText = "";

  while (true) {
    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system:
        "You are a file system expert agent. Use the provided tools to read, list, write, and analyse files as needed to complete the user's task. Be concise and precise.",
      tools: FILE_TOOLS,
      messages,
    });

    process.stdout.write("[FileAgent] ");
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

      // Log each tool_use to the transcript
      for (const toolBlock of toolUseBlocks) {
        const toolId = uuidv4().slice(0, 24);
        transcript.writeToolUse(
          toolId,
          toolBlock.name,
          toolBlock.input as Record<string, unknown>
        );

        const result = executeTool(
          toolBlock.name,
          toolBlock.input as Record<string, string>
        );
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
