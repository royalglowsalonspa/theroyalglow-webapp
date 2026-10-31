/************************************************************
 * Module Name  : GET /api/services (route test)
 * Scope        : API — public catalogue, branch availability (R4.2, R7.2)
 *
 * Description  : The catalogue keeps each service's branches and gains a
 *                customer-facing note for a restricted one, naming public
 *                branches only. The query layer is mocked; no database.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  getActiveCatalogue: vi.fn(),
  getPublicBranches: vi.fn(),
}))
vi.mock('@rgss/db/queries', () => dbMocks)

import { GET } from './route'

const CTX = { params: Promise.resolve({}) } as never

function service(id: string, availableBranchIds: string[] | null) {
  return {
    id,
    categoryId: 'cat_spa',
    categoryName: 'Premium SPA',
    serviceType: 'spa',
    name: id,
    slug: id,
    durationMinutes: 60,
    pricePaise: 250_000,
    gemsRedeemable: false,
    gemsRequired: null,
    availableBranchIds,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  dbMocks.getPublicBranches.mockResolvedValue([
    { id: 'br_rs', name: 'Rayasandra', code: 'RS', city: 'Bengaluru', status: 'operational' },
    { id: 'br_mh', name: 'Marathahalli', code: 'MH', city: 'Bengaluru', status: 'opens_soon' },
  ])
  dbMocks.getActiveCatalogue.mockResolvedValue([
    {
      id: 'cat_spa',
      name: 'Premium SPA',
      serviceType: 'spa',
      displayOrder: 1,
      services: [
        service('svc_all', null),
        service('svc_rs', ['br_rs']),
        service('svc_two', ['br_rs', 'br_mh']),
        service('svc_closed', ['br_shut']),
      ],
    },
  ])
})

describe('GET /api/services', () => {
  it('says where each restricted service is offered, and nothing for every branch', async () => {
    const res = await GET(new Request('https://theroyalglow.in/api/services'), CTX)
    const json = await res.json()

    expect(res.status).toBe(200)
    const services = json.data.categories[0].services as {
      id: string
      availableBranchIds: string[] | null
      availabilityNote: string | null
    }[]
    expect(services.map((s) => [s.id, s.availabilityNote])).toEqual([
      ['svc_all', null],
      ['svc_rs', 'Only at Rayasandra'],
      ['svc_two', 'Only at Marathahalli and Rayasandra'],
      // A branch that isn't public is never named.
      ['svc_closed', 'Not offered at any branch right now'],
    ])
    expect(services[1]?.availableBranchIds).toEqual(['br_rs'])
  })
})
