/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : New Membership Page
 * Scope        : Admin Portal — Membership Management
 *
 * Description  : Server page for selling a new SPA membership at the active
 *                branch. Authorizes like the API and hands the branch to
 *                CreateMembershipForm, which sends it back with the sale.
 *
 * Responsibilities :
 * - Resolve the active branch (receptionist or above there)
 * - Refuse a branch that isn't selling (not operational)
 * - Render the CreateMembershipForm for that branch
 *
 * Features / Functionality :
 * - The active branch is the selling branch and issues the purchase invoice
 *   (multi-branch R2.4, route inventory gap 5)
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), branch-page, CreateMembershipForm component
 *
 * Notes        :
 * - Server Component — form interactivity lives in CreateMembershipForm
 ************************************************************/

import type { Metadata } from 'next'
import { EmptyState } from '@/components/ui/state/empty-state'
import { branchForPage } from '@/lib/api/branch-page'
import { CreateMembershipForm } from './create-membership-form'

export const metadata: Metadata = {
  title: 'Sell Membership',
}

export default async function NewMembershipPage() {
  const access = await branchForPage('receptionist')
  if (!access.ok) {
    return <EmptyState title="Memberships can't be sold here" message={access.message} />
  }
  const { branch } = access
  if (branch.status !== 'operational') {
    return (
      <EmptyState
        title="Memberships can't be sold here"
        message={`${branch.name} is not selling memberships right now.`}
      />
    )
  }
  return <CreateMembershipForm branch={{ id: branch.id, name: branch.name }} />
}
