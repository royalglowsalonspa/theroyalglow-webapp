// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : settings-routes.test
 * Scope        : Unit tests for admin Settings routes (multi-branch R1.1, R6.3)
 *
 * Description  : GET|PUT /api/settings:
 *                - only the Developer, at the active branch
 *                  (requireBranchRole('developer')), reads or changes them;
 *                - GET returns the active branch's current revision, its
 *                  history and the invoicing switch every branch shares;
 *                - PUT of a branch section saves the branch's next revision
 *                  from the revision the page was loaded with: 409
 *                  SETTINGS_CHANGED when someone saved since, 409
 *                  BRANCH_CONTEXT_CHANGED after a branch switch; audited;
 *                - PUT invoicing stays one shared switch;
 *                - the settlement share and value per gem are shared too:
 *                  GET returns null when they can't be read, PUT replaces
 *                  them, audited with the old values;
 *                - invalid values and unknown sections are 400.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment. requireBranchRole and the db queries are
 *                mocked; assertRenderedBranch, @rgss/types and @rgss/errors
 *                stay REAL so the section schemas are genuinely exercised.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import {
  DEFAULT_BOOKING_RULES,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_INVOICING,
  DEFAULT_SETTLEMENT,
} from '@rgss/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({
  requireBranchRole: vi.fn(),
  audit: vi.fn(async () => undefined),
}))

const dbMocks = vi.hoisted(() => ({
  getBranchSettingsForAdmin: vi.fn(),
  getInvoicingSetting: vi.fn(),
  getSettlementSetting: vi.fn(),
  saveBranchSettingsSection: vi.fn(),
  upsertSetting: vi.fn(),
  SETTING_KEYS: { invoicing: 'invoicing', settlement: 'settlement' },
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@/lib/api/audit', () => ({ audit: mocks.audit }))
vi.mock('@rgss/db/queries', () => dbMocks)

import * as settingsRoute from '@/app/api/settings/route'

const jsonReq = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

const forbidden = () =>
  new AppError({ code: ERROR_CODES.FORBIDDEN, message: 'no', statusCode: 403 })
const unauthenticated = () =>
  new AppError({ code: ERROR_CODES.UNAUTHENTICATED, message: 'sign in', statusCode: 401 })
const settlementUnreadable = () =>
  new AppError({
    code: ERROR_CODES.SETTLEMENT_SETTINGS_INVALID,
    message: "The settlement settings can't be read.",
    statusCode: 409,
  })

const URL = 'https://admin.theroyalglow.in/api/settings'

function view(revision: number, overrides: Record<string, unknown> = {}) {
  return {
    branchId: TEST_BRANCH.id,
    branchName: TEST_BRANCH.name,
    revision,
    savedAt: '2026-10-30T05:00:00.000Z',
    savedByName: 'Katabathuni Bose',
    businessHours: DEFAULT_BUSINESS_HOURS,
    bookingRules: DEFAULT_BOOKING_RULES,
    ...overrides,
  }
}

const HISTORY = [
  {
    revision: 3,
    section: 'bookingRules',
    savedAt: '2026-10-30T05:00:00.000Z',
    savedByName: 'Katabathuni Bose',
  },
  {
    revision: 2,
    section: 'businessHours',
    savedAt: '2026-10-29T05:00:00.000Z',
    savedByName: 'Katabathuni Bose',
  },
  { revision: 1, section: null, savedAt: '2026-10-28T05:00:00.000Z', savedByName: null },
]

const put = (body: unknown) => settingsRoute.PUT(jsonReq(URL, 'PUT', body))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_dev', role: 'developer' }))
  dbMocks.getBranchSettingsForAdmin.mockResolvedValue({ current: view(3), history: HISTORY })
  dbMocks.getInvoicingSetting.mockResolvedValue(DEFAULT_INVOICING)
  dbMocks.getSettlementSetting.mockResolvedValue(DEFAULT_SETTLEMENT)
  dbMocks.saveBranchSettingsSection.mockResolvedValue({
    ok: true,
    revision: 4,
    savedAt: new Date('2026-10-30T06:00:00.000Z'),
  })
})

describe('GET /api/settings', () => {
  it("returns the active branch's current revision, its history and the shared settings", async () => {
    const res = await settingsRoute.GET(new Request(URL))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        branch: view(3),
        history: HISTORY,
        invoicing: DEFAULT_INVOICING,
        settlement: DEFAULT_SETTLEMENT,
      },
    })
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('developer')
    expect(dbMocks.getBranchSettingsForAdmin).toHaveBeenCalledWith(TEST_BRANCH.id)
  })

  it("returns settlement null when the stored value can't be read, for the Developer to save again", async () => {
    dbMocks.getSettlementSetting.mockRejectedValue(settlementUnreadable())

    const res = await settingsRoute.GET(new Request(URL))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.settlement).toBeNull()
    expect(body.data.invoicing).toEqual(DEFAULT_INVOICING)
  })

  it('does not hide any other failure reading the settlement settings', async () => {
    dbMocks.getSettlementSetting.mockRejectedValue(new Error('connection reset'))

    const res = await settingsRoute.GET(new Request(URL))

    expect(res.status).toBe(500)
  })

  it('reads the branch the Developer has active, not another', async () => {
    mocks.requireBranchRole.mockResolvedValue(
      branchContext({ userId: 'u_dev', role: 'developer', branch: OTHER_BRANCH }),
    )

    await settingsRoute.GET(new Request(URL))

    expect(dbMocks.getBranchSettingsForAdmin).toHaveBeenCalledWith(OTHER_BRANCH.id)
  })

  it('passes unreadable sections through as null for the Developer to fix', async () => {
    dbMocks.getBranchSettingsForAdmin.mockResolvedValue({
      current: view(3, { bookingRules: null }),
      history: HISTORY,
    })

    const body = await (await settingsRoute.GET(new Request(URL))).json()

    expect(body.data.branch.bookingRules).toBeNull()
    expect(body.data.branch.businessHours).toEqual(DEFAULT_BUSINESS_HOURS)
  })

  it('→ 401 when unauthenticated', async () => {
    mocks.requireBranchRole.mockRejectedValue(unauthenticated())
    const res = await settingsRoute.GET(new Request(URL))
    expect(res.status).toBe(401)
    expect(dbMocks.getBranchSettingsForAdmin).not.toHaveBeenCalled()
  })

  it('→ 403 for anyone but the Developer', async () => {
    mocks.requireBranchRole.mockRejectedValue(forbidden())
    const res = await settingsRoute.GET(new Request(URL))
    expect(res.status).toBe(403)
    expect(dbMocks.getBranchSettingsForAdmin).not.toHaveBeenCalled()
  })
})

