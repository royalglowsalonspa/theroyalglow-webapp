/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : catalogue-resync
 * Scope        : Data Access — Developer catalogue resync (multi-branch R4.7,
 *                catalogue-resync.md)
 *
 * Description  : Copies one Payload catalogue row (a category, a service or
 *                an offer's checkout rule) into its app mirror, in one
 *                transaction, only while the CMS row is still at the revision
 *                the drift report showed.
 *
 * Responsibilities :
 * - getCmsRevisions() → each CMS row's `updated_at`, by table and mirror id
 * - resyncCatalogueRecord(record) → upsert the mirror and replace its join
 *   rows (or retire an offer mirror whose rule is gone)
 *
 * Features / Functionality :
 * - Revision check under `FOR UPDATE` on the CMS row: a CMS save in flight
 *   holds the same row, so a stale repair waits, then refuses (409
 *   CATALOGUE_CHANGED); a later save overwrites the repair
 * - Dependencies checked before the write (409 CONFLICT naming what to fix):
 *   a service's category mirror, the branches the CMS lists, an offer's
 *   linked services, an offer rule's dates
 * - Idempotent upserts and replacements: safe to retry
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/errors, @rgss/types, ../index,
 *                ./driver-errors
 *
 * Notes        :
 * - The mapping is the sync hooks' (apps/cms/src/hooks/mappers.ts,
 *   offer-mapper.ts) and the drift read's (./service-drift.ts), written in
 *   SQL here; the caller verifies parity with a fresh drift report.
 * - The CMS timestamps are copied, so the mirror matches within the drift
 *   tolerance. Nothing is ever deleted except join rows being replaced.
 * - Raw SQL for the `cms.*` side, as in ./service-drift.ts: Payload owns that
 *   schema and its migrations.
 ************************************************************/

import { AppError, conflict, ERROR_CODES } from '@rgss/errors'
import type { CatalogueResyncRecord, CatalogueSyncTable } from '@rgss/types'
import { type SQL, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '../index'
import { abortedWithMarker, isConstraintViolation, SQLSTATE } from './driver-errors'

/** Per table, each CMS row's `updated_at` (ISO, milliseconds) by mirror id. */
export type CatalogueRevisions = Record<CatalogueSyncTable, Record<string, string>>

/** What a resync wrote; `unchanged` for a rule-free offer with no live mirror. */
export type ResyncAction = 'created' | 'updated' | 'retired' | 'unchanged'

// Cast to an integer by the revision guard when the CMS row moved on.
const CHANGED = 'catalogue_changed'
const OFFER_RULE_CHECK = 'offer_cms_rule_check'
const OFFER_ID = /^cms_offer_(\d{1,9})$/

const ISO_MS = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`)

/** Each CMS catalogue row's revision, keyed as the drift report keys it. */
export async function getCmsRevisions(): Promise<CatalogueRevisions> {
  const result = await db.execute(sql`
    SELECT 'service_category' AS t, c.id::text AS id,
           to_char(c.updated_at AT TIME ZONE 'UTC', ${ISO_MS}) AS revision
      FROM cms.service_category c
    UNION ALL
    SELECT 'service', s.id::text, to_char(s.updated_at AT TIME ZONE 'UTC', ${ISO_MS})
      FROM cms.service s
    UNION ALL
    SELECT 'offer', 'cms_offer_' || o.id, to_char(o.updated_at AT TIME ZONE 'UTC', ${ISO_MS})
      FROM cms.offer o
  `)
  const revisions: CatalogueRevisions = { service_category: {}, service: {}, offer: {} }
  for (const row of result.rows as { t: CatalogueSyncTable; id: string; revision: string }[]) {
    revisions[row.t][row.id] = row.revision
  }
  return revisions
}

function changed(): AppError {
  return new AppError({
    code: ERROR_CODES.CATALOGUE_CHANGED,
    message:
      'This record changed in the CMS, or was removed there, after the report was made. Refresh the report, then resync it again.',
    statusCode: 409,
  })
}

function refused(message: string): AppError {
  return conflict(ERROR_CODES.CONFLICT, message)
}

/**
 * Lock the CMS row and check it is still at `revision`; else the cast aborts
 * the batch. Reports how many mirror rows existed before the write.
 */
function revisionGuard(cmsRow: SQL, mirror: SQL) {
  return db.execute(sql`
    WITH locked AS (${cmsRow} FOR UPDATE)
    SELECT (CASE WHEN count(*) = 0 THEN ${CHANGED} ELSE '1' END)::int AS ok,
           (${mirror})::int AS existed
      FROM locked
  `)
}

/** The branch ids the CMS lists that name no branch. */
async function unknownBranches(texts: SQL): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT btrim(t.text) AS id
      FROM (${texts}) t
     WHERE btrim(coalesce(t.text, '')) <> ''
       AND NOT EXISTS (SELECT 1 FROM branch b WHERE b.id = btrim(t.text))
     ORDER BY 1`)
  return (result.rows as { id: string }[]).map((row) => row.id)
}

