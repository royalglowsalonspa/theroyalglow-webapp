/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Memberships Page
 * Scope        : Admin Portal — Membership Management
 *
 * Description  : Server page for the SPA memberships list. Sets
 *                metadata and renders the MembershipsList component.
 *
 * Responsibilities :
 * - Define page-level metadata (title: "Memberships")
 * - Render the MembershipsList component as page content
 * - Serve as the route entry point for /memberships
 *
 * Features / Functionality :
 * - Next.js metadata API for tab title
 * - Delegates membership list/filter logic to MembershipsList
 * - Clean separation of server metadata from client interactivity
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), MembershipsList component
 *
 * Notes        :
 * - Server Component — no client-side code here
 ************************************************************/

import type { Metadata } from 'next'
import { MembershipsList } from './memberships-list'

export const metadata: Metadata = {
  title: 'Memberships',
}

export default function MembershipsPage() {
  return <MembershipsList />
}
