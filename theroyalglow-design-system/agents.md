# Agent Rules and Behavior

> **TL;DR:** Governance rules for all agent operations. Fresh session initialization: verify ShadCN MCP + Tailwind availability. Key hard rules: Verified Sources Only (official domains only), Non-Speculative Integrity (never invent content), Protect Sensitive Information (no secrets, tokens, keys, passwords, or PII), Theme/Component Variable Separation (no hardcoded colors in components), Heuristic Precedence (heuristics never override component or theme specs). Source-of-truth hierarchy: agents.md → maintenance.md → workflows.md → optimization.md → index.md. All unknowns use the TODO system. Single build target: Kiro Power. Security: NEVER include secrets, tokens, keys, or passwords in any file, instruction, or output.

## Govern Agent Behavior

This file defines how agents must behave when interacting with this design system skill project. It governs all agent operations during initialization, content creation, maintenance, and build processes.

## Initialize Fresh Session (REQUIRED — FIRST ACTION)

On every fresh session (no prior conversation history), the agent MUST complete the following checks before processing any user prompt.

### 1. Verify Dependency Availability

- Confirm ShadCN MCP Tools are accessible by making a test call (e.g., `get_project_registries` or `search_items_in_registries`)
- If ShadCN MCP is unavailable → STOP, alert user, provide setup instructions from `mcp-setup.md`
- Confirm Tailwind CSS is available as a project dependency
- If Tailwind is unavailable → STOP, alert user with recovery instructions

Only after all checks pass (or the user acknowledges any issues) should the agent proceed with the user's request.

### Manual Operations (User-Triggered)

Component API sync and documentation-of-record sync run only when the user explicitly requests them:

- **`manual-sync` hook:** Check ShadCN component APIs for updates and refresh documentation from external sources

See `maintenance.md` and `build.md` for full procedures.

## Resolve Source-of-Truth Conflicts

1. `agents.md` (this file — ongoing agent governance)
2. `maintenance.md` (day-to-day lifecycle rules; `build.md` and `error-recovery.md` are subordinate)
3. `workflows.md` (deterministic validation workflows)
4. `optimization.md` (quality and formatting rules)
5. `index.md` (navigation and system map)

## Verify External Dependencies

The following external dependencies are required:

- **shadCN component library** — accessed via ShadCN MCP Tools
- **Tailwind CSS** — CSS utility framework

If any dependency is unavailable, the agent MUST stop execution and alert the user with recovery instructions.

---

MCP server configuration instructions are in `mcp-setup.md`. Load that file when setup is needed.

---

## Verified Sources Only (HARD RULE)

The agent MUST use only official source documentation when fetching or validating external information:

| Source | Allowed Domains |
|--------|----------------|
| ShadCN | `ui.shadcn.com`, ShadCN MCP Tools |
| Tailwind CSS | `tailwindcss.com` |
| Kiro Powers | `kiro.dev` |
| Radix UI | `radix-ui.com` |
| WCAG/WAI-ARIA | `w3.org` |
| Storybook | `storybook.js.org` |
| Motion | `motion.dev` |
| Lucide | `lucide.dev` |
| GitHub | `github.com`, `docs.github.com` |
| Figma | `figma.com` |

**NEVER:**
- Use blog posts, third-party aggregators, or unofficial mirrors
- Trust content from non-official domains, even if it appears accurate
- Use cached or summarized versions of official docs from other sites

## Non-Speculative Integrity (HARD RULE)

The agent MUST:
- NEVER invent content
- NEVER infer missing data
- NEVER best guess or approximate

Allowed sources ONLY:
- Explicit user input
- Verified external references
- System-defined sources: shadCN, Tailwind, provided design libraries

## Protect Sensitive Information (HARD RULE)

The agent MUST never include secrets, tokens, keys, passwords, emails, usernames, personal access tokens, or any PII in any file, instruction, or output. This applies to:
- Build outputs (`/dist`)
- Skill content (`/src`)
- Code comments and examples
- Commit messages

When a workflow requires credentials (e.g., MCP server setup), the agent must guide the user through obtaining and configuring their own credentials securely — never store, echo, or hardcode them.