describe('PUT /api/settings — a branch section (R6.3)', () => {
  it("saves the business hours as the branch's next revision, audited", async () => {
    const value = { ...DEFAULT_BUSINESS_HOURS, sun: { open: null, close: null, closed: true } }
    dbMocks.getBranchSettingsForAdmin.mockResolvedValue({
      current: view(4, { businessHours: value }),
      history: HISTORY,
    })

    const res = await put({
      section: 'businessHours',
      branchId: TEST_BRANCH.id,
      expectedRevision: 3,
      value,
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(dbMocks.saveBranchSettingsSection).toHaveBeenCalledWith({
      section: 'businessHours',
      value,
      branchId: TEST_BRANCH.id,
      expectedRevision: 3,
      actorId: 'u_dev',
    })
    expect(body.data).toEqual({
      section: 'businessHours',
      branch: view(4, { businessHours: value }),
      history: HISTORY,
    })
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      expect.objectContaining({
        action: 'update',
        entityType: 'branch_setting',
        entityId: `${TEST_BRANCH.id}:4`,
        branchId: TEST_BRANCH.id,
        newValues: { section: 'businessHours', revision: 4, value },
      }),
    )
  })

  it('saves the booking rules, with the reschedule rules', async () => {
    const value = {
      minAdvanceLeadTimeMinutes: 30,
      maxAdvanceBookingDays: 14,
      cancellationCutoffHours: 6,
      maxActiveBookingsPerCustomer: 2,
      rescheduleCutoffHours: 3,
      maxReschedulesPerBooking: 1,
    }

    const res = await put({
      section: 'bookingRules',
      branchId: TEST_BRANCH.id,
      expectedRevision: 3,
      value,
    })

    expect(res.status).toBe(200)
    expect(dbMocks.saveBranchSettingsSection).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'bookingRules', value, expectedRevision: 3 }),
    )
  })

  it('refuses a save when someone saved since the page loaded: 409 SETTINGS_CHANGED', async () => {
    dbMocks.saveBranchSettingsSection.mockResolvedValue({ ok: false, reason: 'stale' })

    const res = await put({
      section: 'bookingRules',
      branchId: TEST_BRANCH.id,
      expectedRevision: 2,
      value: DEFAULT_BOOKING_RULES,
    })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatchObject({
      code: ERROR_CODES.SETTINGS_CHANGED,
      message:
        "Someone saved Rayasandra's settings after you opened this page. Reload to see them, then make your change again.",
    })
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('refuses a page rendered for another branch: 409 BRANCH_CONTEXT_CHANGED, nothing saved', async () => {
    const res = await put({
      section: 'businessHours',
      branchId: OTHER_BRANCH.id,
      expectedRevision: 3,
      value: DEFAULT_BUSINESS_HOURS,
    })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.saveBranchSettingsSection).not.toHaveBeenCalled()
  })

  it('needs the branch and the revision the page was loaded with', async () => {
    const noRevision = await put({
      section: 'businessHours',
      branchId: TEST_BRANCH.id,
      value: DEFAULT_BUSINESS_HOURS,
    })
    const noBranch = await put({
      section: 'bookingRules',
      expectedRevision: 3,
      value: DEFAULT_BOOKING_RULES,
    })

    expect(noRevision.status).toBe(400)
    expect(noBranch.status).toBe(400)
    expect(dbMocks.saveBranchSettingsSection).not.toHaveBeenCalled()
  })

  it('answers 404 when the branch is gone', async () => {
    dbMocks.saveBranchSettingsSection.mockResolvedValue({ ok: false, reason: 'missing' })

    const res = await put({
      section: 'businessHours',
      branchId: TEST_BRANCH.id,
      expectedRevision: 3,
      value: DEFAULT_BUSINESS_HOURS,
    })

    expect(res.status).toBe(404)
  })

  it.each([
    [
      'a malformed time',
      { ...DEFAULT_BUSINESS_HOURS, mon: { open: '25:00', close: '21:00', closed: false } },
    ],
    [
      'a day that closes before it opens',
      { ...DEFAULT_BUSINESS_HOURS, tue: { open: '21:00', close: '10:00', closed: false } },
    ],
  ])('rejects business hours with %s with 400', async (_label, value) => {
    const res = await put({
      section: 'businessHours',
      branchId: TEST_BRANCH.id,
      expectedRevision: 3,
      value,
    })
    expect(res.status).toBe(400)
    expect(dbMocks.saveBranchSettingsSection).not.toHaveBeenCalled()
  })

  it('rejects booking rules outside their limits with 400', async () => {
    const res = await put({
      section: 'bookingRules',
      branchId: TEST_BRANCH.id,
      expectedRevision: 3,
      value: { ...DEFAULT_BOOKING_RULES, maxReschedulesPerBooking: 11 },
    })
    expect(res.status).toBe(400)
    expect(dbMocks.saveBranchSettingsSection).not.toHaveBeenCalled()
  })
})

