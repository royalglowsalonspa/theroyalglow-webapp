/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Settlements Page
 * Scope        : Admin Portal — statements between branches (multi-branch R10)
 *
 * Description  : Server page for the monthly statements between branches:
 *                what each owes the other for SPA membership sessions and
 *                gems, the net, and its payment. Authorizes like the API (the
 *                two branches' Owners and the Developer) and renders the
 *                SettlementsManager, or a refusal for anyone else.
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), settlement-access, EmptyState,
 *                SettlementsManager
 *
 * Notes        :
 * - Server Component — interactivity lives in SettlementsManager
 ************************************************************/

import type { Metadata } from 'next'
import { EmptyState } from '@/components/ui/state/empty-state'
import { settlementViewerForPage } from '@/lib/api/settlement-access'
import { SettlementsManager } from './settlements-manager'

export const metadata: Metadata = {
  title: 'Settlements',
}

export default async function SettlementsPage() {
  const access = await settlementViewerForPage()
  if (!access.ok) {
    return <EmptyState title="Settlements aren't available here" message={access.message} />
  }
  return <SettlementsManager />
}
