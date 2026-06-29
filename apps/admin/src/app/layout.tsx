import { AdminShell } from '@/components/layout/admin-shell'
import { auth } from '@/lib/auth-server'
import { getDevImpersonatedSession } from '@/lib/dev-auth'
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (admin)
 * Module Name  : RootLayout
 * Scope        : Application Shell
 *
 * Description  : Root layout for the admin portal (admin.theroyalglow.in).
 *                Provides the global HTML shell, base (noindex) metadata, and
 *                the admin chrome (sidebar + top bar) that wraps every admin
 *                page. The signed-in user's role is resolved on the server here
 *                and passed into the client shell so the sidebar shows only the
 *                navigation the user may see.
 *
 * Responsibilities :
 * - Provide the root <html>/<body> shell
 * - Set global metadata (title template, robots noindex — admin is private)
 * - Resolve the session server-side and derive role + display details
 * - Wrap all admin pages in the AdminShell chrome
 *
 * Tech Stack   : Next.js 16 (App Router), React, Better Auth
 * Layer        : Presentation (Layout)
 *
 * Dependencies : next (Metadata), next/headers, @/lib/auth-server, AdminShell
 *
 * Notes        :
 * - suppressHydrationWarning for browser-extension compatibility
 * - Access control is enforced by the edge middleware (lib/rbac); this layout
 *   only drives nav visibility. Unknown/absent roles resolve to the lowest
 *   level, so the sidebar fails closed.
 ************************************************************/
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Royal Glow Admin',
    template: '%s | Royal Glow Admin',
  },
  description: 'Royal Glow Salon & Spa — admin portal.',
  robots: { index: false, follow: false },
}

/** Derive up-to-two-letter uppercase initials from a display name. */
function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return 'RG'
  }
  const letters = parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase())
  return letters.join('')
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // LOCAL DEV ONLY — when the middleware auth bypass is active, there is no
  // shared session on localhost, so assume a Developer role to render the full
  // sidebar. This branch can never run in a production build (NODE_ENV guard).
  const devBypass =
    process.env.NODE_ENV !== 'production' && process.env.ADMIN_DEV_BYPASS_AUTH === '1'

  if (devBypass) {
    const devRole = 'developer'
    return (
      <html lang="en" translate="no" suppressHydrationWarning>
        <body suppressHydrationWarning>
          <AdminShell role={devRole} userName="Dev (bypass)" userInitials="DV">
            {children}
          </AdminShell>
        </body>
      </html>
    )
  }

  // Resolve the session on the server so the shell renders the correct role and
  // user details on first paint (no flash). Access is already gated by the edge
  // middleware before this layout runs. In local dev, an optional impersonated
  // session (ADMIN_DEV_IMPERSONATE_EMAIL) takes precedence — never in prod.
  const session =
    (await getDevImpersonatedSession()) ?? (await auth.api.getSession({ headers: await headers() }))
  const user = session?.user
  const role = (user as { role?: string } | undefined)?.role ?? 'customer'
  const userName = user?.name ?? 'Admin User'
  const userInitials = toInitials(user?.name ?? '')

  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AdminShell role={role} userName={userName} userInitials={userInitials}>
          {children}
        </AdminShell>
      </body>
    </html>
  )
}
