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
 *                or empty. Rebuilt on the shadcn/ui Button + Badge primitives
 *                with a motion Reveal header.
 *
 * Responsibilities :
 * - Fetch active offers via the CMS read seam (getActiveOffers)
 * - Provide a graceful hardcoded fallback when CMS returns nothing
 * - Render up to two offer cards with booking CTAs
 *
 * Features / Functionality :
 * - CMS-first content with curated fallback (2 offers)
 * - ISR-cached reads (1h default) via the CMS fetch seam
 * - Gradient overlay cards with hover scale + gold CTA buttons
 *
 * Tech Stack   : React (server), Next.js 16 (App Router), Tailwind CSS v4,
 *                shadcn/ui, motion, lucide-react
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/lib/cms/client, @/lib/cms/types, @/components/ui/button,
 *                @/components/ui/motion/reveal, lucide-react, next/link
 *
 * Notes        :
 * - Owner creates offers in Payload → appear here within the ISR window.
 ************************************************************/

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Reveal } from '@/components/ui/motion/reveal'
import { FALLBACK_OFFERS, getActiveOffers } from '@/lib/cms/client'
import type { Offer } from '@/lib/cms/types'

const HOMEPAGE_OFFER_LIMIT = 2

function OfferCard({ offer }: { offer: Offer }) {
  return (
    <article className="group relative h-[360px] cursor-pointer overflow-hidden rounded-xl md:h-[400px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={offer.image.url}
        alt={offer.image.alt}
        className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-8">
        {offer.discountLabel && (
          <p className="mb-2 font-ui text-[11px] font-bold uppercase tracking-[0.15em] text-warm-gold">
            {offer.discountLabel}
          </p>
        )}
        <h3 className="mb-3 font-display text-2xl font-bold leading-tight text-white">
          {offer.title}
        </h3>
        {offer.description && <p className="mb-7 font-sans text-white/80">{offer.description}</p>}
        <div>
          <Button asChild variant="gold" className="font-ui font-bold">
            <Link href={offer.ctaHref}>{offer.ctaLabel}</Link>
          </Button>
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
      className="mx-auto w-full max-w-[1280px] px-4 py-16 md:px-8"
    >
      <Reveal className="mb-10 flex items-end justify-between" as="div">
        <h2
          id="offers-heading"
          className="font-display text-[clamp(28px,4vw,40px)] font-black leading-[1.1] tracking-tight text-cocoa-dark"
        >
          Special Offers
        </h2>
        <Button
          asChild
          variant="link"
          className="hidden whitespace-nowrap font-ui font-bold text-cocoa-dark hover:text-deep-gold sm:inline-flex"
        >
          <Link href="/offers">
            View all offers
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </Reveal>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {offers.map((offer) => (
          <OfferCard key={offer.id} offer={offer} />
        ))}
      </div>

      <div className="mt-6 sm:hidden">
        <Button asChild variant="link" className="px-0 font-ui font-bold text-deep-gold">
          <Link href="/offers">
            View all offers
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
