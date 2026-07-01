import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sbCaptureTool } from "./tools/sb-capture.js";
import { sbSearchTool } from "./tools/sb-search.js";
import { sbCalendarTool } from "./tools/sb-calendar.js";
import { spawnSbAgent } from "./agent-runner.js";
import { loadConfig, resolveKbPath } from "./config.js";

/**
 * Pi Second Brain — Personal knowledge management for the Pi coding agent.
 *
 * This extension captures fleeting thoughts, searches a knowledge base,
 * refactors inbox items using the PARA method, and auto-commits.
 *
 * @param pi - Pi Extension API
 */
export default function (pi: ExtensionAPI): void {
  // 1. Register tools
  pi.registerTool(sbCaptureTool);
  pi.registerTool(sbSearchTool);
  pi.registerTool(sbCalendarTool);

  // 2. PARA folder definitions for list
  const PARA_FOLDERS: ReadonlyArray<{ key: string; dir: string; icon: string; label: string }> = [
    { key: "inbox", dir: "00-Inbox", icon: "📥", label: "Inbox" },
    { key: "projects", dir: "01-Projects", icon: "📁", label: "Projects" },
    { key: "areas", dir: "02-Areas", icon: "📂", label: "Areas" },
    { key: "resources", dir: "03-Resources", icon: "📚", label: "Resources" },
    { key: "archive", dir: "99-Archive", icon: "🗂️", label: "Archive" },
  ];

  /**
   * Counts entries (## headings) in a markdown file.
   */
  function countEntries(filePath: string): number {
    try {
      const content = readFileSync(filePath, "utf-8");
      const matches = content.match(/^## /gm);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Extracts entry headings from a markdown file.
   */
  function getEntryHeadings(filePath: string): string[] {
    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const headings: string[] = [];
      for (const line of lines) {
        if (/^## /.test(line)) {
          headings.push(line);
        }
      }
      return headings;
    } catch {
      return [];
    }
  }

  /**
   * Handles the /sb list command — lists folders with counts, or a specific folder's contents.
   */
  async function handleList(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const config = await loadConfig();
    const kbRoot = resolveKbPath(config);
    const folderArg = args.trim().toLowerCase();

    // If a specific folder is requested, show its contents
    if (folderArg) {
      const folder = PARA_FOLDERS.find(
        (f) => f.key === folderArg || f.dir.toLowerCase() === folderArg,
      );
      if (!folder) {
        ctx.ui.notify(
          `Unknown folder "${folderArg}". Use: ${PARA_FOLDERS.map((f) => f.key).join(", ")}`,
          "error",
        );
        return;
      }

      const folderPath = join(kbRoot, folder.dir);
      let files: string[];
      try {
        files = readdirSync(folderPath)
          .filter((f) => f.endsWith(".md"))
          .sort();
      } catch {
        ctx.ui.notify(`${folder.icon} ${folder.label}: directory not found or empty.`, "error");
        return;
      }

      if (files.length === 0) {
        ctx.ui.notify(`${folder.icon} ${folder.label} (${folder.dir}): empty`, "info");
        return;
      }

      const lines: string[] = [`${folder.icon} ${folder.label} (${folder.dir}): ${files.length} file(s)\n`];
      for (const file of files) {
        const filePath = join(folderPath, file);
        const headings = getEntryHeadings(filePath);
        lines.push(`  ${file}`);
        for (const h of headings) {
          // Show the heading text (strip ## prefix)
          lines.push(`    ${h.replace(/^## /, "")}`);
        }
      }
      ctx.ui.notify(lines.join("\n"), "info");
      return;
    }

    // No folder specified — show summary with counts
    const summaryLines: string[] = [];
    for (const folder of PARA_FOLDERS) {
      const folderPath = join(kbRoot, folder.dir);
      let count = 0;
      try {
        const files = readdirSync(folderPath).filter((f) => f.endsWith(".md"));
        for (const file of files) {
          count += countEntries(join(folderPath, file));
        }
      } catch {
        // Directory doesn't exist
      }
      summaryLines.push(`${folder.icon} ${folder.label}: ${count} entries (${folder.dir}/)`);
    }
    ctx.ui.notify(summaryLines.join("\n"), "info");
  }

  // 3. Helper: count entries in all .md files under a folder
  function countFolderEntries(folderPath: string): number {
    try {
      const files = readdirSync(folderPath).filter((f) => f.endsWith(".md"));
      let count = 0;
      for (const file of files) {
        count += countEntries(join(folderPath, file));
      }
      return count;
    } catch {
      return 0;
    }
  }

  // 4. Register /sb-list command
  pi.registerCommand("sb-list", {
    description: "List Second Brain folder contents",
    getArgumentCompletions: async () => {
      const config = await loadConfig();
      const kbRoot = resolveKbPath(config);
      return PARA_FOLDERS.map((f) => {
        const count = countFolderEntries(join(kbRoot, f.dir));
        return {
          value: f.key,
          label: `${f.icon} ${f.key} (${count})`,
          description: `${f.label} (${f.dir}/)`,
        };
      });
    },
    handler: async (args, ctx) => {
      await handleList((args ?? "").trim(), ctx);
    },
  });

  // 5. Register /sb command
  pi.registerCommand("sb", {
    description: "Second Brain operations: refactor, status, or query your knowledge base",
    getArgumentCompletions: async () => [
      { value: "refactor", label: "refactor", description: "Refactor inbox entries into PARA categories" },
      { value: "status", label: "status", description: "Report the current status of the knowledge base" },
    ],
    handler: async (args, ctx) => {
      const trimmed = (args ?? "").trim();
      const lower = trimmed.toLowerCase();

      // Handle refactor, status, query via subprocess
      let operation: "refactor" | "query" | "status";
      let task: string;

      if (lower === "" || lower === "refactor") {
        operation = "refactor";
        task = "Refactor all inbox entries into the appropriate PARA categories.";
      } else if (lower.startsWith("refactor ")) {
        operation = "refactor";
        task = trimmed.slice("refactor ".length);
      } else if (lower === "status") {
        operation = "status";
        task = "Report the current status of the Second Brain knowledge base.";
      } else {
        operation = "query";
        task = trimmed;
      }

      // Notify user that operation started
      ctx.ui.notify(`⏳ Second Brain: ${operation}...`, "info");

      try {
        const result = await spawnSbAgent(task, { operation }, undefined);

        if (result.success) {
          const summary = result.output || "done";
          ctx.ui.notify(`✓ Second Brain ${operation}: ${summary.slice(0, 500)}`, "info");
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

  // 3. Bootstrap agent file on session_start (update if source is newer)
  pi.on("session_start", () => {
    try {
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

      if (existsSync(srcAgentPath)) {
        mkdirSync(agentsDir, { recursive: true });
        // Copy when dst is missing or source is newer (propagates prompt updates)
        const srcMtime = statSync(srcAgentPath).mtimeMs;
        let needsCopy = true;
        try {
          needsCopy = srcMtime > statSync(dstAgentPath).mtimeMs;
        } catch {
          // dst doesn't exist — copy
        }
        if (needsCopy) {
          copyFileSync(srcAgentPath, dstAgentPath);
        }
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
