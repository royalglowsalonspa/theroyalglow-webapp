/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : StaffLayout
 * Scope        : Staff Portal
 *
 * Description  : Layout for the staff self-service area (schedule + leave).
 *                Provides minimal chrome with RBAC session gating and compact navigation.
 *
 * Responsibilities :
 * - Validate staff session via Better Auth (redirect if unauthenticated)
 * - Render the staff header with wordmark and navigation (Schedule, Leave)
 * - Provide accessible skip-link and main content area
 *
 * Features / Functionality :
 * - Session-gated layout (min role: staff via middleware)
 * - Compact header with Schedule and Leave nav links
 * - No admin sidebar — staff see only their own surfaces
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, Better Auth
 * Layer        : Presentation
 *
 * Dependencies : auth, next (Metadata, headers, redirect), next/link
 *
 * Notes        :
 * - Access is also gated by RBAC middleware at the route level
 ************************************************************/

import { auth } from '@/lib/auth-server'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: {
    template: '%s | Staff | Royal Glow',
    default: 'Staff | Royal Glow',
  },
  robots: { index: false, follow: false },
}

// Minimal chrome for the staff self-service area (schedule + leave). Access is
// gated by middleware (min role 'staff'); we also resolve the session here so a
// missing/expired session falls back to the homepage rather than rendering an empty
// shell. No admin sidebar — staff see only their own surfaces.
export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-canvas-white">
      <a
        href="#staff-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-royal-gold focus:text-cocoa-dark focus:font-ui focus:text-xs focus:uppercase focus:tracking-[0.5px] focus:rounded-full focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      <header className="border-b border-cloud-gray bg-canvas-white">
        <div className="mx-auto flex max-w-[960px] items-center justify-between gap-4 px-5 py-4">
          <Link href="/staff/schedule" className="flex flex-col">
            <span className="font-display text-[18px] leading-none text-cocoa-dark tracking-tight">
              Royal Glow
            </span>
            <span className="font-ui text-[10px] uppercase tracking-[2px] text-warm-stone mt-1">
              Staff
            </span>
          </Link>

          <nav aria-label="Staff navigation" className="flex items-center gap-1">
            <Link
              href="/staff/schedule"
              className="font-ui text-[12px] uppercase tracking-[0.5px] text-warm-gray hover:text-cocoa-dark rounded-full px-3 py-2 transition-colors duration-200"
            >
              Schedule
            </Link>
            <Link
              href="/staff/leave"
              className="font-ui text-[12px] uppercase tracking-[0.5px] text-warm-gray hover:text-cocoa-dark rounded-full px-3 py-2 transition-colors duration-200"
            >
              Leave
            </Link>
          </nav>
        </div>
      </header>

      <main id="staff-main" className="mx-auto max-w-[960px] px-5 py-8 lg:py-10">
        {children}
      </main>
    </div>
  )
}
