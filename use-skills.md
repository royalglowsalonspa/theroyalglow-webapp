# Skills & npx Commands — Royal Glow Salon & Spa

> Essential tools, CLI skills, and npx commands for efficient development.
> Curated for this stack: Next.js 16 + Bun + Turborepo + Drizzle + Cloudflare + shadcn/ui.

---

## Table of Contents

0. [Agent Skill Installer (npx skills)](#0-agent-skill-installer-install-skills-from-github)
1. [Project Scaffolding & Init](#1-project-scaffolding--init)
2. [UI Components & Design](#2-ui-components--design)
3. [Database & ORM](#3-database--orm)
4. [Authentication](#4-authentication)
5. [Deployment & Infrastructure](#5-deployment--infrastructure)
6. [Testing & Quality](#6-testing--quality)
7. [Code Quality & Formatting](#7-code-quality--formatting)
8. [Observability & Monitoring](#8-observability--monitoring)
9. [Email & Notifications](#9-email--notifications)
10. [Documentation](#10-documentation)
11. [Security Scanning](#11-security-scanning)
12. [Monorepo & Build](#12-monorepo--build)
13. [Performance & Optimization](#13-performance--optimization)
14. [Developer Productivity (AI Agent Skills)](#14-developer-productivity-ai-agent-skills)
15. [Environment & Validation](#15-environment--validation)
16. [Git & Version Control](#16-git--version-control)

---

## 0. Agent Skill Installer (Install Skills from GitHub)

> **`npx skills`** is the open ecosystem package manager for AI agent skills. Works with Kiro, Claude Code, Cursor, Copilot, Codex, and 18+ other agents.

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Install skill from GitHub** | Add any skill from a public GitHub repo to your project | `npx skills add <owner/repo>` |
| **Install specific skill** | Install one named skill from a multi-skill repo | `npx skills add <owner/repo> <skill-name>` |
| **List installed skills** | See all skills currently installed in the project | `npx skills list` |
| **Remove a skill** | Uninstall a previously added skill | `npx skills remove <skill-name>` |
| **Refero Design Skill** | Research-first design methodology — typography, color, spacing, motion, icons, copywriting, a11y | `npx skills add https://github.com/referodesign/refero_skill` |
| **Vercel Agent Skills** | Official Next.js, React, Tailwind, deployment skills | `npx skills add vercel-labs/agent-skills` |
| **Anthropic Skills** | Official Anthropic agent skills (skill-creator, pptx, etc.) | `npx skills add anthropics/skills` |
| **Anthony Fu Skills** | Curated skills from Anthony Fu (3.1k ⭐) — TypeScript, tooling | `npx skills add antfu/skills` |

---

## 1. Project Scaffolding & Init

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Create Next.js App** | Bootstrap a new Next.js 16 application with App Router, TypeScript, Tailwind | `npx create-next-app@latest` |
| **Create Turborepo** | Scaffold a new Turborepo monorepo from official templates | `npx create-turbo@latest` |
| **Turborepo Migrate** | Auto-upgrade Turborepo version with codemods applied | `npx @turbo/codemod migrate` |
| **Create T3 App** | Full-stack Next.js scaffolding with type safety (good reference) | `npx create-t3-app@latest` |
| **Next.js Codemods** | Automated upgrade transforms (e.g., Next.js 15 → 16 migration) | `npx @next/codemod@latest` |
| **Codemod AI** | AI-powered deterministic code migrations (framework upgrades) | `npx codemod <codemod-name>` |

---

## 2. UI Components & Design

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **shadcn/ui Init** | Initialize shadcn/ui in the project (Tailwind v4, Radix primitives) | `npx shadcn@latest init` |
| **shadcn/ui Add Component** | Add a specific component (e.g., button, dialog, data-table) | `npx shadcn@latest add <component>` |
| **shadcn/ui Add All** | Add all available components at once | `npx shadcn@latest add --all` |
| **shadcn/ui Diff** | Show what changed since component was added (check for updates) | `npx shadcn@latest diff` |
| **Refero Design Skill** | Research-first premium UI — teaches agents to research references, synthesize direction, and implement with craft rules for typography, color, spacing, motion, icons, copy, a11y | `npx skills add https://github.com/referodesign/refero_skill` |
| **Tailwind CSS v4 (PostCSS)** | CSS-first config — no `tailwind.config.js` needed in v4 | `bun add tailwindcss @tailwindcss/postcss postcss` |

---

## 3. Database & ORM

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Drizzle Kit Generate** | Generate SQL migration files from schema changes | `npx drizzle-kit generate` |
| **Drizzle Kit Migrate** | Apply pending migrations to the database | `npx drizzle-kit migrate` |
| **Drizzle Kit Push** | Push schema directly to DB (dev mode, no migration files) | `npx drizzle-kit push` |
| **Drizzle Kit Pull** | Introspect existing DB and generate Drizzle schema | `npx drizzle-kit pull` |
| **Drizzle Kit Studio** | Open Drizzle Studio — visual DB browser (like pgAdmin) | `npx drizzle-kit studio` |
| **Drizzle Kit Check** | Verify migration consistency and detect drift | `npx drizzle-kit check` |
| **Drizzle Kit Drop** | Drop a specific migration file | `npx drizzle-kit drop` |

---

## 4. Authentication

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Better Auth Init** | Scaffold a complete Better Auth setup (config, DB adapter, framework integration) | `npx @better-auth/cli init` |
| **Better Auth Generate** | Generate DB schema for Better Auth (Drizzle/Prisma/SQL) | `npx @better-auth/cli generate` |
| **Better Auth Migrate** | Apply Better Auth migrations to the database | `npx @better-auth/cli migrate` |
| **Better Auth Skill** | Official best-practices skill for AI agents implementing Better Auth | `npx skills add better-auth/skills` |

---

## 5. Deployment & Infrastructure

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Wrangler Login** | Authenticate with Cloudflare for Workers/KV/R2 deployments | `npx wrangler login` |
| **Wrangler Dev** | Run Cloudflare Worker locally for development | `npx wrangler dev` |
| **Wrangler Deploy** | Deploy Worker/Pages application to Cloudflare | `npx wrangler deploy` |
| **Wrangler Whoami** | Verify Cloudflare authentication status | `npx wrangler whoami` |
| **Wrangler KV** | Manage Cloudflare KV namespaces (create, list, put, get) | `npx wrangler kv namespace create <name>` |
| **Wrangler R2** | Manage Cloudflare R2 buckets | `npx wrangler r2 bucket create <name>` |
| **Wrangler Secret** | Set secrets for Workers (env vars) | `npx wrangler secret put <KEY>` |
| **OpenNext Cloudflare Build** | Build Next.js app for Cloudflare Workers via OpenNext adapter | `npx opennextjs-cloudflare build` |
| **OpenNext Cloudflare Dev** | Local dev with Cloudflare bindings (Miniflare) | `npx opennextjs-cloudflare dev` |
| **OpenNext Cloudflare Deploy** | Deploy Next.js to Cloudflare Workers | `npx opennextjs-cloudflare deploy` |

---

## 6. Testing & Quality

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Vitest Run** | Run all unit/integration tests (single execution, no watch) | `npx vitest --run` |
| **Vitest Coverage** | Run tests with coverage report | `npx vitest --run --coverage` |
| **Vitest UI** | Open Vitest interactive UI dashboard | `npx vitest --ui` |
| **Playwright Install** | Install Playwright browsers (Chromium, Firefox, WebKit) | `npx playwright install` |
| **Playwright Test** | Run all Playwright E2E tests | `npx playwright test` |
| **Playwright Codegen** | Record browser actions and generate test code | `npx playwright codegen <url>` |
| **Playwright Show Report** | Open Playwright HTML test report | `npx playwright show-report` |
| **MSW Init** | Initialize Mock Service Worker in public directory | `npx msw init ./public --save` |
| **Stryker Init** | Set up mutation testing configuration | `npm init stryker@latest` |
| **Stryker Run** | Execute mutation tests | `npx stryker run` |
| **Checkly Init** | Initialize Checkly synthetic monitoring project | `npx checkly init` |
| **Checkly Test** | Dry-run checks on Checkly cloud before deploy | `npx checkly test` |
| **Checkly Deploy** | Deploy monitoring checks to production | `npx checkly deploy` |
| **Lighthouse CI** | Run Lighthouse audits in CI (performance gate) | `npx lhci autorun` |
| **Lighthouse CLI** | Run a one-off Lighthouse audit locally | `npx lighthouse <url> --output html` |

---

## 7. Code Quality & Formatting

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Biome Init** | Initialize Biome config (replaces ESLint + Prettier) | `npx @biomejs/biome init` |
| **Biome Check** | Lint + format check all files | `npx @biomejs/biome check .` |
| **Biome Check (Apply)** | Lint + format + auto-fix all files | `npx @biomejs/biome check --write .` |
| **Biome Format** | Format files only | `npx @biomejs/biome format --write .` |
| **Biome Lint** | Lint files only | `npx @biomejs/biome lint .` |
| **Husky Init** | Set up Git hooks (pre-commit, pre-push) | `npx husky init` |
| **lint-staged** | Run linters on staged files only (used inside Husky hooks) | `npx lint-staged` |
| **TypeScript Check** | Run TypeScript compiler check (no emit) | `npx tsc --noEmit` |
| **Knip** | Find unused files, dependencies, and exports in the project | `npx knip` |

---

## 8. Observability & Monitoring

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Sentry Wizard** | Auto-configure Sentry for Next.js (error monitoring) | `npx @sentry/wizard@latest -i nextjs` |
| **Sentry Sourcemaps** | Upload sourcemaps to Sentry for production debugging | `npx @sentry/cli sourcemaps upload ./out` |
| **PostHog (via package)** | Product analytics — installed as npm dep, no npx needed | `bun add posthog-js posthog-node` |
| **OpenTelemetry** | Distributed tracing setup (installed as dep) | `bun add @opentelemetry/sdk-node` |
| **BetterStack CLI** | Manage uptime monitors and status page | (via BetterStack dashboard or Terraform) |

---

## 9. Email & Notifications

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **React Email Dev** | Start local dev server to preview email templates | `npx react-email dev` |
| **React Email Build** | Build production email templates | `npx react-email build` |
| **React Email Export** | Export templates to HTML for testing | `npx react-email export` |
| **Web Push Generate VAPID** | Generate VAPID keys for Web Push notifications | `npx web-push generate-vapid-keys` |

---

## 10. Documentation

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Fumadocs Init** | Create a new Fumadocs documentation site | `npx create-fumadocs-app` |
| **Fumadocs OpenAPI** | Generate API reference docs from OpenAPI spec | (configured in fumadocs, runs at build time) |
| **TypeDoc** | Generate TypeScript API docs from source code | `npx typedoc --entryPoints src/index.ts` |

---

## 11. Security Scanning

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Trivy** | Scan for vulnerabilities in dependencies (CVE) | `trivy fs --scanners vuln .` |
| **Semgrep** | Static analysis / SAST (code pattern detection) | `semgrep scan --config auto` |
| **Socket.dev** | Supply chain attack detection (used via GitHub App or CLI) | `npx socket scan` |
| **npm Audit** | Quick dependency vulnerability check | `bun audit` or `npm audit` |
| **Is Website Vulnerable** | Quick check if a deployed site has known JS vuln | `npx is-website-vulnerable <url>` |
| **better-npm-audit** | Enhanced npm audit with config file support (severity filter) | `npx better-npm-audit audit` |
| **lockfile-lint** | Validate lockfile against security policies (no http, trusted hosts) | `npx lockfile-lint --path bun.lockb --type bun` |

---

## 12. Monorepo & Build

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Turbo Run Build** | Build all packages/apps with caching | `npx turbo run build` |
| **Turbo Run Dev** | Start all dev servers in parallel | `npx turbo run dev` |
| **Turbo Run Lint** | Lint all packages with task orchestration | `npx turbo run lint` |
| **Turbo Run Test** | Run tests across all packages | `npx turbo run test` |
| **Turbo Run (Filtered)** | Run tasks for a specific app only | `npx turbo run build --filter=web` |
| **Turbo Run (Affected)** | Run only on packages affected by current changes | `npx turbo run build lint test --affected` |
| **Turbo Prune** | Create a sparse monorepo checkout for Docker builds | `npx turbo prune --scope=web` |
| **Turbo Daemon** | Manage the Turbo daemon (faster incremental builds) | `npx turbo daemon status` |

---

## 13. Performance & Optimization

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Bundle Analyzer** | Visualize Next.js bundle size (find bloat) | `ANALYZE=true npx turbo run build --filter=web` |
| **next-bundle-analyzer** | (Config in next.config.ts, activated with ANALYZE env var) | See `@next/bundle-analyzer` docs |
| **Speed Insights** | Measure Core Web Vitals locally | `npx lighthouse <url> --only-categories=performance` |
| **Unlighthouse** | Audit entire site (all pages) with Lighthouse | `npx unlighthouse --site https://theroyalglow.in` |
| **Why Did You Render** | Debug unnecessary React re-renders (dev only) | `bun add @welldone-software/why-did-you-render` |
| **Depcheck** | Find unused dependencies in package.json | `npx depcheck` |
| **Size Limit** | Performance budget for JS — fail CI if bundle exceeds threshold | `npx size-limit` |
| **Bundlephobia (web)** | Check package size before installing | `npx bundle-phobia <package-name>` |

---

## 14. Developer Productivity (AI Agent Skills)

### Install Skills via `npx skills` (Vercel Skills CLI)

The **`npx skills`** CLI is the npm-for-skills ecosystem. One command installs any skill from GitHub into your project for Kiro, Claude Code, Cursor, Codex, Copilot, and 18+ other agents.

```bash
# Install Refero Design skill (premium UI methodology)
npx skills add https://github.com/referodesign/refero_skill

# Install Vercel's official agent skills (Next.js, React, Tailwind, deployment)
npx skills add vercel-labs/agent-skills

# Install Anthropic's official skills
npx skills add anthropics/skills

# Install Anthony Fu's curated skills (3.1k ⭐)
npx skills add antfu/skills

# Install Better Auth best-practices skill
npx skills add better-auth/skills

# Install Jezweb skills (Cloudflare, React, Tailwind v4)
npx skills add jezweb/claude-skills

# Install secondsky production-ready skills
npx skills add secondsky/claude-skills

# List what's installed
npx skills list
```

### Kiro Skills (`.kiro/skills/`)

Skills are Markdown files in `.kiro/skills/` that Kiro auto-activates based on context or can be invoked via `/skill-name`.

| Skill Name | Use Case | How to Use |
|-----------|----------|------------|
| **nextjs-app-router** | Follow Next.js 16 App Router patterns, server components, metadata API, `use cache` | Create `.kiro/skills/nextjs-app-router.md` |
| **drizzle-orm** | Use Drizzle ORM patterns correctly — schemas, queries, migrations | Create `.kiro/skills/drizzle-orm.md` |
| **shadcn-ui** | Generate shadcn/ui components with correct imports and Tailwind v4 | Create `.kiro/skills/shadcn-ui.md` |
| **tailwind-v4** | Write Tailwind CSS v4 classes (CSS-first config, no JS config file) | Create `.kiro/skills/tailwind-v4.md` |
| **better-auth** | Implement Better Auth patterns — Google OAuth, RBAC, sessions | Create `.kiro/skills/better-auth.md` |
| **cloudflare-workers** | Write code compatible with Cloudflare Workers V8 isolate | Create `.kiro/skills/cloudflare-workers.md` |
| **react-email** | Build React Email templates using correct component patterns | Create `.kiro/skills/react-email.md` |
| **zod-validation** | Create Zod schemas for API input validation | Create `.kiro/skills/zod-validation.md` |
| **playwright-testing** | Write Playwright E2E tests following best practices | Create `.kiro/skills/playwright-testing.md` |
| **motion-animations** | Use motion.dev (formerly Framer Motion) for animations | Create `.kiro/skills/motion-animations.md` |
| **ably-realtime** | Implement Ably channels, events, and presence | Create `.kiro/skills/ably-realtime.md` |
| **meta-pixel-capi** | Integrate Meta Pixel + Conversions API correctly | Create `.kiro/skills/meta-pixel-capi.md` |
| **biome-linting** | Follow Biome lint rules and config patterns | Create `.kiro/skills/biome-linting.md` |
| **turborepo-monorepo** | Manage Turborepo tasks, caching, and filtering | Create `.kiro/skills/turborepo-monorepo.md` |
| **payload-cms** | Work with Payload CMS v3 collections, hooks, and API | Create `.kiro/skills/payload-cms.md` |
| **upstash-redis** | Use Upstash Redis + QStash for caching, rate limiting, and jobs | Create `.kiro/skills/upstash-redis.md` |
| **neon-db** | Neon DB branching, pg_cron, and connection pooling patterns | Create `.kiro/skills/neon-db.md` |
| **fumadocs** | Write and organize documentation with Fumadocs | Create `.kiro/skills/fumadocs.md` |
| **pwa-service-worker** | Build Progressive Web App features — offline, push, install prompt | Create `.kiro/skills/pwa-service-worker.md` |
| **refero-design** | Research-first design — references, typography, color, spacing, motion, icons, copy | `npx skills add https://github.com/referodesign/refero_skill` |
| **web-accessibility** | WCAG 2.1 AA compliance — semantic HTML, ARIA, focus management, contrast | Create `.kiro/skills/web-accessibility.md` |
| **json-ld-seo** | Structured data (LocalBusiness, Service, FAQ, BlogPosting, BreadcrumbList) | Create `.kiro/skills/json-ld-seo.md` |
| **indian-locale** | India-specific patterns — DD/MM/YYYY dates, ₹ currency, GST, DPDP Act | Create `.kiro/skills/indian-locale.md` |
| **error-boundaries** | React error boundaries, API error shapes, graceful degradation | Create `.kiro/skills/error-boundaries.md` |
| **opennext-cloudflare** | Deploy Next.js to Cloudflare Workers with OpenNext adapter | Create `.kiro/skills/opennext-cloudflare.md` |

### Community Agent Skills (from GitHub)

These are popular open-source skill repositories used by proficient developers:

| Repository | Stars | Description | Install |
|-----------|-------|-------------|---------|
| [referodesign/refero_skill](https://github.com/referodesign/refero_skill) | Design-first | Research-first design methodology — typography, color, spacing, motion, icons, copywriting, a11y | `npx skills add https://github.com/referodesign/refero_skill` |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Official | Next.js, React, Tailwind, web design guidelines, deployment | `npx skills add vercel-labs/agent-skills` |
| [anthropics/skills](https://github.com/anthropics/skills) | Official | Anthropic's official agent skills (skill-creator, presentations, etc.) | `npx skills add anthropics/skills` |
| [antfu/skills](https://github.com/antfu/skills) | 3.1k ⭐ | Anthony Fu's curated agent skills — TypeScript, tooling, open-source | `npx skills add antfu/skills` |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-claude-skills) | 700+ skills | Comprehensive agent skills catalog (Claude Code, Kiro, Cursor compatible) | Browse & pick |
| [jasonkneen/kiro](https://github.com/jasonkneen/kiro) | Community | Battle-tested Kiro skills, hooks, and commands | Copy `.kiro/skills/` |
| [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | Curated | Curated list of Claude/agent skills and resources | Browse & pick |
| [YuvalNag/everything-kiro-cli](https://github.com/YuvalNag/everything-kiro-cli) | Hackathon winner | Agents, skills, hooks, commands, rules, MCPs | Copy relevant files |
| [BlakeHastings/kiro-cli-skills](https://github.com/BlakeHastings/kiro-cli-skills) | Skills pack | Implementation of skills specifically for Kiro CLI | Copy `.kiro/skills/` |
| [better-auth/skills](https://playbooks.com/skills/better-auth/skills/best-practices) | Official | Better Auth best-practices skill for AI agents | `npx skills add better-auth/skills` |
| [jezweb/claude-skills](https://github.com/jezweb/claude-skills) | Full-stack | Cloudflare, React, Tailwind v4, AI integrations | `npx skills add jezweb/claude-skills` |
| [secondsky/claude-skills](https://github.com/secondsky/claude-skills) | Production | Production-ready skills for Claude Code CLI | `npx skills add secondsky/claude-skills` |
| [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills) | 67 skills | Design skill files for Claude Design, Google Stitch, Codex, Cursor | Browse & pick |

### Skill Marketplaces & Directories

| Platform | URL | Description |
|----------|-----|-------------|
| **Skills.sh** | [skills.sh](https://skills.sh/) | The Agent Skills Directory — discover, install, share |
| **SkillsMP** | [skillsmp.com](https://skillsmp.com/) | Agent Skills Marketplace — Claude, Codex, ChatGPT |
| **Playbooks** | [playbooks.com](https://playbooks.com/) | Skill browser with search and previews |
| **Antigravity** | [antigravity.codes/agent-skills](https://antigravity.codes/agent-skills/nextjs) | Next.js-specific agent skills |

---

## 15. Environment & Validation

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **T3 Env** | Type-safe environment variable validation with Zod (Next.js) | `bun add @t3-oss/env-nextjs` (configured in `env.ts`) |
| **dotenv-vault** | Encrypt and sync `.env` files across team/environments | `npx dotenv-vault push` |
| **env-cmd** | Run commands with environment variables from a file | `npx env-cmd -f .env.local bun run dev` |
| **Zod** | Schema validation for all API inputs at system boundary | `bun add zod` (core dep, not npx) |

---

## 16. Git & Version Control

| Skill | Use Case | npx Command |
|-------|----------|-------------|
| **Commitlint** | Enforce conventional commit messages | `npx --no -- @commitlint/cli --edit` |
| **Commitizen** | Interactive conventional commit prompt | `npx cz` |
| **Changelog** | Auto-generate CHANGELOG from conventional commits | `npx conventional-changelog -p angular -i CHANGELOG.md -s` |
| **Release It** | Automated versioning and release (bumps, tags, changelog, publish) | `npx release-it` |
| **Git Cliff** | Generate changelog from git history (Rust-fast, highly configurable) | `npx git-cliff -o CHANGELOG.md` |

---

## Quick Reference — Most Used Commands Daily

```bash
# ──────────────────────────────────────────────
# SKILLS (install once)
# ──────────────────────────────────────────────
npx skills add https://github.com/referodesign/refero_skill
npx skills add vercel-labs/agent-skills
npx skills add anthropics/skills
npx skills add antfu/skills

# ──────────────────────────────────────────────
# DEV WORKFLOW
# ──────────────────────────────────────────────
# Start dev (all apps)
npx turbo run dev

# Start dev (web only)
npx turbo run dev --filter=web

# Build
npx turbo run build

# Lint + Format (fix)
npx @biomejs/biome check --write .

# Type check
npx tsc --noEmit

# ──────────────────────────────────────────────
# DATABASE
# ──────────────────────────────────────────────
# Generate migration
npx drizzle-kit generate

# Push schema to dev DB
npx drizzle-kit push

# Open DB studio
npx drizzle-kit studio

# ──────────────────────────────────────────────
# TESTING
# ──────────────────────────────────────────────
# Run tests
npx vitest --run

# Run E2E
npx playwright test

# ──────────────────────────────────────────────
# UI & EMAIL
# ──────────────────────────────────────────────
# Add UI component
npx shadcn@latest add dialog

# Preview emails
npx react-email dev

# ──────────────────────────────────────────────
# DEPLOY & AUDIT
# ──────────────────────────────────────────────
# Deploy to Cloudflare
npx opennextjs-cloudflare deploy

# Lighthouse audit
npx lighthouse https://theroyalglow.in --output html

# Full-site audit (all pages)
npx unlighthouse --site https://theroyalglow.in

# Find dead code / unused deps
npx knip
```

---

## Installation Priority (Do These First)

| Order | What | Command | Why |
|-------|------|---------|-----|
| 0 | Install Refero Design skill | `npx skills add https://github.com/referodesign/refero_skill` | Premium UI from day 1 |
| 0 | Install Vercel agent skills | `npx skills add vercel-labs/agent-skills` | Next.js + React best practices |
| 1 | Create Turborepo monorepo | `npx create-turbo@latest` | Foundation |
| 2 | Init Next.js app inside `apps/web` | `npx create-next-app@latest` | Main app |
| 3 | Init shadcn/ui | `npx shadcn@latest init` | UI system |
| 4 | Init Biome | `npx @biomejs/biome init` | Code quality from day 1 |
| 5 | Init Husky + lint-staged | `npx husky init` | Git hooks |
| 6 | Init Better Auth | `npx @better-auth/cli init` | Auth system |
| 7 | Generate Drizzle schema | `npx drizzle-kit generate` | Database |
| 8 | Init Sentry | `npx @sentry/wizard@latest -i nextjs` | Error tracking |
| 9 | Init Playwright | `npx playwright install` | E2E testing |
| 10 | Init MSW | `npx msw init ./public --save` | API mocking |
| 11 | Init Checkly | `npx checkly init` | Synthetic monitoring |
| 12 | Init Stryker | `npm init stryker@latest` | Mutation testing |
| 13 | Setup Wrangler | `npx wrangler login` | Cloudflare deploy |
| 14 | Create Fumadocs | `npx create-fumadocs-app` | Documentation |
| 15 | Install Anthony Fu skills | `npx skills add antfu/skills` | TypeScript tooling patterns |
| 16 | Install Anthropic skills | `npx skills add anthropics/skills` | Agent skill creation |

---

## Notes

- **Bun over npm/npx:** Where possible, use `bun run` / `bunx` instead of `npx` for faster execution in this project. All commands above work with both.
- **bunx equivalent:** Replace `npx` with `bunx` for Bun-native execution: `bunx shadcn@latest add button`
- **Turborepo caching:** All `turbo run` commands benefit from incremental caching. First run is slow; subsequent runs are near-instant if inputs haven't changed.
- **Skills placement:** Kiro skills go in `.kiro/skills/` at workspace root. Steering rules go in `.kiro/steering/`.
- **Agent compatibility:** Skills work across Kiro, Claude Code, Cursor, and other AI coding agents that support Markdown instruction files.

---

*Last updated: May 2026*
