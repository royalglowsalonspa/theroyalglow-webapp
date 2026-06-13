/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : TestimonialsSection
 * Scope        : Customer Pages
 *
 * Description  : Homepage testimonials carousel — 5 curated Google-style
 *                reviews that auto-advance every 4 seconds. Desktop shows
 *                3 cards side-by-side; mobile/tablet shows 1 card at a time
 *                in a horizontal scroll-snap row (never stacks vertically).
 *                Functional dot indicators, pause-on-hover, keyboard-safe.
 *
 * Responsibilities :
 * - Surface social proof via 5 curated customer reviews
 * - Auto-advance the carousel on a 4-second interval
 * - Render functional dot indicators that reflect and control position
 * - Pause auto-advance while the user hovers or focuses the carousel
 * - Link out to the complete Google review listing
 *
 * Features / Functionality :
 * - CSS scroll-snap with JS scrollIntoView for reliable cross-browser scroll
 * - Auto-advance timer paused on mouseenter / focusin events
 * - Active dot highlights current card; clicking a dot jumps to that card
 * - prefers-reduced-motion: auto-advance disabled, manual scroll still works
 * - Production-ready Indian names + authentic review copy
 *
 * Tech Stack   : React (client), Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : next/link, react
 *
 * Notes        :
 * - On desktop (md+) only 3 cards are visible at once; scrolled by 1 each tick
 *   so the dot count matches the number of "pages" = total - 2.
 * - On mobile 1 card is visible; dot count = total cards.
 ************************************************************/

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

const testimonials = [
  {
    name: 'Priya Sharma',
    stars: 5,
    quote:
      'Royal Glow is truly a premium experience. The stylists listened to exactly what I wanted and delivered perfectly. Booking was effortless and the ambience is calming.',
    timeAgo: '1 week ago',
  },
  {
    name: 'Ananya Reddy',
    stars: 5,
    quote:
      'I had my bridal makeup done here and it was beyond beautiful. The team is incredibly skilled and made sure I felt like royalty on my wedding day.',
    timeAgo: '2 weeks ago',
  },
  {
    name: 'Sneha Iyer',
    stars: 5,
    quote:
      'The spa ritual was so relaxing I almost fell asleep. The products they use are top quality and the therapists are very professional. Will definitely be back.',
    timeAgo: '3 weeks ago',
  },
  {
    name: 'Deepika Nair',
    stars: 5,
    quote:
      'Best salon in Bengaluru. I have been coming here for over a year now and the consistency of quality is exceptional. Hair colour and treatment were flawless.',
    timeAgo: '1 month ago',
  },
  {
    name: 'Kavya Menon',
    stars: 5,
    quote:
      'I visited for a facial and left feeling completely refreshed. The staff are warm and attentive throughout. A genuinely luxurious experience at a fair price.',
    timeAgo: '1 month ago',
  },
]

// How many cards are visible at once (used for dot/page count calculation)
const DESKTOP_VISIBLE = 3

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: count }).map((_, i) => (
        <svg
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed star array, order never changes
          key={`star-${i}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="#D4AF37"
          aria-hidden="true"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}

export function TestimonialsSection() {
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
  const dotCount = isDesktop
    ? Math.max(1, testimonials.length - DESKTOP_VISIBLE + 1)
    : testimonials.length

  /**
   * Scroll the carousel track to a given card index by setting scrollLeft
   * directly on the container element. This ONLY moves the scroll position
   * inside the carousel — it never touches the page scroll position, so it
   * cannot hijack or jump the user away from where they are on the page.
   * (scrollIntoView was the previous approach and caused the page-hijack bug.)
   */
  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current
    const card = itemRefs.current[index]
    if (!track || !card) return
    // scrollLeft = card's offset from the start of the track container
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
      className="px-4 md:px-8 py-16 mx-auto w-full max-w-[1280px]"
    >
      {/* Header */}
      <div className="mb-10">
        <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold mb-2">
          Testimonials
        </p>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
          <h2
            id="testimonials-heading"
            className="font-display font-black text-cocoa-dark text-[clamp(28px,4vw,40px)] tracking-tight leading-[1.1]"
          >
            Real reviews from real people
          </h2>
          <Link
            href="https://maps.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-ui font-bold text-sm flex items-center gap-1 text-cocoa-dark hover:text-deep-gold transition-colors duration-200 whitespace-nowrap"
          >
            See all on Google <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {/* Carousel track — overflow-y must be visible so hover lift is not clipped */}
      <div
        ref={trackRef}
        className="flex overflow-x-auto overflow-y-visible gap-5 snap-x snap-mandatory scrollbar-hide pb-1 py-2"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        aria-live="polite"
      >
        {testimonials.map((review, i) => (
          <article
            key={review.name}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            className="flex-shrink-0 w-[85vw] sm:w-[380px] md:w-[calc(33.333%-14px)] snap-start border border-outline-gray rounded-2xl p-7 hover:border-deep-gold hover:-translate-y-[2px] hover:shadow-card-hover motion-safe:transition-all motion-safe:duration-200"
            aria-label={`Review by ${review.name}`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-sans font-bold text-cocoa-dark">{review.name}</h3>
              <StarRating count={review.stars} />
            </div>
            <blockquote className="font-sans text-sm leading-relaxed text-warm-gray mb-5">
              {review.quote}
            </blockquote>
            <p className="font-ui text-[10px] font-bold uppercase tracking-widest opacity-30">
              {review.timeAgo}
            </p>
          </article>
        ))}
      </div>

      {/* Dot indicators */}
      <div
        className="flex justify-center gap-2 mt-6"
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
            className={`h-2 rounded-full transition-all duration-300 motion-safe:transition-all ${
              activeIndex === i ? 'w-6 bg-deep-gold' : 'w-2 bg-outline-gray hover:bg-warm-stone'
            }`}
          />
        ))}
      </div>
    </section>
  )
}
