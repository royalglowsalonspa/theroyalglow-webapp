/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Waitlist Page
 * Scope        : Admin Portal — Waitlist Management
 *
 * Description  : Server page for waitlist queue management. Sets metadata and
 *                renders the WaitlistQueue component.
 *
 * Responsibilities :
 * - Define page-level metadata (title: "Waitlist")
 * - Render the WaitlistQueue component as page content
 * - Serve as the route entry point for /waitlist
 *
 * Features / Functionality :
 * - Next.js metadata API for tab title
 * - Delegates the waitlist workflow to WaitlistQueue
 * - Clean separation of server metadata from client interactivity
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), WaitlistQueue component
 *
 * Notes        :
 * - Server Component — no client-side code here
 ************************************************************/

import type { Metadata } from 'next'
import { WaitlistQueue } from './waitlist-queue'

export const metadata: Metadata = {
  title: 'Waitlist',
}

export default function WaitlistPage() {
  return <WaitlistQueue />
}
