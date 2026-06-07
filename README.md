# 🧠 Pi Second Brain

Personal knowledge management for the Pi coding agent using the **PARA method**.

Capture fleeting thoughts, search your knowledge base, refactor inbox items into organized projects/areas/resources/archives, and sync everything via git — all from within Pi.

## Install

```bash
pi install git:github.com/andrea-tomassi/pi-second-brain
```

## Usage

> **Coming soon.** Once installed, the extension registers commands and tools available from within Pi.

## Features

- **📥 Capture** — Save quick notes, ideas, and TODOs to your inbox without leaving your workflow.
- **🔍 Search** — Full-text search across your entire knowledge base.
- **📐 PARA refactoring** — Organize inbox items into **P**rojects, **A**reas, **R**esources, and **A**rchives using the PARA method.
- **🔄 Git sync** — Automatically commit and push changes to keep your second brain in sync.

> Feature details are **coming soon** as implementation progresses.

## Architecture

```
pi-second-brain/
├── src/
│   ├── index.ts        # Extension entry point
│   ├── tools/          # Custom Pi tools (capture, search, para, sync)
│   │   └── ...
├── resources/
│   ├── agents/         # Agent configs and skill definitions
│   └── skills/
│       └── second-brain/  # Skill files loaded by Pi
├── package.json
└── tsconfig.json
```

## License

MIT © 2026 Andrea Tomassi
