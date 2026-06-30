/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : OffersPage
 * Scope        : Customer Pages
 *
 * Description  : Lists active marketing offers from Payload CMS with optional
 *                category filtering. Falls back to curated offers when the CMS
 *                is unconfigured, unreachable, or empty. Rebuilt on the
 *                shadcn/ui Button + Badge primitives with motion Reveal.
 *
 * Responsibilities :
 * - Fetch active CMS offers (validity-window filtered)
 * - Render offer cards with discount badges and booking CTAs
 * - Support optional category filter via search params
 *
 * Features / Functionality :
 * - CMS-first content with curated fallback
 * - Category filter (Salon / SPA / Bridal / etc.)
 * - Empty state when no offers match the filter
 *
 * Tech Stack   : React (server), Next.js 16 (App Router), Tailwind CSS v4,
 *                shadcn/ui, motion
 * Layer        : Presentation
 *
 * Dependencies : OfferBookButton, JsonLd, SEO helpers, @/lib/cms/client,
 *                @/components/ui/{button,badge}, @/components/ui/motion/reveal
 *
 * Notes        :
 * - Marketing offers from Payload; separate from Drizzle booking redemptions.
 ************************************************************/

import { OfferBookButton } from '@/components/offers/OfferBookButton'
import { JsonLd } from '@/components/seo/JsonLd'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Reveal, RevealGroup, RevealItem } from '@/components/ui/motion/reveal'
import { FALLBACK_OFFERS, getActiveOffers } from '@/lib/cms/client'
import type { Offer } from '@/lib/cms/types'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = buildMetadata({
  title: 'Special Offers',
  description:
    'Explore exclusive offers and discounts at Royal Glow Salon & Spa. Save on facials, spa treatments, and more at our Bengaluru salon.',
  path: '/offers',
})

const CATEGORY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'salon', label: 'Salon' },
  { value: 'spa', label: 'SPA' },
  { value: 'bridal', label: 'Bridal' },
  { value: 'nails', label: 'Nails' },
  { value: 'skincare', label: 'Skincare' },
] as const

type CategoryFilter = (typeof CATEGORY_FILTERS)[number]['value']

function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

function filterByCategory(offers: Offer[], category: CategoryFilter): Offer[] {
  if (category === 'all') {
    return offers
  }
  return offers.filter((offer) => offer.category === category || offer.category === 'all')
}

function categoryLabel(value: string): string {
  const match = CATEGORY_FILTERS.find((item) => item.value === value)
  return match?.label ?? value
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category: rawCategory } = await searchParams
  const category: CategoryFilter = CATEGORY_FILTERS.some((item) => item.value === rawCategory)
    ? (rawCategory as CategoryFilter)
    : 'all'

  const cmsOffers = await getActiveOffers()
  const allOffers = cmsOffers.length > 0 ? cmsOffers : FALLBACK_OFFERS
  const offers = filterByCategory(allOffers, category)

  return (
    <div className="flex flex-col gap-20">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', url: SITE_URL }, { name: 'Offers' }])} />

      <section aria-labelledby="offers-heading" className="px-5">
        <Reveal className="mx-auto mt-6 max-w-[1278px] lg:mt-10" as="div">
          <h1
            id="offers-heading"
            className="font-display font-black text-[clamp(40px,6vw,72px)] leading-[1.03] tracking-[-1.44px] text-cocoa-dark"
          >
            Special Offers
          </h1>
          <p className="mt-4 max-w-[520px] font-sans text-[17px] leading-[1.6] text-warm-gray">
            Exclusive deals on our premium salon and spa services. Grab them before they expire.
          </p>

          <nav aria-label="Filter offers by category" className="mt-8 flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((item) => {
              const isActive = category === item.value
              const href = item.value === 'all' ? '/offers' : `/offers?category=${item.value}`
              return (
                <Button
                  key={item.value}
                  asChild
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full font-ui text-xs uppercase tracking-[0.12em]"
                >
                  <Link href={href} aria-current={isActive ? 'page' : undefined}>
                    {item.label}
                  </Link>
                </Button>
              )
            })}
          </nav>
        </Reveal>
      </section>

      <section aria-label="Current offers" className="px-5 pb-20">
        <div className="mx-auto max-w-[1278px]">
          {offers.length > 0 ? (
            <RevealGroup className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {offers.map((offer) => (
                <RevealItem key={offer.id}>
                  <article className="group relative h-[360px] overflow-hidden rounded-xl md:h-[420px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={offer.image.url}
                      alt={offer.image.alt}
                      className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/30 to-transparent p-8">
                      <div className="mb-2 flex items-center gap-2">
                        {offer.discountLabel && (
                          <Badge className="bg-warm-gold font-ui text-[11px] font-bold uppercase tracking-[0.15em] text-cocoa-dark">
                            {offer.discountLabel}
                          </Badge>
                        )}
                        {offer.category !== 'all' && (
                          <span className="font-ui text-[10px] uppercase tracking-[0.12em] text-white/60">
                            {categoryLabel(offer.category)}
                          </span>
                        )}
                      </div>
                      <h2 className="mb-2 font-display text-2xl font-bold leading-tight text-white">
                        {offer.title}
                      </h2>
                      {offer.description && (
                        <p className="mb-3 max-w-[520px] font-sans text-white/80">
                          {offer.description}
                        </p>
                      )}
                      {offer.validUntil && (
                        <p className="mb-4 font-ui text-sm text-white/60">
                          Valid until {formatDate(offer.validUntil)}
                        </p>
                      )}
                      <OfferBookButton
                        offerId={offer.id}
                        href={offer.ctaHref}
                        label={offer.ctaLabel}
                      />
                    </div>
                  </article>
                </RevealItem>
              ))}
            </RevealGroup>
          ) : (
            <div className="py-16 text-center">
              <p className="font-sans text-[17px] leading-[1.6] text-warm-gray">
                No offers in this category right now. Try another filter or check back soon!
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
