/**
 * TranscriptWriter — writes JSONL transcripts in Claude Code format.
 *
 * pixel-agents watches for *.jsonl files under:
 *   ~/.claude/projects/<sanitized-cwd>/<session-uuid>.jsonl
 *
 * Each line is a JSON object (one of: assistant, user, system).
 */

import fs from "fs";
import os from "os";
import path from "path";
import { v4 as uuidv4 } from "uuid";

/** Sanitize a filesystem path to the format Claude Code uses for project dirs.
 *  Replicates agentManager.ts getProjectDirPath() exactly:
 *    workspacePath.replace(/[^a-zA-Z0-9-]/g, '-')
 *  e.g. /home/user/pixel-agent- → -home-user-pixel-agent-
 */
function sanitizePath(dir: string): string {
  return dir.replace(/[^a-zA-Z0-9-]/g, "-");
}

export class TranscriptWriter {
  readonly sessionId: string;
  readonly jsonlPath: string;
  private fd: fs.WriteStream;

  constructor(projectDir: string = process.cwd()) {
    this.sessionId = uuidv4();

    const claudeProjectsDir = path.join(
      os.homedir(),
      ".claude",
      "projects",
      sanitizePath(projectDir)
    );
    fs.mkdirSync(claudeProjectsDir, { recursive: true });

    this.jsonlPath = path.join(claudeProjectsDir, `${this.sessionId}.jsonl`);
    this.fd = fs.createWriteStream(this.jsonlPath, { flags: "a" });

    console.log(`\n📝 Transcript JSONL: ${this.jsonlPath}`);
    console.log(
      "   (Point pixel-agents at this file to visualize the agent)\n"
    );
  }

  private writeLine(obj: unknown): void {
    this.fd.write(JSON.stringify(obj) + "\n");
  }

  /** Emit an assistant message containing one or more tool_use blocks */
  writeToolUse(
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>,
    textPrefix?: string
  ): void {
    const content: unknown[] = [];
    if (textPrefix) {
      content.push({ type: "text", text: textPrefix });
    }
    content.push({
      type: "tool_use",
      id: toolUseId,
      name: toolName,
      input,
    });
    this.writeLine({
      type: "assistant",
      message: { role: "assistant", content },
    });
  }

  /** Emit a user message containing a tool_result block */
  writeToolResult(
    toolUseId: string,
    result: string,
    isError = false
  ): void {
    this.writeLine({
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: result,
            ...(isError ? { is_error: true } : {}),
          },
        ],
      },
    });
  }

  /** Emit a plain assistant text message */
  writeAssistantText(text: string): void {
    this.writeLine({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text }],
      },
    });
  }

  /** Emit a system turn_duration record (signals turn completion to pixel-agents) */
  writeTurnEnd(durationMs: number): void {
    this.writeLine({
      type: "system",
      subtype: "turn_duration",
      duration_ms: durationMs,
    });
  }

  /** Emit a system init record */
  writeInit(): void {
    this.writeLine({
      type: "system",
      subtype: "init",
      session_id: this.sessionId,
    });
  }

  close(): void {
    this.fd.end();
  }
}
