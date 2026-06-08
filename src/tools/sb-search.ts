import { spawn } from "node:child_process";
import path from "node:path";
import { Type } from "typebox";
import { loadConfig, resolveKbPath } from "../config.js";

/**
 * Maps user-friendly directory names to PARA subdirectory names.
 */
const DIR_MAP: Record<string, string> = {
  inbox: "00-Inbox",
  projects: "01-Projects",
  areas: "02-Areas",
  resources: "03-Resources",
  archive: "99-Archive",
} as const;

interface SbSearchParams {
  query: string;
  directory?: string;
  maxResults?: number;
}

export const sbSearchTool = {
  name: "sb_search",
  label: "Search knowledge base",
  description:
    "Search your Second Brain knowledge base for notes, tasks, or ideas matching a query. Returns matching file paths and line excerpts. Use this when the user asks about personal projects, tasks, or past captures. IMPORTANT: This tool only searches local notes — it does NOT check Google Calendar. For schedule, events, or appointments, use the /sb command instead.",
  parameters: Type.Object({
    query: Type.String({ description: "Search query — specific terms work best." }),
    directory: Type.Optional(
      Type.String({ description: "Restrict search to a PARA subdirectory: inbox, projects, areas, resources, archive. Default: search entire KB." }),
    ),
    maxResults: Type.Optional(Type.Number({ description: "Maximum results to return. Default: 20." })),
  }),
  execute: async (_toolCallId: string, params: SbSearchParams, _signal: AbortSignal | undefined) => {
    const config = await loadConfig();
    const kbRoot = resolveKbPath(config);
    let searchDir = kbRoot;
    if (params.directory && params.directory in DIR_MAP) {
      searchDir = path.join(kbRoot, DIR_MAP[params.directory]);
    }

    // Safety check: ensure searchDir is within kbRoot
    const normalizedKbRoot = path.resolve(kbRoot);
    const normalizedSearchDir = path.resolve(searchDir);
    if (!normalizedSearchDir.startsWith(normalizedKbRoot)) {
      searchDir = normalizedKbRoot;
    }
    const maxResults = params.maxResults ?? 20;

    return new Promise<{ content: { type: "text"; text: string }[]; details: { query: string; resultsCount: number; directory: string | undefined } }>(
      (resolve) => {
        const child = spawn("rg", [
          "--no-heading",
          "--line-number",
          "--color",
          "never",
          "--max-count",
          String(maxResults),
          "--sort",
          "path",
          params.query,
          searchDir,
        ]);

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        child.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        child.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ENOENT") {
            resolve({
              content: [{ type: "text", text: "ripgrep (rg) not found. Install with: apt install ripgrep" }],
              details: { query: params.query, resultsCount: 0, directory: params.directory },
            });
          } else {
            resolve({
              content: [{ type: "text", text: `Search error: ${err.message}` }],
              details: { query: params.query, resultsCount: 0, directory: params.directory },
            });
          }
        });

        child.on("close", (code: number | null) => {
          if (code === 1) {
            resolve({
              content: [{ type: "text", text: `No results found for: ${params.query}` }],
              details: { query: params.query, resultsCount: 0, directory: params.directory },
            });
          } else if (code !== null && code >= 2) {
            resolve({
              content: [{ type: "text", text: `Search error (exit code ${code}): ${stderr || "unknown error"}` }],
              details: { query: params.query, resultsCount: 0, directory: params.directory },
            });
          } else if (code === 0) {
            // Strip the KB root prefix from each matching line
            const kbRootPrefix = kbRoot.endsWith("/") ? kbRoot : kbRoot + "/";
            const relativeLines = stdout
              .split("\n")
              .filter((line) => line.length > 0)
              .map((line) => {
                if (line.startsWith(kbRootPrefix)) {
                  return line.slice(kbRootPrefix.length);
                }
                if (line.startsWith(kbRoot)) {
                  return line.slice(kbRoot.length + 1);
                }
                return line;
              });

            const resultText = relativeLines.length > 0 ? relativeLines.join("\n") : "No results found.";
            resolve({
              content: [{ type: "text", text: resultText }],
              details: { query: params.query, resultsCount: relativeLines.length, directory: params.directory },
            });
          } else {
            resolve({
              content: [{ type: "text", text: `Search failed with exit code ${code}` }],
              details: { query: params.query, resultsCount: 0, directory: params.directory },
            });
          }
        });
      },
    );
  },
};
