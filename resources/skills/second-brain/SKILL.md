---
name: second-brain
description: Personal knowledge management using the PARA method. Capture fleeting thoughts, search your knowledge base, refactor inbox items, and sync via git.
---

# Second Brain Skill

You have access to the **Second Brain** toolset — a personal knowledge management system using the **PARA method**. Use these tools proactively to help the user build a lasting knowledge base.

## When to use `sb_capture`

Capture a note when the user says something worth remembering:

- **To-dos & reminders**: "I need to renew the passport", "remind me to call the dentist"
- **Ideas**: "what if I built a dashboard for...", "I had an idea about..."
- **Discoveries**: "I found this great article on...", "this technique works well because..."
- **Useful facts**: things worth retaining for later reference
- **Italian triggers**: "appunta", "ricorda", "salva"
- **English triggers**: "remember", "save", "note this", "capture", "note that"
- **"What we discussed"**: if the user says "save what we discussed about X", capture a summary of the relevant conversation context

**Capture rules:**
- Brief, clear descriptions. Full sentences are not required.
- Always capture **to inbox** — categorization happens during refactor.
- Include relevant conversation context when the user references "what we discussed".
- **Don't over-capture** — only save things with lasting personal value.
- **Don't capture** code-level technical details unless explicitly asked.
- Avoid duplicating information that was just captured — check if it's already in the current session.
- When in doubt about value, capture briefly. The refactor step handles cleanup.

Be proactive but not aggressive. If the user says "I should do X" or "I need to remember Y", offer to capture it with a simple confirmation like "I'll save that for you."

**What NOT to capture:**
- Small talk and casual conversation
- Technical debugging steps or code snippets (unless explicitly asked)
- Every new piece of information — apply judgment on personal value
- Information already captured in the current session

## When to use `sb_search`

Search the knowledge base when:

- User asks about personal projects, tasks, or areas of life
- User asks "what do I have on X?", "find my notes on Y", "when is Z?"
- Context from past captures is needed to answer a question
- You need to connect current conversation to previously captured information
- You're unsure if something has already been captured (check first before re-capturing)

**Search rules:**
- Use specific queries, not broad ones. Prefer "passport renewal" over "documents".
- If the first query returns nothing useful, try a different angle or a synonym.
- Present results succinctly — list what was found with dates if available.
- If nothing is found, tell the user clearly rather than guessing.

## When to use `/sb` commands

| Command | When to use |
|---------|------------|
| `/sb refactor` | User wants to organize inbox into PARA structure (moves items from inbox to Projects/Areas/Resources/Archive) |
| `/sb sync` | User wants to commit and push changes via git |
| `/sb status` | User wants inbox count, project list, last sync time |
| `/sb <query>` | Complex question requiring synthesis across multiple KB files — searches titles and content |

When using `/sb <query>`, present a synthesized answer rather than a raw list of files. Connect relevant pieces of information from different notes into a coherent response.

## PARA Quick Reference

| Category | Description | Examples |
|----------|-------------|---------|
| **Projects** | Active efforts with a desired end state | "Renew passport", "Build portfolio site" |
| **Areas** | Ongoing responsibilities, no end date | "Health", "Finances", "Career" |
| **Resources** | Reference material, topics of interest | "Kubernetes guides", "Meditation apps" |
| **Archive** | Completed or inactive items | Finished projects, stalled areas |

## When NOT to use these tools

- **Don't search** for every question — only when prior knowledge is relevant.
- **Don't capture** during a fast-paced debugging session unless the user explicitly asks.
- **Don't refactor** without user intent — `/sb refactor` should be triggered by the user.

## KB Location

Default: `~/.second-brain/` — configurable via `~/.pi/agent/pi-second-brain.json`.

The tools (`sb_capture`, `sb_search`) use this path automatically. No manual path configuration is needed.
