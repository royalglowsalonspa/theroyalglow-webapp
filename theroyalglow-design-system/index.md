# System Index

## Purpose

Navigation and system map for agents and humans. Describes project structure, system connections, and entry points.

## Project Structure

```
/theroyalglow-design-system
├── README.md              — Entry point and project guide
├── agents.md              — Agent behavior and rules
├── mcp-setup.md           — MCP server configuration (shadCN)
├── index.md               — This file (navigation + system map)
├── maintenance.md         — Day-to-day lifecycle and procedures
├── build.md               — Build system (Kiro Power format)
├── error-recovery.md      — Error recovery procedures
├── optimization.md        — Quality and consistency standards
├── workflows.md           — Deterministic validation workflows
├── changes.md             — Change log
├── todos.md               — TODO tracking
├── project-status.md      — Current project status
├── .editorconfig          — Editor configuration
├── /src
│   ├── /design-system
│   │   ├── design-system.md  — Design system library (parent record + indexes)
│   │   ├── /components    — Component specs
│   │   ├── /patterns      — Pattern specs
│   │   └── /templates     — Template specs
│   ├── /themes
│   │   └── default.md     — Default theme (New York)
│   ├── /guidelines
│   │   ├── /design
│   │   │   ├── design-guidelines.md
│   │   │   └── ui-guidelines.md
│   │   └── /copywriting
│   │       ├── copy-guidelines.md
│   │       └── glossary.md
│   ├── /tech
│   │   ├── technical-guidelines.md
│   │   ├── shadcn.md
│   │   ├── storybook.md
│   │   ├── motion.md
│   │   └── lucide.md
│   ├── /setup
│   │   └── mcp.md
│   └── /workflows
│       └── workflows.md
├── /dist
│   └── /kiro               — Kiro Power build output
```

## Separation of Concerns

| Layer | Location | Purpose |
|-------|----------|---------|
| Operational | Root | Agent behavior, build processes, project governance |
| Skill | `/src` | Design system definitions, reusable knowledge. Gets built into outputs |
| Build Output | `/dist/kiro` | Generated Kiro Power output. Not edited directly |

## Agent Entry Points

1. Read `agents.md` — understand rules and constraints
2. Read `index.md` (this file) — understand structure and navigation
3. Read `maintenance.md` — understand lifecycle procedures
4. Read `optimization.md` — understand quality standards
5. Navigate to `/src` for skill content work

## System Connections

| File | Role | Connects To |
|------|------|-------------|
| `agents.md` | Governs behavior | `todos.md`, `maintenance.md`, `optimization.md`, `mcp-setup.md` |
| `mcp-setup.md` | MCP server setup reference | Referenced by `agents.md` on dependency failure |
| `maintenance.md` | Governs day-to-day lifecycle | `todos.md`, `build.md`, `error-recovery.md`, `optimization.md` |
| `build.md` | Governs builds | Reads `/src`, writes `/dist/kiro` |
| `error-recovery.md` | Error procedures | Referenced by `agents.md`, `maintenance.md` |
| `optimization.md` | Governs quality | Applied during content creation and builds |
| `workflows.md` | Validation workflows | Operationalizes governance rules into deterministic workflows |
| `todos.md` | Tracks gaps | Populated by validation and manual entry |
| `changes.md` | Tracks history | Updated by builds and content changes |

