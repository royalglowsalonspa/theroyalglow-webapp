/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookLandingPage
 * Scope        : Lead Capture
 *
 * Description  : Meta ad lead capture landing page. Renders a minimal 3-field
 *                form (name, phone, service interest) to capture leads from paid traffic.
 *
 * Responsibilities :
 * - Extract UTM parameters from search params for attribution
 * - Resolve the `branch` parameter (id or code) the ad link names
 * - Fetch available service interest options for the form dropdown
 * - Mount the LeadCaptureForm component with UTM and branch context
 *
 * Features / Functionality :
 * - UTM parameter extraction (source, medium, campaign, content, term)
 * - Service interest dropdown populated from database
 * - No-index/no-follow to prevent organic indexing of ad page
 *
 * Tech Stack   : React, Next.js 16 (App Router), Drizzle ORM
 * Layer        : Presentation
 *
 * Dependencies : LeadCaptureForm, getServiceInterestOptions, next (Metadata)
 *
 * Notes        :
 * - This page is NOT linked from site navigation — reached only via ad clicks
 ************************************************************/

import { matchBranchParam } from '@rgss/business'
import { getPublicBranches, getServiceInterestOptions } from '@rgss/db/queries'
import type { Metadata } from 'next'
import { LeadCaptureForm } from '@/components/lead/LeadCaptureForm'

// Ad-traffic landing page — never indexed, never linked from site navigation.
export const metadata: Metadata = {
  title: 'Book Your Visit | Royal Glow Salon & Spa',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

// Pull the first value for a query key (Next can hand back string | string[]).
function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

export default async function BookLandingPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const [services, branches] = await Promise.all([getServiceInterestOptions(), getPublicBranches()])

  const utm = {
    utmSource: firstParam(sp.utm_source),
    utmMedium: firstParam(sp.utm_medium),
    utmCampaign: firstParam(sp.utm_campaign),
    utmContent: firstParam(sp.utm_content),
    utmTerm: firstParam(sp.utm_term),
  }
  // An ad can name its branch (`?branch=MH`); the API falls back to the
  // default branch otherwise (multi-branch R7.3).
  const branchId = matchBranchParam(branches, firstParam(sp.branch))?.id

  return <LeadCaptureForm services={services} utm={utm} branchId={branchId} />
}
