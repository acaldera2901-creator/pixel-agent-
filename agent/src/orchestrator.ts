/**
 * Orchestrator — main multi-task coordinator.
 *
 * 1. Receives a high-level task from the user.
 * 2. Uses the configured AI provider to classify and plan the task into sub-tasks.
 * 3. Delegates each sub-task to the appropriate specialist agent
 *    (fileAgent, searchAgent, codeAgent).
 * 4. Logs every delegation as a "Task" tool_use in the JSONL transcript
 *    so pixel-agents can visualise them as sub-agents in the pixel office.
 * 5. Returns the combined results.
 */

import { v4 as uuidv4 } from "uuid";
import { TranscriptWriter } from "./transcript.js";
import { runFileAgent } from "./agents/fileAgent.js";
import { runSearchAgent } from "./agents/searchAgent.js";
import { runCodeAgent } from "./agents/codeAgent.js";
import { getProvider, AIProvider } from "./providers/index.js";
import { getConfig } from "./config.js";

type AgentType = "file" | "search" | "code" | "general";

interface SubTask {
  agent: AgentType;
  description: string;
  task: string;
}

interface Plan {
  summary: string;
  subtasks: SubTask[];
}

/** Ask the AI provider to decompose a user request into typed sub-tasks */
async function planTask(
  userTask: string,
  transcript: TranscriptWriter,
  provider: AIProvider
): Promise<Plan> {
  const planToolId = uuidv4().slice(0, 24);

  transcript.writeToolUse(planToolId, "Task", {
    description: "Planning and decomposing the task into sub-tasks",
    task: userTask,
  });

  const raw = await provider.complete({
    system: `You are an orchestration planner. Given a user task, decompose it into subtasks and assign each to the most appropriate specialist agent:
- "file": reading, writing, listing, or analysing files and directories
- "search": web research, fact-finding, current events, looking up information
- "code": code generation, code analysis, debugging, code explanation

Respond with a JSON object matching this exact schema:
{
  "summary": "Brief description of what we're doing overall",
  "subtasks": [
    {
      "agent": "file" | "search" | "code",
      "description": "Short label for this sub-task",
      "task": "Detailed instruction for the sub-agent"
    }
  ]
}

Keep subtasks focused. Use 1-3 subtasks unless the request genuinely requires more.`,
    userMessage: `Decompose this task into subtasks:\n\n${userTask}`,
    maxTokens: 2048,
  });

  // Extract JSON from the response (may be wrapped in markdown code blocks)
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, raw];
  const jsonStr = jsonMatch[1]?.trim() ?? raw.trim();

  let plan: Plan;
  try {
    plan = JSON.parse(jsonStr) as Plan;
  } catch {
    plan = {
      summary: userTask,
      subtasks: [{ agent: "general", description: userTask, task: userTask }],
    };
  }

  transcript.writeToolResult(
    planToolId,
    `Plan created: ${plan.summary} (${plan.subtasks.length} subtask(s))`
  );

  return plan;
}

async function runSubAgent(
  subTask: SubTask,
  transcript: TranscriptWriter,
  provider: AIProvider
): Promise<string> {
  const taskToolId = uuidv4().slice(0, 24);

  transcript.writeToolUse(taskToolId, "Task", {
    description: subTask.description,
    agent_type: subTask.agent,
    task: subTask.task,
  });

  let result: string;
  switch (subTask.agent) {
    case "file":
      result = await runFileAgent(subTask.task, transcript, provider);
      break;
    case "search":
      result = await runSearchAgent(subTask.task, transcript, provider);
      break;
    case "code":
    case "general":
    default:
      result = await runCodeAgent(subTask.task, transcript, provider);
      break;
  }

  transcript.writeToolResult(
    taskToolId,
    result.slice(0, 500) + (result.length > 500 ? "…" : "")
  );
  return result;
}

/** Summarise sub-task results into a final answer */
async function summarise(
  userTask: string,
  results: { description: string; result: string }[],
  transcript: TranscriptWriter,
  provider: AIProvider
): Promise<string> {
  const summaryToolId = uuidv4().slice(0, 24);
  transcript.writeToolUse(summaryToolId, "Task", {
    description: "Synthesising results from all sub-agents",
  });

  const resultsText = results
    .map((r, i) => `### Sub-task ${i + 1}: ${r.description}\n${r.result}`)
    .join("\n\n");

  const summary = await provider.complete({
    system:
      "You are a synthesis expert. Given the original task and results from multiple specialist agents, produce a clear, comprehensive final answer. Integrate all information naturally.",
    userMessage: `Original task: ${userTask}\n\nSub-task results:\n${resultsText}\n\nPlease synthesise a final comprehensive answer.`,
    maxTokens: 4096,
  });

  transcript.writeAssistantText(summary);
  transcript.writeToolResult(summaryToolId, "Synthesis complete");
  transcript.writeTurnEnd(500);

  return summary;
}

export class Orchestrator {
  private transcript: TranscriptWriter;
  private providerPromise: Promise<AIProvider>;

  constructor() {
    this.transcript = new TranscriptWriter(process.cwd());
    this.transcript.writeInit();
    this.providerPromise = getProvider(getConfig());
  }

  async run(userTask: string): Promise<string> {
    const provider = await this.providerPromise;
    console.log(`\n🎯 Task: ${userTask}`);
    console.log(`   Provider: ${provider.name}\n`);

    // 1. Plan
    console.log("🗺️  Planning sub-tasks...");
    const plan = await planTask(userTask, this.transcript, provider);
    console.log(`   → ${plan.summary}`);
    console.log(`   → ${plan.subtasks.length} sub-task(s)\n`);

    // 2. Execute each sub-task
    const results: { description: string; result: string }[] = [];

    for (const [i, subTask] of plan.subtasks.entries()) {
      console.log(
        `\n[${i + 1}/${plan.subtasks.length}] 🤖 ${subTask.description} (${subTask.agent} agent)`
      );
      const result = await runSubAgent(subTask, this.transcript, provider);
      results.push({ description: subTask.description, result });
    }

    // 3. Synthesise
    console.log("\n✨ Synthesising final answer...\n");
    const finalAnswer = await summarise(userTask, results, this.transcript, provider);

    return finalAnswer;
  }

  close(): void {
    this.transcript.close();
  }
}
