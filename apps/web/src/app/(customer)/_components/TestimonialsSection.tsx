/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : TestimonialsSection
 * Scope        : Customer Pages
 *
 * Description  : Homepage testimonials — three review cards with star ratings
 *                and a link to the full Google reviews profile.
 *
 * Responsibilities :
 * - Surface social proof via curated customer reviews
 * - Link out to the complete Google review listing
 *
 * Features / Functionality :
 * - Bordered review cards with gold star ratings
 * - "TESTIMONIALS" eyebrow + "See all on Google" link
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : next/link
 *
 * Notes        : None
 ************************************************************/
import Link from 'next/link'

const testimonials = [
  {
    name: 'Katy',
    stars: 5,
    quote:
      'Royal Glow is an awesome salon. Very convenient and easy to book. Their stylists are excellent and help make the look you want.',
    timeAgo: '1 week ago',
  },
  {
    name: 'Martin',
    stars: 5,
    quote:
      'I absolutely love the calm and luxury of this place — an easy way to unwind every visit. It makes you feel pampered and cared for.',
    timeAgo: '2 weeks ago',
  },
  {
    name: 'Penelope',
    stars: 5,
    quote:
      'I find Royal Glow excellent. I am able to book appointments that suit my schedule. If there has ever been any issue, the team resolves it instantly.',
    timeAgo: '3 weeks ago',
  },
]

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: count }).map((_, i) => (
        <svg
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed star array, no reordering
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
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="px-4 md:px-8 py-16 mx-auto w-full max-w-[1280px]"
    >
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {testimonials.map((review) => (
          <article
            key={review.name}
            className="border border-outline-gray rounded-2xl p-7 hover:border-deep-gold hover:-translate-y-[2px] hover:shadow-card-hover motion-safe:transition-all motion-safe:duration-200"
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

      {/* Carousel dots */}
      <div className="flex justify-center gap-2" aria-hidden="true">
        <div className="w-2 h-2 rounded-full bg-deep-gold" />
        <div className="w-2 h-2 rounded-full bg-outline-gray" />
        <div className="w-2 h-2 rounded-full bg-outline-gray" />
      </div>
    </section>
  )
}
