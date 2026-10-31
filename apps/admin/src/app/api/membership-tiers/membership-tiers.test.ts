// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : membership-tiers.test
 * Scope        : Unit tests — membership tier routes (multi-branch R9.4, MS-18)
 *
 * Description  : GET lists every tier and says whether the person may change a
 *                tax classification; POST adds a tier and PATCH edits one, for
 *                Receptionists and above, with an audit entry naming the
 *                active branch. Only the Developer sets or changes a SAC code,
 *                including through direct API calls; resending the unchanged
 *                code is allowed.
 *
 * Approach     : requireBranchRole and the DB are mocked; validation and the
 *                business rules stay real.
 ************************************************************/

import type { BranchRole } from '@rgss/business'
import { AppError, conflict, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
  getMembershipTiers: vi.fn(),
  getMembershipTierById: vi.fn(),
  createMembershipTier: vi.fn(),
  updateMembershipTier: vi.fn(),
  recordAudit: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)

import * as tierRoute from '@/app/api/membership-tiers/[id]/route'
import * as tiersRoute from '@/app/api/membership-tiers/route'

const GOLD = {
  id: 'tier_gold',
  name: 'Gold',
  slug: 'gold',
  description: null,
  defaultHoursMinutes: 900,
  defaultPricePaise: 1_500_000,
  defaultValidityDays: 90,
  sacCode: '999723',
  isActive: true,
  displayOrder: 2,
}

const actAs = (role: BranchRole) =>
  mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_admin', role }))

