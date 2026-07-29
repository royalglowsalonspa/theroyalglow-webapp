/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 15-06-2026 & Updated - 15-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-service (hooks)
 * Scope        : CMS Integration — Service Sync (cms.service → public.service)
 *
 * Description  : Payload `afterChange` hook that mirrors every service document
 *                written in the CMS into the app's `public.service` table, on
 *                Payload's OWN request transaction, so the `cms.service` write
 *                and the `public.service` write commit or roll back together.
 *
 * Responsibilities :
 * - Short-circuit on the SERVICE_SYNC_ENABLED feature flag before any write
 * - Resolve Payload's transaction-bound Drizzle handle via txDb(req)
 * - UPSERT public.service on `create`, UPDATE by id on `update`
 * - Emit structured success/failure logs with operation, documentId, durationMs
 * - Re-throw on failure so Payload rolls the WHOLE transaction back
 *
 * Features / Functionality :
 * - syncServiceToPublic: CollectionAfterChangeHook
 * - Idempotent create path (onConflictDoUpdate) — safe to re-run
 * - createdAt is never overwritten on an existing row
 *
 * Tech Stack   : Payload CMS v3, Drizzle ORM, PostgreSQL (Neon), TypeScript
 * Layer        : CMS (Hooks — sync)
 *
 * Dependencies : payload (types), drizzle-orm, ../lib/sync-db, ./mappers
 *
 * Notes        :
 * - There is intentionally NO delete branch: delete is disabled at the access
 *   control layer (`delete: () => false`) and services are retired via the
 *   `isActive` toggle, so there is nothing to mirror.
 * - The mapper returns `createdAt` as `Date | string` (Payload serialises
 *   timestamps to ISO strings), while the Drizzle column is
 *   `timestamp(..., { mode: 'date' })`. It is coerced to a real `Date` here.
 ************************************************************/

import { eq } from 'drizzle-orm'
import type { CollectionAfterChangeHook } from 'payload'
import { isSyncEnabled, service, txDb } from '../lib/sync-db'
import { mapPayloadToPublicService } from './mappers'

/**
 * Coerce a Payload timestamp to a real `Date`.
 *
 * Payload hands `createdAt` back either as a `Date` (direct local API call) or
 * as an ISO string (serialised through the REST/GraphQL layer). Drizzle's
 * `timestamp(..., { mode: 'date' })` column accepts only a `Date`, so the
 * string case is converted rather than cast away.
 */
function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

export const syncServiceToPublic: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  // Feature-flag gate — the FIRST thing this hook does. No `public.*` write and
  // NO throw, so the CMS write still succeeds. This is what lets the seed
  // script run with the hooks registered, and is the PRIMARY ROLLBACK LEVER
  // (env-var change + restart, no code edit, no rebuild).
  if (!isSyncEnabled()) {
    console.info('[sync] service skipped — SERVICE_SYNC_ENABLED=false', {
      operation,
      documentId: doc.id,
    })
    return doc
  }

  const startedAt = Date.now()

  try {
    // Bind to Payload's ACTIVE transaction so cms.service and public.service
    // commit or roll back together. txDb is async — it awaits req.transactionID
    // before resolving the transaction-bound session handle.
    const db = await txDb(req)

    const mapped = mapPayloadToPublicService(doc)
    // createdAt coerced once, here, so both write paths get a real Date.
    const row = { ...mapped, createdAt: toDate(mapped.createdAt) }

    if (operation === 'create') {
      // UPSERT, never a bare insert. The seed script reads rows FROM
      // public.service and then calls payload.create() with the SAME id, so a
      // plain .insert() would raise a duplicate-key / unique-slug violation.
      // onConflictDoUpdate makes re-seeding, hook retries, and pre-existing
      // rows safe instead of fatal.
      //
      // `id` and `createdAt` are destructured OUT of the set clause so an
      // existing row keeps its original creation timestamp while every mutable
      // field converges on the Payload document.
      const { id: _id, createdAt: _createdAt, ...updatable } = row

      await db
        .insert(service)
        .values(row)
        .onConflictDoUpdate({
          target: service.id,
          set: { ...updatable, updatedAt: new Date() },
        })
    } else if (operation === 'update') {
      await db
        .update(service)
        .set({ ...row, updatedAt: new Date() })
        .where(eq(service.id, doc.id))
    }
    // No delete branch — delete is disabled at the access control layer
    // (`delete: () => false`); services are retired via the isActive toggle.

    console.info('[sync] service synced', {
      operation,
      documentId: doc.id,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    console.error('[sync] service sync failed', {
      operation,
      documentId: doc.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationMs: Date.now() - startedAt,
    })
    // Re-throw is ESSENTIAL: it makes Payload roll back the WHOLE transaction,
    // including the cms.service write, which is what guarantees cms.* and
    // public.* can never diverge. Payload surfaces this as a 500 in the admin UI.
    throw error
  }

  return doc
}
