/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 15-06-2026 & Updated - 15-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-db (lib)
 * Scope        : CMS Integration — Service Sync Data Access
 *
 * Description  : Shared data-access surface for the service/service-category
 *                sync hooks. Re-exports the app's Drizzle table definitions and
 *                resolves the Drizzle client bound to Payload's ACTIVE request
 *                transaction, so a `cms.*` write and its mirrored `public.*`
 *                write commit or roll back together.
 *
 * Responsibilities :
 * - Re-export the `service` / `serviceCategory` Drizzle table definitions
 *   (STRUCTURE ONLY) from @rgss/db/schema
 * - Resolve Payload's transaction-bound Drizzle handle via txDb(req)
 * - Gate the sync hooks behind the SERVICE_SYNC_ENABLED feature flag
 *
 * Features / Functionality :
 * - txDb(req) → transaction-bound Drizzle instance (async; awaits transactionID)
 * - isSyncEnabled() → false only when SERVICE_SYNC_ENABLED === 'false'
 *
 * Tech Stack   : Payload CMS v3, Drizzle ORM, PostgreSQL (Neon)
 * Layer        : CMS (Data Access)
 *
 * Dependencies : drizzle-orm/node-postgres (types only), @rgss/db/schema
 *
 * Notes        :
 * - Deliberately does NOT import @rgss/db's `db` export: that client is bound to
 *   drizzle-orm/neon-http, an edge/Workers HTTP-fetch driver that cannot
 *   participate in Payload's transaction. Only the table definitions are reused.
 * - `cms.*` and `public.*` live in the SAME physical Neon database, which is what
 *   makes the single-transaction cross-schema write possible.
 ************************************************************/

// Table definitions only — the connection used at write time is Payload's
// request-scoped transaction handle, resolved per call by txDb() below.
// Unqualified Drizzle table defs resolve to `public.*` via search_path
// (verified by the Task 2.0a spike on the dev Neon branch).
import { service, serviceCategory } from '@rgss/db/schema'
// Type-only import. `drizzle-orm` is pinned to the EXACT version `packages/db`
// resolves (0.45.2) so `apps/cms`, `@rgss/db` and `@payloadcms/drizzle` all share
// ONE physical copy — the single-drizzle-instance property the Task 2.0a spike
// relied on. A second copy would break table-identity at RUNTIME while still
// typechecking.
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export { service, serviceCategory }

/**
 * Resolve the Drizzle client bound to Payload's ACTIVE TRANSACTION for this
 * request. Shape VERIFIED by the Task 2.0a spike against the dev Neon branch,
 * and matches Payload's own internal `getTransaction()` in `@payloadcms/drizzle`.
 *
 * - `req.transactionID` MAY be a Promise, so it MUST be awaited — that is why
 *   this function is async.
 * - `adapter.sessions[txID].db` is the transaction-bound Drizzle instance;
 *   writes issued on it JOIN Payload's transaction, so the `cms.*` write and the
 *   `public.*` write commit or roll back together.
 * - The `?? adapter.drizzle` fallback matches Payload's behaviour when there is
 *   no active transaction (non-transactional call).
 *
 * ⚠️ DO NOT use `req.payload.db.drizzle` DIRECTLY. The Task 2.0a spike PROVED
 * that returns the BASE connection pool, which commits INDEPENDENTLY of
 * Payload's transaction — on rollback `public.*` keeps a row `cms.*` no longer
 * has, reintroducing exactly the data divergence this feature exists to prevent.
 * Always go through this resolver.
 *
 * `req: any` is DELIBERATE, not an oversight: Payload's `PayloadRequest` type does
 * not expose the postgres adapter's `sessions` map or its `drizzle` instance, so
 * this access cannot be expressed against the public types. The path itself is
 * verified (Task 2.0a) and mirrors Payload's own internal implementation.
 *
 * The RETURN type, however, is explicit and NOT `any`. Without it the `any` from
 * `req` propagates into every `db.insert(service).values(...)` / `.set(...)` call
 * in the sync hooks, and TypeScript checks NOTHING about the most
 * correctness-critical code in this feature (column names, `createdAt`
 * Date-vs-string, missing NOT NULL columns). `NodePgDatabase` is the type
 * `@payloadcms/db-postgres` itself declares for `adapter.drizzle`
 * (`NodePgDatabase | PgWithReplicas<NodePgDatabase>`); the session branch is a
 * `PgTransaction` over the same node-postgres driver, and both expose an
 * IDENTICAL query-builder surface, which is all this seam hands to callers.
 */
// biome-ignore lint/suspicious/noExplicitAny: Payload's public request/adapter types do not expose `sessions` or `drizzle`; see the JSDoc above.
export async function txDb(req: any): Promise<NodePgDatabase> {
  const adapter = req.payload.db // PostgresAdapter
  const txID = await req.transactionID
  return adapter.sessions?.[txID]?.db ?? adapter.drizzle
}

/**
 * Feature-flag gate for the service sync hooks.
 *
 * Default ENABLED: only the literal string 'false' disables the sync, so a
 * missing or unset env var can NEVER silently stop syncing.
 *
 * Set to 'false':
 * - while running the seed script (`apps/cms/scripts/seed-services.ts`), which
 *   reads rows FROM `public.service` and then calls `payload.create()` — with the
 *   hook live that would re-write the same id and raise a duplicate-key error
 * - as the PRIMARY ROLLBACK LEVER: an env-var change plus a restart, with no code
 *   edit and no rebuild.
 */
export function isSyncEnabled(): boolean {
  return process.env.SERVICE_SYNC_ENABLED !== 'false'
}
