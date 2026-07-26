/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : MeLayout (staff self-service)
 * Scope        : Admin Portal — Staff Self-Service
 *
 * Description  : Layout for the staff self-service area (/me/schedule + /me/leave),
 *                relocated from apps/web/staff/* during the admin-web-separation
 *                feature. Session-gated; the admin RootLayout's AdminShell already
 *                provides the chrome, and filterNavByLevel limits a staff user's
 *                sidebar to the Self-Service section (RBAC `/me`, level 1).
 *
 * Responsibilities :
 * - Resolve the session server-side; redirect to the customer site if absent
 *   (defence-in-depth complementing the edge middleware RBAC gate)
 * - Mark the self-service area noindex
 *
 * Tech Stack   : React, Next.js 16 (App Router), Better Auth
 * Layer        : Presentation
 *
 * Notes        :
 * - Access is gated by admin middleware (min role 'staff' for `/me/*`). This
 *   layout adds a server-side session fallback only.
 ************************************************************/

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth-server'

export const metadata: Metadata = {
  title: {
    template: '%s | Royal Glow',
    default: 'Self-Service | Royal Glow',
  },
  robots: { index: false, follow: false },
}

const WEB_ORIGIN = 'https://theroyalglow.in'

// Session-gate the staff self-service area. The edge middleware already enforces
// the `/me` RBAC minimum (staff, level 1); this resolves the session as a
// defence-in-depth fallback so a missing/expired session lands on the customer
// site rather than rendering an empty shell.
export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect(WEB_ORIGIN)
  }

  return children
}
