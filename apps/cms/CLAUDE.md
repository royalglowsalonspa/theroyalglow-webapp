# Claude Code: CMS

@AGENTS.md

The import above loads this folder's shared development instructions into Claude
Code. Read the repository-level instructions as well when working from this
directory. Keep detailed rules in `AGENTS.md` so both agent entry points agree.

## Task orientation

- This is `@rgss/cms`: Payload admin, content APIs, and the bookable catalogue
  authoring app. Its Payload users are separate from Better Auth users.
- Begin with [README.md](README.md), then the collection or hook you will change.
  Read `src/payload.config.ts` for registered collections and integrations.
- For catalogue changes, trace collection → mapper → transaction-bound sync →
  public Drizzle schema → web/admin consumer. Verify both sides of the contract.
- For schema changes, follow the Payload migration workflow in `AGENTS.md`.
  For routine checks, use the isolated root Vitest `cms` project; live suites and
  browser tests write data and require an intentionally selected test environment.
- Keep MCP read-only, preserve the account-unlock denial, and retain the
  generated Next.js instruction block. Do not infer broader permissions from
  a collection helper's name or from a dependency upgrade.
- Finish with a concise summary of changes, checks, migration requirements, and
  any unverified behavior. Separate source configuration from observed live state.

## Focused references

- [Repository instructions](../../AGENTS.md) and [CMS instructions](AGENTS.md)
- [Catalogue migration](../../knowledge-base/service-catalogue-migration.md)
- [Migration discipline](../../.kiro/steering/migration-discipline.md)
- [Render Blueprint](../../render.yaml) and [CMS migration workflow](../../.github/workflows/cms-migrate.yml)
