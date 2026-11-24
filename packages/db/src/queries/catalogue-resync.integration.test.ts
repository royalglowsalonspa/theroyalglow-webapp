/************************************************************
 * Module Name  : catalogue-resync.integration.test
 * Scope        : Integration test — Developer catalogue resync (REAL db,
 *                multi-branch R4.7, catalogue-resync.md)
 *
 * Description  : Against Neon dev, with CMS rows written straight to the
 *                `cms` tables as a sync that never ran leaves them:
 *                  - the missing mirrors are created from the CMS rows (a
 *                    service only once its category is mirrored), and the
 *                    drift read then sees both sides alike;
 *                  - a mirror edited out of band is put back, and a rerun
 *                    changes nothing;
 *                  - a revision the CMS has moved on from, or a CMS row that
 *                    is gone, is refused with CATALOGUE_CHANGED, writing
 *                    nothing, also when a CMS save holds the row meanwhile;
 *                  - unknown branches and unmirrored services are refused,
 *                    named;
 *                  - an offer whose rule is gone has its mirror retired.
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Prefixed `crs_it_<run>` CMS and public rows, plus the CMS
 *                offer's serial id and its mirror, deleted in afterAll; zero
 *                residue is proven.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import {
  isLiveDbAvailable,
  queryRow,
  queryRows,
  requireOperationalPrimaryBranchId,
} from '../test/live-db'
import { getCmsRevisions, resyncCatalogueRecord } from './catalogue-resync'
import { getServiceDriftSnapshot } from './service-drift'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `crs_it_${RUN}`
const CATEGORY = `${PREFIX}_cat`
const SERVICE = `${PREFIX}_svc`
// A CMS service that is never mirrored.
const UNMIRRORED = `${PREFIX}_svc_cms_only`
const SAVED = '2026-11-21T06:00:00.000Z'

let branchId: string
let offerCmsId = 0
let offerId = ''

async function revision(table: 'service_category' | 'service' | 'offer', id: string) {
  const revisions = await getCmsRevisions()
  const found = revisions[table][id]
  if (!found) {
    throw new Error(`no CMS revision for ${table} ${id}`)
  }
  return found
}

/** The AppError's `code: message`, or 'written'. */
async function outcome(write: Promise<unknown>): Promise<string> {
  try {
    await write
  } catch (error) {
    const e = error as { code?: unknown; message?: unknown }
    return `${String(e.code)}: ${String(e.message)}`
  }
  return 'written'
}

/** Both sides of the drift read for one record. */
async function sides(table: 'service_category' | 'service' | 'offer', id: string) {
  const snapshot = await getServiceDriftSnapshot()
  if (table === 'offer') {
    return {
      cms: snapshot.offers.ruleRows.find((row) => row.id === id),
      mirror: snapshot.offers.publicRows.find((row) => row.id === id),
    }
  }
  const pair = table === 'service' ? snapshot.services : snapshot.categories
  return {
    cms: pair.cmsRows.find((row) => row.id === id),
    mirror: pair.publicRows.find((row) => row.id === id),
  }
}

