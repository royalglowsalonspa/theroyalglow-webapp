/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 07-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : FavoritesPage
 * Scope        : Customer Pages
 *
 * Description  : Customer-facing "Favorites" page. Auth-guarded shell with the
 *                page header and an on-brand empty state pointing users to the
 *                services catalogue. Detailed favourite-service management is
 *                delivered by the favourite-services feature spec.
 *
 * Responsibilities :
 * - Guard the route (redirect signed-out visitors to sign-in)
 * - Render the page header and a clear empty state
 *
 * Features / Functionality :
 * - Static metadata with robots noindex/nofollow (private user data)
 * - Empty state with a primary CTA to browse services
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, Better Auth
 * Layer        : Presentation
 *
 * Dependencies : auth, next (Metadata), next/headers, next/navigation, next/link
 *
 * Notes        :
 * - Protected route; redirects to / (homepage) if no session
 ************************************************************/

import { auth } from '@/lib/auth-server'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'My Favorites',
  description: 'Your saved Royal Glow services and rituals.',
  robots: { index: false, follow: false },
}

export default async function FavoritesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/')
  }

  return (
    <div className="mx-auto max-w-[800px] px-5 py-10 lg:py-14">
      <header className="mb-8">
        <p className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-2">
          Saved for you
        </p>
        <h1 className="font-display text-[clamp(32px,5vw,48px)] text-cocoa-dark tracking-tight leading-[1.05]">
          My Favorites
        </h1>
      </header>

      <section
        className="flex flex-col items-center rounded-[6px] border border-cloud-gray bg-warm-cream px-6 py-14 text-center"
        aria-labelledby="favorites-empty-heading"
      >
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas-white text-deep-gold shadow-card-hover"
          aria-hidden="true"
        >
          <svg
            className="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
        </span>
        <h2
          id="favorites-empty-heading"
          className="mt-5 font-display text-[22px] text-cocoa-dark tracking-tight"
        >
          No favourites yet
        </h2>
        <p className="mt-2 max-w-[42ch] font-sans text-[15px] leading-relaxed text-warm-gray">
          Tap the heart on any service to save it here for quick booking next time.
        </p>
        <Link
          href="/services"
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-warm-gold px-7 py-3 font-ui font-bold text-sm text-cocoa-dark transition-all duration-200 hover:bg-deep-gold active:scale-[0.97]"
        >
          Browse services <span aria-hidden="true">→</span>
        </Link>
      </section>
    </div>
  )
}
