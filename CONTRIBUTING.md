# Contributing to Royal Glow Salon & Spa

Thanks for your interest in the **theroyalglow-webapp** codebase. This document
covers how we work — branching, commits, code review, and how to get a
pull request merged.

For questions that aren't about code, see [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
and [`SECURITY.md`](./SECURITY.md).

## Project at a glance

- **Runtime / package manager:** Bun (`1.4.0`; pinned via `packageManager` in
  `package.json`). Do not introduce pnpm / npm / yarn assumptions.
- **Language:** TypeScript + JavaScript.
- **Framework:** Next.js 16.2.9 (App Router) for web and admin; Payload CMS
  v3 for content; SST v4 for AWS Lambda + CloudFront deployment.
- **CI:** GitHub Actions — every push runs `ci.yml` (lint, typecheck, unit
  tests, dependency-audit, design gates). PRs run the same suite plus
  `integration.yml` on demand.
- **Branches:** `dev` → `test` → `pprd` → `prod`. The branch protection on
  `dev` is the soft review gate; `prod` is the release branch.

## Local setup

Prerequisites:

- **Bun 1.4.0+** (`bun --version` should match `packageManager`).
- **PostgreSQL client** (for running migrations locally against Neon).
- **`@neondatabase/mcp-server-neon`** or a `DATABASE_URL` from your Neon
  dashboard (the MCP entry is wired in `.mcp.json` for Claude Code and
  Cursor).
- Optional but recommended: the **Kiro** or **Claude Code** MCP client so the
  Neon / Snyk / Sentry / PostHog MCP servers in `.mcp.json` are available.

First run:

```bash
git clone https://github.com/royalglowsalonspa/theroyalglow-webapp.git
cd theroyalglow-webapp
bun install
cp .env.example .env.local   # then fill in the four _RGSS credentials
bun run dev                  # spins up web (3000) + admin (3001) + cms (3002)
```

Required environment variables (referenced in `.env.example`):

| Variable | Used by |
|----------|---------|
| `NEON_API_KEY_RGSS` | `neon` MCP server |
| `GITHUB_PAT_RGSS` | `github` MCP server |
| `POSTHOG_AUTH_HEADER_RGSS` | `posthog` MCP server |
| `PAYLOAD_MCP_API_KEY_RGSS` | `payload` MCP server |

Other env vars (per-app secrets, OAuth credentials, etc.) live in
`.env.example` per workspace — see that file for the full list.

## Workflow

1. **Branch from `dev`.** Use one of these prefixes:
   - `feat/<short-kebab>` — new feature
   - `fix/<short-kebab>` — bug fix
   - `chore/<short-kebab>` — tooling, deps, docs, no production change
   - `docs/<short-kebab>` — docs-only change
2. **Keep branches short-lived.** Aim to land a PR within a day or two. If a
   branch diverges from `dev`, rebase it; do not merge `dev` into your
   feature branch unless you have a specific reason.
3. **Open a PR against `dev` as soon as you push.** A draft PR is fine for
   WIP — early review beats late surprises.
4. **Pass CI before requesting review.** The `ci.yml` workflow is the gate;
   if it's red, the PR is not ready. Watch the `dependency-audit` job
   particularly — it fails on any severity, not just high.
5. **Get one approving review** from a code owner, then squash-merge. Use
   the GitHub UI's "Squash and merge" so each PR becomes one commit on
   `dev`. Don't use the "Rebase and merge" or "Create a merge commit"
   buttons.
6. **Promote to `test` / `pprd` / `prod` after the PR is merged.** This is
   done by the maintainer in a separate operation; you don't push directly
   to those branches.

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/). Format:

```
<type>(<scope>): <subject>

<body — explain the why, not the what>

<footer — references, breaking-change markers, Co-authored-by>
```

Common types:

- `feat` — new user-facing capability
- `fix` — bug fix
- `chore` — tooling, deps, internal refactors with no user-facing change
- `docs` — docs only
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or fixing tests
- `perf` — performance improvement

Subject line rules:

- **Imperative mood** ("add", not "added" or "adds").
- **Lowercase** after the type/scope.
- **No trailing period.**
- **50 characters or fewer** if possible; 72 hard cap.

## Code style

- **Formatting:** [Biome](https://biomejs.dev/) handles both formatting and
  lint. The pre-commit hook (`lint-staged` → `biome check --write`) runs on
  staged files; you can also run `bun run lint` across the whole repo.
- **TypeScript:** `strict: true` in every workspace. Avoid `any`; prefer
  `unknown` + narrowing. ESLint rules are in `biome.json`.
- **Tailwind:** v4, CSS-first config. Don't reintroduce `tailwind.config.js`
  unless you have a real reason — most config now lives in `app/global.css`.
- **Imports:** use the path aliases defined in each workspace's `tsconfig.json`
  (`@/components`, `@rgss/ui`, etc.). No relative `../../..` chains across
  workspace boundaries.
- **Comments:** explain *why*, not *what*. If the code is so clever it needs
  a comment, prefer simpler code.

## Testing

- **Unit tests:** Vitest, `bun run test` (excludes integration and e2e).
- **Integration tests:** `bun run test:integration` — requires a live Neon
  branch.
- **E2E tests:** Playwright, `bun run test:e2e` per workspace.
- **Load tests:** k6, `bun run test:load` — run before bumping infra
  capacity claims.
- **Coverage:** `bun run test:coverage` — keep coverage on changed files at
  or above the prior level.

When you fix a bug, write a test that fails on `main` and passes with your
fix. When you add a feature, write a test that exercises the new behavior.

## Pull request checklist

- [ ] PR targets `dev` (or a feature branch off `dev`)
- [ ] Title follows Conventional Commits (`feat(scope): subject`)
- [ ] Body explains *why* this change is needed, not just *what* it does
- [ ] All checks in `ci.yml` are green
- [ ] Added or updated tests cover the change
- [ ] No new `console.log` / `debugger` / commented-out code
- [ ] No unrelated formatting churn (run `biome check` separately and only
      stage the relevant lines)
- [ ] If the change touches a workspace's API surface, the
      `knowledge-base/` entry for that workspace is updated

## Security

**Do not** file public GitHub issues for security vulnerabilities. See
[`SECURITY.md`](./SECURITY.md) for the private disclosure process.

## License

By contributing, you agree that your contributions will be licensed under
the project's [MIT License](./LICENSE).
