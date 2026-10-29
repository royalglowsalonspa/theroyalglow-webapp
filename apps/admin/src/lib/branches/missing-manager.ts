/************************************************************
 * Module Name  : branches/missing-manager (admin)
 * Scope        : Page loaders — dashboard banner (multi-branch R1.9)
 *
 * Description  : Whether the dashboard should say that the active branch has
 *                no Manager: it is operational and nobody manages it. The
 *                same rule drives the daily reminder to the Owner
 *                (lacksManager in @rgss/business).
 *
 * Responsibilities :
 * - missingManagerNotice() → { branchName, canAssign } | null
 *
 * Notes        : Authorizes like the dashboard (Receptionist or above at the
 *                active branch). Only the branch's Owner and the Developer can
 *                assign a Manager (R1.5), so only they get the link. A failed
 *                read hides the banner rather than breaking the dashboard.
 ************************************************************/

import { hasBranchRole, lacksManager } from '@rgss/business'
import { getBranchById } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { unstable_rethrow } from 'next/navigation'
import { branchForPage } from '@/lib/api/branch-page'

const logger = createLogger({
  service: 'admin:branches:missing-manager',
  environment: process.env.NODE_ENV ?? 'development',
})

export type MissingManagerNotice = {
  branchName: string
  /** The viewer may assign one in Users & Roles. */
  canAssign: boolean
}

export async function missingManagerNotice(): Promise<MissingManagerNotice | null> {
  try {
    const access = await branchForPage('receptionist')
    if (!access.ok) {
      return null
    }
    const row = await getBranchById(access.branch.id)
    if (!row || !lacksManager({ status: row.status, hasManager: row.managerUserId !== null })) {
      return null
    }
    return {
      branchName: access.branch.name,
      canAssign: hasBranchRole(access.branch, 'owner'),
    }
  } catch (error) {
    // Let Next.js handle its own control-flow errors (dynamic rendering, redirects).
    unstable_rethrow(error)
    logger.warn('missing-Manager check failed; banner hidden', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
