/************************************************************
 * Module Name  : test/branch-context
 * Scope        : Test support — branch context for route tests
 *
 * Description  : Builds the BranchContext that requireBranchRole resolves, so
 *                route tests can mock requireBranchRole and keep the real
 *                assertRenderedBranch:
 *
 *                  vi.mock('@/lib/api/branch-context', async (importOriginal) => ({
 *                    ...(await importOriginal()),
 *                    requireBranchRole: mocks.requireBranchRole,
 *                  }))
 *                  mocks.requireBranchRole.mockResolvedValue(branchContext())
 ************************************************************/

import type { BranchRole } from '@rgss/business'
import type { BranchContext } from '@/lib/api/branch-context'

type TestBranch = {
  id: string
  name: string
  code: string
  status: 'operational' | 'temporarily_closed' | 'opens_soon' | 'shutdown'
  isPrimary: boolean
}

/** The active branch in route tests. */
export const TEST_BRANCH: TestBranch = {
  id: 'branch_rs',
  name: 'Rayasandra',
  code: 'RS',
  status: 'operational',
  isPrimary: true,
}

/** Another branch, for cross-branch cases. */
export const OTHER_BRANCH: TestBranch = {
  id: 'branch_mh',
  name: 'Marathahalli',
  code: 'MH',
  status: 'operational',
  isPrimary: false,
}

/** The context requireBranchRole resolves for `userId` acting as `role` at `branch`. */
export function branchContext({
  userId = 'user_1',
  role = 'receptionist',
  branch = TEST_BRANCH,
}: {
  userId?: string
  role?: BranchRole
  branch?: TestBranch
} = {}): BranchContext {
  const active = { ...branch, role }
  return {
    session: { user: { id: userId, role } },
    access: { userId, role, branches: [active] },
    branch: active,
  } as unknown as BranchContext
}
