/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : seed-services.test
 * Scope        : CMS Operations Script — Catalogue Seed
 *
 * Validates    : Requirements 11.4, 3.7, 3.12
 *
 * Description  : Tests for `scripts/seed-services.ts`. The pre-flight guards are
 *                asserted directly (pure, no database), and the seeded outcome is
 *                asserted against the live `dev` branch: every `public.*` row has
 *                a matching CMS document with the SAME id and the SAME createdAt,
 *                and a re-run is a no-op.
 *
 * Responsibilities :
 * - Assert the script refuses to run unless SERVICE_SYNC_ENABLED === 'false'
 * - Assert each pre-flight violation class is reported, listing every offender
 * - Assert `public.*` ↔ `cms.*` id parity and createdAt preservation
 * - Assert categories were seeded before services (no orphaned relationships)
 * - Assert idempotency: a second run creates 0 and reports N already present
 *
 * Features / Functionality :
 * - The guard tests need NO database and run everywhere, including CI
 * - The live tests skip cleanly when no database is configured
 * - Idempotency is proven by actually re-running the script as a subprocess
 *
 * Tech Stack   : TypeScript, Vitest, Payload CMS v3, Drizzle ORM, PostgreSQL
 * Layer        : CMS (Scripts — test)
 *
 * Dependencies : vitest, drizzle-orm, node:child_process, ../lib/seed-validation,
 *                ../../src/test/live-payload
 *
 * Notes        :
 * - The live assertions EXCLUDE `zz`-prefixed ids so they describe the real
 *   catalogue only and cannot be perturbed by another suite's throwaway rows.
 * - Nothing here mutates the catalogue. The re-run is a genuine no-op on an
 *   already-seeded branch: every id is in the CMS skip-set.
 ************************************************************/

