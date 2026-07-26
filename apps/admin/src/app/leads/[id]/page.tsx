/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Lead Detail Page
 * Scope        : Admin Portal — Lead Management
 *
 * Description  : Server page for individual lead details. Extracts
 *                lead ID from dynamic route params and renders the
 *                LeadDetail client component.
 *
 * Responsibilities :
 * - Await dynamic route params (Next.js 16 Promise API)
 * - Set page-level metadata (title: "Lead Detail")
 * - Pass leadId to the LeadDetail client component
 *
 * Features / Functionality :
 * - Dynamic route [id] parameter extraction
 * - Next.js metadata for page title
 * - Clean server/client boundary separation
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), LeadDetail component
 *
 * Notes        :
 * - params is a Promise in Next.js 16 — must be awaited
 ************************************************************/

import type { Metadata } from 'next'
import { LeadDetail } from '@/components/lead/LeadDetail'

export const metadata: Metadata = {
  title: 'Lead Detail',
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params
  return <LeadDetail leadId={id} />
}
