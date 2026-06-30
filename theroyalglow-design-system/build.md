# Build & Release

> **TL;DR:** Build system for generating a Kiro Power from `/src` content. Single build target: `/dist/kiro`. Covers build flow, Kiro Power formatting rules, documentation sync, component API sync, build validation, README structure rules, and release process.

---

## Build System

### Build Inputs

Source: `/src`

Control: `maintenance.md`, `agents.md`, `optimization.md`

### Build Outputs

- `/dist/kiro` — Kiro Power output

### Dist Folder Structure

```
dist/kiro/
├── theroyalglow-design-system/           ← Latest build (overwritten each build)
│   ├── POWER.md
│   └── steering/
└── archive/                  ← Versioned zip archives
    └── theroyalglow-design-system-v{X.X.X}.zip
```

### Build Flow

1. Validate `/src`
2. Run Documentation Sync
3. Ask user: major, minor, or patch version
4. Apply versioning rules
5. Archive current build (if not first build)
6. Generate Kiro Power output → `/dist/kiro/theroyalglow-design-system/`
7. Run validation checks
8. Update: `changes.md`, `todos.md`, `README.md` (if workflow changed)
9. Prepare commit

### Build Copy Procedure

When copying `/src` files into dist output:

1. Execute each `cp` command as a separate shell invocation
2. After copying, run a file count verification
3. If the count doesn't match, diff the file lists and copy missing files
4. Only proceed after the count check passes

### Build Efficiency Rules

1. Chunk file copies into batches of ~10 files per shell invocation
2. Skip files unchanged since last build when possible
3. If a build step exceeds reasonable time, checkpoint and report

---

## Kiro Power Format

Source: Kiro documentation (`https://kiro.dev/docs/powers/create/`)

### Required Files

- `POWER.md` — Root documentation file with YAML frontmatter (required)
- `steering/*.md` — Directory containing all documentation/steering files

### POWER.md Structure

```yaml
---
name: theroyalglow-design-system
displayName: {Display Name}
description: {description}
keywords:
  - design-system
  - shadcn
  - tailwind
  - components
version: {X.X.X}
---
```

### File Organization

```
theroyalglow-design-system/
├── POWER.md
└── steering/
    ├── design-system.md
    ├── components/
    ├── patterns/
    ├── templates/
    ├── default-theme.md
    ├── design-guidelines.md
    ├── ui-guidelines.md
    ├── copy-guidelines.md
    ├── glossary.md
    ├── technical-guidelines.md
    ├── shadcn.md
    ├── storybook.md
    ├── motion.md
    ├── lucide.md
    ├── mcp.md
    └── workflows.md
```

---

## Documentation-of-Record Sync System

During every build:
1. Attempt to fetch latest documentation from external sources
2. Compare against this file's documented build instructions
3. Update with verified changes only
4. Log changes in `changes.md`

If external documentation is unavailable, use this file as the authoritative source and add a TODO.

---

## Component API Sync System

On every build or when user requests sync:
1. Verify ShadCN MCP is available
2. For each component file, query ShadCN MCP for current API data
3. Compare against internal record
4. Non-breaking changes → update directly
5. Breaking changes → create conflict TODO
6. Log sync results in `changes.md`

---

## Build Validation

After generating the Kiro Power output, verify:
1. File count: dist file count matches src file count
2. Source coverage: every `/src` file has a corresponding dist file
3. Content match: Markdown body matches source
4. Metadata: POWER.md frontmatter is valid
5. No orphan files in dist

---

## Release Process

1. Complete all content changes
2. Run full validation pass
3. Perform documentation sync
4. Execute build flow
5. Verify output in `/dist/kiro`
6. Update `changes.md`
7. Commit and push

---

## README Structure Rules

README files follow a canonical section structure per copy-guidelines.md voice and tone. The README is the primary orientation document for the project — it covers what the project does, how to get started, capabilities with example prompts, project tools, technologies, and project structure.

### Canonical sections

1. About this project
2. Getting started
3. What you can do (capabilities with example prompts)
4. Project tools
5. Technologies (with swap guidance)
6. Project structure
7. Additional information

