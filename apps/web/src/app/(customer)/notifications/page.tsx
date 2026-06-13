/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 07-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : NotificationsPage
 * Scope        : Customer Pages
 *
 * Description  : Auth-guarded notifications page. Renders the full
 *                notifications list (relocated from the header bell into the
 *                account menu → this page).
 *
 * Responsibilities :
 * - Guard the route (redirect signed-out visitors to sign-in)
 * - Render the client NotificationsPanel
 *
 * Features / Functionality :
 * - Static metadata with robots noindex/nofollow (private user data)
 *
 * Tech Stack   : React, Next.js 16 (App Router), Better Auth
 * Layer        : Presentation
 *
 * Dependencies : auth, next (Metadata), next/headers, next/navigation
 *
 * Notes        : Protected route; redirects to /sign-in if no session.
 ************************************************************/

import { auth } from '@/lib/auth-server'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { NotificationsPanel } from './notifications-panel'

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Your Royal Glow booking updates, reminders, and offers.',
  robots: { index: false, follow: false },
}

export default async function NotificationsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/sign-in')
  }

  return <NotificationsPanel />
}
