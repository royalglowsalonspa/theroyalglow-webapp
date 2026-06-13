/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : OffersSection
 * Scope        : Customer Pages
 *
 * Description  : Homepage special-offers grid — full-bleed image cards with
 *                gradient overlays and gold "Book Now" CTAs.
 *
 * Responsibilities :
 * - Showcase current promotional offers
 * - Link each offer to the booking flow
 *
 * Features / Functionality :
 * - Two-column image cards with gradient overlay
 * - Hover image scale + gold CTA buttons
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : next/link
 *
 * Notes        : None
 ************************************************************/
import Link from 'next/link'

const offers = [
  {
    title: '20% OFF All Facials — This week only!',
    description: 'Refresh your glow with our signature skincare rituals.',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuChf_-S9qaSgh4ChgD4vHvHOXi0JaNdY6sbENglW-QFs2Y4_PxRHayjVgKBYvET6H1oc_jFCq-SpkAlMqZvATcX4vqOf_4Qv7lowJ0Z-yUpijd-prJwrxZL009WIpMoejD5h8E1v_-VX8fFsNU1Xw-qZCSpfkKGZXC8nFE4r2FGwMDV6aDAqywKydJi6rijlY3TMDjBOuQh3RIWyVZSVNguwgQ-dDaXeufdUkyJX6-zPdZ_AFn-rgIWM6Tpw4_aG2tbZyj4RDWqDmM',
    alt: '20% off facials at Royal Glow — skincare treatment',
    href: '/offers',
  },
  {
    title: 'Free Head Massage with any SPA booking',
    description: 'Unwind a little deeper, on the house.',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDHedetGHswV5AvpWgVH4EwLo9_l2a4jGr_COWOvJIYh1S1t5nt6KYk_ERnSYzSlgQFVu-dClz4Ywcr6J5hT3fvWKZPoUQWt8Bw0Q7rDOmZp_8GxX0DDyqmt5p2yXE9RjXHzB6TRqveNgRpqTQS5VvXUcjda0g2-Nv3jDjp14f5HQW8rHnmgy3OXM3DCbhgWiuFZVF_Kk3EQ5GnGqLP0xBGMo-qR8C6yIgSEaPMB3L000XhYHYhsEj-8VEuCjzHXntthSt61iFilQA',
    alt: 'Free head massage offer at Royal Glow Spa',
    href: '/offers',
  },
]

export function OffersSection() {
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
          <article
            key={offer.title}
            className="group relative h-[360px] md:h-[400px] rounded-xl overflow-hidden cursor-pointer"
          >
            <img
              src={offer.image}
              alt={offer.alt}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-8">
              <h3 className="font-display font-bold text-2xl text-white mb-3 leading-tight">
                {offer.title}
              </h3>
              <p className="font-sans text-white/80 mb-7">{offer.description}</p>
              <div>
                <Link
                  href={offer.href}
                  className="bg-warm-gold text-cocoa-dark px-7 py-3 rounded-xl font-ui font-bold text-sm hover:bg-deep-gold transition-colors duration-200 inline-block"
                >
                  Book Now
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
