import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Special Offers | Royal Glow Salon & Spa',
  description:
    'Explore exclusive offers and discounts at Royal Glow Salon & Spa. Save on facials, spa treatments, and more at our Bengaluru salon.',
  openGraph: {
    title: 'Special Offers | Royal Glow Salon & Spa',
    description:
      'Explore exclusive offers and discounts at Royal Glow Salon & Spa in Bengaluru.',
    url: 'https://theroyalglow.in/offers',
    siteName: 'Royal Glow Salon & Spa',
    locale: 'en_IN',
    type: 'website',
  },
}

const offers = [
  {
    id: 'facial-20-off',
    type: 'percentage' as const,
    badge: 'Percentage Discount',
    name: '20% OFF All Facials',
    description:
      'Treat your skin to our premium facial treatments — Hydrafacial, Cleanup, Gold Facial, and more — at a special discounted price.',
    validFrom: '20/05/2026',
    validTo: '31/05/2026',
    terms: [
      'Max 1 per customer per day',
      'Cannot combine with other offers or gems',
      'Valid at Rayasandra branch only',
    ],
  },
  {
    id: 'first-visit-200',
    type: 'flat' as const,
    badge: 'Flat Discount',
    name: '₹200 OFF Your First Visit',
    description:
      'New to Royal Glow? Enjoy a flat ₹200 discount on your first completed booking. Applicable on all services ₹500 and above.',
    validFrom: 'Ongoing',
    validTo: 'New customers only',
    terms: [
      'First completed booking only',
      'Minimum spend ₹500 before discount',
      'Cannot combine with other offers',
    ],
  },
  {
    id: 'free-head-massage',
    type: 'complimentary' as const,
    badge: 'Complimentary Add-on',
    name: 'Free Head Massage with SPA Booking',
    description:
      'Book any SPA service and enjoy a complimentary 15-minute head massage. Pure relaxation, on the house.',
    validFrom: '01/06/2026',
    validTo: '30/06/2026',
    terms: [
      'Auto-applied at checkout',
      '15-minute add-on (no extra charge)',
      'Valid with all SPA services',
    ],
  },
]

const badgeEmoji: Record<string, string> = {
  percentage: '🎉',
  flat: '💎',
  complimentary: '🎁',
}

export default function OffersPage() {
  return (
    <div className="flex flex-col gap-20">
      {/* ═══════════════════════════════════════════════════════ */}
      {/* HEADING */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section aria-labelledby="offers-heading" className="px-5">
        <div className="mx-auto max-w-[1278px] mt-6 lg:mt-10">
          <h1
            id="offers-heading"
            className="font-display text-cocoa-dark tracking-[-1.44px] leading-[1.03] text-[clamp(40px,6vw,72px)]"
          >
            Special Offers
          </h1>
          <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-4 max-w-[520px]">
            Exclusive deals on our premium salon and spa services. Grab them before they expire.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* OFFER CARDS */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section aria-label="Current offers" className="px-5 pb-20">
        <div className="mx-auto max-w-[1278px]">
          {offers.length > 0 ? (
            <div className="grid grid-cols-1 gap-6">
              {offers.map((offer) => (
                <article
                  key={offer.id}
                  className="bg-rich-chocolate text-canvas-white border-l-4 border-deep-gold rounded-[6px] p-8"
                >
                  {/* Badge */}
                  <div className="flex items-center gap-2 mb-3">
                    <span aria-hidden="true">{badgeEmoji[offer.type]}</span>
                    <span className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone">
                      {offer.badge}
                    </span>
                  </div>

                  {/* Offer Name */}
                  <h2 className="font-display text-canvas-white text-xl lg:text-2xl">
                    {offer.name}
                  </h2>

                  {/* Description */}
                  <p className="font-sans text-[15px] leading-[1.55] text-dusty-gray mt-3 max-w-[600px]">
                    {offer.description}
                  </p>

                  {/* Validity */}
                  <p className="font-sans text-sm text-warm-stone mt-4">
                    Valid: {offer.validFrom} – {offer.validTo}
                  </p>

                  {/* Terms */}
                  <div className="mt-4">
                    <p className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone mb-2">
                      Terms
                    </p>
                    <ul className="space-y-1">
                      {offer.terms.map((term) => (
                        <li
                          key={term}
                          className="font-sans text-sm text-dusty-gray flex items-start gap-2"
                        >
                          <span className="text-deep-gold mt-0.5" aria-hidden="true">•</span>
                          {term}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* CTA */}
                  <Link
                    href="/?book=1"
                    className="inline-flex items-center gap-1 font-ui text-xs uppercase tracking-[0.5px] text-royal-gold mt-6 hover:text-canvas-white transition-colors duration-200"
                  >
                    Book Now <span aria-hidden="true">→</span>
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            /* Empty state */
            <div className="text-center py-16">
              <p className="font-sans text-[17px] leading-[1.6] text-warm-gray">
                No active offers right now. Check back soon!
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
