/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Membership Detail Page
 * Scope        : Admin Portal — Membership Management
 *
 * Description  : Server page for individual membership detail view.
 *                Extracts membership ID from dynamic route params
 *                and renders the MembershipDetail client component.
 *
 * Responsibilities :
 * - Await dynamic route params (Next.js 16 Promise API)
 * - Set page-level metadata (title: "Membership Detail")
 * - Pass membershipId to the MembershipDetail client component
 *
 * Features / Functionality :
 * - Dynamic route [id] parameter extraction
 * - Next.js metadata for page title
 * - Clean server/client boundary separation
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), MembershipDetail component
 *
 * Notes        :
 * - params is a Promise in Next.js 16 — must be awaited
 ************************************************************/

import type { Metadata } from 'next'
import { MembershipDetail } from './membership-detail'

export const metadata: Metadata = {
  title: 'Membership Detail',
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function MembershipDetailPage({ params }: PageProps) {
  const { id } = await params
  return <MembershipDetail membershipId={id} />
}
