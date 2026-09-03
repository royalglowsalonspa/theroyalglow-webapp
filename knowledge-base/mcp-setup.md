# MCP Setup — Cross-IDE Configuration

## Why this exists

RGSS uses 15 MCP servers (Neon, GitHub, Cloudflare, Sentry, PostHog, Payload,
Snyk, shadcn, Mintlify, code-review-graph). The team moves between **Kiro**,
**Claude Code**, **VS Code**, **Cursor**, and **OpenCode** — and every one of
those tools reads MCP server config from a different file, with a different
JSON shape and a different `${...}` substitution syntax. Hand-maintaining five
near-duplicate JSON files would drift the moment one server's args changed.

Instead there is **one source of truth**, `scripts/mcp/sources.json`, and a
generator, `scripts/mcp/generate.ts`, that renders all five native files from
it. A new collaborator clones the repo, sets four environment variables, runs
one command, and every tool is configured identically. No token is ever
written to disk in plaintext — every credential is a reference to an OS
environment variable.

## Quick start (new machine / new collaborator)

1. Get the four credential values from whoever owns them (Neon, GitHub,
   PostHog, Payload — see the table below for scopes). These are **not**
   committed anywhere; they're handed over out-of-band (password manager,
   1Password, etc.).
2. Set them as OS environment variables under the exact `_RGSS`-suffixed
   names — suffixed so they can't collide with a same-named variable another
   project or tool already uses on your machine.

   **Windows (PowerShell), persists across reboots and new terminals:**
   ```powershell
   [System.Environment]::SetEnvironmentVariable('NEON_API_KEY_RGSS', '<value>', 'User')
   [System.Environment]::SetEnvironmentVariable('GITHUB_PAT_RGSS', '<value>', 'User')
   [System.Environment]::SetEnvironmentVariable('POSTHOG_AUTH_HEADER_RGSS', '<value>', 'User')
   [System.Environment]::SetEnvironmentVariable('PAYLOAD_MCP_API_KEY_RGSS', '<value>', 'User')
   ```

   **macOS/Linux, add to `~/.zshrc` / `~/.bashrc` then `source` it:**
   ```bash
   export NEON_API_KEY_RGSS="<value>"
   export GITHUB_PAT_RGSS="<value>"
   export POSTHOG_AUTH_HEADER_RGSS="<value>"
   export PAYLOAD_MCP_API_KEY_RGSS="<value>"
   ```

3. **Fully restart the IDE/terminal** (see "Why a restart is required" below —
   this step is not optional).
4. Run the generator once (also re-run any time `sources.json` changes):
   ```bash
   bun run mcp:generate
   ```
5. Reconnect/reauthenticate each MCP server inside your tool. Setting the env
   var makes the *credential* available; it does not itself open a live
   connection, and OAuth-based servers (Cloudflare, Sentry, Mintlify) need an
   interactive sign-in regardless of env vars.

## Why a restart is required

An environment variable set via `SetEnvironmentVariable(..., 'User')` (or
`export` in a shell profile) only becomes visible to processes launched
**after** it's set. An IDE that's already running was launched before the
variable existed, and neither Windows nor macOS/Linux retroactively injects
new env vars into a running process tree. Close the IDE completely (not just
the window — the process) and reopen it.

## Architecture

```
scripts/mcp/sources.json      ← single source of truth. Edit ONLY this file.
scripts/mcp/generate.ts       ← reads sources.json, writes all 5 native configs
        │
        ├──▶ .kiro/settings/mcp.json   (Kiro)
        ├──▶ .mcp.json                 (Claude Code, project scope)
        ├──▶ .vscode/mcp.json          (VS Code workspace)
        ├──▶ .cursor/mcp.json          (Cursor)
        └──▶ opencode.json             (OpenCode — mcp key only; other
                                         top-level keys are preserved)
```

**Never hand-edit the five generated files.** They're overwritten wholesale
on every `mcp:generate` run (OpenCode's file is the one exception — only its
`mcp` key is replaced, since that file also carries general OpenCode config
like `model`/`provider`).

To add, remove, or change a server: edit `scripts/mcp/sources.json`, then run
`bun run mcp:generate`, then commit both the source file and the five
regenerated outputs together.

## Per-tool schema differences

This is *why* a generator exists instead of one shared file — the formats are
genuinely incompatible, not just cosmetically different:

