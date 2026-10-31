/************************************************************
 * Module Name  : service-drift.integration.test
 * Scope        : Integration test — catalogue drift snapshot (REAL db)
 *
 * Description  : Against Neon dev, with the Payload migration
 *                `catalogue_tax_versions_availability` and app migrations
 *                0033–0034: both sides of the snapshot read the same fields,
 *                including the SAC code and branch availability, and a
 *                restriction written to one side only is reported as drift.
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Changes one real category's public availability inside a
 *                try/finally and restores it; nothing is inserted.
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
})
