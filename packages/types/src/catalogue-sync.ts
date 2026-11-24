/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : catalogue-sync (types)
 * Scope        : Shared Types & Validation — Developer catalogue resync
 *                (multi-branch R4.7, catalogue-resync.md)
 *
 * Description  : The request that copies Payload's current catalogue rows
 *                into their app mirrors, record by record, each named with
 *                the CMS revision the drift report showed.
 *
 * Responsibilities :
 * - CATALOGUE_SYNC_TABLES: the mirrored record kinds
 * - MAX_RESYNC_RECORDS: the bound on one request
 * - catalogueResyncSchema: POST /api/catalogue-sync
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : `cmsUpdatedAt` is the CMS row's `updated_at` to the
 *                millisecond; the write refuses a row saved since (409).
 ************************************************************/
import { z } from 'zod'

/** The catalogue records Payload mirrors into the app's tables. */
export const CATALOGUE_SYNC_TABLES = ['service_category', 'service', 'offer'] as const
export type CatalogueSyncTable = (typeof CATALOGUE_SYNC_TABLES)[number]

/** The most records one resync request may name. */
export const MAX_RESYNC_RECORDS = 25

export const catalogueResyncRecordSchema = z.object({
  table: z.enum(CATALOGUE_SYNC_TABLES),
  // The mirror's id: the CMS id for services and categories, and
  // `cms_offer_<cms id>` for offers.
  id: z.string().trim().min(1).max(200),
  cmsUpdatedAt: z.string().datetime(),
})
export type CatalogueResyncRecord = z.infer<typeof catalogueResyncRecordSchema>

export const catalogueResyncSchema = z.object({
  records: z.array(catalogueResyncRecordSchema).min(1).max(MAX_RESYNC_RECORDS),
})
export type CatalogueResyncInput = z.infer<typeof catalogueResyncSchema>
