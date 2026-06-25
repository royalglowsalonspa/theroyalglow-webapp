/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Reports Page
 * Scope        : Admin Portal — Reports / Analytics
 *
 * Description  : Thin server page for the Reports dashboard. Sets metadata and
 *                renders the interactive ReportsDashboard client component,
 *                which fetches GET /api/reports.
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), ReportsDashboard
 *
 * Notes        : Manager+ (enforced by edge middleware + API requireRole).
 ************************************************************/

import type { Metadata } from 'next'
import { ReportsDashboard } from './reports-dashboard'

export const metadata: Metadata = {
  title: 'Reports',
}

export default function ReportsPage() {
  return <ReportsDashboard />
}
