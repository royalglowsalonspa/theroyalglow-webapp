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
 *                CMS is unconfigured, unreachable, or empty. Rebuilt on the
 *                shadcn/ui Button primitive with a motion Reveal header and
 *                lucide chevrons.
 *
 * Responsibilities :
 * - Fetch active service cards via the CMS read seam (getServiceCards)
 * - Provide a graceful hardcoded fallback when CMS returns nothing
 * - Render the section heading, scroll row, and bare gold chevron hint
 *
 * Features / Functionality :
 * - CMS-first content with curated fallback (Hair, Spa, Bridal, Nails)
 * - Snap-mandatory horizontal scroll with hidden scrollbar
 * - Bare nudging gold chevron affordance on mobile/tablet
 * - Hover image zoom + gap-grow Book affordance
 *
 * Tech Stack   : React (server), Next.js 16 (App Router), Tailwind CSS v4,
 *                shadcn/ui, motion, lucide-react
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/lib/cms/client, @/lib/cms/types, @/components/ui/button,
 *                @/components/ui/motion/reveal, lucide-react, next/link
 *
 * Notes        :
 * - The bare arrow is intentionally minimal per premium salon UX standards.
 * - Owner adds cards in Payload → appear here within the ISR window.
 ************************************************************/
import { Button } from '@/components/ui/button'
import { Reveal } from '@/components/ui/motion/reveal'
import { FALLBACK_SERVICE_CARDS, getServiceCards } from '@/lib/cms/client'
import type { ServiceCardItem } from '@/lib/cms/types'
import { ArrowRight, ChevronRight } from 'lucide-react'
import Link from 'next/link'

function ServiceCard({ card }: { card: ServiceCardItem }) {
  return (
    <article className="group relative aspect-[3/4] w-[280px] shrink-0 cursor-pointer snap-start overflow-hidden rounded-[12px] md:w-[300px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.image.url}
        alt={card.imageAlt}
        className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-6 md:p-8">
        <h3 className="mb-1 font-display text-2xl font-bold text-white">{card.name}</h3>
        <p className="mb-5 font-sans text-sm text-white/80">From {card.fromPrice}</p>
        <Link
          href={card.bookingHref}
          className="flex items-center gap-2 font-ui text-sm font-bold text-white transition-all duration-200 group-hover:gap-3"
        >
          Book <ArrowRight className="size-4" aria-hidden="true" />
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
      className="mx-auto w-full max-w-[1280px] px-4 py-16 md:px-8"
    >
      <Reveal className="mb-10 flex items-end justify-between" as="div">
        <div>
          <h2
            id="services-heading"
            className="font-display text-[clamp(28px,4vw,40px)] font-black leading-[1.1] tracking-tight text-cocoa-dark"
          >
            See what Royal Glow can do for you
          </h2>
          <p className="mt-2 font-sans text-warm-gray">
            Expert-led treatments tailored to your needs.
          </p>
        </div>
        <Button
          asChild
          variant="link"
          className="hidden font-ui font-bold text-cocoa-dark hover:text-deep-gold sm:inline-flex"
        >
          <Link href="/services">
            View all services
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </Reveal>

      <div className="relative">
        <div className="scrollbar-hide flex snap-x snap-mandatory gap-5 overflow-x-auto pb-1">
          {cards.map((card) => (
            <ServiceCard key={card.id} card={card} />
          ))}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 lg:hidden"
        >
          <ChevronRight className="rg-scroll-hint size-5 text-deep-gold" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-6 sm:hidden">
        <Button asChild variant="link" className="px-0 font-ui font-bold text-deep-gold">
          <Link href="/services">
            View all services
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
