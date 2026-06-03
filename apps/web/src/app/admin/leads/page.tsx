/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Leads Page
 * Scope        : Admin Portal — Lead Management
 *
 * Description  : Server page for the lead pipeline. Sets metadata
 *                and renders the LeadKanban board component.
 *
 * Responsibilities :
 * - Define page-level metadata (title: "Leads")
 * - Render the LeadKanban component for pipeline visualization
 * - Serve as the route entry point for /admin/leads
 *
 * Features / Functionality :
 * - Next.js metadata API for tab title
 * - Delegates lead pipeline to LeadKanban (kanban board)
 * - Clean separation of server metadata from client interactivity
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), LeadKanban component
 *
 * Notes        :
 * - Server Component — kanban interactivity lives in LeadKanban
 ************************************************************/

import { LeadKanban } from '@/components/lead/LeadKanban'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Leads',
}

export default function LeadsPage() {
  return <LeadKanban />
}