## Enforce Content Separation

| Location | Contains |
|----------|----------|
| `/src` | Skill content (design system definitions, components, patterns, templates, themes, guidelines, tech) |
| Root files | Operational system (agent rules, maintenance, optimization, tracking) |
| `/dist/kiro` | Kiro Power build output |

The agent must NEVER confuse `/src` (content to be BUILT) with root files (system that CONTROLS the build).


### Enforce Theme and Component Variable Separation

| Rule | Detail |
|------|--------|
| Component files (`/src/design-system/components/*.md`) | Reference CSS variables only (e.g., `--foreground`, `--border`) — NEVER hardcoded color values (hex, rgba) |
| Theme files (`/src/themes/*.md`) | Hold all resolved color/style values |
| Design tokens in components | Map to CSS variable names, not raw color values |

Theme variables must align with shadCN CSS variables and Tailwind utility variables.

### Enforce Component Parent/Child Content Separation

`design-system.md` is the parent record and index for the three-tier design system (components, patterns, templates). Individual `[item].md` files are child records.

| Content Type | Location | Examples |
|-------------|----------|----------|
| Global content | `design-system.md` only | WCAG reference link, theme compatibility rules, file structure conventions, section template, validation procedures, variable tracking, Component Index table |
| Component-specific content | Individual files only | Behavior, API, composition patterns, accessibility, HTML structure, CSS, CSS variable dependencies, theme behavior |

## Heuristic Precedence (HARD RULE)

Design heuristics (`src/guidelines/design/design-guidelines.md`) are reference material for constructing UI experiences. They do NOT govern the design system itself.

**Precedence order:**
1. Component library specs (`/src/design-system/components/*.md`) — highest authority
2. Theme definitions (`/src/themes/*.md`) — highest authority
3. Design heuristics (`src/guidelines/design/design-guidelines.md`) — advisory only

The agent MUST:
- NEVER use heuristics as justification to alter an existing component's design, API, variants, or styling
- NEVER use heuristics as justification to alter theme variable values or structure
- NEVER override component or theme specs with heuristic recommendations

## Track Unknowns with the TODO System

All unknowns must:
- Preserve structure (headers/subheaders remain intact)
- Insert TODO in the body only: `TODO: Content required. No source or reference provided.`
- Be tracked centrally in `todos.md`

The agent must NEVER partially fill a section. Either fully populated with verified content, or marked with TODO.

### Apply TODO Auto-Removal Rule

See `workflows.md` → Workflow 5 (`todo-integrity`), check TD-02 for the auto-removal procedure.

## Build and Validation Enforcement

See `build.md` → Build System and `workflows.md` → Trigger Summary for all build and validation procedures.

The agent must NEVER place build/operational logic in `/src`.

## Commit Workflow (HARD RULE)

The standard commit workflow for this project is shell git.

1. REQUIRED: Run the post-change sequence from `workflows.md` before committing
2. Use standard `git add`, `git commit`, `git push` via shell
3. The `pre-commit-audit` hook is available as a manual check before committing

**The agent MUST:**
- ALWAYS run the post-change sequence before committing
- NEVER skip the post-change sequence — it is the primary quality gate

## TODO Audit After Every Commit (REQUIRED)

After every commit, the agent MUST audit `todos.md`. See `workflows.md` for the specific checks.

## Handle Failure Conditions

The agent MUST stop and alert the user for any of these conditions:

| Condition | Action |
|-----------|--------|
| ShadCN MCP unavailable | Provide setup instructions from `mcp-setup.md`; offer to configure (with user approval) |
| Tailwind unavailable | Alert user with recovery instructions |
| Required external reference inaccessible | Alert user; no fallback exists |
| File write desync suspected | Follow `error-recovery.md` → Error 6 |

## Troubleshoot File Write Desync

If the agent suspects a desync (string replacement fails unexpectedly, file content doesn't match what was just written, or user reports corrupted content), follow `error-recovery.md` → Error 6.

## Enforce Trailing Whitespace Hygiene

The agent MUST never introduce trailing whitespace in any file write or edit. `.editorconfig` enforces `trim_trailing_whitespace = true` but agents must produce clean output regardless.
