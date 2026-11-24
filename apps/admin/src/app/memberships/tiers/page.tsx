/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Membership Tiers Page
 * Scope        : Admin Portal — Membership Management (multi-branch R9.4)
 *
 * Description  : Server page for the membership tiers screen. Tiers are the
 *                starting templates a sale prefills from; one list serves
 *                every branch and customers never see it.
 *
 * Responsibilities :
 * - Authorize like the tiers API (Receptionist or above at the active branch)
 * - Render the TiersManager
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), branch-page, EmptyState, TiersManager
 *
 * Notes        :
 * - Server Component — interactivity lives in TiersManager
 ************************************************************/

import type { Metadata } from 'next'
import { EmptyState } from '@/components/ui/state/empty-state'
import { branchForPage } from '@/lib/api/branch-page'
import { TiersManager } from './tiers-manager'

export const metadata: Metadata = {
  title: 'Membership Tiers',
}

export default async function MembershipTiersPage() {
  const access = await branchForPage('receptionist')
  if (!access.ok) {
    return <EmptyState title="Membership tiers aren't available here" message={access.message} />
  }
  return <TiersManager />
}