import { spawnSync } from 'node:child_process'
import { sql } from 'drizzle-orm'
import type { Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { bootPayload, CMS_ROOT, isLiveDbAvailable, queryRows } from '../../src/test/live-payload'
import {
  assertSeedable,
  assertSyncDisabled,
  collectSeedProblems,
  type DrizzleCategoryRow,
  type DrizzleServiceRow,
} from '../lib/seed-validation'

const NOW = new Date('2026-06-01T10:00:00.000Z')

function category(overrides: Partial<DrizzleCategoryRow> = {}): DrizzleCategoryRow {
  return {
    id: 'cat_hair',
    name: 'Hair Care',
    slug: 'hair-care',
    description: null,
    serviceType: 'salon',
    displayOrder: 0,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function svc(overrides: Partial<DrizzleServiceRow> = {}): DrizzleServiceRow {
  return {
    id: 'svc_haircut',
    categoryId: 'cat_hair',
    name: 'Haircut',
    slug: 'haircut',
    description: null,
    durationMinutes: 30,
    bufferMinutes: 0,
    pricePaise: 30_000,
    isActive: true,
    imageUrl: null,
    displayOrder: 0,
    gemsRedeemable: false,
    gemsRequired: null,
    gemsCatalogueOrder: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('seed guard: assertSyncDisabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses to run when the flag is unset (sync defaults to ENABLED)', () => {
    vi.stubEnv('SERVICE_SYNC_ENABLED', undefined)

    expect(() => assertSyncDisabled()).toThrow(/Refusing to seed with the service sync ENABLED/)
  })

  it('refuses to run when the flag is "true"', () => {
    vi.stubEnv('SERVICE_SYNC_ENABLED', 'true')

    expect(() => assertSyncDisabled()).toThrow(/Refusing to seed/)
  })

  it('refuses to run for any value other than the literal "false"', () => {
    // `isSyncEnabled()` treats only the exact string 'false' as disabled, so a
    // typo like 'FALSE' must NOT be read as permission to seed.
    vi.stubEnv('SERVICE_SYNC_ENABLED', 'FALSE')

    expect(() => assertSyncDisabled()).toThrow(/Refusing to seed/)
  })

  it('allows the run when the flag is exactly "false"', () => {
    vi.stubEnv('SERVICE_SYNC_ENABLED', 'false')

    expect(() => assertSyncDisabled()).not.toThrow()
  })
})

describe('seed guard: pre-flight validation', () => {
  it('accepts a catalogue every row of which the CMS can represent', () => {
    const categories = [category(), category({ id: 'cat_spa', slug: 'spa', serviceType: 'spa' })]
    const services = [
      svc(),
      svc({ id: 'svc_keratin', slug: 'keratin', durationMinutes: 180 }),
      svc({ id: 'svc_facial', slug: 'facial', durationMinutes: 45 }),
      svc({
        id: 'svc_massage',
        slug: 'massage',
        categoryId: 'cat_spa',
        durationMinutes: 120,
        gemsRedeemable: true,
        gemsRequired: 40,
      }),
    ]

    expect(collectSeedProblems(categories, services)).toEqual([])
    expect(() => assertSeedable(categories, services)).not.toThrow()
  })

  it('rejects a duration outside SERVICE_DURATION_MINUTES, naming the offender', () => {
    const problems = collectSeedProblems(
      [category()],
      [svc({ id: 'svc_odd', slug: 'odd-duration', durationMinutes: 75 })],
    )

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('svc_odd')
    expect(problems[0]).toContain('odd-duration')
    expect(problems[0]).toContain('durationMinutes=75')
    expect(problems[0]).toContain('SERVICE_DURATION_MINUTES')
  })

  it('rejects gemsRedeemable with a non-positive gemsRequired', () => {
    const zero = collectSeedProblems(
      [category()],
      [svc({ id: 'svc_zero', slug: 'zero-gems', gemsRedeemable: true, gemsRequired: 0 })],
    )
    const missing = collectSeedProblems(
      [category()],
      [svc({ id: 'svc_null', slug: 'null-gems', gemsRedeemable: true, gemsRequired: null })],
    )
    const negative = collectSeedProblems(
      [category()],
      [svc({ id: 'svc_neg', slug: 'neg-gems', gemsRedeemable: true, gemsRequired: -5 })],
    )

    expect(zero[0]).toMatch(/svc_zero.*gemsRedeemable is true but gemsRequired=0/)
    expect(missing[0]).toMatch(/svc_null.*gemsRequired=null/)
    expect(negative[0]).toMatch(/svc_neg.*gemsRequired=-5/)
  })

  it('accepts gemsRedeemable=false regardless of gemsRequired', () => {
    expect(
      collectSeedProblems([category()], [svc({ gemsRedeemable: false, gemsRequired: null })]),
    ).toEqual([])
  })

  it('rejects a categoryId with no matching category', () => {
    const problems = collectSeedProblems(
      [category()],
      [svc({ id: 'svc_orphan', slug: 'orphan', categoryId: 'cat_missing' })],
    )

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('svc_orphan')
    expect(problems[0]).toContain('categoryId=cat_missing')
    expect(problems[0]).toContain('public.service_category')
  })

  it('reports EVERY offender in one throw rather than failing on the first', () => {
    const services = [
      svc({ id: 'svc_a', slug: 'a', durationMinutes: 75 }),
      svc({ id: 'svc_b', slug: 'b', gemsRedeemable: true, gemsRequired: 0 }),
      svc({ id: 'svc_c', slug: 'c', categoryId: 'cat_missing' }),
      // One row breaking two rules at once counts twice.
      svc({ id: 'svc_d', slug: 'd', durationMinutes: 7, categoryId: 'cat_missing' }),
    ]

    const problems = collectSeedProblems([category()], services)
    expect(problems).toHaveLength(5)

    let thrown: unknown
    try {
      assertSeedable([category()], services)
    } catch (error) {
      thrown = error
    }

    const message = thrown instanceof Error ? thrown.message : String(thrown)
    expect(message).toContain('Refusing to seed: 5 row(s)')
    for (const id of ['svc_a', 'svc_b', 'svc_c', 'svc_d']) {
      expect(message).toContain(id)
    }
    // The message tells the operator how to fix it, not just that it broke.
    expect(message).toContain('packages/types/src/service.ts')
  })
})

const live = isLiveDbAvailable()

describe.skipIf(!live)('seeded catalogue (integration — live dev branch)', () => {
  let payload: Payload

  /**
   * Run the seed script exactly the way the runbook does. `omitFlag` drops
   * SERVICE_SYNC_ENABLED entirely, which is how the refusal path is reached.
   */
  function runSeed({ omitFlag = false }: { omitFlag?: boolean } = {}) {
    // `NodeJS.ProcessEnv`, not a plain record: Next.js augments it with a
    // required NODE_ENV, so a looser type is not assignable to spawnSync's env.
    const env: NodeJS.ProcessEnv = { ...process.env }
    if (omitFlag) {
      delete env.SERVICE_SYNC_ENABLED
    } else {
      env.SERVICE_SYNC_ENABLED = 'false'
    }

    // No `shell: true` — the arguments are fixed literals, but spawning through
    // a shell concatenates rather than escapes them, which Node flags as an
    // injection risk. Naming the executable explicitly keeps the shell out of it.
    const bun = process.platform === 'win32' ? 'bun.exe' : 'bun'

    return spawnSync(bun, ['run', '--env-file=.env.local', 'scripts/seed-services.ts'], {
      cwd: CMS_ROOT,
      encoding: 'utf8',
      env,
      timeout: 300_000,
    })
  }

  beforeAll(async () => {
    payload = await bootPayload()
  }, 180_000)

  it('gives every public.service_category row a CMS document with the same id and createdAt', async () => {
    // `zz`-prefixed ids are throwaway rows owned by other suites; the real
    // catalogue is what this asserts on.
    const rows = await queryRows(
      payload,
      sql`select p.id                as id,
                 p.created_at        as public_created_at,
                 c.id                as cms_id,
                 c.created_at        as cms_created_at
            from public.service_category p
            left join cms.service_category c on c.id = p.id
           where p.id not like ${'zz%'}
           order by p.id`,
    )

    expect(rows.length).toBeGreaterThan(0)

    const unseeded = rows.filter((row) => row.cms_id === null)
    expect(unseeded.map((row) => row.id)).toEqual([])

    for (const row of rows) {
      expect(new Date(row.cms_created_at as string).toISOString()).toBe(
        new Date(row.public_created_at as string).toISOString(),
      )
    }
  }, 120_000)

  it('gives every public.service row a CMS document with the same id and createdAt', async () => {
    const rows = await queryRows(
      payload,
      sql`select p.id                as id,
                 p.created_at        as public_created_at,
                 c.id                as cms_id,
                 c.created_at        as cms_created_at,
                 p.duration_minutes  as public_duration,
                 c.duration_minutes  as cms_duration
            from public.service p
            left join cms.service c on c.id = p.id
           where p.id not like ${'zz%'}
           order by p.id`,
    )

    expect(rows.length).toBeGreaterThan(0)

    const unseeded = rows.filter((row) => row.cms_id === null)
    expect(unseeded.map((row) => row.id)).toEqual([])

    for (const row of rows) {
      expect(new Date(row.cms_created_at as string).toISOString()).toBe(
        new Date(row.public_created_at as string).toISOString(),
      )
      // cms stores the Payload `select` value as text, public stores an integer —
      // the seed must have written the same duration on both sides.
      expect(Number(row.cms_duration)).toBe(Number(row.public_duration))
    }
  }, 120_000)

  it('seeded categories before services — no CMS service references a missing category', async () => {
    // This is the observable consequence of the ordering: `Service.categoryId` is
    // a Payload relationship, so a service created before its category would
    // have been REJECTED outright. A fully-resolvable relationship graph across
    // the whole catalogue is what "categories first" leaves behind.
    const [row] = await queryRows(
      payload,
      sql`select count(*)::int as orphans
            from cms.service s
            left join cms.service_category c on c.id = s.category_id_id
           where s.id not like ${'zz%'}
             and c.id is null`,
    )

    expect(row?.orphans).toBe(0)
  }, 120_000)

  it('is idempotent: a re-run creates 0 and reports every row already present', async () => {
    const [counts] = await queryRows(
      payload,
      sql`select
            (select count(*) from public.service where id not like ${'zz%'})::int          as services,
            (select count(*) from public.service_category where id not like ${'zz%'})::int as categories`,
    )

    const result = runSeed()
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status, `seed exited ${result.status}\n${output}`).toBe(0)
    expect(output).toContain('Seed complete.')
    expect(output).toMatch(
      new RegExp(`categories\\s*:\\s*0 created, ${counts?.categories} already present`),
    )
    expect(output).toMatch(
      new RegExp(`services\\s*:\\s*0 created, ${counts?.services} already present`),
    )
  }, 420_000)

  it('refuses to run when SERVICE_SYNC_ENABLED is not "false"', () => {
    const result = runSeed({ omitFlag: true })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status).not.toBe(0)
    expect(output).toContain('Refusing to seed with the service sync ENABLED')
    // It must fail BEFORE touching Payload, so nothing can be half-written.
    expect(output).not.toContain('Seed complete.')
  }, 300_000)
})
