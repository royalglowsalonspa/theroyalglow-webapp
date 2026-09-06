# MCP Setup — Cross-IDE Configuration

## Why this exists

RGSS uses 16 MCP servers (Neon, GitHub, Cloudflare, Sentry, PostHog, Payload,
Socket, Snyk, shadcn, Mintlify, code-review-graph). The team moves between **Kiro**,
**Claude Code**, **Codex**, **VS Code**, **Cursor**, and **OpenCode** — and every one of
those tools reads MCP server config from a different file, with a different
JSON shape and a different `${...}` substitution syntax. Hand-maintaining five
near-duplicate JSON files would drift the moment one server's args changed.

Instead there is **one source of truth**, `scripts/mcp/sources.json`, and a
generator, `scripts/mcp/generate.ts`, that renders all six native files from
it. A new collaborator clones the repo, installs three global npm packages,
sets five environment variables, runs
one command, and every tool is configured identically. No token is ever
written to disk in plaintext — every credential is a reference to an OS
environment variable.

## Quick start (new machine / new collaborator)

1. Get the five credential values from whoever owns them (Neon, GitHub,
   PostHog, Payload, Cloudflare — see the table below for scopes). These are **not**
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
    [System.Environment]::SetEnvironmentVariable('CLOUDFLARE_API_TOKEN_RGSS', '<value>', 'User')
    ```

    **macOS/Linux, add to `~/.zshrc` / `~/.bashrc` then `source` it:**
    ```bash
    export NEON_API_KEY_RGSS="<value>"
    export GITHUB_PAT_RGSS="<value>"
    export POSTHOG_AUTH_HEADER_RGSS="<value>"
    export PAYLOAD_MCP_API_KEY_RGSS="<value>"
    export CLOUDFLARE_API_TOKEN_RGSS="<value>"
    ```

3. Install the three global launcher packages (configs invoke `snyk`,
   `shadcn`, and `mcp-remote` directly — no `npx`, so a cold spawn takes
   under a second instead of ~17s):
    ```bash
    npm i -g mcp-remote@0.8.3 shadcn snyk
    ```
   (`mcp-remote` is pinned to the version validated against these endpoints;
   `snyk`/`shadcn` intentionally track latest.)

4. **Fully restart the IDE/terminal** (see "Why a restart is required" below —
   this step is not optional).
5. Run the generator once (also re-run any time `sources.json` changes):
    ```bash
    bun run mcp:generate
    ```
   Then verify the machine with `bun run mcp:doctor` — it checks binaries,
   env vars, file sync, and the payload CMS port, and exits non-zero on any
   failure. Every collaborator should see all PASS (except the port WARN when
   the CMS isn't running) before expecting identical behavior.
   The file check compares parsed JSON/TOML against the generator's output,
   including commands, arguments, URLs, and environment references. It ignores
   timestamps, formatting, and JSON key order, so a normal clone or pull cannot
   falsely report stale files based on modification times. Kiro's local absolute
   repository path still requires regeneration on a different checkout.
6. Reconnect/reauthenticate each MCP server inside your tool. Setting the env
   var makes the *credential* available; it does not itself open a live
   connection, and OAuth-based servers (Cloudflare, Sentry, Mintlify) need an
   interactive sign-in regardless of env vars.

## Why a restart is required

The tracked `.claude/settings.json` approves the 16 project servers listed in
`.mcp.json`. Each collaborator still installs the launchers, sets their own
credentials, and completes OAuth. Personal command permissions remain in ignored
`.claude/settings.local.json`. Claude arguments reference `_RGSS` variables
directly because expansion happens before the server receives its `env` mapping.

An environment variable set via `SetEnvironmentVariable(..., 'User')` (or
`export` in a shell profile) only becomes visible to processes launched
**after** it's set. An IDE that's already running was launched before the
variable existed, and neither Windows nor macOS/Linux retroactively injects
new env vars into a running process tree. Close the IDE completely (not just
the window — the process) and reopen it.

## Architecture

```
scripts/mcp/sources.json      ← single source of truth. Edit ONLY this file.
scripts/mcp/generate.ts       ← reads sources.json, writes all 6 native configs
        │
        ├──▶ .kiro/settings/mcp.json   (Kiro)
        ├──▶ .mcp.json                 (Claude Code, project scope)
        ├──▶ .codex/config.toml        (Codex project reference)
        ├──▶ .vscode/mcp.json          (VS Code workspace)
        ├──▶ .cursor/mcp.json          (Cursor)
        └──▶ opencode.json             (OpenCode — mcp key only; other
                                         top-level keys are preserved)
