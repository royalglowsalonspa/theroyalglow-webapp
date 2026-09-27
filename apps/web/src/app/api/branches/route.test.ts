// @vitest-environment node
/************************************************************
 * Module Name  : branches/route.test
 * Scope        : Unit tests for GET /api/branches
 *
 * Description  : The booking dialog's branch picker reads this route. It must
 *                list each visible branch with whether it takes bookings, name
 *                the branch to preselect, and expose nothing beyond name, city
 *                and status.
 *
 * Approach     : Only the query layer is mocked; @rgss/business stays real.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  getPublicBranches: vi.fn(),
}))

vi.mock('@rgss/db/queries', () => dbMocks)

import { GET } from './route'

const ROUTE_CTX = { params: Promise.resolve({}) } as never

async function get() {
  const res = await GET(new Request('https://theroyalglow.in/api/branches'), ROUTE_CTX)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/branches', () => {
  it('lists the branches, which take bookings, and the one to preselect', async () => {
    dbMocks.getPublicBranches.mockResolvedValue([
      {
        id: 'branch_rayasandra',
        name: 'Rayasandra',
        city: 'Bengaluru',
        status: 'operational',
        isPrimary: true,
      },
      {
        id: 'branch_marathahalli',
        name: 'Marathahalli',
        city: 'Bengaluru',
        status: 'opens_soon',
        isPrimary: false,
      },
    ])

    const { status, body } = await get()

    expect(status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        branches: [
          {
            id: 'branch_rayasandra',
            name: 'Rayasandra',
            city: 'Bengaluru',
            status: 'operational',
            acceptingBookings: true,
          },
          {
            id: 'branch_marathahalli',
            name: 'Marathahalli',
            city: 'Bengaluru',
            status: 'opens_soon',
            acceptingBookings: false,
          },
        ],
        defaultBranchId: 'branch_rayasandra',
      },
    })
  })

  it('reports no default when no branch is taking bookings', async () => {
    dbMocks.getPublicBranches.mockResolvedValue([
      {
        id: 'branch_marathahalli',
        name: 'Marathahalli',
        city: 'Bengaluru',
        status: 'opens_soon',
        isPrimary: true,
      },
    ])

    const { status, body } = await get()

    expect(status).toBe(200)
    expect(body.data.defaultBranchId).toBeNull()
    expect(body.data.branches[0].acceptingBookings).toBe(false)
  })

  it('answers with the standard error envelope when the branches cannot be read', async () => {
    dbMocks.getPublicBranches.mockRejectedValue(new Error('database unavailable'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { status, body } = await get()

    expect(status).toBe(500)
    expect(body.success).toBe(false)
    // The internal error message never reaches the customer.
    expect(JSON.stringify(body)).not.toContain('database unavailable')
    consoleError.mockRestore()
  })
})
