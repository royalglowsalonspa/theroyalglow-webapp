/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Tax Settings Page
 * Scope        : Admin Portal — Branch tax rates (multi-branch R6.4, TX-01)
 *
 * Description  : Server page for the active branch's GST rates per SAC code.
 *                Authorizes like the API (Developer only) and renders the
 *                TaxManager, or a refusal for anyone else.
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), branch-page, EmptyState, TaxManager
 *
 * Notes        :
 * - Server Component — interactivity lives in TaxManager
 ************************************************************/

import type { Metadata } from 'next'
import { EmptyState } from '@/components/ui/state/empty-state'
import { branchForPage } from '@/lib/api/branch-page'
import { TaxManager } from './tax-manager'

export const metadata: Metadata = {
  title: 'Tax Rates',
}

export default async function TaxSettingsPage() {
  const access = await branchForPage('developer')
  if (!access.ok) {
    return <EmptyState title="Tax rates aren't available here" message={access.message} />
  }
  return <TaxManager />
}
