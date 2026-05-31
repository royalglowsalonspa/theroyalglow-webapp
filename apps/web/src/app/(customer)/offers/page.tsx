import type { Metadata } from 'next'
import { formatINR } from '@rgss/business'
import { getActiveOffers } from '@rgss/db/queries'
import { OfferBookButton } from '@/components/offers/OfferBookButton'
import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = buildMetadata({
  title: 'Special Offers',
  description:
    'Explore exclusive offers and discounts at Royal Glow Salon & Spa. Save on facials, spa treatments, and more at our Bengaluru salon.',
  path: '/offers',
})

// Re-fetch active offers on each request so newly published/expired offers
// surface promptly (no stale ISR cache for a promotions surface).
export const dynamic = 'force-dynamic'

type ActiveOffer = Awaited<ReturnType<typeof getActiveOffers>>[number]

const OFFER_BADGE: Record<string, { emoji: string; label: string }> = {
  percentage: { emoji: '🎉', label: 'Percentage Discount' },
  flat: { emoji: '💎', label: 'Flat Discount' },
  combo_price: { emoji: '🎁', label: 'Combo Price' },
}

// "2026-05-24T00:00:00.000Z" | Date | "2026-05-24" → "24/05/2026".
function formatDate(value: Date | string): string {
  const iso = value instanceof Date ? value.toISOString() : value
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

// Human-readable discount label per offer type.
function discountLabel(offer: ActiveOffer): string {
  switch (offer.offerType) {
    case 'percentage':
      return offer.discountPercentage != null
        ? `${offer.discountPercentage}% OFF`
        : 'Special discount'
    case 'flat':
      return offer.discountAmountPaise != null
        ? `${formatINR(offer.discountAmountPaise)} OFF`
        : 'Flat discount'
    case 'combo_price':
      return offer.comboPricePaise != null
        ? `Combo at ${formatINR(offer.comboPricePaise)}`
        : 'Combo offer'
    default:
      return 'Special offer'
  }
}

export default async function OffersPage() {
  const offers = await getActiveOffers()

  return (
    <div className="flex flex-col gap-20">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: SITE_URL },
          { name: 'Offers' },
        ])}
      />
      {/* HEADING */}
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

      {/* OFFER CARDS */}
      <section aria-label="Current offers" className="px-5 pb-20">
        <div className="mx-auto max-w-[1278px]">
          {offers.length > 0 ? (
            <div className="grid grid-cols-1 gap-6">
              {offers.map((offer) => {
                const badge = OFFER_BADGE[offer.offerType] ?? {
                  emoji: '✨',
                  label: 'Offer',
                }
                return (
                  <article
                    key={offer.id}
                    className="bg-rich-chocolate text-canvas-white border-l-4 border-deep-gold rounded-[6px] p-8"
                  >
                    {/* Badge */}
                    <div className="flex items-center gap-2 mb-3">
                      <span aria-hidden="true">{badge.emoji}</span>
                      <span className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone">
                        {badge.label}
                      </span>
                    </div>

                    {/* Discount label + name */}
                    <p className="font-ui text-[13px] uppercase tracking-[1px] text-royal-gold mb-1">
                      {discountLabel(offer)}
                    </p>
                    <h2 className="font-display text-canvas-white text-xl lg:text-2xl">
                      {offer.name}
                    </h2>

                    {/* Description */}
                    {offer.description && (
                      <p className="font-sans text-[15px] leading-[1.55] text-dusty-gray mt-3 max-w-[600px]">
                        {offer.description}
                      </p>
                    )}

                    {/* Applicable services */}
                    {offer.services.length > 0 && (
                      <p className="font-sans text-sm text-warm-stone mt-4">
                        <span className="text-dusty-gray">Applies to: </span>
                        {offer.services.map((s) => s.name).join(', ')}
                      </p>
                    )}

                    {/* Validity */}
                    <p className="font-sans text-sm text-warm-stone mt-2">
                      Valid: {formatDate(offer.startDate)} – {formatDate(offer.endDate)}
                    </p>

                    {/* Terms */}
                    {offer.terms && (
                      <p className="font-sans text-sm text-dusty-gray mt-4 max-w-[600px]">
                        {offer.terms}
                      </p>
                    )}

                    {/* CTA */}
                    <OfferBookButton offerId={offer.id} />
                  </article>
                )
              })}
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
