// @vitest-environment node
/************************************************************
 * Module Name  : branches/missing-manager.test
 * Scope        : Page loaders — dashboard banner (multi-branch R1.9)
 *
 * Description  : The dashboard banner shows for an operational branch
 *                without a Manager, offers the assign link only to the
 *                branch's Owner and the Developer, and never breaks the
 *                dashboard when its read fails.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const pageMock = vi.hoisted(() => vi.fn())
const dbMocks = vi.hoisted(() => ({ getBranchById: vi.fn() }))

vi.mock('@/lib/api/branch-page', () => ({ branchForPage: pageMock }))
vi.mock('@rgss/db/queries', () => dbMocks)

import { missingManagerNotice } from './missing-manager'

function access(role: string, status = 'operational') {
  return {
    ok: true,
    branch: {
      id: 'branch_mh',
      name: 'Marathahalli',
      code: 'MH',
      status,
      isPrimary: false,
      role,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('missingManagerNotice', () => {
  it('shows for an operational branch without a Manager, with the link for its Owner', async () => {
    pageMock.mockResolvedValue(access('owner'))
    dbMocks.getBranchById.mockResolvedValue({ status: 'operational', managerUserId: null })

    expect(await missingManagerNotice()).toEqual({ branchName: 'Marathahalli', canAssign: true })
    expect(pageMock).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getBranchById).toHaveBeenCalledWith('branch_mh')
  })

  it('shows without the link to a Receptionist', async () => {
    pageMock.mockResolvedValue(access('receptionist'))
    dbMocks.getBranchById.mockResolvedValue({ status: 'operational', managerUserId: null })

    expect(await missingManagerNotice()).toEqual({
      branchName: 'Marathahalli',
      canAssign: false,
    })
  })

  it('gives the Developer the link', async () => {
    pageMock.mockResolvedValue(access('developer'))
    dbMocks.getBranchById.mockResolvedValue({ status: 'operational', managerUserId: null })

    expect((await missingManagerNotice())?.canAssign).toBe(true)
  })

  it('hides once a Manager is assigned, or when the branch is not operational', async () => {
    pageMock.mockResolvedValue(access('owner'))
    dbMocks.getBranchById.mockResolvedValue({ status: 'operational', managerUserId: 'm_1' })
    expect(await missingManagerNotice()).toBeNull()

    dbMocks.getBranchById.mockResolvedValue({ status: 'opens_soon', managerUserId: null })
    expect(await missingManagerNotice()).toBeNull()
  })

  it('hides for someone who cannot open the dashboard at any branch', async () => {
    pageMock.mockResolvedValue({ ok: false, message: 'No branch' })

    expect(await missingManagerNotice()).toBeNull()
    expect(dbMocks.getBranchById).not.toHaveBeenCalled()
  })

  it('hides instead of breaking the dashboard when the read fails', async () => {
    pageMock.mockResolvedValue(access('owner'))
    dbMocks.getBranchById.mockRejectedValue(new Error('connection reset'))

    expect(await missingManagerNotice()).toBeNull()
  })
})
