/**
 * fileAgent — sub-agent for file system operations.
 * Uses the configured AI provider with file-related tools.
 */

import fs from "fs";
import path from "path";
import { TranscriptWriter } from "../transcript.js";
import { AIProvider, ToolDefinition } from "../providers/index.js";

const FILE_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file from the filesystem",
    input_schema: {
      type: "object",
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
      type: "object",
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
      type: "object",
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
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to the file" },
      },
      required: ["file_path"],
    },
  },
];

function executeTool(name: string, input: Record<string, unknown>): string {
  try {
    switch (name) {
      case "read_file": {
        const content = fs.readFileSync(input.file_path as string, "utf-8");
        return content.slice(0, 8000);
      }
      case "list_directory": {
        const entries = fs.readdirSync(input.dir_path as string, {
          withFileTypes: true,
        });
        return entries
          .map((e) => `${e.isDirectory() ? "[dir] " : "      "}${e.name}`)
          .join("\n");
      }
      case "write_file": {
        const dir = path.dirname(input.file_path as string);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          input.file_path as string,
          input.content as string,
          "utf-8"
        );
        return `File written successfully: ${input.file_path}`;
      }
      case "file_info": {
        const stat = fs.statSync(input.file_path as string);
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
  transcript: TranscriptWriter,
  provider: AIProvider
): Promise<string> {
  const turnStart = Date.now();

  const finalText = await provider.runAgent({
    system:
      "You are a file system expert agent. Use the provided tools to read, list, write, and analyse files as needed to complete the user's task. Be concise and precise.",
    task,
    tools: FILE_TOOLS,
    executeTool,
    maxTokens: 4096,
    logPrefix: "[FileAgent] ",
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
