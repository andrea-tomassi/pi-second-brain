import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig, resolveKbPath } from "./config.js";

const AGENT_PROMPT_PATH = path.join(os.homedir(), ".pi", "agent", "agents", "sb.md");
const SIGKILL_TIMEOUT_MS = 5_000;

export interface SbAgentOptions {
  operation: "refactor" | "query" | "status";
  timeout?: number;       // Default: 120_000ms
  onProgress?: (message: string) => void;  // Optional progress callback
}

export interface SbAgentResult {
  success: boolean;
  output: string;           // Full assistant text output
  error?: string;
  toolCalls?: number;       // Count of tool calls made
}

/**
 * Resolves the pi command and its initial arguments.
 * Mirrors the pattern from pi's subagent extension example.
 */
function getPiCommand(): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript] };
  }
  return { command: "pi", args: [] };
}

/**
 * Builds the operation-specific task prefix.
 */
function buildTaskPrefix(operation: string): string {
  switch (operation) {
    case "refactor":
      return `REFACTOR the Second Brain inbox. Execute the refactor now.\n\nTask: `;
    case "status":
      return `Report the STATUS of the Second Brain knowledge base.\n\nTask: `;
    default:
      return "";
  }
}

/**
 * Spawns pi as a subprocess in JSON mode to execute a slow-path SB operation.
 * Reads the agent prompt from ~/.pi/agent/agents/sb.md, writes it to a temp file,
 * and passes it via --append-system-prompt.
 *
 * @param task - The task text for the agent
 * @param options - Operation options
 * @param signal - Optional AbortSignal to cancel the operation
 */
export async function spawnSbAgent(
  task: string,
  options: SbAgentOptions,
  signal?: AbortSignal,
): Promise<SbAgentResult> {
  const timeout = options.timeout ?? 120_000;
  let tmpPromptPath: string | null = null;

  try {
    // 1. Read the agent prompt
    let agentPrompt: string;
    try {
      agentPrompt = await readFile(AGENT_PROMPT_PATH, "utf-8");
    } catch {
      return {
        success: false,
        output: "",
        error: `Agent prompt not found at ${AGENT_PROMPT_PATH}. Run the extension bootstrap first.`,
      };
    }

    // 2. Write prompt to a temp file
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    tmpPromptPath = path.join(os.tmpdir(), `pi-sb-${randomSuffix}.md`);
    await writeFile(tmpPromptPath, agentPrompt, "utf-8");

    // 3. Determine the KB path
    const config = await loadConfig();
    const kbPath = resolveKbPath(config);

    // 4. Build pi invocation args
    const prefix = buildTaskPrefix(options.operation);
    const fullTask = `${prefix}${task}`;
    const piArgs: string[] = [
      "--mode", "json",
      "-p",
      "--no-session",
      "--append-system-prompt", tmpPromptPath,
      fullTask,
    ];
    const piCmd = getPiCommand();
    const spawnArgs = [...piCmd.args, ...piArgs];

    // 5. Spawn pi
    let exitCode = 0;
    let stderr = "";
    let toolCallCount = 0;
    let assistantOutput = "";
    let timedOut = false;

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(piCmd.command, spawnArgs, {
        cwd: kbPath,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Timeout handling
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let sigkillHandle: ReturnType<typeof setTimeout> | undefined;

      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          proc.kill("SIGTERM");
          sigkillHandle = setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL");
          }, SIGKILL_TIMEOUT_MS);
        }, timeout);
      }

      // Abort signal handling
      const abortHandler = () => {
        proc.kill("SIGTERM");
        sigkillHandle = setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, SIGKILL_TIMEOUT_MS);
      };
      if (signal) {
        if (signal.aborted) {
          abortHandler();
        } else {
          signal.addEventListener("abort", abortHandler, { once: true });
        }
      }

      let buffer = "";

      proc.stdout.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(trimmed);
          } catch {
            // Skip lines that aren't valid JSON
            continue;
          }

          if (event.type === "message_end" && event.message) {
            const msg = event.message as Record<string, unknown>;
            if (msg.role === "assistant") {
              const content = msg.content as Array<Record<string, unknown>> | undefined;
              if (content) {
                for (const part of content) {
                  if (part.type === "text" && typeof part.text === "string") {
                    assistantOutput += part.text;
                    options.onProgress?.(part.text);
                  }
                }
              }
            }
          }

          if (event.type === "tool_result_end") {
            toolCallCount++;
          }
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("error", (err: NodeJS.ErrnoException) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (sigkillHandle) clearTimeout(sigkillHandle);
        reject(err);
      });

      proc.on("close", (code: number | null) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (sigkillHandle) clearTimeout(sigkillHandle);
        exitCode = code ?? 0;

        // Process remaining buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          try {
            const event = JSON.parse(trimmed) as Record<string, unknown>;
            if (event.type === "message_end" && event.message) {
              const msg = event.message as Record<string, unknown>;
              if (msg.role === "assistant") {
                const content = msg.content as Array<Record<string, unknown>> | undefined;
                if (content) {
                  for (const part of content) {
                    if (part.type === "text" && typeof part.text === "string") {
                      assistantOutput += part.text;
                    }
                  }
                }
              }
            }
            if (event.type === "tool_result_end") {
              toolCallCount++;
            }
          } catch {
            // Ignore parse errors on the last buffer
          }
        }

        resolve();
      });
    });

    // 7. Return result
    if (timedOut) {
      return {
        success: false,
        output: assistantOutput,
        error: "Operation timed out",
        toolCalls: toolCallCount,
      };
    }

    if (exitCode !== 0) {
      return {
        success: false,
        output: assistantOutput,
        error: `Agent exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`,
        toolCalls: toolCallCount,
      };
    }

    return {
      success: true,
      output: assistantOutput,
      toolCalls: toolCallCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      error: message,
    };
  } finally {
    // 11. Clean up temp file
    if (tmpPromptPath) {
      try {
        unlinkSync(tmpPromptPath);
      } catch {
        // Best-effort cleanup
      }
    }
  }
}
