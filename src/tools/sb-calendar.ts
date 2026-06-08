import { Type } from "typebox";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";

/**
 * Fast-path calendar tool that queries Google Calendar via go-calendar CLI.
 * Returns structured event data without spawning a subagent.
 */
export const sbCalendarTool = {
  name: "sb_calendar",
  label: "Check Google Calendar",
  description:
    "Check Google Calendar for upcoming events, schedule, or availability. " +
    "Use when the user asks about their schedule, appointments, meetings, or what they have today/this week. " +
    "Returns events from ALL calendars (work, personal, shared) merged into a unified timeline. " +
    "Supports queries like 'cosa ho domani?', 'my schedule this week', 'am I free Thursday?'.",
  parameters: Type.Object({
    from: Type.String({
      description: "Start date in YYYY-MM-DD format (default: today)",
    }),
    to: Type.String({
      description: "End date in YYYY-MM-DD format (default: 7 days from start)",
    }),
    query: Type.Optional(Type.String({
      description: "Optional text to search for in event titles",
    })),
  }),
  execute: async (
    _toolCallId: string,
    params: { from: string; to: string; query?: string },
    _signal: AbortSignal | undefined,
    _onUpdate: AgentToolUpdateCallback<unknown> | undefined,
    _ctx: ExtensionContext,
  ): Promise<AgentToolResult<unknown>> => {
    // 1. Check go-calendar is available
    try {
      execSync("which go-calendar", { encoding: "utf-8" });
    } catch {
      return {
        content: [{
          type: "text",
          text: "Google Calendar integration is not available. Install go-calendar (`npm install -g @marcfargas/go-easy`) and configure credentials.",
        }],
        details: {},
      };
    }

    // 2. Detect account
    let account: string;
    try {
      const authList = execSync("go-easy auth list 2>/dev/null", { encoding: "utf-8" }).trim();
      if (!authList) {
        return {
          content: [{ type: "text", text: "No Google account configured. Run: go-easy auth add your@email.com" }],
          details: {},
        };
      }
      account = authList.split("\n")[0].trim();
    } catch {
      return {
        content: [{ type: "text", text: "Failed to detect Google account." }],
        details: {},
      };
    }

    // 3. Discover calendars
    let calendars: Array<{ id: string; summary: string; primary?: boolean }>;
    try {
      const calJson = execSync(`go-calendar ${account} calendars`, { encoding: "utf-8" });
      calendars = JSON.parse(calJson);
    } catch {
      return {
        content: [{ type: "text", text: "Failed to discover calendars." }],
        details: {},
      };
    }

    // 4. Query each calendar and merge events
    const { from, to, query } = params;
    const allEvents: Array<{
      summary: string;
      start: string;
      end: string;
      location?: string;
      calendar: string;
    }> = [];

    for (const cal of calendars) {
      try {
        let cmd = `go-calendar ${account} events ${cal.id} --from=${from}T00:00:00Z --to=${to}T23:59:59Z --event-types=default,outOfOffice,focusTime`;
        if (query) {
          cmd += ` --query="${query.replace(/"/g, '\\"')}"`;
        }
        const eventsJson = execSync(cmd, { encoding: "utf-8", timeout: 10_000 });
        const events = JSON.parse(eventsJson);
        const items = events.items || events || [];
        for (const ev of items) {
          allEvents.push({
            summary: ev.summary || "(no title)",
            start: ev.start?.dateTime || ev.start?.date || "?",
            end: ev.end?.dateTime || ev.end?.date || "",
            location: ev.location || "",
            calendar: cal.summary,
          });
        }
      } catch {
        // Skip calendars we can't read
      }
    }

    // 5. Sort by start time and format
    allEvents.sort((a, b) => a.start.localeCompare(b.start));

    if (allEvents.length === 0) {
      return {
        content: [{ type: "text", text: `No events found from ${from} to ${to}.` }],
        details: { calendarCount: calendars.length },
      };
    }

    // Format output
    let output = `📅 Events (${from} → ${to}):\n\n`;
    let currentDate = "";
    for (const ev of allEvents) {
      // Extract date for grouping
      const date = ev.start.slice(0, 10);
      if (date !== currentDate) {
        currentDate = date;
        output += `## ${date}\n`;
      }

      const time = ev.start.length > 10 ? ev.start.slice(11, 16) : "all-day";
      const endTime = ev.end.length > 10 ? ev.end.slice(11, 16) : "";
      const timeRange = endTime ? `${time}-${endTime}` : time;

      output += `- **${timeRange}** ${ev.summary}`;
      if (ev.location) {
        output += ` 📍 ${ev.location}`;
      }
      if (calendars.length > 1) {
        output += ` [${ev.calendar}]`;
      }
      output += "\n";
    }

    return {
      content: [{ type: "text", text: output }],
      details: { eventCount: allEvents.length, calendarCount: calendars.length },
    };
  },
};
