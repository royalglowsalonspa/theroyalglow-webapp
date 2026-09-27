// @vitest-environment node
/************************************************************
 * Module Name  : availability/route.test
 * Scope        : Unit tests for GET /api/availability
 *
 * Description  : The booking dialog's time step calls this route. It required
 *                `branchId`, the dialog never sent one, and every request
 *                failed with 400 "Invalid availability query", so no customer
 *                could book online. These tests pin both halves of the fix: a
 *                request that names no branch gets the default branch's slots,
 *                and a named branch must exist and be taking bookings.
 *
 * Approach     : Only the query layer is mocked. The route, the error handler,
 *                @rgss/business (slot grid, branch rules) and the shared Zod
 *                schema stay real, so the envelopes are the ones the app sends.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getBranchById: vi.fn(),
  getPublicBranches: vi.fn(),
}))

vi.mock('@rgss/db/queries', () => dbMocks)

import { GET } from './route'

const OPEN_DAY = { open: '10:00', close: '21:00', closed: false }
const SETTINGS = {
  businessHours: {
    mon: OPEN_DAY,
    tue: OPEN_DAY,
    wed: OPEN_DAY,
    thu: OPEN_DAY,
    fri: OPEN_DAY,
    sat: OPEN_DAY,
    sun: OPEN_DAY,
  },
}

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

// Far enough ahead that the past-date guard never interferes.
const FUTURE_DATE = '2099-06-15'

const ROUTE_CTX = { params: Promise.resolve({}) } as never

async function get(query: string) {
  const res = await GET(new Request(`https://theroyalglow.in/api/availability?${query}`), ROUTE_CTX)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  dbMocks.getSettings.mockResolvedValue(SETTINGS)
  dbMocks.getPublicBranches.mockResolvedValue([RAYASANDRA, MARATHAHALLI])
  dbMocks.getBranchById.mockImplementation(
    async (id: string) => [RAYASANDRA, MARATHAHALLI].find((b) => b.id === id) ?? null,
  )
})

describe('GET /api/availability', () => {
  it('answers the date-only request the booking dialog used to send', async () => {
    const { status, body } = await get(`date=${FUTURE_DATE}`)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    // 10:00 to 20:30 on the 30-minute grid.
    expect(body.data.slots).toHaveLength(22)
    expect(body.data.slots[0]).toEqual({ startTime: '10:00', endTime: '10:30', available: true })
    // Answered for the default branch; no specific branch lookup was needed.
    expect(dbMocks.getPublicBranches).toHaveBeenCalledOnce()
    expect(dbMocks.getBranchById).not.toHaveBeenCalled()
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

  it('still rejects a missing date or an explicitly empty branchId', async () => {
    const noDate = await get('branchId=branch_rayasandra')
    const emptyBranch = await get(`date=${FUTURE_DATE}&branchId=`)

    for (const { status, body } of [noDate, emptyBranch]) {
      expect(status).toBe(400)
      expect(body.error.message).toBe('Invalid availability query')
    }
    expect(dbMocks.getSettings).not.toHaveBeenCalled()
  })
})
