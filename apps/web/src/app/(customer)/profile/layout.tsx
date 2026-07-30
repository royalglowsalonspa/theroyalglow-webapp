/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ProfileLayout
 * Scope        : Customer Pages — profile-completion gate
 *
 * Description  : Server layout that gates /profile on a completed
 *                `customer_profile`, routing a first-time user to /onboarding.
 *
 * Responsibilities :
 * - Run requireOnboardedSession() before the segment renders
 * - Render children unchanged (no chrome of its own)
 *
 * Tech Stack   : Next.js 16 (App Router, RSC)
 * Layer        : Presentation (Layout)
 *
 * Dependencies : @/lib/onboarding-guard
 *
 * Notes        :
 * - Deliberately per-segment, NOT in `(customer)/layout.tsx`: that layout is
 *   shared with the public homepage, /services, /blog, /about, /contact and
 *   /faq, which must not pay for a profile lookup.
 ************************************************************/

import { requireOnboardedSession } from '@/lib/onboarding-guard'

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  await requireOnboardedSession()
  return children
}
