/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : MembershipLayout
 * Scope        : Customer Pages — profile-completion gate
 *
 * Description  : Server layout that gates /membership on a completed
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
 * Notes        : Mirrors the /profile, /bookings and /gems segment gates.
 ************************************************************/

import { requireOnboardedSession } from '@/lib/onboarding-guard'

export default async function MembershipLayout({ children }: { children: React.ReactNode }) {
  await requireOnboardedSession()
  return children
}
