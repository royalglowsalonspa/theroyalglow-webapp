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

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { auth } from '@/lib/auth-server'
import { ArrowRight, Heart } from 'lucide-react'
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
        <h1 className="font-display font-black text-[clamp(32px,5vw,48px)] text-cocoa-dark tracking-tight leading-[1.05]">
          My Favorites
        </h1>
      </header>

      <Card
        className="items-center bg-warm-cream px-6 py-14 text-center"
        aria-labelledby="favorites-empty-heading"
      >
        <span
          className="flex size-14 items-center justify-center rounded-full bg-canvas-white text-deep-gold shadow-card-hover"
          aria-hidden="true"
        >
          <Heart className="size-7" strokeWidth={1.75} />
        </span>
        <h2
          id="favorites-empty-heading"
          className="mt-5 font-display text-[22px] tracking-tight text-cocoa-dark"
        >
          No favourites yet
        </h2>
        <p className="mt-2 max-w-[42ch] font-sans text-[15px] leading-relaxed text-warm-gray">
          Tap the heart on any service to save it here for quick booking next time.
        </p>
        <Button asChild variant="gold" size="lg" className="mt-7 font-ui font-bold">
          <Link href="/services">
            Browse services
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </Card>
    </div>
  )
}
