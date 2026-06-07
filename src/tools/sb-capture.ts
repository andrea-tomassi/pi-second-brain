import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Type } from "typebox";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, getTodayInboxFile } from "../config.js";

/**
 * Formats a timestamp string as "YYYY-MM-DD HH:MM".
 */
function timestamp(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Fast-path capture tool that atomically appends notes to the inbox.
 */
export const sbCaptureTool = {
  name: "sb_capture",
  label: "Capture to inbox",
  description: "Capture a fleeting thought, task, idea, or note into your Second Brain inbox. Use when the user mentions something worth remembering — a to-do, an idea, a reminder, a discovery. The note is appended to today's inbox file and will be categorized during the next refactor.",
  parameters: Type.Object({
    content: Type.String({ description: "The text to capture. Brief and clear." }),
  }),
  execute: async (
    _toolCallId: string,
    params: { content: string },
    _signal: AbortSignal | undefined,
    _onUpdate: AgentToolUpdateCallback<unknown> | undefined,
    _ctx: ExtensionContext,
  ): Promise<AgentToolResult<unknown>> => {
    const config = await loadConfig();
    const inboxFile = getTodayInboxFile(config);
    const ts = timestamp();
    const heading = `## ${ts}`;
    const entry = `\n${heading}\n\n- ${params.content}`;
    const bullet = `- ${params.content}`;

    // Ensure the 00-Inbox directory exists
    await mkdir(path.dirname(inboxFile), { recursive: true });

    let fileContent: string;

    try {
      fileContent = await readFile(inboxFile, "utf-8");
    } catch {
      // File doesn't exist — create it with the full entry
      await writeFile(inboxFile, entry, "utf-8");
      return {
        content: [{ type: "text", text: `✓ Captured to inbox: ${path.basename(inboxFile)}` }],
        details: {},
      };
    }

    // File exists — check if the same heading already exists
    const headingIndex = fileContent.indexOf(heading);

    if (headingIndex !== -1) {
      // Same heading exists — insert the bullet after the heading
      const before = fileContent.slice(0, headingIndex + heading.length);
      const after = fileContent.slice(headingIndex + heading.length);
      const newContent = `${before}\n${bullet}${after}`;

      await writeFile(inboxFile, newContent, "utf-8");
    } else {
      // No matching heading — append full entry block
      const newContent = fileContent.endsWith("\n") ? `${fileContent}${entry}` : `${fileContent}\n${entry}`;
      await writeFile(inboxFile, newContent, "utf-8");
    }

    return {
      content: [{ type: "text", text: `✓ Captured to inbox: ${path.basename(inboxFile)}` }],
      details: {},
    };
  },
};
