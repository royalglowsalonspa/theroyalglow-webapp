/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : OffersSection
 * Scope        : Customer Pages
 *
 * Description  : Server component that resolves homepage special offers from
 *                Payload CMS (active, ordered, within validity window) and
 *                renders full-bleed image cards. Falls back to curated
 *                hardcoded offers when the CMS is unconfigured, unreachable,
 *                or empty.
 *
 * Responsibilities :
 * - Fetch active offers via the CMS read seam (getActiveOffers)
 * - Provide a graceful hardcoded fallback when CMS returns nothing
 * - Render up to four offer cards with booking CTAs
 *
 * Features / Functionality :
 * - CMS-first content with curated fallback (2 offers)
 * - ISR-cached reads (1h default) via the CMS fetch seam
 * - Gradient overlay cards with hover scale + gold CTA buttons
 *
 * Tech Stack   : React (server), Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/lib/cms/client, @/lib/cms/types, next/link
 *
 * Notes        :
 * - Owner creates offers in Payload → appear here within the ISR window.
 ************************************************************/
import { FALLBACK_OFFERS, getActiveOffers } from '@/lib/cms/client'
import type { Offer } from '@/lib/cms/types'
import Link from 'next/link'

const HOMEPAGE_OFFER_LIMIT = 4

function OfferCard({ offer }: { offer: Offer }) {
  return (
    <article className="group relative h-[360px] md:h-[400px] rounded-xl overflow-hidden cursor-pointer">
      <img
        src={offer.image.url}
        alt={offer.image.alt}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-8">
        {offer.discountLabel && (
          <p className="font-ui text-[11px] font-bold uppercase tracking-[0.15em] text-warm-gold mb-2">
            {offer.discountLabel}
          </p>
        )}
        <h3 className="font-display font-bold text-2xl text-white mb-3 leading-tight">
          {offer.title}
        </h3>
        {offer.description && <p className="font-sans text-white/80 mb-7">{offer.description}</p>}
        <div>
          <Link
            href={offer.ctaHref}
            className="bg-warm-gold text-cocoa-dark px-7 py-3 rounded-xl font-ui font-bold text-sm hover:bg-deep-gold transition-colors duration-200 inline-block"
          >
            {offer.ctaLabel}
          </Link>
        </div>
      </div>
    </article>
  )
}

export async function OffersSection() {
  const cmsOffers = await getActiveOffers()
  const source = cmsOffers.length > 0 ? cmsOffers : FALLBACK_OFFERS
  const offers = source.slice(0, HOMEPAGE_OFFER_LIMIT)

  return (
    <section
      aria-labelledby="offers-heading"
      className="px-4 md:px-8 py-16 mx-auto w-full max-w-[1280px]"
    >
      <h2
        id="offers-heading"
        className="font-display font-black text-cocoa-dark text-[clamp(28px,4vw,40px)] tracking-tight leading-[1.1] mb-10"
      >
        Special Offers
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {offers.map((offer) => (
          <OfferCard key={offer.id} offer={offer} />
        ))}
      </div>
    </section>
  )
}
