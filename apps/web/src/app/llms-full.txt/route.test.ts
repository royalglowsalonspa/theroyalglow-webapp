/************************************************************
 * Module Name  : GET /llms-full.txt (route test)
 * Scope        : AI discovery — full menu, branch availability
 *
 * Description  : Each menu line keeps its price and duration and, for a
 *                restricted service, says where it is offered, naming public
 *                branches only (multi-branch R4.2). A database failure still
 *                answers 200 with the menu pointer. The query layer is
 *                mocked; no database.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  getAllServicesGrouped: vi.fn(),
  getPublicBranches: vi.fn(),
}))
vi.mock('@rgss/db/queries', () => dbMocks)

import { GET } from './route'

function service(name: string, availableBranchIds: string[] | null) {
  return { name, pricePaise: 250_000, durationMinutes: 60, availableBranchIds }
}

beforeEach(() => {
  vi.clearAllMocks()
  dbMocks.getPublicBranches.mockResolvedValue([
    { id: 'br_rs', name: 'Rayasandra', code: 'RS', city: 'Bengaluru', status: 'operational' },
    { id: 'br_mh', name: 'Marathahalli', code: 'MH', city: 'Bengaluru', status: 'opens_soon' },
  ])
  dbMocks.getAllServicesGrouped.mockResolvedValue([
    {
      id: 'cat_spa',
      name: 'VVIP SPA',
      services: [
        service('Swedish', null),
        service('Hot Stone', ['br_rs']),
        service('Kerala Potli', ['br_rs', 'br_mh']),
      ],
    },
    // A category with no active services is left out.
    { id: 'cat_empty', name: 'Empty', services: [] },
  ])
})

describe('GET /llms-full.txt', () => {
  it('says where each restricted service is offered, and nothing for every branch', async () => {
    const res = await GET()
    const body = await res.text()

    expect(res.status).toBe(200)
    const lines = body.split('\n').filter((line) => line.startsWith('- ') && line.includes(' min'))
    expect(lines).toEqual([
      '- Swedish — ₹2,500.00 — 60 min',
      '- Hot Stone — ₹2,500.00 — 60 min — Only at Rayasandra',
      '- Kerala Potli — ₹2,500.00 — 60 min — Only at Marathahalli and Rayasandra',
    ])
    expect(body).not.toContain('### Empty')
  })

  it('falls back to the menu pointer when the database read fails', async () => {
    dbMocks.getAllServicesGrouped.mockRejectedValue(new Error('db down'))

    const res = await GET()
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('Our full menu is temporarily unavailable here.')
    expect(body).not.toContain('Hot Stone')
  })
})
