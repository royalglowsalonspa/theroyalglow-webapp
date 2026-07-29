# Knowledge Base — Index

The single key to all project documentation for **Royal Glow Salon & Spa (RGSS)**.
Every information / planning document lives here. Only `README.md` remains in the repo root.

> Steering files reference these docs via `#[[file:knowledge-base/<name>.md]]`.

## Architecture & Infrastructure

| Document | Description |
|----------|-------------|
| [architecture.md](./architecture.md) | Architecture & infrastructure — routing, hosting, subdomain map |
| [tech-stack.md](./tech-stack.md) | Technology choices with rationale |
| [database.md](./database.md) | Database strategy & selection |
| [database-schema.md](./database-schema.md) | Full schema — all 38 tables, columns, indexes, ERD |
| [data-seeding.md](./data-seeding.md) | Data seeding strategy |
| [error-handling.md](./error-handling.md) | API error handling strategy & error codes |
| [system-design/HLD.md](./system-design/HLD.md) | High-Level Design — architecture overview, tech decisions, data model |
| [system-design/LLD.md](./system-design/LLD.md) | Low-Level Design — detailed SQL, state machines, sequence diagrams |

## Features & Product

| Document | Description |
|----------|-------------|
| [features.md](./features.md) | Features & application scope |
| [features/favourite-services.md](./features/favourite-services.md) | Favourite services — per-feature specification |
| [design.md](./design.md) | Design brief — UI/UX direction |
| [pages/README.md](./pages/README.md) | Pages & routes — complete route/page specification map |
| [sitemap.md](./sitemap.md) | Complete information architecture & site hierarchy |
| [authentication.md](./authentication.md) | Auth design & RBAC |
| [background-jobs.md](./background-jobs.md) | All 19 background jobs — QStash + GitHub Actions |
| [ably-channels.md](./ably-channels.md) | Ably realtime — channel structure |

## Integrations & Marketing

| Document | Description |
|----------|-------------|
| [email-strategy.md](./email-strategy.md) | Email strategy (Resend / Brevo) |
| [meta-pixel.md](./meta-pixel.md) | Meta Pixel + CAPI implementation plan |
| [seo.md](./seo.md) | SEO, local SEO, AI search visibility, agent-friendly standards |
| [PAYLOAD_INTEGRATION_PLAN.md](./PAYLOAD_INTEGRATION_PLAN.md) | Payload CMS → website integration plan (handoff) |
| [payload-mcp.md](./payload-mcp.md) | Payload MCP server — read-only CMS access for AI agents |

## Environment, Build & Ops

| Document | Description |
|----------|-------------|
| [environment-variables.md](./environment-variables.md) | All environment variables reference |
| [ENVIRONMENT_SETUP_GUIDE.md](./ENVIRONMENT_SETUP_GUIDE.md) | Env variables — setup guide & current status |
| [deployment.md](./deployment.md) | Deployment pipeline & DevOps strategy |
| [git-workflow.md](./git-workflow.md) | Git workflow & branch strategy |
| [observability.md](./observability.md) | Observability, analytics & monitoring |
| [file-header-guide.md](./file-header-guide.md) | File header conventions |
| [use-skills.md](./use-skills.md) | Skills & npx commands |

## Quality & Release

| Document | Description |
|----------|-------------|
| [testing.md](./testing.md) | Testing strategy — production quality engineering |
| [launch-checklist.md](./launch-checklist.md) | Launch checklist — Production Readiness Review |
| [LAUNCH.md](./LAUNCH.md) | Launch runbook |
| [release-documents.md](./release-documents.md) | Release documents — per-release artifacts |
