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

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics/events'

/**
 * Offer "Book Now" CTA. Client-only wrapper around the booking deep-link so we
 * can emit the `offer_clicked` funnel event on click. Navigation behaviour is
 * unchanged — the link still routes to the homepage booking dialog. The
 * `track()` call is fire-and-forget and a no-op without a loaded provider.
 */
export function OfferBookButton({
  offerId,
  href = '/?book=1',
  label = 'Book Now',
}: {
  offerId: string
  href?: string
  label?: string
}) {
  return (
    <Button asChild variant="gold" className="w-fit font-ui font-bold">
      <Link href={href} onClick={() => track('offer_clicked', { offerId })}>
        {label}
        <ArrowRight data-icon="inline-end" aria-hidden="true" />
      </Link>
    </Button>
  )
}
