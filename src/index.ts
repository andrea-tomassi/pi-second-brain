import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sbCaptureTool } from "./tools/sb-capture.js";
import { sbSearchTool } from "./tools/sb-search.js";
import { sbCalendarTool } from "./tools/sb-calendar.js";
import { spawnSbAgent } from "./agent-runner.js";

/**
 * Pi Second Brain — Personal knowledge management for the Pi coding agent.
 *
 * This extension captures fleeting thoughts, searches a knowledge base,
 * refactors inbox items using the PARA method, and syncs via git.
 *
 * @param pi - Pi Extension API
 */
export default function (pi: ExtensionAPI): void {
  // 1. Register tools
  pi.registerTool(sbCaptureTool);
  pi.registerTool(sbSearchTool);
  pi.registerTool(sbCalendarTool);

  // 2. Register /sb command
  pi.registerCommand("sb", {
    description: "Second Brain operations: refactor, sync, status, or query your knowledge base",
    getArgumentCompletions: async () => [
      { value: "refactor", label: "refactor", description: "Refactor inbox entries into PARA categories" },
      { value: "sync", label: "sync", description: "Commit and push changes to the Second Brain repository" },
      { value: "status", label: "status", description: "Report the current status of the knowledge base" },
    ],
    handler: async (args, ctx) => {
      // Parse args
      const trimmed = (args ?? "").trim();
      const lower = trimmed.toLowerCase();

      let operation: "refactor" | "query" | "sync" | "status";
      let task: string;

      if (lower === "" || lower === "refactor") {
        operation = "refactor";
        task = "Refactor all inbox entries into the appropriate PARA categories.";
      } else if (lower === "sync") {
        operation = "sync";
        task = "Commit and push all changes in the Second Brain repository.";
      } else if (lower === "status") {
        operation = "status";
        task = "Report the current status of the Second Brain knowledge base.";
      } else {
        operation = "query";
        task = trimmed; // Raw query
      }

      // Notify user that operation started
      ctx.ui.notify(`⏳ Second Brain: ${operation}...`, "info");

      try {
        const result = await spawnSbAgent(task, { operation }, undefined);

        if (result.success) {
          ctx.ui.notify(`✓ Second Brain ${operation} complete`, "info");
          // For status, show the output as a notification
          if (operation === "status") {
            ctx.ui.notify(result.output, "info");
          }
        } else {
          ctx.ui.notify(`✗ Second Brain ${operation} failed: ${result.error}`, "error");
        }
      } catch (err) {
        ctx.ui.notify(
          `✗ Second Brain error: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      }
    },
  });

  // 3. Bootstrap agent file on session_start
  pi.on("session_start", () => {
    try {
      // Copy sb.md to ~/.pi/agent/agents/ if not present
      const here = dirname(fileURLToPath(import.meta.url));
      // In dist/ → resources is at ../../resources/
      const srcAgentPath = join(here, "..", "resources", "agents", "sb.md");
      const agentsDir = join(
        process.env.HOME || process.env.USERPROFILE || "~",
        ".pi",
        "agent",
        "agents",
      );
      const dstAgentPath = join(agentsDir, "sb.md");

      if (!existsSync(dstAgentPath) && existsSync(srcAgentPath)) {
        mkdirSync(agentsDir, { recursive: true });
        copyFileSync(srcAgentPath, dstAgentPath);
      }
    } catch {
      // Best-effort — don't crash startup
    }
  });

  // 4. Expose skill path on resources_discover
  pi.on("resources_discover", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const skillsPath = join(here, "..", "resources", "skills");
    return { skillPaths: [skillsPath] };
  });

}
