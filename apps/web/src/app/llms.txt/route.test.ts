/************************************************************
 * Module Name  : GET /llms.txt (route test)
 * Scope        : AI discovery — live service names, branch availability
 *
 * Description  : The service list says where a restricted service is
 *                offered, naming public branches only (multi-branch R4.2),
 *                and the file still answers 200 when the database fails.
 *                The query layer is mocked; no database.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  getAllServicesGrouped: vi.fn(),
  getPublicBranches: vi.fn(),
}))
vi.mock('@rgss/db/queries', () => dbMocks)

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  dbMocks.getPublicBranches.mockResolvedValue([
    { id: 'br_rs', name: 'Rayasandra', code: 'RS', city: 'Bengaluru', status: 'operational' },
  ])
  dbMocks.getAllServicesGrouped.mockResolvedValue([
    {
      id: 'cat_hair',
      name: 'Haircut & Styling',
      services: [{ name: 'Haircut', availableBranchIds: null }],
    },
    {
      id: 'cat_spa',
      name: 'VVIP SPA',
      services: [
        { name: 'Hot Stone', availableBranchIds: ['br_rs'] },
        { name: 'Kerala Potli', availableBranchIds: ['br_shut'] },
      ],
    },
  ])
})

describe('GET /llms.txt', () => {
  it('lists the live services and says where a restricted one is offered', async () => {
    const res = await GET()
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain(
      'We offer Haircut, Hot Stone (only at Rayasandra), Kerala Potli (not offered at any branch right now).',
    )
  })

  it('falls back to the static list when the database read fails', async () => {
    dbMocks.getPublicBranches.mockRejectedValue(new Error('db down'))

    const res = await GET()
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('We offer haircuts, hair colouring, facials')
    expect(body).not.toContain('Hot Stone')
  })
})
