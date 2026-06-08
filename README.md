# 🧠 Pi Second Brain

Personal knowledge management for the Pi coding agent using the **PARA method**.

Capture fleeting thoughts, search your knowledge base, refactor inbox items into organized projects/areas/resources/archives, and sync everything via git — all from within Pi.

## Install

```bash
pi install git:github.com/andrea-tomassi/pi-second-brain
```

Or from npm (when published):
```bash
pi install npm:pi-second-brain
```

## Usage

### Capture (instant)

Talk naturally — the main agent captures when you ask:

```
"appunta che l'idraulico viene giovedì alle 10"
"remember to call the insurance company"
"save this: the passport expires in March"
```

### Search (instant)

Ask about your notes:

```
"quando viene l'idraulico?"
"what do I have on passport renewal?"
"cerca note sulle tasse"
```

### Manage (`/sb` command)

```
/sb refactor     # Organize inbox into PARA categories (dry-run first)
/sb sync         # Git commit + push
/sb status       # Inbox count, active projects, last sync
/sb <query>      # Complex question (e.g., "/sb summarize my home renovation project")
```

## Features

- **📥 Capture** — Save quick notes, ideas, and TODOs to your inbox (atomic append, zero LLM cost)
- **🔍 Search** — Ripgrep-powered full-text search across your entire KB
- **📐 PARA refactoring** — Subagent organizes inbox into **P**rojects, **A**reas, **R**esources, and **A**rchives
- **🔄 Git sync** — Commit and push changes to keep your second brain in sync
- **📅 Google Calendar** — Read events, check availability, create events from inbox entries (optional)

## Google Calendar Integration (optional)

Second Brain can integrate with Google Calendar via [`@marcfargas/go-easy`](https://pi.dev/packages/@marcfargas/go-easy). No code changes needed — the subagent uses the `go-calendar` CLI.

### Setup

1. **Create Google Cloud credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a project, enable the **Google Calendar API**
   - Create **OAuth client ID** → application type: **Desktop application**
   - Download the JSON credentials

2. **Install go-easy:**
   ```bash
   npm install -g @marcfargas/go-easy
   ```

3. **Configure credentials:**
   ```json
   // ~/.go-easy/credentials.json
   {
     "clientId": "<from downloaded JSON>",
     "clientSecret": "<from downloaded JSON>"
   }
   ```

4. **Authorize:**
   ```bash
   go-easy auth add your@email.com
   # Opens browser for OAuth consent, then:
   go-easy auth add your@email.com  # poll for completion
   ```

### What it enables

```
"cosa ho domani?"                    → SB notes + calendar events
"sono libero giovedì pomeriggio?"    → free/busy check
/sb refactor                         → creates calendar events from dated inbox entries
/sb status                           → includes today's upcoming events
```

If `go-calendar` is not installed, all calendar features are silently skipped — no errors.

## Architecture

```
pi-second-brain/
├── src/
│   ├── index.ts              # Extension entry: registers tools, /sb command, bootstraps agent + skill
│   ├── config.ts             # KB path settings (~/.pi/agent/pi-second-brain.json)
│   ├── tools/
│   │   ├── sb-capture.ts     # Atomic inbox append (fast path)
│   │   └── sb-search.ts      # Ripgrep search (fast path)
│   └── agent-runner.ts       # Spawns pi subprocess for /sb operations (slow path)
├── resources/
│   ├── agents/
│   │   └── sb.md             # Subagent prompt: PARA refactor, query, sync, calendar
│   └── skills/
│       └── second-brain/
│           └── SKILL.md      # Teaches main agent when to capture/search
└── package.json
```

**Two-tier design:**
- **Fast path** (extension tools): `sb_capture` and `sb_search` — instant, zero LLM cost
- **Slow path** (subagent): `/sb` operations — spawns a pi subprocess for intelligent work

## Knowledge Base Structure

```
~/.second-brain/               # Git repo (configurable path)
├── 00-Inbox/
│   └── 2026-06-08.md          # Daily capture files
├── 01-Projects/
│   └── renovate-bathroom.md   # One file per project
├── 02-Areas/
│   └── health.md              # One file per life area
├── 03-Resources/
│   └── kubernetes.md          # One file per topic
├── 99-Archive/
│   └── completed-project.md   # Finished or stale items
└── index.md                   # Map of Content (auto-maintained)
```

## Optional Dependencies

| Tool | Used by | Install |
|------|---------|---------|
| **ripgrep** (`rg`) | `sb_search` | `apt install ripgrep` |
| **go-calendar** | `/sb` calendar features | `npm install -g @marcfargas/go-easy` |

Both are detected at runtime. Missing tools are skipped gracefully.

## License

MIT © 2026 Andrea Tomassi
