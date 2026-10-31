// @vitest-environment node
/************************************************************
 * Module Name  : memberships/[id]/sessions route.test
 * Scope        : API — Admin Membership
 *
 * Description  : POST /api/memberships/[id]/sessions ("Record now") starts a
 *                session: an in-progress booking whose minutes the database
 *                holds until completion, which issues the ₹0 invoice
 *                (membership-scheduling.md). It must answer a retried request
 *                (same idempotency key) with the session it already started,
 *                before any balance check, and reject a key reused for a
 *                different session. When the guarded write finds the
 *                membership unavailable, the error says why, from a fresh read.
 *
 *                The session is performed at the active branch: a form
 *                rendered for another branch is refused, as are staff from
 *                another branch (multi-branch R2.3, R2.4, R9).
 *
 *                One person does the whole session (0028): naming nobody or
 *                two people is a 400, and a person the database refuses is a
 *                409, STAFF_BUSY when they are booked or still with another
 *                customer.
 *
 *                With a start time the session is booked ahead: confirmed for
 *                its date and time at the branch, as the counter books (open
 *                that day, within its hours on the half-hour grid, still to
 *                come), with validity checked at the planned start.
 *
 * Approach     : requireBranchRole and @rgss/db/queries are mocked.
 *                assertRenderedBranch and @rgss/business stay REAL, so the
 *                balance check and the replay comparison are the production
 *                rules.
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import { DEFAULT_BOOKING_RULES, DEFAULT_BUSINESS_HOURS } from '@rgss/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const branchMocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))
const dbMocks = vi.hoisted(() => ({
  // The db layer's wording; the route passes the refusal and uses its text.
  assigneeRefusalMessage: vi.fn((refusal: string) => `refused: ${refusal}`),
  getBranchByIdAdmin: vi.fn(),
  getBranchPolicy: vi.fn(),
  getClosureOn: vi.fn(async (): Promise<{ name: string; allBranches: boolean } | null> => null),
  getMembershipById: vi.fn(),
  getMembershipSessionByKey: vi.fn(),
  getServicesByIds: vi.fn(),
  getStaffNamesByIds: vi.fn(),
  isStaffAtBranch: vi.fn(),
  recordMembershipSession: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: branchMocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)

import { POST } from './route'

const KEY = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const LINE = { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' }
const IN_30_DAYS = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
// Before every instant the tests run at, real or fake.
const SINCE = new Date('2026-01-01T00:00:00.000Z')

function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem_1',
    customerId: 'usr_1',
    status: 'active',
    startsAt: SINCE,
    expiresAt: IN_30_DAYS,
    totalHoursMinutes: 600,
    usedHoursMinutes: 0,
    reservedMinutes: 0,
    ...overrides,
  }
}

// A completed session the key started earlier: its invoice exists.
const RECORDED = {
  booking: { id: 'bk_1' },
  invoice: { id: 'inv_1' },
  services: [LINE],
  remainingMinutes: 0,
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request('https://admin.theroyalglow.in/api/memberships/mem_1/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ branchId: TEST_BRANCH.id, ...body }),
    }),
    { params: Promise.resolve({ id: 'mem_1' }) },
  )
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string } }).error
}

beforeEach(() => {
  vi.clearAllMocks()
  branchMocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_rec' }))
  dbMocks.getMembershipById.mockResolvedValue(membership())
  dbMocks.getMembershipSessionByKey.mockResolvedValue(null)
  dbMocks.getServicesByIds.mockResolvedValue([{ id: 'svc_aroma_60', name: 'Aroma 60' }])
  dbMocks.getStaffNamesByIds.mockResolvedValue([{ id: 'stf_1', name: 'Anita' }])
  dbMocks.getBranchByIdAdmin.mockResolvedValue({
    id: TEST_BRANCH.id,
    name: TEST_BRANCH.name,
    code: 'RS',
    number: 1,
    status: 'operational',
    legalName: null,
    gstin: null,
  })
  dbMocks.isStaffAtBranch.mockResolvedValue(true)
  dbMocks.recordMembershipSession.mockResolvedValue({
    ok: true,
    booking: { id: 'bk_2' },
    remainingMinutes: 540,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/memberships/[id]/sessions', () => {
  it('starts a session and hands the key to the guarded write; no invoice yet', async () => {
    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(201)
    expect(branchMocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getBranchByIdAdmin).toHaveBeenCalledWith(TEST_BRANCH.id)
    expect(dbMocks.isStaffAtBranch).toHaveBeenCalledWith('stf_1', TEST_BRANCH.id)
    expect((await res.json()).data).toEqual({
      booking: { id: 'bk_2' },
      invoice: null,
      remainingMinutes: 540,
      duplicate: false,
    })
    const params = dbMocks.recordMembershipSession.mock.calls[0]?.[0]
    expect(params).toMatchObject({
      membershipId: 'mem_1',
      customerId: 'usr_1',
      branchId: TEST_BRANCH.id,
      idempotencyKey: KEY,
      // The status log records who started the session.
      recordedById: 'u_rec',
      services: [
        {
          serviceId: 'svc_aroma_60',
          staffId: 'stf_1',
          serviceNameSnapshot: 'Aroma 60',
          staffNameSnapshot: 'Anita',
          durationMinutes: 60,
        },
      ],
    })
    // The balance comes from the write itself, not from this request's read.
    expect(params).not.toHaveProperty('totalHoursMinutes')
    expect(params).not.toHaveProperty('usedHoursMinutes')
    // Completion issues the invoice and the settlement entry, so starting
    // takes neither.
    expect(params).not.toHaveProperty('invoice')
    expect(params).not.toHaveProperty('settlement')
  })

  it('plans the session from now (IST) for the requested minutes, on today’s date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 10:05 IST on 28 October 2026.
    vi.setSystemTime(new Date('2026-10-28T04:35:00.000Z'))

    const res = await post({
      services: [LINE, { serviceId: 'svc_aroma_60', durationMinutes: 30 }],
      idempotencyKey: KEY,
    })

    expect(res.status).toBe(201)
    const params = dbMocks.recordMembershipSession.mock.calls[0]?.[0]
    expect(params).toMatchObject({ startTime: '10:05', endTime: '11:35' })
    expect(params.bookingDate).toEqual(new Date('2026-10-28T00:00:00.000Z'))
    // SPA, with the membership suffix.
    expect(params.bookingNumber).toMatch(/^BK-RS-2610-S-\d{5}-M$/)
  })

  it.each([
    ['yesterday', '2026-10-27'],
    ['tomorrow', '2026-10-29'],
  ])(
    'refuses a session dated %s: a session recorded now takes today’s date',
    async (_label, bookingDate) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-28T04:35:00.000Z'))

      const res = await post({ services: [LINE], bookingDate, idempotencyKey: KEY })

      expect(res.status).toBe(400)
      expect((await errorOf(res)).message).toBe(
        "A session recorded now takes today's date. To book one ahead, choose its start time.",
      )
      expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
    },
  )

  it('accepts today’s date sent explicitly', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T04:35:00.000Z'))

    const res = await post({ services: [LINE], bookingDate: '2026-10-28', idempotencyKey: KEY })

    expect(res.status).toBe(201)
  })

  it('replays a retry before the balance check, even when the hours are spent', async () => {
    dbMocks.getMembershipById.mockResolvedValue(membership({ usedHoursMinutes: 600 }))
    dbMocks.getMembershipSessionByKey.mockResolvedValue(RECORDED)

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(200)
    expect(dbMocks.getMembershipSessionByKey).toHaveBeenCalledWith('mem_1', KEY)
    expect((await res.json()).data).toEqual({
      booking: { id: 'bk_1' },
      invoice: { id: 'inv_1' },
      remainingMinutes: 0,
      duplicate: true,
    })
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('replays a session still in progress, which has no invoice yet', async () => {
    dbMocks.getMembershipSessionByKey.mockResolvedValue({
      ...RECORDED,
      invoice: null,
      remainingMinutes: 540,
    })

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({
      booking: { id: 'bk_1' },
      invoice: null,
      remainingMinutes: 540,
      duplicate: true,
    })
  })

  it('rejects a key reused for a different session, writing nothing', async () => {
    dbMocks.getMembershipSessionByKey.mockResolvedValue({
      ...RECORDED,
      services: [{ ...LINE, durationMinutes: 90 }],
    })

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe('CONFLICT')
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('records without a replay lookup when the request has no key', async () => {
    const res = await post({ services: [LINE] })

    expect(res.status).toBe(201)
    expect(dbMocks.getMembershipSessionByKey).not.toHaveBeenCalled()
    expect(dbMocks.recordMembershipSession.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: null,
    })
  })

  it.each([
    ['too short', 'abc'],
    ['with other characters', 'key with spaces!'],
  ])('rejects a key that is %s', async (_label, idempotencyKey) => {
    const res = await post({ services: [LINE], idempotencyKey })

    expect(res.status).toBe(400)
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('refuses up front when the membership is short of minutes', async () => {
    dbMocks.getMembershipById.mockResolvedValue(membership({ usedHoursMinutes: 580 }))

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe('MEMBERSHIP_INSUFFICIENT_HOURS')
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('refuses a membership sold to start later, naming its start date (MS-05)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T04:35:00.000Z'))
    // 00:00 IST on 05/11/2026.
    dbMocks.getMembershipById.mockResolvedValue(
      membership({ startsAt: new Date('2026-11-04T18:30:00.000Z') }),
    )

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({
      code: ERROR_CODES.MEMBERSHIP_NOT_STARTED,
      message: 'This membership starts on 05/11/2026. Sessions can be recorded from then.',
    })
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('counts minutes other sessions hold as unavailable', async () => {
    // 600 − 500 used − 60 held leaves 40 free, short of the 60 requested.
    dbMocks.getMembershipById.mockResolvedValue(
      membership({ usedHoursMinutes: 500, reservedMinutes: 60 }),
    )

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe('MEMBERSHIP_INSUFFICIENT_HOURS')
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it.each([
    [
      'expired since it was read',
      membership({ status: 'expired' }),
      'MEMBERSHIP_EXPIRED',
      'This membership is not active or has expired',
    ],
    [
      'spent since it was read',
      membership({ usedHoursMinutes: 600 }),
      'MEMBERSHIP_INSUFFICIENT_HOURS',
      'The requested session duration exceeds the remaining membership hours',
    ],
    [
      'held by another session since it was read',
      membership({ reservedMinutes: 580 }),
      'MEMBERSHIP_INSUFFICIENT_HOURS',
      'The requested session duration exceeds the remaining membership hours',
    ],
    [
      'apparently unchanged',
      membership(),
      'MEMBERSHIP_INSUFFICIENT_HOURS',
      'The membership changed while this session was being recorded. Refresh and try again.',
    ],
  ])(
    'explains a guarded write that found the membership %s',
    async (_label, current, code, message) => {
      dbMocks.getMembershipById.mockResolvedValueOnce(membership()).mockResolvedValueOnce(current)
      dbMocks.recordMembershipSession.mockResolvedValue({ ok: false, reason: 'unavailable' })

      const res = await post({ services: [LINE], idempotencyKey: KEY })

      expect(res.status).toBe(409)
      expect(await errorOf(res)).toMatchObject({ code, message })
      expect(dbMocks.getMembershipById).toHaveBeenCalledTimes(2)
    },
  )

  it('answers a concurrent duplicate with the session that committed first', async () => {
    dbMocks.getMembershipSessionByKey.mockResolvedValueOnce(null).mockResolvedValueOnce(RECORDED)
    dbMocks.recordMembershipSession.mockResolvedValue({ ok: false, reason: 'duplicate_key' })

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ booking: { id: 'bk_1' }, duplicate: true })
  })

  it('rejects a duplicate key that belongs to something else', async () => {
    dbMocks.recordMembershipSession.mockResolvedValue({ ok: false, reason: 'duplicate_key' })

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe('CONFLICT')
  })
})

describe('POST /api/memberships/[id]/sessions — at the active branch', () => {
  it('refuses a form rendered for another branch, without writing', async () => {
    const res = await post({ branchId: OTHER_BRANCH.id, services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.getMembershipById).not.toHaveBeenCalled()
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('refuses staff who work at another branch', async () => {
    dbMocks.isStaffAtBranch.mockResolvedValue(false)

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(400)
    expect((await errorOf(res)).message).toBe('Choose staff who work at Rayasandra.')
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('refuses a service the branch doesn’t offer, naming it (R4.3)', async () => {
    dbMocks.getServicesByIds.mockResolvedValue([
      { id: 'svc_aroma_60', name: 'Aroma 60', availableBranchIds: ['branch_other'] },
    ])

    const res = await post({ services: [LINE] })

    expect(res.status).toBe(400)
    expect((await errorOf(res)).message).toBe(
      "Aroma 60 isn't offered at Rayasandra. Choose another service, or book at a branch that offers it.",
    )
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('takes no sessions at a branch that is not operational', async () => {
    dbMocks.getBranchByIdAdmin.mockResolvedValue({
      id: TEST_BRANCH.id,
      name: TEST_BRANCH.name,
      code: 'RS',
      number: 1,
      status: 'temporarily_closed',
    })

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(400)
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('uses the shared hours of a membership sold at another branch', async () => {
    dbMocks.getMembershipById.mockResolvedValue(
      membership({ sellingBranchId: OTHER_BRANCH.id, sellingBranch: OTHER_BRANCH }),
    )

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(201)
    expect(dbMocks.recordMembershipSession.mock.calls[0]?.[0]).toMatchObject({
      branchId: TEST_BRANCH.id,
    })
  })
})

describe('POST /api/memberships/[id]/sessions — one person does it (0028)', () => {
  const UNNAMED = { serviceId: 'svc_aroma_60', durationMinutes: 60 }

  it('requires the person doing it, before reading the membership', async () => {
    const res = await post({ services: [UNNAMED], idempotencyKey: KEY })

    expect(res.status).toBe(400)
    expect((await errorOf(res)).message).toBe('Choose who is doing this session.')
    expect(dbMocks.getMembershipById).not.toHaveBeenCalled()
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('gives every line the person the form chose', async () => {
    dbMocks.getServicesByIds.mockResolvedValue([
      { id: 'svc_aroma_60', name: 'Aroma 60' },
      { id: 'svc_scrub_30', name: 'Scrub 30' },
    ])

    const res = await post({
      staffId: 'stf_1',
      services: [UNNAMED, { serviceId: 'svc_scrub_30', durationMinutes: 30 }],
      idempotencyKey: KEY,
    })

    expect(res.status).toBe(201)
    expect(dbMocks.isStaffAtBranch).toHaveBeenCalledWith('stf_1', TEST_BRANCH.id)
    expect(dbMocks.recordMembershipSession.mock.calls[0]?.[0]).toMatchObject({
      services: [
        { serviceId: 'svc_aroma_60', staffId: 'stf_1', staffNameSnapshot: 'Anita' },
        { serviceId: 'svc_scrub_30', staffId: 'stf_1', staffNameSnapshot: 'Anita' },
      ],
    })
  })

  it('replays a retry that names the person once for the whole session', async () => {
    dbMocks.getMembershipSessionByKey.mockResolvedValue(RECORDED)

    const res = await post({ staffId: 'stf_1', services: [UNNAMED], idempotencyKey: KEY })

    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ duplicate: true, booking: { id: 'bk_1' } })
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('refuses lines that name different people, writing nothing', async () => {
    const res = await post({
      services: [LINE, { serviceId: 'svc_scrub_30', durationMinutes: 30, staffId: 'stf_2' }],
      idempotencyKey: KEY,
    })

    expect(res.status).toBe(400)
    expect((await errorOf(res)).message).toBe(
      'One person does the whole session. Choose one person for all of it.',
    )
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it.each([
    { refusal: 'booked', code: ERROR_CODES.STAFF_BUSY },
    { refusal: 'working', code: ERROR_CODES.STAFF_BUSY },
    { refusal: 'on_leave', code: ERROR_CODES.CONFLICT },
    { refusal: 'not_at_branch', code: ERROR_CODES.CONFLICT },
  ])(
    'answers a person the database refused as $refusal with 409 $code',
    async ({ refusal, code }) => {
      dbMocks.recordMembershipSession.mockResolvedValue({ ok: false, reason: 'staff', refusal })

      const res = await post({ services: [LINE], idempotencyKey: KEY })

      expect(res.status).toBe(409)
      expect(await errorOf(res)).toMatchObject({ code, message: `refused: ${refusal}` })
      expect(dbMocks.assigneeRefusalMessage).toHaveBeenCalledWith(refusal)
    },
  )
})

// --- Booking a session ahead (membership-scheduling.md lifecycle) ---

describe('POST /api/memberships/[id]/sessions — booked ahead', () => {
  // Monday 02/11/2026, 12:10 IST.
  const NOW = new Date('2026-11-02T06:40:00.000Z')
  const POLICY = {
    branchId: TEST_BRANCH.id,
    branchName: TEST_BRANCH.name,
    revision: 4,
    businessHours: DEFAULT_BUSINESS_HOURS,
    bookingRules: DEFAULT_BOOKING_RULES,
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    dbMocks.getBranchPolicy.mockResolvedValue(POLICY)
    dbMocks.getClosureOn.mockResolvedValue(null)
  })

  it('books a confirmed session for its date and time, recording the revision', async () => {
    const res = await post({
      services: [LINE],
      bookingDate: '2026-11-07',
      startTime: '16:30',
      idempotencyKey: KEY,
    })

    expect(res.status).toBe(201)
    expect(dbMocks.getClosureOn).toHaveBeenCalledWith(TEST_BRANCH.id, '2026-11-07')
    const params = dbMocks.recordMembershipSession.mock.calls[0]?.[0]
    expect(params).toMatchObject({
      when: 'ahead',
      settingsRevision: 4,
      startTime: '16:30',
      endTime: '17:30',
      recordedById: 'u_rec',
    })
    expect(params.bookingDate).toEqual(new Date('2026-11-07T00:00:00.000Z'))
    expect(params.bookingNumber).toMatch(/^BK-RS-2611-S-\d{5}-M$/)
  })

  it('books later today, and beyond the customer’s window and lead time', async () => {
    dbMocks.getMembershipById.mockResolvedValue(
      membership({ expiresAt: new Date('2027-06-30T18:29:59.999Z') }),
    )
    expect(
      (await post({ services: [LINE], bookingDate: '2026-11-02', startTime: '13:00' })).status,
    ).toBe(201)
    expect(
      (await post({ services: [LINE], bookingDate: '2027-01-15', startTime: '11:00' })).status,
    ).toBe(201)
  })

  it('needs the date of a session booked ahead', async () => {
    const res = await post({ services: [LINE], startTime: '16:30' })

    expect(res.status).toBe(400)
    expect(dbMocks.getMembershipById).not.toHaveBeenCalled()
  })

  it.each([
    ['already passed', '2026-11-02', '11:30', 'That time has passed'],
    ['outside the branch’s hours', '2026-11-07', '21:30', 'is open 10:00–22:00 on Saturdays'],
    ['off the half-hour grid', '2026-11-07', '16:15', 'on the hour or the half hour'],
    ['on a date already passed', '2026-11-01', '16:30', 'That date has passed'],
  ])('refuses a time %s, writing nothing', async (_case, bookingDate, startTime, says) => {
    const res = await post({ services: [LINE], bookingDate, startTime })
    const error = await errorOf(res)

    expect(res.status).toBe(409)
    expect(error.code).toBe(ERROR_CODES.BOOKING_SLOT_UNAVAILABLE)
    expect(error.message).toContain(says)
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('refuses a day the branch is closed, saying how to open it', async () => {
    dbMocks.getClosureOn.mockResolvedValue({ name: 'Diwali', allBranches: false })

    const res = await post({ services: [LINE], bookingDate: '2026-11-08', startTime: '11:00' })
    const error = await errorOf(res)

    expect(res.status).toBe(409)
    expect(error.message).toContain('Rayasandra is closed on 08/11/2026 (Diwali).')
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('checks validity at the planned start, not now', async () => {
    // Sold to start on 05/11/2026: bookable for the 7th, not the 4th.
    dbMocks.getMembershipById.mockResolvedValue(
      membership({ startsAt: new Date('2026-11-04T18:30:00.000Z') }),
    )

    expect(
      (await post({ services: [LINE], bookingDate: '2026-11-07', startTime: '16:30' })).status,
    ).toBe(201)

    const early = await post({ services: [LINE], bookingDate: '2026-11-04', startTime: '16:30' })
    expect(early.status).toBe(409)
    expect(await errorOf(early)).toMatchObject({
      code: ERROR_CODES.MEMBERSHIP_NOT_STARTED,
      message: 'This membership starts on 05/11/2026. Choose a time from then.',
    })
  })

  it('refuses a time after the membership expires, saying until when', async () => {
    dbMocks.getMembershipById.mockResolvedValue(
      membership({ expiresAt: new Date('2026-11-05T18:29:59.999Z') }),
    )

    const res = await post({ services: [LINE], bookingDate: '2026-11-07', startTime: '16:30' })

    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({
      code: ERROR_CODES.MEMBERSHIP_EXPIRED,
      message: 'This membership expires on 05/11/2026. Choose a time before then.',
    })
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('answers a person not scheduled then with 409 and the database’s reason', async () => {
    dbMocks.recordMembershipSession.mockResolvedValue({
      ok: false,
      reason: 'staff',
      refusal: 'off_schedule',
    })

    const res = await post({ services: [LINE], bookingDate: '2026-11-07', startTime: '16:30' })

    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({
      code: ERROR_CODES.CONFLICT,
      message: 'refused: off_schedule',
    })
  })

  it('explains a refused hold from a fresh read at the planned start', async () => {
    dbMocks.getMembershipById
      .mockResolvedValueOnce(membership())
      .mockResolvedValueOnce(membership({ expiresAt: new Date('2026-11-05T18:29:59.999Z') }))
    dbMocks.recordMembershipSession.mockResolvedValue({ ok: false, reason: 'unavailable' })

    const res = await post({ services: [LINE], bookingDate: '2026-11-07', startTime: '16:30' })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.MEMBERSHIP_EXPIRED)
  })
})