function request(method: string, url: string, body?: unknown): Request {
  return new Request(`https://admin.theroyalglow.in${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

const create = (body: unknown) => tiersRoute.POST(request('POST', '/api/membership-tiers', body))
const edit = (body: unknown, id = 'tier_gold') =>
  tierRoute.PATCH(request('PATCH', `/api/membership-tiers/${id}`, body), {
    params: Promise.resolve({ id }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  actAs('receptionist')
  dbMocks.getMembershipTiers.mockResolvedValue([GOLD, { ...GOLD, id: 't_s', displayOrder: 1 }])
  dbMocks.getMembershipTierById.mockResolvedValue(GOLD)
  dbMocks.createMembershipTier.mockImplementation(async (values: object) => ({
    id: 'tier_new',
    description: null,
    ...values,
  }))
  dbMocks.updateMembershipTier.mockImplementation(async (_id: string, patch: object) => ({
    ...GOLD,
    ...patch,
  }))
})

describe('GET /api/membership-tiers', () => {
  it('lists every tier, retired ones too, and lets only the Developer edit tax', async () => {
    const res = await tiersRoute.GET(request('GET', '/api/membership-tiers'))
    const { data } = await res.json()

    expect(res.status).toBe(200)
    expect(data.canEditTax).toBe(false)
    expect(data.tiers).toHaveLength(2)
    expect(dbMocks.getMembershipTiers).toHaveBeenCalledWith({ includeInactive: true })

    actAs('developer')
    const dev = await (await tiersRoute.GET(request('GET', '/api/membership-tiers'))).json()
    expect(dev.data.canEditTax).toBe(true)
  })

  it('refuses someone below Receptionist', async () => {
    mocks.requireBranchRole.mockRejectedValue(
      new AppError({ code: ERROR_CODES.FORBIDDEN, message: 'No access.', statusCode: 403 }),
    )

    const res = await tiersRoute.GET(request('GET', '/api/membership-tiers'))

    expect(res.status).toBe(403)
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getMembershipTiers).not.toHaveBeenCalled()
  })
})

describe('POST /api/membership-tiers', () => {
  const DIWALI = {
    name: 'Diwali Special',
    usualHours: 10,
    usualPricePaise: 1_000_000,
    usualValidityDays: 120,
  }

  it('adds a tier last in the order, with the provisional SAC code, and audits it', async () => {
    const res = await create(DIWALI)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(dbMocks.createMembershipTier).toHaveBeenCalledWith({
      name: 'Diwali Special',
      slug: 'diwali-special',
      defaultHoursMinutes: 600,
      defaultPricePaise: 1_000_000,
      defaultValidityDays: 120,
      sacCode: '999723',
      isActive: true,
      displayOrder: 3,
    })
    expect(body.data.tier.id).toBe('tier_new')
    expect(dbMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u_admin',
        action: 'create',
        entityType: 'spa_membership_tier',
        entityId: 'tier_new',
        branchId: TEST_BRANCH.id,
      }),
    )
  })

  it('accepts 0 usual hours and ₹0 for a tier agreed at the counter', async () => {
    const res = await create({ ...DIWALI, usualHours: 0, usualPricePaise: 0 })

    expect(res.status).toBe(201)
    expect(dbMocks.createMembershipTier).toHaveBeenCalledWith(
      expect.objectContaining({ defaultHoursMinutes: 0, defaultPricePaise: 0 }),
    )
  })

  it('refuses a SAC code from anyone but the Developer, without writing (MS-18)', async () => {
    const res = await create({ ...DIWALI, sacCode: '999723' })

    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toMatch(/Only the Developer/)
    expect(dbMocks.createMembershipTier).not.toHaveBeenCalled()
  })

  it('takes the Developer’s SAC code', async () => {
    actAs('developer')

    const res = await create({ ...DIWALI, sacCode: '999722' })

    expect(res.status).toBe(201)
    expect(dbMocks.createMembershipTier).toHaveBeenCalledWith(
      expect.objectContaining({ sacCode: '999722' }),
    )
  })

  it.each([
    ['no name', { name: '  ' }],
    ['part of an hour', { usualHours: 7.5 }],
    ['no validity', { usualValidityDays: 0 }],
    ['an unreviewed SAC code', { sacCode: '998599' }],
  ])('refuses %s', async (_label, change) => {
    actAs('developer')

    const res = await create({ ...DIWALI, ...change })

    expect(res.status).toBe(400)
    expect(dbMocks.createMembershipTier).not.toHaveBeenCalled()
  })

  it('answers 409 for a name another tier has', async () => {
    dbMocks.createMembershipTier.mockRejectedValue(
      conflict(ERROR_CODES.CONFLICT, 'A tier called Gold already exists.'),
    )

    const res = await create({ ...DIWALI, name: 'Gold' })

    expect(res.status).toBe(409)
    expect(dbMocks.recordAudit).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/membership-tiers/[id]', () => {
  it('changes the usual values for later sales and audits old and new', async () => {
    const res = await edit({ name: 'Gold Plus', usualHours: 16, usualPricePaise: 1_600_000 })

    expect(res.status).toBe(200)
    expect(dbMocks.updateMembershipTier).toHaveBeenCalledWith('tier_gold', {
      name: 'Gold Plus',
      defaultHoursMinutes: 960,
      defaultPricePaise: 1_600_000,
    })
    expect(dbMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityId: 'tier_gold',
        branchId: TEST_BRANCH.id,
        oldValues: GOLD,
      }),
    )
  })

  it('retires a tier instead of deleting it', async () => {
    const res = await edit({ isActive: false })

    expect(res.status).toBe(200)
    expect(dbMocks.updateMembershipTier).toHaveBeenCalledWith('tier_gold', { isActive: false })
    expect((tierRoute as Record<string, unknown>).DELETE).toBeUndefined()
  })

  it('refuses a SAC change from a Manager, but takes the unchanged code (MS-18)', async () => {
    actAs('manager')

    const refused = await edit({ sacCode: '999721' })
    expect(refused.status).toBe(403)
    expect(dbMocks.updateMembershipTier).not.toHaveBeenCalled()

    const unchanged = await edit({ name: 'Gold', sacCode: '999723' })
    expect(unchanged.status).toBe(200)
  })

  it('lets the Developer change the SAC code', async () => {
    actAs('developer')

    const res = await edit({ sacCode: '999729' })

    expect(res.status).toBe(200)
    expect(dbMocks.updateMembershipTier).toHaveBeenCalledWith('tier_gold', { sacCode: '999729' })
  })

  it('answers 404 for an unknown tier and 400 for an empty change', async () => {
    dbMocks.getMembershipTierById.mockResolvedValue(null)
    expect((await edit({ name: 'X' }, 'tier_missing')).status).toBe(404)

    expect((await edit({})).status).toBe(400)
    expect(dbMocks.updateMembershipTier).not.toHaveBeenCalled()
  })
})
