/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : TestimonialsCarousel
 * Scope        : Customer Pages
 *
 * Description  : Client-side auto-advancing testimonials carousel. Receives a
 *                pre-resolved list of reviews (CMS-driven or fallback) from the
 *                TestimonialsSection server component and renders them. Desktop
 *                shows 3 cards side-by-side; mobile/tablet shows 1 card at a
 *                time in a horizontal scroll-snap row. Rebuilt on the shadcn/ui
 *                Button primitive with lucide star icons.
 *
 * Responsibilities :
 * - Render the testimonials section header + carousel track + dot indicators
 * - Auto-advance the carousel on a 4-second interval
 * - Render functional dot indicators that reflect and control position
 * - Pause auto-advance while the user hovers or focuses the carousel
 *
 * Features / Functionality :
 * - scrollLeft-based scroll (never scrollIntoView — avoids page-scroll hijack)
 * - Auto-advance timer paused on mouseenter / focusin events
 * - Active dot highlights current card; clicking a dot jumps to that card
 * - prefers-reduced-motion: auto-advance disabled, manual scroll still works
 *
 * Tech Stack   : React (client), Next.js 16 (App Router), Tailwind CSS v4,
 *                shadcn/ui, lucide-react
 * Layer        : Presentation (Component)
 *
 * Dependencies : next/link, react, @/lib/cms/types, @/components/ui/button,
 *                lucide-react
 *
 * Notes        :
 * - Data (CMS-first + fallback) is resolved by the parent server component.
 * - On desktop (md+) 3 cards are visible; dot count = total - 2.
 * - On mobile 1 card is visible; dot count = total cards.
 ************************************************************/

'use client'

import { ArrowRight, Star } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Testimonial } from '@/lib/cms/types'

// How many cards are visible at once (used for dot/page count calculation)
const DESKTOP_VISIBLE = 3

function StarRating({ count }: { count: number }) {
  return (
    // role="img" makes the decorative star row a single labelled graphic, so the
    // aria-label is actually exposed (an unroled div ignores it).
    <div className="flex items-center gap-0.5" role="img" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: count }).map((_, i) => (
        <Star
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed star array, order never changes
          key={`star-${i}`}
          className="size-3.5 fill-deep-gold text-deep-gold"
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

export function TestimonialsCarousel({ reviews }: { reviews: Testimonial[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLElement | null)[]>([])

  // Detect desktop breakpoint (md = 768px)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handle = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    setIsDesktop(mq.matches)
    mq.addEventListener('change', handle)
    return () => mq.removeEventListener('change', handle)
  }, [])

  // How many dots/positions exist for the current viewport
  const dotCount = isDesktop ? Math.max(1, reviews.length - DESKTOP_VISIBLE + 1) : reviews.length

  /**
   * Scroll the carousel track to a given card index by setting scrollLeft
   * directly on the container element. This ONLY moves the scroll position
   * inside the carousel — it never touches the page scroll position.
   */
  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current
    const card = itemRefs.current[index]
    if (!track || !card) return
    track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' })
    setActiveIndex(index)
  }, [])

  const advance = useCallback(() => {
    setActiveIndex((prev) => {
      const next = (prev + 1) % dotCount
      const track = trackRef.current
      const card = itemRefs.current[next]
      if (track && card) {
        track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' })
      }
      return next
    })
  }, [dotCount])

  // Auto-advance — disabled when paused or when reduced-motion is preferred
  useEffect(() => {
    if (paused) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return
    const id = setInterval(advance, 4000)
    return () => clearInterval(id)
  }, [paused, advance])

  return (
    <section
      aria-labelledby="testimonials-heading"
      className="mx-auto w-full max-w-[1280px] px-4 py-16 md:px-8"
    >
      {/* Header */}
      <div className="mb-10">
        <p className="mb-2 font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold">
          Testimonials
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2
            id="testimonials-heading"
            className="font-display text-[clamp(28px,4vw,40px)] font-black leading-[1.1] tracking-tight text-cocoa-dark"
          >
            Real reviews from real people
          </h2>
          <Button
            asChild
            variant="link"
            className="whitespace-nowrap font-ui font-bold text-cocoa-dark hover:text-deep-gold"
          >
            <Link href="https://maps.google.com" target="_blank" rel="noopener noreferrer">
              See all on Google
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Carousel track — overflow-y must be visible so hover lift is not clipped */}
      {/* role="group" gives the scrollable track a non-static role, which is required
          for it to carry the hover/focus pause handlers and be announced as a labelled
          region rather than an anonymous div. */}
      <div
        ref={trackRef}
        role="group"
        aria-label="Customer testimonials"
        className="scrollbar-hide flex snap-x snap-mandatory gap-5 overflow-x-auto overflow-y-visible py-2 pb-1"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        aria-live="polite"
      >
        {reviews.map((review, i) => (
          <article
            // Stable identity from the review's own fields; the array index would
            // reassign state to the wrong card if the order ever changes.
            key={`${review.reviewerName}-${review.timeLabel}`}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            className="w-[85vw] shrink-0 snap-start rounded-2xl border border-outline-gray p-7 transition-all duration-200 hover:-translate-y-0.5 hover:border-deep-gold hover:shadow-card-hover motion-reduce:transition-none sm:w-[380px] md:w-[calc(33.333%-14px)]"
            aria-label={`Review by ${review.reviewerName}`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-sans font-bold text-cocoa-dark">{review.reviewerName}</h3>
              <StarRating count={review.rating} />
            </div>
            <blockquote className="mb-5 font-sans text-sm leading-relaxed text-warm-gray">
              {review.reviewText}
            </blockquote>
            {review.timeLabel !== '' && (
              <p className="font-ui text-[10px] font-bold uppercase tracking-widest opacity-30">
                {review.timeLabel}
              </p>
            )}
          </article>
        ))}
      </div>

      {/* Dot indicators */}
      <div
        className="mt-6 flex justify-center gap-2"
        role="tablist"
        aria-label="Testimonial navigation"
      >
        {Array.from({ length: dotCount }).map((_, i) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: positional dots, order never changes
            key={`dot-${i}`}
            type="button"
            role="tab"
            aria-selected={activeIndex === i}
            aria-label={`Go to review ${i + 1}`}
            onClick={() => scrollToIndex(i)}
            className={`h-2 rounded-full transition-all duration-300 ${
              activeIndex === i ? 'w-6 bg-deep-gold' : 'w-2 bg-outline-gray hover:bg-warm-stone'
            }`}
          />
        ))}
      </div>
    </section>
  )
}