describe('PUT /api/settings — invoicing and the rest', () => {
  it('turns live invoicing on for every branch (valid → saved)', async () => {
    const value = { live: true }
    dbMocks.upsertSetting.mockResolvedValue({ key: 'invoicing', value })

    const res = await put({ section: 'invoicing', value })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ section: 'invoicing', invoicing: value })
    expect(dbMocks.upsertSetting).toHaveBeenCalledWith('invoicing', value, 'u_dev')
    expect(dbMocks.saveBranchSettingsSection).not.toHaveBeenCalled()
  })

  it('saves the settlement share and value per gem for every pair, audited with the old values', async () => {
    const value = { shareBps: 8_000, gemValuePaise: 50 }
    dbMocks.upsertSetting.mockResolvedValue({ key: 'settlement', value })

    const res = await put({ section: 'settlement', value })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ section: 'settlement', settlement: value })
    expect(dbMocks.upsertSetting).toHaveBeenCalledWith('settlement', value, 'u_dev')
    expect(dbMocks.saveBranchSettingsSection).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      expect.objectContaining({
        action: 'update',
        entityType: 'system_setting',
        entityId: 'settlement',
        oldValues: DEFAULT_SETTLEMENT,
        newValues: value,
      }),
    )
  })

  it('replaces unreadable settlement settings, audited with no old values', async () => {
    dbMocks.getSettlementSetting.mockRejectedValue(settlementUnreadable())
    const value = { shareBps: 10_000, gemValuePaise: 100 }
    dbMocks.upsertSetting.mockResolvedValue({ key: 'settlement', value })

    const res = await put({ section: 'settlement', value })

    expect(res.status).toBe(200)
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      expect.objectContaining({ entityId: 'settlement', oldValues: null, newValues: value }),
    )
  })

  it.each([
    ['a share above 100%', { shareBps: 10_001, gemValuePaise: 100 }],
    ['a negative share', { shareBps: -1, gemValuePaise: 100 }],
    ['a gem worth nothing', { shareBps: 10_000, gemValuePaise: 0 }],
    ['a fractional share', { shareBps: 50.5, gemValuePaise: 100 }],
    ['a missing value per gem', { shareBps: 10_000 }],
  ])('rejects settlement settings with %s with 400', async (_label, value) => {
    const res = await put({ section: 'settlement', value })
    expect(res.status).toBe(400)
    expect(dbMocks.upsertSetting).not.toHaveBeenCalled()
  })

  it('rejects an unknown section with 400', async () => {
    const res = await put({ section: 'nope', value: {} })
    expect(res.status).toBe(400)
    expect(dbMocks.upsertSetting).not.toHaveBeenCalled()
  })

  it('has no GST setting: rates are per-branch tax versions (R6.4)', async () => {
    const res = await put({ section: 'gst', value: { ratePercent: 18, inclusive: true } })
    expect(res.status).toBe(400)
    expect(dbMocks.upsertSetting).not.toHaveBeenCalled()
  })

  it('→ 403 for anyone but the Developer', async () => {
    mocks.requireBranchRole.mockRejectedValue(forbidden())
    const res = await put({ section: 'invoicing', value: DEFAULT_INVOICING })
    expect(res.status).toBe(403)
    expect(dbMocks.upsertSetting).not.toHaveBeenCalled()
  })

  it('→ 401 when unauthenticated', async () => {
    mocks.requireBranchRole.mockRejectedValue(unauthenticated())
    const res = await put({ section: 'invoicing', value: DEFAULT_INVOICING })
    expect(res.status).toBe(401)
    expect(dbMocks.upsertSetting).not.toHaveBeenCalled()
  })
})
