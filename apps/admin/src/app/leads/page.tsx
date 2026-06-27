/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Leads Page
 * Scope        : Admin Portal — Lead Management
 *
 * Description  : Server page for the lead pipeline. Sets metadata
 *                and renders the LeadsTable list component.
 *
 * Responsibilities :
 * - Define page-level metadata (title: "Leads")
 * - Render the LeadsTable component for the lead pipeline
 * - Serve as the route entry point for /leads
 *
 * Features / Functionality :
 * - Next.js metadata API for tab title
 * - Delegates the lead list to LeadsTable (DataTable + FilterBar primitives)
 * - Clean separation of server metadata from client interactivity
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), LeadsTable component
 *
 * Notes        :
 * - Server Component — list interactivity lives in LeadsTable
 ************************************************************/

import type { Metadata } from 'next'
import { LeadsTable } from './leads-table'

export const metadata: Metadata = {
  title: 'Leads',
}

export default function LeadsPage() {
  return <LeadsTable />
}
