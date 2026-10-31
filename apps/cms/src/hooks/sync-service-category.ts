/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 15-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-service-category (hooks)
 * Scope        : CMS Integration — Service Category Sync
 *
 * Description  : Payload `afterChange` hook that mirrors every
 *                `cms.service_category` write to `public.service_category`,
 *                the table the booking engine reads, and its branch
 *                availability (`public.service_category_branch`). The writes
 *                are issued on Payload's own request-scoped transaction
 *                handle, so the cms row and the public rows commit or roll
 *                back TOGETHER.
 *
 * Responsibilities :
 * - Short-circuit when the SERVICE_SYNC_ENABLED flag is off (no write, no throw)
 * - Resolve Payload's transaction-bound Drizzle handle via txDb(req)
 * - UPSERT public.service_category on create AND update, so a missing mirror
 *   row is recreated by the next save (multi-branch R4.7)
 * - Replace the category's `service_category_branch` rows
 * - Emit structured success / failure logs (operation, documentId, durationMs)
 * - Re-throw on failure so Payload rolls the WHOLE transaction back
 *
 * Features / Functionality :
 * - syncServiceCategoryToPublic → CollectionAfterChangeHook
 * - Idempotent (onConflictDoUpdate) — safe on re-seed and retry
 * - `id` / `createdAt` excluded from the create conflict set (Property 10)
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
import { isSyncEnabled, serviceCategory, serviceCategoryBranch, txDb } from '../lib/sync-db'
import { availabilityOf, mapPayloadToPublicCategory } from './mappers'

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

    if (operation === 'create' || operation === 'update') {
      // UPSERT, never a bare insert or update. The seed script seeds
      // CATEGORIES FIRST: it reads rows FROM public.service_category and then
      // calls payload.create() with the SAME id, so a bare .insert() would
      // raise a duplicate-key / unique-slug violation; a bare .update() of a
      // missing mirror row would write nothing (R4.7).
      //
      // On create, `id` and `createdAt` stay OUT of the set clause so an
      // existing row keeps its original creation timestamp; an update carries
      // Payload's createdAt, as it always has.
      const { id: _id, createdAt: _createdAt, ...updatableFields } = mapped
      const set =
        operation === 'update'
          ? { ...updatableFields, createdAt, updatedAt: new Date() }
          : { ...updatableFields, updatedAt: new Date() }

      await db
        .insert(serviceCategory)
        .values({ ...mapped, createdAt })
        .onConflictDoUpdate({ target: serviceCategory.id, set })

      // Branch availability, replaced wholesale (empty for all branches).
      const { allBranches, branchIds } = availabilityOf(doc)
      await db.delete(serviceCategoryBranch).where(eq(serviceCategoryBranch.categoryId, doc.id))
      if (!allBranches && branchIds.length > 0) {
        await db
          .insert(serviceCategoryBranch)
          .values(branchIds.map((branchId) => ({ categoryId: doc.id, branchId })))
      }
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
