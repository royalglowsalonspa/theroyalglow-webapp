# Payload MCP Server — Read-Only CMS Access for AI Agents

The CMS exposes a **Model Context Protocol** server so AI agents (Kiro, Claude
Desktop, any MCP client) can *read* Royal Glow content directly instead of
guessing at it or scraping the website.

It is **read-only by design**. Nothing about this integration can write to the
database.

| Property | Value |
|----------|-------|
| Endpoint | `/api/mcp` (served by Payload's REST catch-all route) |
| Local dev | `http://localhost:3002/api/mcp` |
| Production | `https://cms.theroyalglow.in/api/mcp` |
| Plugin | `@payloadcms/plugin-mcp` (pinned `^3.86.0`) |
| Auth | `Authorization: Bearer <api-key>` |
| Server name | `Royal Glow Payload MCP` |
| Exposed tools | 11, all `find*` |

---

## Why read-only

Two of the exposed collections are **live operational data**, not marketing copy:

- `service` and `service_category` carry `afterChange` sync hooks
  (`syncServiceToPublic` / `syncServiceCategoryToPublic`) that mirror every write
  into `public.service` and `public.service_category` — the catalogue customers
  actually book against.
- A model granted write access could therefore silently change real prices (in
  paise) and durations on bookable services, and those writes would propagate
  straight into the booking engine.

The remaining collections are marketing/content surfaces the website renders.
Read access covers every use case we have: answering questions about content,
auditing what is published, drafting copy elsewhere.

`users` is **deliberately excluded entirely** — not even `find`. It is Payload's
auth collection and holds password `hash`/`salt` plus admin PII.

---

## Two-step access model

Enabling a capability requires **both** of the following. Neither alone is
sufficient, which is what makes accidental widening hard:

1. **Config** — the capability must be listed in the `mcpPlugin({ collections })`
   block in `apps/cms/src/payload.config.ts`. Every entry there declares
   `enabled: { find: true }` and nothing else.
2. **Per-key toggle** — the capability must ALSO be switched on for the specific
   API Key, in the admin panel under **MCP → API Keys**.

Because step 1 only ever declared `find`, the `cms.payload_mcp_api_keys` table
was generated with **only `*_find` columns**. There is no column in which a
create/update/delete grant could even be stored.

---

## Exposed collections

| Tool | Collection | Content |
|------|-----------|---------|
| `findService` | `service` | Bookable service catalogue — prices in paise, durations, gems fields |
| `findServiceCategory` | `service_category` | Salon/SPA taxonomy behind the bookable catalogue |
| `findServiceCard` | `service-card` | Homepage marketing category cards (display-only, not bookable) |
| `findBlog` | `blog` | Blog posts, Lexical body, SEO group, draft/published state |
| `findGallery` | `gallery` | Curated `/gallery` images with alt text and categories |
| `findTeam` | `team` | Public team profiles (also blog authors) |
| `findBanner` | `banner` | Homepage announcement banners with scheduling window |
| `findFaq` | `faq` | FAQ entries powering `/faq` and its FAQPage JSON-LD |
| `findTestimonial` | `testimonial` | Homepage review carousel |
| `findOffer` | `offer` | Promotional offer cards (marketing only) |
| `findMedia` | `media` | Shared R2 upload collection — resolve an image to URL/alt |

Collection `description`s in the config are intentionally verbose and specific.
The description is the primary signal a model uses to pick the right tool, and
vague descriptions cause wrong-tool calls — for example confusing the marketing
`service-card` collection with the bookable `service` collection.

---

## Database footprint

The plugin adds exactly one table, inside the isolated `cms` schema:

```
cms.payload_mcp_api_keys
```

plus a nullable `payload_mcp_api_keys_id` column on
`cms.payload_locked_documents_rels` and `cms.payload_preferences_rels`.

Migration: `apps/cms/src/migrations/20260729_201902_add_mcp_api_keys.ts`. It
contains **zero references to the `public` schema**. Verified after applying to
`dev`: `public.service` still 57 rows, `public.service_category` still 10 rows,
`public.service` still 16 columns.

Per [migration-discipline](../.kiro/steering/migration-discipline.md), `push` is
disabled (`push: false`) and this is applied via `bun payload migrate` per branch
in `dev → test → pprd → prod` order.

---

## Provisioning an API key

Use the committed script — it is idempotent by label and grants `find` and
nothing else on all 11 collections:

```bash
cd apps/cms
bun run --env-file=.env.local scripts/create-mcp-api-key.ts
```

Optional overrides: `MCP_KEY_OWNER_EMAIL`, `MCP_KEY_LABEL`.

The raw key is printed **once** — Payload stores only an HMAC-SHA256 index of
it (`api_key_index`), keyed on `PAYLOAD_SECRET`. Re-running the script with the
same label **rotates** the key, immediately invalidating the previous one.

A key can also be created by hand in the admin panel at
`localhost:3002/admin` → **MCP → API Keys**.

---

## Wiring an MCP client

Workspace config lives in `.kiro/settings/mcp.json` (gitignored):

```jsonc
"payload": {
  "command": "npx",
  "args": [
    "-y", "mcp-remote",
    "http://localhost:3002/api/mcp",
    "--header", "Authorization:Bearer ${PAYLOAD_MCP_API_KEY}",
    "--allow-http"
  ],
  "env": { "PAYLOAD_MCP_API_KEY": "<key>" },
  "disabled": false,
  "autoApprove": []
}
```

`--allow-http` is required only because local dev is plain HTTP. Drop it when
pointing at `https://cms.theroyalglow.in/api/mcp`.

The CMS dev server must be running for the local endpoint to answer.

---

## Verifying

```bash
cd apps/cms
bunx next dev --webpack -p 3002
.\scripts\verify-mcp.ps1 -ApiKey <key>
```

The script is read-only and asserts the whole security posture:

| Check | Expected |
|-------|----------|
| No `Authorization` header | HTTP 401 |
| Invalid API key | HTTP 401 |
| `tools/list` | 11 tools, every name starts with `find` |
| `findService` | HTTP 200 with a document count |
| `updateService` / `deleteService` / `createService` | `Tool not found` |
| `findUsers` | `Tool not found` |

---

## Known local-environment constraint

Turbopack cannot start on the current Windows machine — an Application Control
policy blocks the native SWC binary
(`@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node`), and Turbopack refuses
to run on WASM-only bindings. Use `bunx next dev --webpack -p 3002` instead of
`bun run dev` when exercising the CMS locally. This is a machine policy issue,
not a repo issue, so `package.json` is left alone.

---

## Security posture

| Aspect | Status |
|--------|--------|
| Write access | **Impossible.** No non-`find` capability in config; no write column in the key table |
| `users` collection | Not exposed at any capability |
| Unauthenticated access | Rejected with 401 |
| Key storage at rest | HMAC-SHA256 index only, keyed on `PAYLOAD_SECRET` |
| Key in version control | No — `.kiro/settings/` is gitignored |
| Rotation | Re-run `create-mcp-api-key.ts` with the same label |
| Blast radius if leaked | Read access to published CMS content. No PII, no credentials, no write path |

> `.kiro/settings/mcp.json` holds plaintext credentials for several services
> beyond Payload (Neon, GitHub, PostHog). It is gitignored, but it does sit
> inside a OneDrive-synced folder. Worth rotating those independently of this
> integration.

---

## Widening access later

If a write capability ever becomes genuinely necessary:

1. Understand that `service` / `service_category` writes reach the live booking
   catalogue through the sync hooks. Prefer exposing a narrower collection.
2. Add the capability to `payload.config.ts`.
3. `bun payload migrate:create` to add the new `*_create` / `*_update` columns —
   note this needs a **TTY**; it hangs on drizzle-kit's interactive rename
   resolver when run from an agent shell.
4. Apply the migration per branch in `dev → test → pprd → prod` order.
5. Toggle the capability on the specific API Key in the admin panel.
6. Re-run `verify-mcp.ps1` and update the expectations table above.

---

## Reference

- [architecture.md](./architecture.md) — subdomain map and hosting
- [PAYLOAD_INTEGRATION_PLAN.md](./PAYLOAD_INTEGRATION_PLAN.md) — Payload → website integration
- [migration-discipline](../.kiro/steering/migration-discipline.md) — migration workflow
- `.kiro/specs/payload-service-management/` — the spec that made `service` a Payload-authored collection
- [Payload MCP plugin docs](https://payloadcms.com/docs/plugins/mcp)
