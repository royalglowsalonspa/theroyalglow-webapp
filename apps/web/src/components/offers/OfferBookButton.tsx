/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : OfferBookButton
 * Scope        : Offers UI
 *
 * Description  : Offer "Book Now" CTA that emits an analytics event on click
 *                while navigating to the homepage booking dialog.
 *
 * Responsibilities :
 * - Render offer booking CTA link
 * - Fire offer_clicked analytics event with offerId on click
 *
 * Features / Functionality :
 * - Link to /?book=1 (booking dialog deep-link)
 * - Fire-and-forget analytics tracking
 * - Gold-coloured text with hover transition
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS, Next.js
 * Layer        : Frontend
 *
 * Dependencies : @/lib/analytics/events, next/link
 *
 * Notes        : None
 ************************************************************/

'use client'

import { track } from '@/lib/analytics/events'
import Link from 'next/link'

/**
 * Offer "Book Now" CTA. Client-only wrapper around the booking deep-link so we
 * can emit the `offer_clicked` funnel event on click. Navigation behaviour is
 * unchanged — the link still routes to the homepage booking dialog. The
 * `track()` call is fire-and-forget and a no-op without a loaded provider.
 */
export function OfferBookButton({ offerId }: { offerId: string }) {
  return (
    <Link
      href="/?book=1"
      onClick={() => track('offer_clicked', { offerId })}
      className="inline-flex items-center gap-1 font-ui text-xs uppercase tracking-[0.5px] text-royal-gold mt-6 hover:text-canvas-white transition-colors duration-200"
    >
      Book Now <span aria-hidden="true">→</span>
    </Link>
  )
}