describe.skipIf(!LIVE)('Developer catalogue resync against a live database', () => {
  beforeAll(async () => {
    // A branch must exist for the category's selected availability.
    branchId = await requireOperationalPrimaryBranchId()
    await db.batch([
      db.execute(sql`
        insert into cms.service_category (id, name, slug, service_type, sac_code, availability,
                                          display_order, is_active, created_at, updated_at)
        values (${CATEGORY}, 'ZZ Resync IT category', ${CATEGORY}, 'salon', '999721', 'selected',
                990, true, ${SAVED}, ${SAVED})`),
      db.execute(sql`
        insert into cms.service_category_texts ("order", parent_id, path, text)
        values (1, ${CATEGORY}, 'availableBranches', ${branchId})`),
      db.execute(sql`
        insert into cms.service (id, category_id_id, name, slug, duration_minutes, buffer_minutes,
                                 price_paise, is_active, display_order, gems_redeemable,
                                 availability, created_at, updated_at)
        values (${SERVICE}, ${CATEGORY}, 'ZZ Resync IT service', ${SERVICE}, '30', 5, 50000, true,
                990, false, 'all', ${SAVED}, ${SAVED}),
               (${UNMIRRORED}, ${CATEGORY}, 'ZZ Resync IT CMS-only service', ${UNMIRRORED}, '30',
                0, 40000, true, 991, false, 'all', ${SAVED}, ${SAVED})`),
    ])
    const created = await queryRow<{ id: number }>(sql`
      insert into cms.offer (title, active, valid_from, valid_until, "order", show_on_website,
                             rule_type, rule_amount_paise, rule_terms, created_at, updated_at)
      values ('ZZ Resync IT offer', true, '2099-01-01T00:00:00+05:30',
              '2099-01-31T23:59:00+05:30', 1, true, 'flat', 20000, ' ZZ terms ', ${SAVED}, ${SAVED})
      returning id`)
    offerCmsId = Number(created?.id)
    offerId = `cms_offer_${offerCmsId}`
    await db.execute(sql`
      insert into cms.offer_rels ("order", parent_id, path, service_id)
      values (1, ${offerCmsId}, 'rule.services', ${SERVICE})`)
  }, 60_000)

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(sql`delete from offer_service where offer_id = ${offerId}`),
      db.execute(sql`delete from offer where id = ${offerId}`),
      db.execute(sql`delete from service_branch where service_id like ${like}`),
      db.execute(sql`delete from service where id like ${like}`),
      db.execute(sql`delete from service_category_branch where category_id like ${like}`),
      db.execute(sql`delete from service_category where id like ${like}`),
      db.execute(sql`delete from cms.offer where id = ${offerCmsId}`),
      db.execute(sql`delete from cms.service_texts where parent_id like ${like}`),
      db.execute(sql`delete from cms.service where id like ${like}`),
      db.execute(sql`delete from cms.service_category_texts where parent_id like ${like}`),
      db.execute(sql`delete from cms.service_category where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from cms.service_category where id like ${like}) as cms_categories,
               (select count(*) from cms.service where id like ${like}) as cms_services,
               (select count(*) from cms.offer where id = ${offerCmsId}) as cms_offers,
               (select count(*) from cms.offer_rels where parent_id = ${offerCmsId}) as cms_rels,
               (select count(*) from service_category where id like ${like}) as categories,
               (select count(*) from service where id like ${like}) as services,
               (select count(*) from offer where id = ${offerId}) as offers`),
    ).toEqual({
      cms_categories: '0',
      cms_services: '0',
      cms_offers: '0',
      cms_rels: '0',
      categories: '0',
      services: '0',
      offers: '0',
    })
  }, 60_000)

  it('creates the missing mirrors from the CMS rows, a service once its category is mirrored', {
    timeout: 60_000,
  }, async () => {
    expect(
      await outcome(
        resyncCatalogueRecord({
          table: 'service',
          id: SERVICE,
          cmsUpdatedAt: await revision('service', SERVICE),
        }),
      ),
    ).toBe(
      `CONFLICT: Its category ${CATEGORY} has no mirror yet. Resync the category first, or with it.`,
    )
    expect(await queryRow(sql`select id from service where id = ${SERVICE}`)).toBeNull()

    expect(
      await resyncCatalogueRecord({
        table: 'service_category',
        id: CATEGORY,
        cmsUpdatedAt: await revision('service_category', CATEGORY),
      }),
    ).toBe('created')
    expect(
      await resyncCatalogueRecord({
        table: 'service',
        id: SERVICE,
        cmsUpdatedAt: await revision('service', SERVICE),
      }),
    ).toBe('created')
    expect(
      await resyncCatalogueRecord({
        table: 'offer',
        id: offerId,
        cmsUpdatedAt: await revision('offer', offerId),
      }),
    ).toBe('created')

    expect(
      await queryRows(
        sql`select branch_id from service_category_branch where category_id = ${CATEGORY}`,
      ),
    ).toEqual([{ branch_id: branchId }])
    expect(
      await queryRows(sql`select service_id from offer_service where offer_id = ${offerId}`),
    ).toEqual([{ service_id: SERVICE }])

    // The drift read sees each record alike on both sides, timestamps too.
    for (const [table, id] of [
      ['service_category', CATEGORY],
      ['service', SERVICE],
      ['offer', offerId],
    ] as const) {
      const { cms, mirror } = await sides(table, id)
      expect(cms).toBeDefined()
      expect(mirror).toEqual(cms)
    }
  })

  it('puts back a mirror edited out of band, and a rerun changes nothing', {
    timeout: 60_000,
  }, async () => {
    await db.execute(
      sql`update service set price_paise = 1, is_active = false where id = ${SERVICE}`,
    )
    const record = {
      table: 'service' as const,
      id: SERVICE,
      cmsUpdatedAt: await revision('service', SERVICE),
    }
    expect(await resyncCatalogueRecord(record)).toBe('updated')
    expect(await resyncCatalogueRecord(record)).toBe('updated')

    const { cms, mirror } = await sides('service', SERVICE)
    expect(mirror).toEqual(cms)
    expect(mirror).toMatchObject({ pricePaise: 50_000, isActive: true, bufferMinutes: 5 })
  })

  it('refuses a revision the CMS has moved on from, or a CMS row that is gone, writing nothing', {
    timeout: 60_000,
  }, async () => {
    const stale = await revision('service', SERVICE)
    await db.execute(sql`
      update cms.service set price_paise = 60000, updated_at = updated_at + interval '1 second'
       where id = ${SERVICE}`)

    expect(
      await outcome(resyncCatalogueRecord({ table: 'service', id: SERVICE, cmsUpdatedAt: stale })),
    ).toMatch(/^CATALOGUE_CHANGED: This record changed in the CMS/)
    expect(await queryRow(sql`select price_paise from service where id = ${SERVICE}`)).toEqual({
      price_paise: 50_000,
    })

    expect(
      await outcome(
        resyncCatalogueRecord({ table: 'service', id: `${PREFIX}_gone`, cmsUpdatedAt: stale }),
      ),
    ).toMatch(/^CATALOGUE_CHANGED: /)
    expect(
      await outcome(
        resyncCatalogueRecord({ table: 'offer', id: 'cms_offer_999999999', cmsUpdatedAt: stale }),
      ),
    ).toMatch(/^CATALOGUE_CHANGED: /)

    // With the current revision it goes through.
    expect(
      await resyncCatalogueRecord({
        table: 'service',
        id: SERVICE,
        cmsUpdatedAt: await revision('service', SERVICE),
      }),
    ).toBe('updated')
    expect(await queryRow(sql`select price_paise from service where id = ${SERVICE}`)).toEqual({
      price_paise: 60_000,
    })
  })

  it('waits for a CMS save holding the row, then refuses the revision it replaced', {
    timeout: 60_000,
  }, async () => {
    const before = await revision('service', SERVICE)
    // A CMS save: it changes the row and holds it for two seconds.
    const save = db.batch([
      db.execute(sql`
        update cms.service set price_paise = 65000, updated_at = updated_at + interval '1 second'
         where id = ${SERVICE}`),
      db.execute(sql`select pg_sleep(2)`),
    ])
    await new Promise((resolve) => setTimeout(resolve, 700))
    const repair = outcome(
      resyncCatalogueRecord({ table: 'service', id: SERVICE, cmsUpdatedAt: before }),
    )
    await save
    expect(await repair).toMatch(/^CATALOGUE_CHANGED: /)
    expect(await queryRow(sql`select price_paise from service where id = ${SERVICE}`)).toEqual({
      price_paise: 60_000,
    })
  })

  it('refuses unknown branches and unmirrored services, naming them', {
    timeout: 60_000,
  }, async () => {
    await db.execute(sql`
      insert into cms.service_category_texts ("order", parent_id, path, text)
      values (2, ${CATEGORY}, 'availableBranches', ${`${PREFIX}_no_branch`})`)
    expect(
      await outcome(
        resyncCatalogueRecord({
          table: 'service_category',
          id: CATEGORY,
          cmsUpdatedAt: await revision('service_category', CATEGORY),
        }),
      ),
    ).toBe(
      `CONFLICT: The CMS lists branches that don't exist: ${PREFIX}_no_branch. Edit the category in the CMS.`,
    )
    await db.execute(sql`
      delete from cms.service_category_texts
       where parent_id = ${CATEGORY} and text = ${`${PREFIX}_no_branch`}`)

    await db.execute(sql`
      insert into cms.offer_rels ("order", parent_id, path, service_id)
      values (2, ${offerCmsId}, 'rule.services', ${UNMIRRORED})`)
    expect(
      await outcome(
        resyncCatalogueRecord({
          table: 'offer',
          id: offerId,
          cmsUpdatedAt: await revision('offer', offerId),
        }),
      ),
    ).toBe(
      `CONFLICT: Its services have no mirror yet: ${UNMIRRORED}. Resync them first, or with it.`,
    )
    await db.execute(sql`
      delete from cms.offer_rels where parent_id = ${offerCmsId} and service_id = ${UNMIRRORED}`)

    expect(
      await outcome(resyncCatalogueRecord({ table: 'offer', id: 'promo_1', cmsUpdatedAt: SAVED })),
    ).toBe("CONFLICT: promo_1 isn't the mirror of a CMS offer.")
  })

  it('retires the mirror of an offer whose rule is gone, keeping its last rule', {
    timeout: 60_000,
  }, async () => {
    await db.execute(sql`
      update cms.offer set rule_type = 'none', updated_at = updated_at + interval '1 second'
       where id = ${offerCmsId}`)
    const record = {
      table: 'offer' as const,
      id: offerId,
      cmsUpdatedAt: await revision('offer', offerId),
    }
    expect(await resyncCatalogueRecord(record)).toBe('retired')
    expect(await resyncCatalogueRecord(record)).toBe('unchanged')
    expect(
      await queryRow(sql`
        select is_active, offer_type::text as offer_type, discount_amount_paise
          from offer where id = ${offerId}`),
    ).toEqual({ is_active: false, offer_type: 'flat', discount_amount_paise: 20_000 })

    const snapshot = await getServiceDriftSnapshot()
    expect(snapshot.offers.ruleFreeIds).toContain(offerId)
  })
})
