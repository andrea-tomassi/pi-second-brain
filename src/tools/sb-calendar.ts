import { Type } from "typebox";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";

export const sbCalendarTool = {
  name: "sb_calendar",
  label: "Check Google Calendar",
  description:
    "Check Google Calendar for upcoming events, schedule, or availability. " +
    "Use when the user asks about their schedule, appointments, meetings, or what they have today/this week. " +
    "Returns raw event data from ALL calendars. " +
    "Supports queries like 'cosa ho domani?', 'my schedule this week', 'am I free Thursday?'.",
  parameters: Type.Object({
    from: Type.String({
      description: "Start date in YYYY-MM-DD format",
    }),
    to: Type.String({
      description: "End date in YYYY-MM-DD format",
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
        content: [{ type: "text", text: "Google Calendar not available. Install: npm i -g @marcfargas/go-easy" }],
        details: {},
      };
    }

    // 2. Detect account
    let account: string;
    try {
      const authData = JSON.parse(execSync("go-easy auth list 2>/dev/null", { encoding: "utf-8" }));
      const accounts: Array<{ email: string }> = authData.accounts || [];
      if (accounts.length === 0) {
        return {
          content: [{ type: "text", text: "No Google account configured. Run: go-easy auth add your@email.com" }],
          details: {},
        };
      }
      account = accounts[0].email;
    } catch {
      return {
        content: [{ type: "text", text: "Failed to detect Google account." }],
        details: {},
      };
    }

    // 3. Discover calendars
    let calendars: Array<{ id: string; summary: string }>;
    try {
      calendars = JSON.parse(execSync(`go-calendar ${account} calendars`, { encoding: "utf-8" }));
    } catch {
      return {
        content: [{ type: "text", text: "Failed to discover calendars." }],
        details: {},
      };
    }

    // 4. Query each calendar and collect raw events
    const { from, to, query } = params;
    const allEvents: unknown[] = [];

    for (const cal of calendars) {
      try {
        let cmd = `go-calendar ${account} events ${cal.id} --from=${from}T00:00:00Z --to=${to}T23:59:59Z --event-types=default,outOfOffice,focusTime`;
        if (query) {
          cmd += ` --query="${query.replace(/"/g, '\\"')}"`;
        }
        const raw = execSync(cmd, { encoding: "utf-8", timeout: 10_000 });
        const parsed = JSON.parse(raw);
        const items: unknown[] = parsed.items || parsed || [];
        // Tag each event with its calendar name, strip fat
        for (const ev of items) {
          const e = ev as Record<string, unknown>;
          allEvents.push({
            summary: e.summary,
            start: e.start,
            end: e.end,
            location: e.location || undefined,
            attendees: (e.attendees as Array<Record<string, string>>)?.map(a => a.displayName || a.email),
            description: typeof e.description === "string" ? e.description.slice(0, 300) : undefined,
            calendar: cal.summary,
          });
        }
      } catch {
        // skip unreadable calendars
      }
    }

    if (allEvents.length === 0) {
      return {
        content: [{ type: "text", text: `No events found from ${from} to ${to}.` }],
        details: { calendarCount: calendars.length },
      };
    }

    // 5. Dump as JSON — the LLM handles the rest
    return {
      content: [{ type: "text", text: JSON.stringify(allEvents, null, 2) }],
      details: { eventCount: allEvents.length, calendarCount: calendars.length },
    };
  },
};
