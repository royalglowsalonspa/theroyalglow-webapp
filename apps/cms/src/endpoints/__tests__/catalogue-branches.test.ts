/************************************************************
 * Module Name  : catalogue-branches.test
 * Scope        : CMS — GET /api/catalogue-branches and the picker's options
 *                (catalogue-availability.md)
 *
 * Description  : The endpoint answers 401 without a CMS login and lists the
 *                branches in display order; the picker hides shut-down
 *                branches unless chosen and keeps unknown chosen ids visible.
 ************************************************************/

import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { branchOptions } from '../../components/branch-options'
import { txDb } from '../../lib/sync-db'
import { catalogueBranchesEndpoint, catalogueBranchesHandler } from '../catalogue-branches'

vi.mock('../../lib/sync-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sync-db')>()
  return { ...actual, txDb: vi.fn() }
})

afterEach(() => {
  vi.mocked(txDb).mockReset()
})

const BRANCHES = [
  { id: 'branch_rs', name: 'Rayasandra', code: 'RS', status: 'operational' },
  { id: 'branch_mh', name: 'Marathahalli', code: 'MH', status: 'opens_soon' },
  { id: 'branch_old', name: 'Old Town', code: 'OT', status: 'shutdown' },
]

describe('GET /api/catalogue-branches', () => {
  it('is mounted at /catalogue-branches for GET', () => {
    expect(catalogueBranchesEndpoint).toMatchObject({ path: '/catalogue-branches', method: 'get' })
  })

  it('answers 401 without a signed-in CMS login, reading nothing', async () => {
    const res = await catalogueBranchesHandler({ user: null } as unknown as PayloadRequest)
    expect(res.status).toBe(401)
    expect(txDb).not.toHaveBeenCalled()
  })

  it('lists every branch for a signed-in login, uncached', async () => {
    const orderBy = vi.fn(async () => BRANCHES)
    const from = vi.fn(() => ({ orderBy }))
    vi.mocked(txDb).mockResolvedValue({ select: vi.fn(() => ({ from })) } as never)

    const res = await catalogueBranchesHandler({
      user: { email: 'manager@theroyalglow.in' },
    } as unknown as PayloadRequest)

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ branches: BRANCHES })
    expect(orderBy).toHaveBeenCalledTimes(1)
  })
})

describe('branchOptions', () => {
  it('lists branches with their status, hiding shut-down ones not chosen', () => {
    expect(branchOptions(BRANCHES, new Set())).toEqual([
      { id: 'branch_rs', label: 'Rayasandra (RS)' },
      { id: 'branch_mh', label: 'Marathahalli (MH, opens soon)' },
    ])
  })

  it('keeps a chosen shut-down branch and an unknown chosen id, so they can be unticked', () => {
    expect(branchOptions(BRANCHES, new Set(['branch_old', 'zz_gone']))).toEqual([
      { id: 'branch_rs', label: 'Rayasandra (RS)' },
      { id: 'branch_mh', label: 'Marathahalli (MH, opens soon)' },
      { id: 'branch_old', label: 'Old Town (OT, shut down)' },
      { id: 'zz_gone', label: 'Unknown branch zz_gone' },
    ])
  })
})
