#!/usr/bin/env node
/**
 * Entry point — interactive CLI for the multi-task orchestrator.
 *
 * Usage:
 *   npm run dev                         # interactive mode
 *   npm run dev -- "your task here"     # single task mode
 *
 * The agent writes a JSONL transcript to ~/.claude/projects/<cwd>/<uuid>.jsonl
 * Point pixel-agents at that file to see the agent visualised in VS Code.
 */

import readline from "readline";
import { Orchestrator } from "./orchestrator.js";

const BANNER = `
╔═══════════════════════════════════════════════════════════╗
║          🤖  Pixel-Agent  —  Multi-Task Orchestrator      ║
║                                                           ║
║  Each task is delegated to specialist sub-agents:         ║
║    📁 fileAgent   — file operations                       ║
║    🔍 searchAgent — web research                          ║
║    💻 codeAgent   — code analysis & generation            ║
║                                                           ║
║  Watch them in pixel-agents (VS Code extension)!          ║
╚═══════════════════════════════════════════════════════════╝
`;

async function main(): Promise<void> {
  console.log(BANNER);

  const orchestrator = new Orchestrator();

  // Single-task mode: task passed as CLI argument
  const taskArg = process.argv.slice(2).join(" ").trim();
  if (taskArg) {
    try {
      const result = await orchestrator.run(taskArg);
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅ FINAL ANSWER:\n");
      console.log(result);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    } finally {
      orchestrator.close();
    }
    return;
  }

  // Interactive mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    rl.question('\n🎯 Enter task (or "exit" to quit):\n> ', async (input) => {
      const task = input.trim();
      if (!task || task.toLowerCase() === "exit") {
        console.log("\n👋 Bye! Closing transcript...");
        orchestrator.close();
        rl.close();
        return;
      }

      try {
        const result = await orchestrator.run(task);
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("✅ FINAL ANSWER:\n");
        console.log(result);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      } catch (err) {
        console.error("\n❌ Error:", (err as Error).message);
      }

      prompt();
    });
  };

  prompt();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
