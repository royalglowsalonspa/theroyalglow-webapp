/************************************************************
 * Module Name  : service-drift.integration.test
 * Scope        : Integration test — catalogue drift snapshot (REAL db)
 *
 * Description  : Against Neon dev, with the Payload migrations
 *                `catalogue_tax_versions_availability` and
 *                `offer_checkout_rules` and app migrations 0033–0036: both
 *                sides of the snapshot read the same fields, including the
 *                SAC code and branch availability, and a restriction written
 *                to one side only is reported as drift. A Payload checkout
 *                rule reads as its mirror would be written: missing until
 *                the mirror exists, then field for field the same.
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Changes one real category's public availability inside a
 *                try/finally and restores it. One `ZZ Drift IT` CMS offer
 *                and its mirror are inserted, then deleted in a finally, and
 *                zero residue is proven.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../index'
import { isLiveDbAvailable, queryRow } from '../test/live-db'
import { getServiceDriftSnapshot, type ServiceDriftSnapshot } from './service-drift'

const LIVE = isLiveDbAvailable()
const TIMEOUT = { timeout: 60_000 }
const NEW_FIELDS = ['sacCode', 'allBranches', 'branchIds'] as const

/**
 * Differences on the new fields only, row by row (the job's differ lives in
 * @rgss/business, which this package can't import), so unrelated dev drift
 * can't fail this.
 */
function newFieldFindings(snapshot: ServiceDriftSnapshot) {
  const findings: {
    table: string
    id: string
    field: string
    cmsValue: unknown
    publicValue: unknown
  }[] = []
  const pairs = [
    ['service_category', snapshot.categories],
    ['service', snapshot.services],
  ] as const
  for (const [table, pair] of pairs) {
    const publicById = new Map<string, Record<string, unknown>>(
      pair.publicRows.map((row) => [row.id, row]),
    )
    for (const row of pair.cmsRows as Record<string, unknown>[]) {
      const other = publicById.get(String(row.id))
      if (!other) {
        continue
      }
      for (const field of NEW_FIELDS) {
        if (row[field] !== other[field]) {
          findings.push({
            table,
            id: String(row.id),
            field,
            cmsValue: row[field],
            publicValue: other[field],
          })
        }
      }
    }
  }
  return findings
}

