'use client'

import Link from 'next/link'
import { track } from '@/lib/analytics/events'

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
