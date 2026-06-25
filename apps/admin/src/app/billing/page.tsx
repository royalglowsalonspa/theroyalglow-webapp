/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Billing Page
 * Scope        : Admin Portal — Billing
 *
 * Description  : Server page for the invoice ledger. Sets metadata and renders
 *                the interactive BillingTable.
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), BillingTable
 *
 * Notes        : Receptionist+ (enforced by edge middleware + API requireRole).
 ************************************************************/

import type { Metadata } from 'next'
import { BillingTable } from './billing-table'

export const metadata: Metadata = {
  title: 'Billing',
}

export default function BillingPage() {
  return <BillingTable />
}
