// @vitest-environment node
/************************************************************
 * Module Name  : catalogue-sync route.test
 * Scope        : API — Developer catalogue resync (multi-branch R4.7,
 *                catalogue-resync.md)
 *
 * Description  : GET /api/catalogue-sync reports the drift one record at a
 *                time, with its CMS revision and whether a resync can repair
 *                it; POST resyncs the named records in dependency order,
 *                reports each outcome (written, changed, refused, failed) and
 *                what a fresh read still finds, and audits every attempt.
 *                Both are Developer only.
 *
 * Approach     : requireRole, the audit helper and @rgss/db/queries are
 *                mocked; @rgss/business stays REAL.
 ************************************************************/

import { AppError, conflict, ERROR_CODES, forbidden } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))
const auditMocks = vi.hoisted(() => ({ audit: vi.fn() }))
const dbMocks = vi.hoisted(() => ({
  getServiceDriftSnapshot: vi.fn(),
  getCmsRevisions: vi.fn(),
  resyncCatalogueRecord: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@/lib/api/audit', () => auditMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import { GET, POST } from './route'

const AT = new Date('2026-11-21T06:00:00.000Z')
const REVISION = '2026-11-21T06:00:00.000Z'

function category(over: Record<string, unknown> = {}) {
  return {
    id: 'cat_nails',
    name: 'Nails',
    slug: 'nails',
    description: null,
    serviceType: 'salon',
    displayOrder: 0,
    isActive: true,
    sacCode: '999721',
    allBranches: true,
    branchIds: null,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  }
}

function service(over: Record<string, unknown> = {}) {
  return {
    id: 'svc_cut',
    categoryId: 'cat_nails',
    name: 'Haircut',
    slug: 'haircut',
    description: null,
    durationMinutes: 30,
    bufferMinutes: 0,
    pricePaise: 50_000,
    isActive: true,
    imageUrl: null,
    displayOrder: 0,
    gemsRedeemable: false,
    gemsRequired: null,
    gemsCatalogueOrder: null,
    sacCode: null,
    allBranches: true,
    branchIds: null,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  }
}

/** The category never mirrored, the service's price edited in its mirror. */
function drifted() {
  return {
    categories: { cmsRows: [category()], publicRows: [] },
    services: { cmsRows: [service()], publicRows: [service({ pricePaise: 45_000 })] },
    offers: { ruleRows: [], ruleFreeIds: [], publicRows: [] },
  }
}

/** After a repair of the category only. */
function partlyRepaired() {
  return { ...drifted(), categories: { cmsRows: [category()], publicRows: [category()] } }
}

function post(body: unknown) {
  return POST(
    new Request('https://admin.theroyalglow.in/api/catalogue-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.requireRole.mockResolvedValue({ user: { id: 'u_dev', role: 'developer' } })
  dbMocks.getServiceDriftSnapshot.mockResolvedValue(drifted())
  dbMocks.getCmsRevisions.mockResolvedValue({
    service_category: { cat_nails: REVISION },
    service: { svc_cut: REVISION },
    offer: {},
  })
})

describe('GET /api/catalogue-sync', () => {
  it('reports each drifted record with its CMS revision, Developer only', async () => {
    const res = await GET(new Request('https://admin.theroyalglow.in/api/catalogue-sync'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(sessionMocks.requireRole).toHaveBeenCalledWith('developer')
    expect(body.data.findingCount).toBe(2)
    expect(body.data.records).toEqual([
      {
        table: 'service_category',
        id: 'cat_nails',
        name: 'Nails',
        kind: 'missing',
        differences: [],
        cmsUpdatedAt: REVISION,
        repairable: true,
      },
      {
        table: 'service',
        id: 'svc_cut',
        name: 'Haircut',
        kind: 'different',
        differences: [{ field: 'pricePaise', cmsValue: '50000', publicValue: '45000' }],
        cmsUpdatedAt: REVISION,
        repairable: true,
      },
    ])
  })

  it('refuses anyone but the Developer', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden('Developer only.'))
    const res = await GET(new Request('https://admin.theroyalglow.in/api/catalogue-sync'))
    expect(res.status).toBe(403)
    expect(dbMocks.getServiceDriftSnapshot).not.toHaveBeenCalled()
  })
})

describe('POST /api/catalogue-sync', () => {
  it('resyncs categories first and reports what a fresh read still finds', async () => {
    dbMocks.resyncCatalogueRecord.mockImplementation(async (record: { table: string }) => {
      if (record.table === 'service') {
        throw new AppError({
          code: ERROR_CODES.CATALOGUE_CHANGED,
          message: 'This record changed in the CMS.',
          statusCode: 409,
        })
      }
      return 'created'
    })
    dbMocks.getServiceDriftSnapshot.mockResolvedValue(partlyRepaired())

    const res = await post({
      records: [
        { table: 'service', id: 'svc_cut', cmsUpdatedAt: REVISION },
        { table: 'service_category', id: 'cat_nails', cmsUpdatedAt: REVISION },
      ],
    })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(dbMocks.resyncCatalogueRecord.mock.calls.map(([r]) => r.table)).toEqual([
      'service_category',
      'service',
    ])
    expect(body.data.results).toEqual([
      {
        table: 'service_category',
        id: 'cat_nails',
        cmsUpdatedAt: REVISION,
        outcome: 'created',
        message: null,
        remaining: { kind: null, differences: [] },
      },
      {
        table: 'service',
        id: 'svc_cut',
        cmsUpdatedAt: REVISION,
        outcome: 'changed',
        message: 'This record changed in the CMS.',
        remaining: {
          kind: 'different',
          differences: [{ field: 'pricePaise', cmsValue: '50000', publicValue: '45000' }],
        },
      },
    ])
    expect(body.data.findingCount).toBe(1)

    expect(auditMocks.audit).toHaveBeenCalledTimes(2)
    expect(auditMocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      { user: { id: 'u_dev', role: 'developer' } },
      expect.objectContaining({
        action: 'update',
        entityType: 'catalogue_resync',
        entityId: 'service:svc_cut',
        newValues: expect.objectContaining({ outcome: 'changed' }),
      }),
    )
  })

  it('reports a refused dependency and an unexpected failure without failing the request', async () => {
    dbMocks.resyncCatalogueRecord.mockImplementation(async (record: { table: string }) => {
      if (record.table === 'service') {
        throw conflict(ERROR_CODES.CONFLICT, 'Its category cat_nails has no mirror yet.')
      }
      throw new Error('connection reset')
    })

    const res = await post({
      records: [
        { table: 'service', id: 'svc_cut', cmsUpdatedAt: REVISION },
        { table: 'offer', id: 'cms_offer_1', cmsUpdatedAt: REVISION },
      ],
    })
    expect(res.status).toBe(200)
    const { results } = (await res.json()).data
    expect(
      results.map((r: { outcome: string; message: string }) => [r.outcome, r.message]),
    ).toEqual([
      ['refused', 'Its category cat_nails has no mirror yet.'],
      ['failed', 'The resync failed unexpectedly; nothing was written.'],
    ])
  })

  it('names each record once', async () => {
    dbMocks.resyncCatalogueRecord.mockResolvedValue('updated')
    await post({
      records: [
        { table: 'service', id: 'svc_cut', cmsUpdatedAt: REVISION },
        { table: 'service', id: 'svc_cut', cmsUpdatedAt: '2026-11-21T07:00:00.000Z' },
      ],
    })
    expect(dbMocks.resyncCatalogueRecord).toHaveBeenCalledTimes(1)
    expect(dbMocks.resyncCatalogueRecord).toHaveBeenCalledWith({
      table: 'service',
      id: 'svc_cut',
      cmsUpdatedAt: '2026-11-21T07:00:00.000Z',
    })
  })

  it.each([
    ['no records', { records: [] }],
    [
      'more than 25',
      {
        records: Array.from({ length: 26 }, (_, i) => ({
          table: 'service',
          id: `svc_${i}`,
          cmsUpdatedAt: REVISION,
        })),
      },
    ],
    ['a record without its revision', { records: [{ table: 'service', id: 'svc_cut' }] }],
    ['an unknown table', { records: [{ table: 'banner', id: 'b1', cmsUpdatedAt: REVISION }] }],
  ])('refuses %s with 400, writing nothing', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(dbMocks.resyncCatalogueRecord).not.toHaveBeenCalled()
  })

  it('refuses anyone but the Developer', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden('Developer only.'))
    const res = await post({
      records: [{ table: 'service', id: 'svc_cut', cmsUpdatedAt: REVISION }],
    })
    expect(res.status).toBe(403)
    expect(dbMocks.resyncCatalogueRecord).not.toHaveBeenCalled()
  })
})
