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
 *                is unconfigured, unreachable, or empty.
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
 * Tech Stack   : React (server), Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : OfferBookButton, JsonLd, SITE_URL, breadcrumbJsonLd, buildMetadata,
 *                @/lib/cms/client
 *
 * Notes        :
 * - Marketing offers from Payload; separate from Drizzle booking redemptions.
 ************************************************************/

import { OfferBookButton } from '@/components/offers/OfferBookButton'
import { JsonLd } from '@/components/seo/JsonLd'
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

          <nav aria-label="Filter offers by category" className="flex flex-wrap gap-2 mt-8">
            {CATEGORY_FILTERS.map((item) => {
              const isActive = category === item.value
              const href = item.value === 'all' ? '/offers' : `/offers?category=${item.value}`
              return (
                <Link
                  key={item.value}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`font-ui text-xs uppercase tracking-[0.12em] px-4 py-2 rounded-full border transition-colors duration-200 ${
                    isActive
                      ? 'bg-cocoa-dark text-canvas-white border-cocoa-dark'
                      : 'bg-transparent text-cocoa-dark border-warm-stone hover:border-deep-gold hover:text-deep-gold'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </section>

      <section aria-label="Current offers" className="px-5 pb-20">
        <div className="mx-auto max-w-[1278px]">
          {offers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {offers.map((offer) => (
                <article
                  key={offer.id}
                  className="group relative h-[360px] md:h-[420px] rounded-xl overflow-hidden"
                >
                  <img
                    src={offer.image.url}
                    alt={offer.image.alt}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex flex-col justify-end p-8">
                    <div className="flex items-center gap-2 mb-2">
                      {offer.discountLabel && (
                        <span className="font-ui text-[11px] font-bold uppercase tracking-[0.15em] text-warm-gold">
                          {offer.discountLabel}
                        </span>
                      )}
                      {offer.category !== 'all' && (
                        <span className="font-ui text-[10px] uppercase tracking-[0.12em] text-white/60">
                          {categoryLabel(offer.category)}
                        </span>
                      )}
                    </div>
                    <h2 className="font-display font-bold text-2xl text-white mb-2 leading-tight">
                      {offer.title}
                    </h2>
                    {offer.description && (
                      <p className="font-sans text-white/80 mb-3 max-w-[520px]">
                        {offer.description}
                      </p>
                    )}
                    {offer.validUntil && (
                      <p className="font-sans text-sm text-white/60 mb-4">
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
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
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
