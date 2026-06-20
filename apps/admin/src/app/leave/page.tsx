/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Leave Page
 * Scope        : Admin Portal — Leave Management
 *
 * Description  : Server page for staff leave request management.
 *                Sets metadata and renders the LeaveQueue component.
 *
 * Responsibilities :
 * - Define page-level metadata (title: "Leave")
 * - Render the LeaveQueue component as page content
 * - Serve as the route entry point for /leave
 *
 * Features / Functionality :
 * - Next.js metadata API for tab title
 * - Delegates leave approval workflow to LeaveQueue
 * - Clean separation of server metadata from client interactivity
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), LeaveQueue component
 *
 * Notes        :
 * - Server Component — no client-side code here
 ************************************************************/

import type { Metadata } from 'next'
import { LeaveQueue } from './leave-queue'

export const metadata: Metadata = {
  title: 'Leave',
}

export default function LeavePage() {
  return <LeaveQueue />
}
