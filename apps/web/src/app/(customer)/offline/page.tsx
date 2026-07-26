/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : OfflinePage
 * Scope        : Customer Pages
 *
 * Description  : PWA offline fallback page shown when the user has no network
 *                connection. Provides a retry link and salon phone number.
 *
 * Responsibilities :
 * - Display a friendly "You're offline" message
 * - Provide a retry (home) link to re-check connectivity
 * - Show the salon phone number for urgent contact
 *
 * Features / Functionality :
 * - Branded dark card with offline messaging
 * - Retry CTA linking back to homepage
 * - Direct phone link for immediate assistance
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : next (Metadata), next/link
 *
 * Notes        :
 * - Served by the service worker when all network requests fail
 ************************************************************/

import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: "You're Offline | Royal Glow Salon & Spa",
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <section aria-labelledby="offline-heading" className="px-5 py-20">
      <div className="mx-auto max-w-[1278px]">
        <div className="bg-cocoa-dark rounded-[6px] p-8 sm:p-12 lg:p-16 text-center">
          {/* Eyebrow */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="w-2 h-2 rounded-full bg-royal-gold" aria-hidden="true" />
            <span className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone">
              No Connection
            </span>
          </div>

          {/* Headline */}
          <h1
            id="offline-heading"
            className="font-display font-black text-canvas-white tracking-[-1.44px] leading-[1.03] text-[clamp(40px,6vw,72px)]"
          >
            You're offline
          </h1>

          {/* Message */}
          <p className="font-sans text-[17px] leading-[1.6] text-dusty-gray mt-6 max-w-[480px] mx-auto">
            We can't reach Royal Glow right now. Check your connection and try again — your
            appointments and offers will be waiting for you.
          </p>

          {/* Retry + contact */}
          <div className="mt-8 flex flex-col items-center gap-4">
            <Button
              asChild
              variant="gold"
              className="rounded-full font-ui text-xs uppercase tracking-[0.5px]"
            >
              <Link href="/">Try Again</Link>
            </Button>
            <p className="font-sans text-[15px] leading-[1.55] text-warm-stone">
              Need us now? Call{' '}
              <a
                href="tel:+916360135720"
                className="font-ui text-royal-gold underline underline-offset-2 hover:text-warm-gold transition-colors duration-200"
              >
                +91 63601 35720
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
