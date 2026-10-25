# MCP Setup — Cross-IDE Configuration

## Why this exists

RGSS uses 13 MCP servers (Neon, GitHub, Cloudflare, Sentry, PostHog, Payload,
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
    npm i -g mcp-remote@0.15.2 shadcn snyk
    ```
   (`mcp-remote` is pinned to 0.15.2, validated on 25/10/2026: all six
   servers that use it completed `initialize` and `tools/list` with the
   same tool counts as 0.8.3. `snyk`/`shadcn` intentionally track latest.
   OpenCode no longer spawns `mcp-remote` — it connects to every HTTP server
   natively under `mcp.servers` — but the other five tools still use it for
   `cloudflare-api`, `cloudflare-docs`, `github`, `posthog`, `sentry`, and
   `payload`. Upgrading from 0.8.3 keeps the cached `sentry` OAuth token in
   `~/.mcp-auth/`; run `bun run mcp:doctor` afterwards to confirm the
   install.)

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
   connection, and OAuth-based servers (Sentry, Mintlify admin, Socket) need an
   interactive sign-in regardless of env vars. Cloudflare, Neon, GitHub,
   PostHog, and Payload authenticate with the static credentials above, and
   Cloudflare docs plus Mintlify search are public.

## Why a restart is required

The tracked `.claude/settings.json` approves the 13 project servers listed in
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
        └──▶ opencode.json             (OpenCode V2 — mcp.servers and
                                         mcp.timeout; other top-level keys
                                         are preserved)
```

**Never hand-edit the six generated files.** They're overwritten wholesale
on every `mcp:generate` run (OpenCode's file is the one exception — only its
`mcp` key is replaced, since that file also carries general OpenCode config
like `model`/`provider`/custom `experimental` settings).

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
| **OpenCode** | `mcp.servers` (nested inside general config) | `{env:VAR}` (no leading `$`) | `{"type": "remote", "url": ...}`, plus `headers`/`oauth: false` for static credentials | `opencode.json` (project) or `~/.config/opencode/opencode.json` (global) |

Other differences the generator absorbs:

- **Command shape.** Every tool except OpenCode splits `command` (executable)
  from `args` (array). OpenCode wants one combined array:
  `"command": ["mcp-remote", "https://..."]`.
- **OpenCode V2 shape.** Servers live under `mcp.servers`, not directly under
  `mcp`. Global timeouts use `mcp.timeout` objects (`startup`, `catalog`,
  `execution`); the generator sets `startup` to 60s because concurrent cold
  starts exceed the 30s default. V2 uses `disabled: true` instead of
  `enabled`, so connected servers carry neither field.
- **OpenCode native HTTP.** OpenCode connects to every HTTP server directly
  and never spawns `mcp-remote`. Servers that are already
  `"transport": "remote"` for all six tools (`neon`, `socket-mcp`,
  `mintlify-admin`, `mintlify-search`) need no override. Servers the other
  five tools reach through the local `mcp-remote` wrapper (`cloudflare-api`,
  `cloudflare-docs`, `github`, `posthog`, `sentry`, `payload`) set
  `openCodeTransport: "remote"` plus a `url`, so only OpenCode bypasses the
  wrapper. Endpoints that use a static credential also set
  `openCodeOAuth: false`, which emits `oauth: false` plus a Bearer `headers`
  entry; OAuth endpoints (`sentry`, `mintlify-admin`, `socket-mcp`) omit it.
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
- OAuth-based remote servers (`sentry`, `mintlify-admin`, `socket-mcp`) carry
  no credential in config at all, and tokens are always stored outside the
  repo. OpenCode performs the browser OAuth flow itself for all three. In the
  other five tools, `mintlify-admin` and `socket-mcp` are plain remote URLs,
  so each tool runs its own OAuth sign-in; only `sentry` goes through
  `mcp-remote`, which caches its token in `~/.mcp-auth/`.
- `cloudflare-docs` and `mintlify-search` are public endpoints and need no
  credential. `cloudflare-api`, `neon`, `github`, `posthog`, and `payload` use
  static Bearer headers in OpenCode with `oauth: false`, so a missing or
  expired API key fails clearly instead of silently starting an OAuth flow.

## Credential reference

| Env var | Server | Scope needed | Where to generate |
|---|---|---|---|
| `NEON_API_KEY_RGSS` | `neon` | Neon Management API key (account-level). OpenCode sends it as an `Authorization: Bearer` header to the remote `https://mcp.neon.tech/mcp`; Kiro/Claude/VS Code/Cursor carry no headers on remotes, so they authenticate to the same URL via OAuth in their UI | console.neon.tech → Account Settings → API Keys |
| `GITHUB_PAT_RGSS` | `github` | Fine-grained PAT scoped to `theroyalglow-webapp` (or the org) — repo contents read, PRs read/write | github.com/settings/personal-access-tokens |
| `POSTHOG_AUTH_HEADER_RGSS` | `posthog` | Personal API key, project-scoped | eu.posthog.com project → Settings → Personal API Keys |
| `PAYLOAD_MCP_API_KEY_RGSS` | `payload` | Local-dev-only key for the Payload CMS instance at `localhost:3002`. Start the CMS (`bun run --filter=@rgss/cms dev`) before connecting. OpenCode's background service keeps a failed connection from when the CMS was down; reconnect `payload` in `/mcps` after starting it. | apps/cms — generated per local Payload user |
| `CLOUDFLARE_API_TOKEN_RGSS` | `cloudflare-api` | Cloudflare API token sent as `Authorization: Bearer` to the unified `https://mcp.cloudflare.com/mcp` (server-side api-token-mode, bypasses the OAuth scope flow `mcp-remote` otherwise stalls in). This one server now covers the former bindings, builds, and observability servers. | dash.cloudflare.com → My Profile → API Tokens. Scope to what you use (Workers/R2/DNS) plus **User → Memberships : Read** so the server can auto-detect your account ID (the README's "Account Resources : Read" label has no matching dashboard entry — Memberships Read is the functional equivalent); leave **Client IP Address Filtering OFF** |

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

   For an HTTP server that authenticates with a static Bearer token:
   - Add `"header": "Authorization"` to the env entry. OpenCode then emits
     `"headers": { "Authorization": "Bearer {env:...}" }`.
   - Add `"openCodeOAuth": false` to the server. OpenCode emits
     `"oauth": false` and uses the header directly; without it OpenCode
     attempts OAuth discovery instead of relying on the static credential.
   - If the other five tools would lose that credential from a bare URL, keep
     `"transport": "local"` with `mcp-remote` and add
     `"openCodeTransport": "remote"` plus `"url"` so only OpenCode connects
     directly. `cloudflare-api`, `github`, `posthog`, and `payload` follow
     this pattern.

   For an OAuth HTTP server (`sentry`, `mintlify-admin`, `socket-mcp`), use
   `"transport": "remote"` or the same `openCodeTransport` override and omit
   both `header` and `openCodeOAuth`. Users complete sign-in through `/mcps`
   or `opencode mcp auth <name>`.

   For a public HTTP server (`cloudflare-docs`, `mintlify-search`), set the
   remote URL with no credential fields.
3. Run `bun run mcp:generate`.
4. Add the new `_RGSS` variable to `.env.example` (documentation only — this
   repo's `.env.example` is not consumed at runtime by any app, it's the
   shared reference template) and to the credential table above.
5. Commit `sources.json` + all six regenerated files together.

## Related

- [environment-variables.md](./environment-variables.md) — application
  runtime environment variables (unrelated to MCP tooling credentials)
- `.env.example` — documents the five `_RGSS` variables alongside app secrets
