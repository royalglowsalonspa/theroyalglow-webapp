// @vitest-environment node
/************************************************************
 * Module Name  : availability/route.test
 * Scope        : Unit tests for GET /api/availability
 *
 * Description  : The booking dialog's time step calls this route.
 *                - A request that names no branch gets the default branch's
 *                  slots; a named branch must exist and be taking bookings
 *                  (requiring `branchId` once failed every request with 400).
 *                - Slots follow the branch's own settings (R6.3): its hours
 *                  that weekday, its lead time and its booking window; a day
 *                  without slots says why. Nothing falls back to defaults.
 *
 * Approach     : Only the query layer is mocked. The route, the error handler,
 *                @rgss/business (slot grid, branch rules) and the shared Zod
 *                schema stay real, so the envelopes are the ones the app sends.
 *                Date is faked to Monday 02/11/2026, 10:00 IST.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import { DEFAULT_BOOKING_RULES, DEFAULT_BUSINESS_HOURS } from '@rgss/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  getBranchById: vi.fn(),
  getBranchPolicy: vi.fn(),
  getPublicBranches: vi.fn(),
  getClosureOn: vi.fn(async (): Promise<{ name: string; allBranches: boolean } | null> => null),
}))

vi.mock('@rgss/db/queries', () => dbMocks)

import { GET } from './route'

// The live branch rows (Rayasandra operational and primary, Marathahalli opening soon).
const RAYASANDRA = {
  id: 'branch_rayasandra',
  name: 'Rayasandra',
  city: 'Bengaluru',
  status: 'operational',
  isPrimary: true,
}
const MARATHAHALLI = {
  id: 'branch_marathahalli',
  name: 'Marathahalli',
  city: 'Bengaluru',
  status: 'opens_soon',
  isPrimary: false,
}

// Rayasandra's current settings: the documented defaults at revision 3.
const POLICY = {
  branchId: 'branch_rayasandra',
  branchName: 'Rayasandra',
  revision: 3,
  businessHours: DEFAULT_BUSINESS_HOURS,
  bookingRules: DEFAULT_BOOKING_RULES,
}

// Monday 02/11/2026, 10:00 IST.
const NOW = new Date('2026-11-02T04:30:00.000Z')
const TODAY = '2026-11-02'
// Tuesday, inside the 30-day booking window.
const FUTURE_DATE = '2026-11-10'

const ROUTE_CTX = { params: Promise.resolve({}) } as never

async function get(query: string) {
  const res = await GET(new Request(`https://theroyalglow.in/api/availability?${query}`), ROUTE_CTX)
  return { status: res.status, body: await res.json() }
}

function availableStarts(body: { data: { slots: { startTime: string; available: boolean }[] } }) {
  return body.data.slots.filter((s) => s.available).map((s) => s.startTime)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  dbMocks.getPublicBranches.mockResolvedValue([RAYASANDRA, MARATHAHALLI])
  dbMocks.getBranchById.mockImplementation(
    async (id: string) => [RAYASANDRA, MARATHAHALLI].find((b) => b.id === id) ?? null,
  )
  dbMocks.getBranchPolicy.mockResolvedValue(POLICY)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/availability — the branch', () => {
  it('answers the date-only request the booking dialog used to send', async () => {
    const { status, body } = await get(`date=${FUTURE_DATE}`)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    // 10:00 to 20:30 on the 30-minute grid.
    expect(body.data.slots).toHaveLength(22)
    expect(body.data.slots[0]).toEqual({ startTime: '10:00', endTime: '10:30', available: true })
    expect(body.data.notice).toBeNull()
    // Answered for the default branch, with its settings; no specific branch lookup.
    expect(dbMocks.getPublicBranches).toHaveBeenCalledOnce()
    expect(dbMocks.getBranchById).not.toHaveBeenCalled()
    expect(dbMocks.getBranchPolicy).toHaveBeenCalledWith('branch_rayasandra')
  })

  it('returns slots for a named branch that is taking bookings', async () => {
    const { status, body } = await get(`date=${FUTURE_DATE}&branchId=branch_rayasandra`)

    expect(status).toBe(200)
    expect(body.data.slots).toHaveLength(22)
    expect(dbMocks.getBranchById).toHaveBeenCalledWith('branch_rayasandra')
  })

  it('rejects an unknown branch', async () => {
    const { status, body } = await get(`date=${FUTURE_DATE}&branchId=branch_nowhere`)

    expect(status).toBe(400)
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Branch not found.' })
    expect(dbMocks.getBranchPolicy).not.toHaveBeenCalled()
  })

  it('rejects a branch that is not taking bookings yet', async () => {
    const { status, body } = await get(`date=${FUTURE_DATE}&branchId=branch_marathahalli`)

    expect(status).toBe(400)
    expect(body.error.message).toBe('Selected branch is not accepting bookings.')
  })

  it('rejects a date-only request when no branch is taking bookings', async () => {
    dbMocks.getPublicBranches.mockResolvedValue([MARATHAHALLI])

    const { status, body } = await get(`date=${FUTURE_DATE}`)

    expect(status).toBe(400)
    expect(body.error.message).toBe('No branch is taking bookings right now.')
  })

  it('still rejects a missing date, an explicitly empty branchId or a bad duration', async () => {
    const noDate = await get('branchId=branch_rayasandra')
    const emptyBranch = await get(`date=${FUTURE_DATE}&branchId=`)
    const badDuration = await get(`date=${FUTURE_DATE}&durationMinutes=0`)

    for (const { status, body } of [noDate, emptyBranch, badDuration]) {
      expect(status).toBe(400)
      expect(body.error.message).toBe('Invalid availability query')
    }
    expect(dbMocks.getBranchPolicy).not.toHaveBeenCalled()
  })
})

describe('GET /api/availability — closures (R1.8)', () => {
  it('says the day is open when there is no closure', async () => {
    const { body } = await get(`date=${FUTURE_DATE}&branchId=branch_rayasandra`)

    expect(body.data.closure).toBeNull()
    expect(dbMocks.getClosureOn).toHaveBeenCalledWith('branch_rayasandra', FUTURE_DATE)
  })

  it('closes every slot on a holiday or closure, and says why', async () => {
    dbMocks.getClosureOn.mockResolvedValueOnce({ name: 'Diwali', allBranches: true })

    const { status, body } = await get(`date=${FUTURE_DATE}&branchId=branch_rayasandra`)

    expect(status).toBe(200)
    expect(body.data.closure).toEqual({ name: 'Diwali' })
    expect(body.data.slots).toHaveLength(22)
    expect(body.data.slots.every((s: { available: boolean }) => !s.available)).toBe(true)
  })

  it("checks the default branch's closures for a date-only request", async () => {
    await get(`date=${FUTURE_DATE}`)

    expect(dbMocks.getClosureOn).toHaveBeenCalledWith('branch_rayasandra', FUTURE_DATE)
  })
})

describe("GET /api/availability — the branch's own settings (R6.3)", () => {
  it('spans that weekday’s opening hours at the branch', async () => {
    dbMocks.getBranchPolicy.mockResolvedValue({
      ...POLICY,
      businessHours: {
        ...DEFAULT_BUSINESS_HOURS,
        tue: { open: '12:00', close: '20:00', closed: false },
      },
    })

    const { body } = await get(`date=${FUTURE_DATE}`)

    expect(body.data.slots[0].startTime).toBe('12:00')
    expect(body.data.slots.at(-1)).toEqual({
      startTime: '19:30',
      endTime: '20:00',
      available: true,
    })
    expect(body.data.slots).toHaveLength(16)
  })

  it('has no slots on a weekday the branch is closed, and says so', async () => {
    dbMocks.getBranchPolicy.mockResolvedValue({
      ...POLICY,
      businessHours: { ...DEFAULT_BUSINESS_HOURS, tue: { open: null, close: null, closed: true } },
    })

    const { status, body } = await get(`date=${FUTURE_DATE}`)

    expect(status).toBe(200)
    expect(body.data.slots).toEqual([])
    expect(body.data.notice).toBe('Rayasandra is closed on Tuesdays.')
  })

  it('has no slots beyond the branch’s booking window, and says so', async () => {
    dbMocks.getBranchPolicy.mockResolvedValue({
      ...POLICY,
      bookingRules: { ...DEFAULT_BOOKING_RULES, maxAdvanceBookingDays: 7 },
    })

    const { body } = await get(`date=${FUTURE_DATE}`)

    expect(body.data.slots).toEqual([])
    expect(body.data.notice).toBe('Rayasandra takes bookings up to 7 days ahead.')
  })

  it('offers today’s slots only after the branch’s lead time', async () => {
    // 10:00 IST now: an hour's lead time makes 11:00 the first start.
    const { body } = await get(`date=${TODAY}`)
    expect(availableStarts(body)[0]).toBe('11:00')

    dbMocks.getBranchPolicy.mockResolvedValue({
      ...POLICY,
      bookingRules: { ...DEFAULT_BOOKING_RULES, minAdvanceLeadTimeMinutes: 180 },
    })
    const longer = await get(`date=${TODAY}`)
    expect(availableStarts(longer.body)[0]).toBe('13:00')
  })

  it('offers only the starts a booking of the given length can finish from', async () => {
    const { body } = await get(`date=${FUTURE_DATE}&durationMinutes=90`)

    expect(availableStarts(body).at(-1)).toBe('19:30')
    expect(body.data.slots).toHaveLength(22)
  })

  it('refuses a past date with 400, before any notice', async () => {
    const { status, body } = await get('date=2026-11-01')

    expect(status).toBe(400)
    expect(body.error.message).toBe('Cannot request availability for a past date')
  })

  it('answers 409 when the branch has no readable settings, never defaults', async () => {
    dbMocks.getBranchPolicy.mockRejectedValue(
      conflict(
        ERROR_CODES.BRANCH_SETTINGS_INCOMPLETE,
        'Rayasandra has no valid booking settings. The Developer sets them under Settings.',
      ),
    )

    const { status, body } = await get(`date=${FUTURE_DATE}`)

    expect(status).toBe(409)
    expect(body.error.code).toBe('BRANCH_SETTINGS_INCOMPLETE')
  })
})