/**
 * Run the guard and the writes as one transaction; the guard's count of
 * mirror rows before the write comes back.
 */
async function runResync(statements: [BatchItem<'pg'>, ...BatchItem<'pg'>[]]): Promise<number> {
  try {
    const [guard] = (await db.batch(statements)) as unknown as { rows: { existed: number }[] }[]
    return Number(guard?.rows[0]?.existed ?? 0)
  } catch (error) {
    if (abortedWithMarker(error, CHANGED)) {
      throw changed()
    }
    if (isConstraintViolation(error, SQLSTATE.checkViolation, [OFFER_RULE_CHECK])) {
      throw refused(
        "The CMS offer's checkout rule is incomplete, so it can't be mirrored. Edit the offer in the CMS.",
      )
    }
    throw error
  }
}

async function resyncCategory(id: string, revision: string): Promise<ResyncAction> {
  const unknown = await unknownBranches(sql`
    SELECT t.text FROM cms.service_category_texts t
      JOIN cms.service_category c ON c.id = t.parent_id
     WHERE t.parent_id = ${id} AND t.path = 'availableBranches'
       AND c.availability::text = 'selected'`)
  if (unknown.length > 0) {
    throw refused(
      `The CMS lists branches that don't exist: ${unknown.join(', ')}. Edit the category in the CMS.`,
    )
  }

  const existed = await runResync([
    revisionGuard(
      sql`SELECT id FROM cms.service_category WHERE id = ${id} AND updated_at = ${revision}::timestamptz`,
      sql`SELECT count(*) FROM service_category WHERE id = ${id}`,
    ),
    db.execute(sql`
      INSERT INTO service_category (id, name, slug, description, service_type, sac_code,
                                    all_branches, display_order, is_active, created_at, updated_at)
      SELECT c.id, c.name, c.slug, c.description, c.service_type::text::service_type,
             c.sac_code::text, c.availability::text <> 'selected',
             coalesce(c.display_order, 0)::int, coalesce(c.is_active, true),
             c.created_at, c.updated_at
        FROM cms.service_category c
       WHERE c.id = ${id}
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description,
        service_type = EXCLUDED.service_type, sac_code = EXCLUDED.sac_code,
        all_branches = EXCLUDED.all_branches, display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active, created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at`),
    db.execute(sql`DELETE FROM service_category_branch WHERE category_id = ${id}`),
    db.execute(sql`
      INSERT INTO service_category_branch (category_id, branch_id)
      SELECT DISTINCT c.id, btrim(t.text)
        FROM cms.service_category c
        JOIN cms.service_category_texts t ON t.parent_id = c.id AND t.path = 'availableBranches'
       WHERE c.id = ${id} AND c.availability::text = 'selected'
         AND btrim(coalesce(t.text, '')) <> ''`),
  ])
  return existed > 0 ? 'updated' : 'created'
}

