/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServicesSection
 * Scope        : Customer Pages
 *
 * Description  : Server component that resolves homepage service category cards
 *                from Payload CMS (active, ordered) and renders the horizontal
 *                snap-scroll row. Falls back to curated hardcoded cards when the
 *                CMS is unconfigured, unreachable, or empty.
 *
 * Responsibilities :
 * - Fetch active service cards via the CMS read seam (getServiceCards)
 * - Provide a graceful hardcoded fallback when CMS returns nothing
 * - Render the section heading, scroll row, and bare gold chevron hint
 *
 * Features / Functionality :
 * - CMS-first content with curated fallback (Hair, Spa, Bridal, Nails)
 * - Snap-mandatory horizontal scroll with hidden scrollbar
 * - Bare nudging gold chevron affordance on mobile/tablet — no fade, no circle
 * - Hover image zoom + gap-grow Book affordance
 *
 * Tech Stack   : React (server), Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/lib/cms/client, @/lib/cms/types, next/link
 *
 * Notes        :
 * - The bare arrow is intentionally minimal per premium salon UX standards.
 * - Owner adds cards in Payload → appear here within the ISR window.
 ************************************************************/
import { FALLBACK_SERVICE_CARDS, getServiceCards } from '@/lib/cms/client'
import type { ServiceCardItem } from '@/lib/cms/types'
import Link from 'next/link'

function ServiceCard({ card }: { card: ServiceCardItem }) {
  return (
    <article className="flex-shrink-0 w-[280px] md:w-[300px] aspect-[3/4] relative rounded-[12px] overflow-hidden snap-start group cursor-pointer">
      <img
        src={card.image.url}
        alt={card.imageAlt}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6 md:p-8">
        <h3 className="font-display font-bold text-2xl text-white mb-1">{card.name}</h3>
        <p className="font-sans text-white/80 text-sm mb-5">From {card.fromPrice}</p>
        <Link
          href={card.bookingHref}
          className="font-ui font-bold text-sm flex items-center gap-2 text-white group-hover:gap-3 transition-all duration-200"
        >
          Book <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}

export async function ServicesSection() {
  const cmsCards = await getServiceCards()
  const cards = cmsCards.length > 0 ? cmsCards : FALLBACK_SERVICE_CARDS

  return (
    <section
      aria-labelledby="services-heading"
      className="px-4 md:px-8 py-16 mx-auto w-full max-w-[1280px]"
    >
      <div className="flex justify-between items-end mb-10">
        <div>
          <h2
            id="services-heading"
            className="font-display font-black text-cocoa-dark text-[clamp(28px,4vw,40px)] tracking-tight leading-[1.1]"
          >
            See what Royal Glow can do for you
          </h2>
          <p className="font-sans text-warm-gray mt-2">
            Expert-led treatments tailored to your needs.
          </p>
        </div>
        <Link
          href="/services"
          className="hidden sm:flex items-center gap-1 font-ui font-bold text-sm text-cocoa-dark hover:text-deep-gold transition-colors duration-200"
        >
          View all services <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="relative">
        <div className="flex overflow-x-auto gap-5 snap-x snap-mandatory pb-1 scrollbar-hide">
          {cards.map((card) => (
            <ServiceCard key={card.id} card={card} />
          ))}
        </div>

        <div
          aria-hidden="true"
          className="lg:hidden pointer-events-none absolute right-0 top-1/2 -translate-y-1/2"
        >
          <svg
            className="rg-scroll-hint h-5 w-5 text-deep-gold"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
      </div>

      <div className="mt-6 sm:hidden">
        <Link
          href="/services"
          className="font-ui font-bold text-sm text-deep-gold hover:text-cocoa-dark transition-colors duration-200"
        >
          View all services →
        </Link>
      </div>
    </section>
  )
}