```

**Never hand-edit the six generated files.** They're overwritten wholesale
on every `mcp:generate` run (OpenCode's file is the one exception — only its
`mcp` key is replaced, since that file also carries general OpenCode config
like `model`/`provider`).

To add, remove, or change a server: edit `scripts/mcp/sources.json`, then run
`bun run mcp:generate`, then commit both the source file and the six
regenerated outputs together.

## Per-tool schema differences

This is *why* a generator exists instead of one shared file — the formats are
genuinely incompatible, not just cosmetically different:

| Tool | Root key | Local server env var syntax | Remote server shape | Config file(s) |
|---|---|---|---|---|
| **Kiro** | `mcpServers` | `${VAR}` | bare `"url"`, no `type` field | `.kiro/settings/mcp.json` |
| **Claude Code** | `mcpServers` | `${VAR}` or `${VAR:-default}` | `"url"` **plus required** `"type": "http"` | `.mcp.json` (project, committed) or `~/.claude.json` (user/local) |
| **Codex** | `mcp_servers` TOML tables | `env_vars` forwards local variables; `bearer_token_env_var` supplies HTTP bearer auth | TOML table with `url` | `.codex/config.toml` (project scope; loaded for trusted projects) |
| **VS Code** | `servers` | `${env:VAR}` | `"url"` plus required `"type": "http"` | `.vscode/mcp.json` (workspace) |
| **Cursor** | `mcpServers` | `${env:VAR}` (Cursor does **not** expand bare `${VAR}`) | bare `"url"`, no `type` documented | `.cursor/mcp.json` |
| **OpenCode** | `mcp` (nested inside general config) | `{env:VAR}` (no leading `$`) | `{"type": "remote", "url": ...}` | `opencode.json` (project) or `~/.config/opencode/opencode.json` (global) |

Other differences the generator absorbs:

- **Command shape.** Every tool except OpenCode splits `command` (executable)
  from `args` (array). OpenCode wants one combined array:
  `"command": ["mcp-remote", "https://..."]`.
- **Workspace-root substitution.** Where a server needs an absolute repo
  path (`code-review-graph`), the generator uses each tool's own portable
  variable where one exists (`${workspaceFolder}` for VS Code/Cursor,
  `${CLAUDE_PROJECT_DIR:-.}` for Claude Code), a portable relative `"."` plus
  `cwd` for Codex/OpenCode, and falls back to this machine's resolved absolute
  path only for Kiro, which does not document a portable project-root variable
  inside `command`/`args`.
- **Pre-approval.** Only Kiro's schema has an in-file `autoApprove` /
  `disabled` concept. The other five tools gate first-use approval through
  their own UI or CLI (Claude Code's per-project approval prompt, VS Code's
  trust dialog, etc.) — there's nothing to generate for them.

## Security model

- `scripts/mcp/sources.json` and all six generated files are **safe to
  commit** — every credential is a `${VAR_RGSS}`-style reference, never a
  literal value.
- `.kiro/settings/` was previously listed in `.gitignore` (because the old,
  hand-written `mcp.json` had four raw tokens inline). It's been removed from
  `.gitignore` now that generation guarantees the file is secret-free.
- The `_RGSS` suffix on every variable name is a collision guard — so
  `GITHUB_PAT_RGSS` can't be shadowed by, or shadow, an unrelated
  `GITHUB_PAT` another tool or project sets on the same machine.
- OAuth-based remote servers (`cloudflare-*`, `sentry`, `mintlify-*`, `socket-mcp`) carry no
  credential in config at all — `mcp-remote` handles the browser-based OAuth
  dance and caches the resulting token itself, outside this repo entirely.

## Credential reference

| Env var | Server | Scope needed | Where to generate |
|---|---|---|---|
| `NEON_API_KEY_RGSS` | `neon` | Neon Management API key (account-level). OpenCode sends it as an `Authorization: Bearer` header to the remote `https://mcp.neon.tech/mcp`; Kiro/Claude/VS Code/Cursor carry no headers on remotes, so they authenticate to the same URL via OAuth in their UI | console.neon.tech → Account Settings → API Keys |
| `GITHUB_PAT_RGSS` | `github` | Fine-grained PAT scoped to `theroyalglow-webapp` (or the org) — repo contents read, PRs read/write | github.com/settings/personal-access-tokens |
| `POSTHOG_AUTH_HEADER_RGSS` | `posthog` | Personal API key, project-scoped | eu.posthog.com project → Settings → Personal API Keys |
| `PAYLOAD_MCP_API_KEY_RGSS` | `payload` | Local-dev-only key for the Payload CMS instance at `localhost:3002` | apps/cms — generated per local Payload user |
| `CLOUDFLARE_API_TOKEN_RGSS` | `cloudflare-api` | Cloudflare API token sent as `Authorization: Bearer` (server-side api-token-mode, bypasses the OAuth scope flow `mcp-remote` otherwise stalls in) | dash.cloudflare.com → My Profile → API Tokens. Scope to what you use (Workers/R2/DNS) plus **User → Memberships : Read** so the server can auto-detect your account ID (the README's "Account Resources : Read" label has no matching dashboard entry — Memberships Read is the functional equivalent); leave **Client IP Address Filtering OFF** |

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
   For a `"transport": "remote"` server that authenticates via HTTP header
   (currently only `neon`), add `"header": "Authorization"` to the entry
   instead: OpenCode emits `"headers": { "Authorization": "Bearer {env:...}" }`
   (per the official docs) but still completes `opencode mcp auth <name>` via
   OAuth — static headers alone do not connect these endpoints from OpenCode —
   while the other four tools (whose remote schemas carry no headers) fall back
   to OAuth in their own UI.
   A server may also set `"openCodeTransport": "remote"` to override its
   transport for OpenCode only (currently `github`): use this when OpenCode's
   native remote + headers succeeds but the shared local `mcp-remote` wrapper
   hijacks the session into an uncompletable headless OAuth flow. The other
   four tools keep using the shared `transport` untouched.
3. Run `bun run mcp:generate`.
4. Add the new `_RGSS` variable to `.env.example` (documentation only — this
   repo's `.env.example` is not consumed at runtime by any app, it's the
   shared reference template) and to the credential table above.
5. Commit `sources.json` + all six regenerated files together.

## Related

- [environment-variables.md](./environment-variables.md) — application
  runtime environment variables (unrelated to MCP tooling credentials)
- `.env.example` — documents the five `_RGSS` variables alongside app secrets