async function resyncService(id: string, revision: string): Promise<ResyncAction> {
  const found = await db.execute(sql`
    SELECT s.category_id_id AS category_id,
           EXISTS (SELECT 1 FROM service_category c WHERE c.id = s.category_id_id) AS mirrored
      FROM cms.service s WHERE s.id = ${id}`)
  const cms = (found.rows as { category_id: string; mirrored: boolean }[])[0]
  if (!cms) {
    throw changed()
  }
  if (!cms.mirrored) {
    throw refused(
      `Its category ${cms.category_id} has no mirror yet. Resync the category first, or with it.`,
    )
  }
  const unknown = await unknownBranches(sql`
    SELECT t.text FROM cms.service_texts t
      JOIN cms.service s ON s.id = t.parent_id
     WHERE t.parent_id = ${id} AND t.path = 'availableBranches'
       AND s.availability::text = 'selected'`)
  if (unknown.length > 0) {
    throw refused(
      `The CMS lists branches that don't exist: ${unknown.join(', ')}. Edit the service in the CMS.`,
    )
  }

  const existed = await runResync([
    revisionGuard(
      sql`SELECT id FROM cms.service WHERE id = ${id} AND updated_at = ${revision}::timestamptz`,
      sql`SELECT count(*) FROM service WHERE id = ${id}`,
    ),
    db.execute(sql`
      INSERT INTO service (id, category_id, name, slug, description, duration_minutes,
                           buffer_minutes, price_paise, is_active, image_url, display_order,
                           gems_redeemable, gems_required, gems_catalogue_order, sac_code,
                           all_branches, created_at, updated_at)
      SELECT s.id, s.category_id_id, s.name, s.slug, s.description,
             s.duration_minutes::text::int, coalesce(s.buffer_minutes, 0)::int,
             s.price_paise::int, coalesce(s.is_active, true), s.image_url,
             coalesce(s.display_order, 0)::int, coalesce(s.gems_redeemable, false),
             s.gems_required::int, s.gems_catalogue_order::int, s.sac_code::text,
             s.availability::text <> 'selected', s.created_at, s.updated_at
        FROM cms.service s
       WHERE s.id = ${id}
      ON CONFLICT (id) DO UPDATE SET
        category_id = EXCLUDED.category_id, name = EXCLUDED.name, slug = EXCLUDED.slug,
        description = EXCLUDED.description, duration_minutes = EXCLUDED.duration_minutes,
        buffer_minutes = EXCLUDED.buffer_minutes, price_paise = EXCLUDED.price_paise,
        is_active = EXCLUDED.is_active, image_url = EXCLUDED.image_url,
        display_order = EXCLUDED.display_order, gems_redeemable = EXCLUDED.gems_redeemable,
        gems_required = EXCLUDED.gems_required,
        gems_catalogue_order = EXCLUDED.gems_catalogue_order, sac_code = EXCLUDED.sac_code,
        all_branches = EXCLUDED.all_branches, created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at`),
    db.execute(sql`DELETE FROM service_branch WHERE service_id = ${id}`),
    db.execute(sql`
      INSERT INTO service_branch (service_id, branch_id)
      SELECT DISTINCT s.id, btrim(t.text)
        FROM cms.service s
        JOIN cms.service_texts t ON t.parent_id = s.id AND t.path = 'availableBranches'
       WHERE s.id = ${id} AND s.availability::text = 'selected'
         AND btrim(coalesce(t.text, '')) <> ''`),
  ])
  return existed > 0 ? 'updated' : 'created'
}