describe.skipIf(!LIVE)('catalogue drift snapshot against a live database', () => {
  it('reads the SAC code and availability on both sides, alike when in sync', TIMEOUT, async () => {
    const snapshot = await getServiceDriftSnapshot()
    expect(snapshot.categories.cmsRows.length).toBeGreaterThan(0)
    const cms = snapshot.categories.cmsRows[0]
    const pub = snapshot.categories.publicRows.find((r) => r.id === cms?.id)
    expect(cms).toMatchObject({ allBranches: expect.any(Boolean) })
    expect(cms?.sacCode).toMatch(/^\d{6}$/)
    expect(pub).toMatchObject({ sacCode: cms?.sacCode, allBranches: cms?.allBranches })
    expect(newFieldFindings(snapshot)).toEqual([])
  })

  it('reports a restriction written to the public side only', TIMEOUT, async () => {
    const target = await queryRow<{ id: string }>(sql`
      select c.id from service_category c join cms.service_category m on m.id = c.id
       where c.all_branches order by c.id limit 1`)
    expect(target).not.toBeNull()
    const id = target?.id ?? ''
    try {
      await db.batch([
        db.execute(sql`update service_category set all_branches = false where id = ${id}`),
        db.execute(sql`
          insert into service_category_branch (category_id, branch_id)
          values (${id}, 'branch_rayasandra')`),
      ])
      const findings = newFieldFindings(await getServiceDriftSnapshot())
      expect(findings).toEqual([
        expect.objectContaining({
          table: 'service_category',
          id,
          field: 'allBranches',
          cmsValue: true,
          publicValue: false,
        }),
        expect.objectContaining({
          table: 'service_category',
          id,
          field: 'branchIds',
          cmsValue: null,
          publicValue: 'branch_rayasandra',
        }),
      ])
    } finally {
      await db.batch([
        db.execute(sql`delete from service_category_branch where category_id = ${id}`),
        db.execute(sql`update service_category set all_branches = true where id = ${id}`),
      ])
    }
    expect(
      await queryRow(sql`
        select (select count(*) from service_category_branch where category_id = ${id}) as rows,
               (select all_branches from service_category where id = ${id}) as all_branches`),
    ).toEqual({ rows: '0', all_branches: true })
  })

  it(
    'reads a Payload checkout rule as its mirror: missing, then alike once mirrored',
    TIMEOUT,
    async () => {
      const service = await queryRow<{ id: string }>(sql`
      select s.id from service s join cms.service m on m.id = s.id
       where s.is_active order by s.id limit 1`)
      expect(service).not.toBeNull()
      const serviceId = service?.id ?? ''
      // Written straight to the CMS table, as a sync that never ran leaves it:
      // padded terms, a fractional order and IST-midnight dates to normalise.
      const created = await queryRow<{ id: number }>(sql`
      insert into cms.offer (title, active, valid_from, valid_until, "order", show_on_website,
                             rule_type, rule_amount_paise, rule_terms)
      values ('ZZ Drift IT offer', true, '2099-01-01T00:00:00+05:30', '2099-01-31T23:59:00+05:30',
              2.4, false, 'flat', 20000, '  ZZ Drift IT terms  ')
      returning id`)
      const cmsId = Number(created?.id)
      const id = `cms_offer_${cmsId}`
      try {
        await db.execute(sql`
        insert into cms.offer_rels ("order", parent_id, path, service_id)
        values (1, ${cmsId}, 'rule.services', ${serviceId})`)

        const before = await getServiceDriftSnapshot()
        const rule = before.offers.ruleRows.find((row) => row.id === id)
        expect(rule).toEqual({
          id,
          name: 'ZZ Drift IT offer',
          description: null,
          offerType: 'flat',
          discountPercentage: null,
          discountAmountPaise: 20_000,
          comboPricePaise: null,
          startDate: '2099-01-01',
          endDate: '2099-01-31',
          isActive: true,
          terms: 'ZZ Drift IT terms',
          displayOrder: 2,
          showOnWebsite: false,
          serviceIds: serviceId,
        })
        expect(before.offers.ruleFreeIds).not.toContain(id)
        expect(before.offers.publicRows.find((row) => row.id === id)).toBeUndefined()

        // The mirror the sync hook (apps/cms/src/hooks/sync-offer.ts) writes.
        await db.batch([
          db.execute(sql`
          insert into offer (id, name, slug, offer_type, discount_amount_paise, start_date,
                             end_date, is_active, terms, display_order, cms_id, show_on_website)
          values (${id}, 'ZZ Drift IT offer', ${`cms-offer-${cmsId}`}, 'flat', 20000,
                  '2099-01-01', '2099-01-31', true, 'ZZ Drift IT terms', 2, ${cmsId}, false)`),
          db.execute(
            sql`insert into offer_service (offer_id, service_id) values (${id}, ${serviceId})`,
          ),
        ])
        const after = await getServiceDriftSnapshot()
        expect(after.offers.publicRows.find((row) => row.id === id)).toEqual(rule)
      } finally {
        // The rels go with their offer (ON DELETE CASCADE).
        await db.batch([
          db.execute(sql`delete from offer_service where offer_id = ${id}`),
          db.execute(sql`delete from offer where id = ${id}`),
          db.execute(sql`delete from cms.offer where id = ${cmsId}`),
        ])
      }
      expect(
        await queryRow(sql`
        select (select count(*) from cms.offer where id = ${cmsId}) as cms,
               (select count(*) from cms.offer_rels where parent_id = ${cmsId}) as rels,
               (select count(*) from offer where id = ${id}) as mirrors`),
      ).toEqual({ cms: '0', rels: '0', mirrors: '0' })
    },
  )
})
