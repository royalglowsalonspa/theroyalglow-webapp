/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : New Membership Page
 * Scope        : Admin Portal — Membership Management
 *
 * Description  : Server page for creating new SPA memberships.
 *                Sets metadata and renders CreateMembershipForm.
 *
 * Responsibilities :
 * - Define page-level metadata (title: "Create Membership")
 * - Render the CreateMembershipForm component as page content
 * - Serve as the route entry point for /admin/memberships/new
 *
 * Features / Functionality :
 * - Next.js metadata API for tab title
 * - Delegates membership creation logic to CreateMembershipForm
 * - Clean separation of server metadata from client interactivity
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), CreateMembershipForm component
 *
 * Notes        :
 * - Server Component — form interactivity lives in CreateMembershipForm
 ************************************************************/

import type { Metadata } from 'next'
import { CreateMembershipForm } from './create-membership-form'

export const metadata: Metadata = {
  title: 'Create Membership',
}

export default function NewMembershipPage() {
  return <CreateMembershipForm />
}
