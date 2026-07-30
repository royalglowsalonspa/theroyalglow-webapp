/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingsLayout
 * Scope        : Customer Pages — profile-completion gate
 *
 * Description  : Server layout that gates /bookings (and /bookings/[id]) on a
 *                completed `customer_profile`, routing a first-time user to
 *                /onboarding before they can browse or manage bookings.
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
 * - Covers the nested /bookings/[id] detail route too, which is why the gate
 *   lives in the segment layout rather than in each page.
 ************************************************************/

import { requireOnboardedSession } from '@/lib/onboarding-guard'

export default async function BookingsLayout({ children }: { children: React.ReactNode }) {
  await requireOnboardedSession()
  return children
}