async function resyncOffer(id: string, revision: string): Promise<ResyncAction> {
  const cmsId = Number(OFFER_ID.exec(id)?.[1] ?? Number.NaN)
  if (!Number.isSafeInteger(cmsId)) {
    throw refused(`${id} isn't the mirror of a CMS offer.`)
  }
  const found = await db.execute(sql`
    SELECT o.rule_type::text AS rule_type,
           (o.valid_from IS NOT NULL AND o.valid_until IS NOT NULL) AS dated,
           (SELECT string_agg(DISTINCT r.service_id, ', ' ORDER BY r.service_id)
              FROM cms.offer_rels r
             WHERE r.parent_id = o.id AND r.path = 'rule.services' AND r.service_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM service s WHERE s.id = r.service_id)) AS unmirrored
      FROM cms.offer o WHERE o.id = ${cmsId}`)
  const cms = (found.rows as { rule_type: string; dated: boolean; unmirrored: string | null }[])[0]
  if (!cms) {
    throw changed()
  }
  const cmsRow = sql`SELECT id FROM cms.offer WHERE id = ${cmsId} AND updated_at = ${revision}::timestamptz`

  // No rule (any more): the counter can't apply it, so its mirror is retired
  // and keeps its last rule, which past invoices name.
  if (cms.rule_type === 'none') {
    const live = await runResync([
      revisionGuard(cmsRow, sql`SELECT count(*) FROM offer WHERE id = ${id} AND is_active`),
      db.execute(sql`
        UPDATE offer SET is_active = false, updated_at = now()
         WHERE id = ${id} AND is_active`),
    ])
    return live > 0 ? 'retired' : 'unchanged'
  }
  if (!cms.dated) {
    throw refused("The CMS offer's rule has no dates, so it can't be mirrored. Edit it in the CMS.")
  }
  if (cms.unmirrored) {
    throw refused(
      `Its services have no mirror yet: ${cms.unmirrored}. Resync them first, or with it.`,
    )
  }

  const existed = await runResync([
    revisionGuard(cmsRow, sql`SELECT count(*) FROM offer WHERE id = ${id}`),
    db.execute(sql`
      INSERT INTO offer (id, name, slug, description, offer_type, discount_percentage,
                         discount_amount_paise, combo_price_paise, start_date, end_date,
                         is_active, terms, image_url, display_order, cms_id, show_on_website,
                         created_at, updated_at)
      SELECT 'cms_offer_' || o.id, o.title, 'cms-offer-' || o.id, o.description,
             o.rule_type::text::discount_type,
             CASE WHEN o.rule_type::text = 'percentage' THEN o.rule_percentage::int END,
             CASE WHEN o.rule_type::text = 'flat' THEN o.rule_amount_paise::int END,
             CASE WHEN o.rule_type::text = 'combo_price' THEN o.rule_combo_price_paise::int END,
             (o.valid_from AT TIME ZONE 'Asia/Kolkata')::date,
             (o.valid_until AT TIME ZONE 'Asia/Kolkata')::date,
             coalesce(o.active, true), nullif(btrim(o.rule_terms), ''), NULL,
             round(coalesce(o."order", 0))::int, o.id, o.show_on_website,
             o.created_at, o.updated_at
        FROM cms.offer o
       WHERE o.id = ${cmsId}
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description,
        offer_type = EXCLUDED.offer_type, discount_percentage = EXCLUDED.discount_percentage,
        discount_amount_paise = EXCLUDED.discount_amount_paise,
        combo_price_paise = EXCLUDED.combo_price_paise, start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date, is_active = EXCLUDED.is_active, terms = EXCLUDED.terms,
        image_url = EXCLUDED.image_url, display_order = EXCLUDED.display_order,
        cms_id = EXCLUDED.cms_id, show_on_website = EXCLUDED.show_on_website,
        updated_at = EXCLUDED.updated_at`),
    db.execute(sql`DELETE FROM offer_service WHERE offer_id = ${id}`),
    db.execute(sql`
      INSERT INTO offer_service (offer_id, service_id)
      SELECT DISTINCT 'cms_offer_' || r.parent_id, r.service_id
        FROM cms.offer_rels r
       WHERE r.parent_id = ${cmsId} AND r.path = 'rule.services' AND r.service_id IS NOT NULL`),
  ])
  return existed > 0 ? 'updated' : 'created'
}

/**
 * Copy one CMS row into its mirror, in one transaction, while the CMS row is
 * still at `cmsUpdatedAt`. Throws 409 CATALOGUE_CHANGED when it moved on or is
 * gone, and 409 CONFLICT, naming what to fix, when a dependency is missing; in
 * both cases nothing is written.
 */
export async function resyncCatalogueRecord(record: CatalogueResyncRecord): Promise<ResyncAction> {
  switch (record.table) {
    case 'service_category':
      return resyncCategory(record.id, record.cmsUpdatedAt)
    case 'service':
      return resyncService(record.id, record.cmsUpdatedAt)
    case 'offer':
      return resyncOffer(record.id, record.cmsUpdatedAt)
    default: {
      const never: never = record.table
      throw new Error(`Unknown catalogue table ${String(never)}`)
    }
  }
}
