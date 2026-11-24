/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-offer (hooks)
 * Scope        : CMS Integration — Offer sync (cms.offer → public.offer)
 *
 * Description  : Payload `afterChange` hook that mirrors an offer's checkout
 *                rule into the app's `public.offer` and `public.offer_service`
 *                on Payload's own request transaction (multi-branch
 *                offers.md, R4.5, R4.7), so the CMS save and the mirror
 *                commit or roll back together.
 *
 * Responsibilities :
 * - Short-circuit on SERVICE_SYNC_ENABLED before any write (validation has
 *   already refused rule changes while it is off)
 * - With a rule: upsert the mirror (`cms_offer_<id>`) and replace its
 *   linked services
 * - Without one: retire a mirror made earlier, keeping its last rule
 * - Log success and failure; re-throw so Payload rolls the save back
 *
 * Tech Stack   : Payload CMS v3, Drizzle ORM, PostgreSQL (Neon), TypeScript
 * Layer        : CMS (Hooks — sync)
 *
 * Dependencies : payload (types), drizzle-orm, ../lib/sync-db, ./offer-mapper
 *
 * Notes        :
 * - No delete branch: Offer's delete is disabled; offers are retired by
 *   unticking Active, which the mirror follows.
 * - A restored version goes through here too (restoreVersion runs
 *   afterChange).
 ************************************************************/

import { eq } from 'drizzle-orm'
import type { CollectionAfterChangeHook } from 'payload'
import { isSyncEnabled, offer, offerService, txDb } from '../lib/sync-db'
import { mapPayloadToPublicOffer, type PayloadOfferDoc, publicOfferId } from './offer-mapper'

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

export const syncOfferToPublic: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (!isSyncEnabled()) {
    console.info('[sync] offer skipped — SERVICE_SYNC_ENABLED=false', {
      operation,
      documentId: doc.id,
    })
    return doc
  }

  const startedAt = Date.now()
  try {
    // Bind to Payload's active transaction: cms.offer and public.offer commit
    // or roll back together.
    const db = await txDb(req)
    const mapped = mapPayloadToPublicOffer(doc as PayloadOfferDoc)

    if (mapped) {
      const row = { ...mapped.row, createdAt: toDate(mapped.row.createdAt) }
      // Upsert, so a missing mirror is recreated by the next save (R4.7);
      // an existing one keeps its creation time.
      const { id: _id, createdAt: _createdAt, ...updatable } = row
      await db
        .insert(offer)
        .values(row)
        .onConflictDoUpdate({ target: offer.id, set: { ...updatable, updatedAt: new Date() } })
      // The linked services, replaced wholesale; the mirror exists by now (FK).
      await db.delete(offerService).where(eq(offerService.offerId, row.id))
      if (mapped.serviceIds.length > 0) {
        await db
          .insert(offerService)
          .values(mapped.serviceIds.map((serviceId) => ({ offerId: row.id, serviceId })))
      }
    } else {
      // No rule (any more): the counter can't apply it. A mirror made earlier
      // is retired and keeps its last rule, which past invoices name.
      await db
        .update(offer)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(offer.id, publicOfferId(doc.id)))
    }

    console.info('[sync] offer synced', {
      operation,
      documentId: doc.id,
      rule: mapped ? mapped.row.offerType : 'none',
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    console.error('[sync] offer sync failed', {
      operation,
      documentId: doc.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationMs: Date.now() - startedAt,
    })
    // Re-throw: Payload rolls the whole transaction back, the CMS write too.
    throw error
  }

  return doc
}