| Tool | Root key | Local server env var syntax | Remote server shape | Config file(s) |
|---|---|---|---|---|
| **Kiro** | `mcpServers` | `${VAR}` | bare `"url"`, no `type` field | `.kiro/settings/mcp.json` |
| **Claude Code** | `mcpServers` | `${VAR}` or `${VAR:-default}` | `"url"` **plus required** `"type": "http"` | `.mcp.json` (project, committed) or `~/.claude.json` (user/local) |
| **VS Code** | `servers` | `${env:VAR}` | `"url"` plus required `"type": "http"` | `.vscode/mcp.json` (workspace) |
| **Cursor** | `mcpServers` | `${env:VAR}` (Cursor does **not** expand bare `${VAR}`) | bare `"url"`, no `type` documented | `.cursor/mcp.json` |
| **OpenCode** | `mcp` (nested inside general config) | `{env:VAR}` (no leading `$`) | `{"type": "remote", "url": ...}` | `opencode.json` (project) or `~/.config/opencode/opencode.json` (global) |

Other differences the generator absorbs:

- **Command shape.** Every tool except OpenCode splits `command` (executable)
  from `args` (array). OpenCode wants one combined array:
  `"command": ["npx", "-y", "some-package"]`.
- **Workspace-root substitution.** Where a server needs an absolute repo
  path (`code-review-graph`), the generator uses each tool's own portable
  variable where one exists (`${workspaceFolder}` for VS Code/Cursor,
  `${CLAUDE_PROJECT_DIR:-.}` for Claude Code) and falls back to this
  machine's resolved absolute path for Kiro and OpenCode, which don't
  document a portable equivalent for use inside `command`/`args`.
- **Pre-approval.** Only Kiro's schema has an in-file `autoApprove` /
  `disabled` concept. The other four tools gate first-use approval through
  their own UI or CLI (Claude Code's per-project approval prompt, VS Code's
  trust dialog, etc.) — there's nothing to generate for them.

## Security model

- `scripts/mcp/sources.json` and all five generated files are **safe to
  commit** — every credential is a `${VAR_RGSS}`-style reference, never a
  literal value.
- `.kiro/settings/` was previously listed in `.gitignore` (because the old,
  hand-written `mcp.json` had four raw tokens inline). It's been removed from
  `.gitignore` now that generation guarantees the file is secret-free.
- The `_RGSS` suffix on every variable name is a collision guard — so
  `GITHUB_PAT_RGSS` can't be shadowed by, or shadow, an unrelated
  `GITHUB_PAT` another tool or project sets on the same machine.
- OAuth-based remote servers (`cloudflare-*`, `sentry`, `mintlify-*`) carry no
  credential in config at all — `mcp-remote` handles the browser-based OAuth
  dance and caches the resulting token itself, outside this repo entirely.

## Credential reference

| Env var | Server | Scope needed | Where to generate |
|---|---|---|---|
| `NEON_API_KEY_RGSS` | `neon` | Neon Management API key (account-level) | console.neon.tech → Account Settings → API Keys |
| `GITHUB_PAT_RGSS` | `github` | Fine-grained PAT scoped to `theroyalglow-webapp` (or the org) — repo contents read, PRs read/write | github.com/settings/personal-access-tokens |
| `POSTHOG_AUTH_HEADER_RGSS` | `posthog` | Personal API key, project-scoped | eu.posthog.com project → Settings → Personal API Keys |
| `PAYLOAD_MCP_API_KEY_RGSS` | `payload` | Local-dev-only key for the Payload CMS instance at `localhost:3002` | apps/cms — generated per local Payload user |

> **Rotation note:** the four values above were, until this change, committed
> in plaintext inside `.kiro/settings/mcp.json`, which was `.gitignore`d but
> had already been read into at least one editor/agent session. Treat all
> four as **potentially exposed** and rotate them (issue a new token/key,
> update the env var, revoke the old one) rather than assuming the git-ignore
> alone contained them. This is a one-time cleanup step, not a recurring one.

## Adding a new MCP server

1. Add an entry to `scripts/mcp/sources.json`. Use `"transport": "local"` for
   a `command`/`args` server or `"transport": "remote"` for a bare-`url`
   server.
2. If it needs a credential, add it to the `env` array as
   `{ "key": "THE_ENV_VAR_THE_SERVER_ITSELF_EXPECTS", "fromEnvVar": "THE_ENV_VAR_RGSS" }`
   — note these can differ: `key` is what the *server process* reads
   (e.g. `GITHUB_PAT`, referenced via `${GITHUB_PAT}` inside the `--header`
   arg), `fromEnvVar` is the *OS* variable the generator pulls the value from.
3. Run `bun run mcp:generate`.
4. Add the new `_RGSS` variable to `.env.example` (documentation only — this
   repo's `.env.example` is not consumed at runtime by any app, it's the
   shared reference template) and to the credential table above.
5. Commit `sources.json` + all five regenerated files together.

## Related

- [environment-variables.md](./environment-variables.md) — application
  runtime environment variables (unrelated to MCP tooling credentials)
- `.env.example` — documents the four `_RGSS` variables alongside app secrets
