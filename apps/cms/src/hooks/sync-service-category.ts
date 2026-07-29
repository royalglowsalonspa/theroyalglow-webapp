/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 15-06-2026 & Updated - 15-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-service-category (hooks)
 * Scope        : CMS Integration — Service Category Sync
 *
 * Description  : Payload `afterChange` hook that mirrors every
 *                `cms.service_category` write to `public.service_category`,
 *                the table the booking engine reads. The write is issued on
 *                Payload's own request-scoped transaction handle, so the cms
 *                row and the public row commit or roll back TOGETHER.
 *
 * Responsibilities :
 * - Short-circuit when the SERVICE_SYNC_ENABLED flag is off (no write, no throw)
 * - Resolve Payload's transaction-bound Drizzle handle via txDb(req)
 * - UPSERT public.service_category on `create`, UPDATE by id on `update`
 * - Emit structured success / failure logs (operation, documentId, durationMs)
 * - Re-throw on failure so Payload rolls the WHOLE transaction back
 *
 * Features / Functionality :
 * - syncServiceCategoryToPublic → CollectionAfterChangeHook
 * - Idempotent create path (onConflictDoUpdate) — safe on re-seed and retry
 * - `id` / `createdAt` excluded from the conflict set clause (Property 10)
 *
 * Tech Stack   : Payload CMS v3, Drizzle ORM, PostgreSQL (Neon)
 * Layer        : CMS (Hooks — sync)
 *
 * Dependencies : payload (types), drizzle-orm, ../lib/sync-db, ./mappers
 *
 * Notes        :
 * - There is deliberately NO delete branch: delete is disabled at the access
 *   layer (`delete: () => false`), categories are retired via `isActive`.
 * - Mirrors apps/cms/src/hooks/sync-service.ts exactly, targeting
 *   `serviceCategory` / `public.service_category` instead of `service`.
 ************************************************************/

import { eq } from 'drizzle-orm'
import type { CollectionAfterChangeHook } from 'payload'
import { isSyncEnabled, serviceCategory, txDb } from '../lib/sync-db'
import { mapPayloadToPublicCategory } from './mappers'

export const syncServiceCategoryToPublic: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  // Feature-flag gate FIRST. When the sync is off we skip the `public` write
  // entirely and DO NOT throw, so the CMS write still succeeds — this is what
  // lets the seed script run with the hooks registered, and is the primary
  // rollback lever (env change + restart, no code edit).
  if (!isSyncEnabled()) {
    console.info('[sync] skipped — SERVICE_SYNC_ENABLED=false', {
      collection: 'service_category',
      operation,
      documentId: doc.id,
    })
    return doc
  }

  const startedAt = Date.now()

  try {
    // Bind to Payload's ACTIVE transaction so cms.service_category and
    // public.service_category commit / roll back together. txDb is async — it
    // awaits req.transactionID before resolving the session handle.
    const db = await txDb(req)
    const mapped = mapPayloadToPublicCategory(doc)

    // The mapper preserves Payload's `createdAt` verbatim, which Payload
    // serialises as an ISO string on some code paths and as a Date on others.
    // Drizzle's column is timestamp({ mode: 'date' }) and expects a real Date,
    // so coerce here rather than silencing the mismatch with a cast.
    const createdAt = new Date(mapped.createdAt)

    if (operation === 'create') {
      // UPSERT, never a bare insert. The seed script seeds CATEGORIES FIRST:
      // it reads rows FROM public.service_category and then calls
      // payload.create() with the SAME id, so categories hit this collision
      // before services do. A bare .insert() would raise a duplicate-key /
      // unique-slug violation; onConflictDoUpdate makes re-seeds, hook
      // retries, and pre-existing rows safe instead of fatal.
      //
      // `id` and `createdAt` are destructured OUT of the set clause so an
      // existing row keeps its original creation timestamp while every mutable
      // field converges on the Payload document.
      const { id: _id, createdAt: _createdAt, ...updatableFields } = mapped

      await db
        .insert(serviceCategory)
        .values({ ...mapped, createdAt })
        .onConflictDoUpdate({
          target: serviceCategory.id,
          set: { ...updatableFields, updatedAt: new Date() },
        })
    } else if (operation === 'update') {
      await db
        .update(serviceCategory)
        .set({ ...mapped, createdAt, updatedAt: new Date() })
        .where(eq(serviceCategory.id, doc.id))
    }
    // No delete branch — delete is disabled at the access-control layer
    // (`delete: () => false`); categories are retired via the isActive toggle.

    console.info('[sync] service_category synced', {
      operation,
      documentId: doc.id,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    console.error('[sync] service_category sync failed', {
      operation,
      documentId: doc.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationMs: Date.now() - startedAt,
    })
    // Re-throw → Payload rolls back the WHOLE transaction (the
    // cms.service_category write included) and returns 500, so the two schemas
    // can never diverge.
    throw error
  }

  return doc
}
