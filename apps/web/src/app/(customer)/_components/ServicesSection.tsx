/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServicesSection
 * Scope        : Customer Pages
 *
 * Description  : Homepage "See what Royal Glow can do for you" section — a
 *                horizontally scrollable row of service category cards with a
 *                minimal bare-arrow scroll hint (no white fade, no circle).
 *
 * Responsibilities :
 * - Render the section heading + "View all services" links
 * - Render service category cards (image, name, from-price, Book link)
 * - Provide a horizontal snap-scroll row with the native scrollbar hidden
 * - Hint scrollability on touch viewports via a small nudging arrow only
 *
 * Features / Functionality :
 * - Snap-mandatory horizontal scroll (touch + trackpad friendly)
 * - Hidden scrollbar (scrollbar-hide) for a clean premium look
 * - Bare nudging gold chevron affordance on mobile/tablet — no fade, no circle
 * - Hover image zoom + gap-grow Book affordance
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : next/link
 *
 * Notes        :
 * - The bare arrow is intentionally minimal per premium salon UX standards.
 *   A white fade or circle container would add visual noise and obscure the
 *   card edges. The small animated chevron is sufficient to signal scrollability.
 ************************************************************/
import Link from 'next/link'

const services = [
  {
    name: 'Hair',
    price: '₹500',
    href: '/services#haircut',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAFTeivZU8LWDtg3w4QyhdnYdO7ClTd0NMYng9j-WdftV_EAGAci_BRb0riH6AP1ozu-uu7yf8HecmVVIYfeoqsO8bUS-L1tmeLpT4R2aY2MFBcDEcBJfHUb5OsACUndPHplAIEtT3ViZ6GAgUjH6LpaTyEhhdZ8f-mSdd4-dK05Ch7ovDP-PbhmhPMdqwMS0kdMK4llg45nS_JOWUf9jat6Rf_F3TLkfAUZmy1WgFGiHD9qFIQJ98SZJCEceMxxRY5cr4YY88T-gY',
    alt: 'Professional hair styling at Royal Glow Salon',
  },
  {
    name: 'Spa',
    price: '₹1,499',
    href: '/services#spa',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDZasmXlzNTRSrg_OR0jZFSrGXvcLd9jTCCEs2zzuTKxivasTAvIz-_UG6LI1C2u-L9kqDTvL3H9V9NQkNpahwhy0nqtTy42b7WG79I_OBeVID5PdpO8RrepTsicR84S-3WBVjyV9vSuFS52O8VrXC3QAzeUFmgmSXJ_qKV34NXixljTGYUIvjNqmctILdgFykX2jJ-mmC8bAv9V9X5e9pTcLMvHchNWPoiGq_xWWiRv2tt2TcmENwrkhdFNE5VXC02go2i_W_PxTs',
    alt: 'Luxury spa treatment at Royal Glow',
  },
  {
    name: 'Bridal',
    price: '₹2,500',
    href: '/services#bridal',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC8w_Rdj8cu_NrcFjxGQmzAH61tYak6FEB5RtbTOEvIMQd50thOeF0TQvIWR-Am9y_lMXtdsy-C2x85kkH66qkTupeAYgLFRLlqM7Pj34dtR_dWcP5UejQAXH68ym48EYh4Ksms64FYgykRmLPSEGO9sxNkrAWnPzLRiJU4qTLOhjxRNTQkZ5IY3tHBadUiD7O4eLsgNIdsdL7r4T8WrOHB1phWjtrf8Z2ECbVbPj-EskCq641BsEDa4REkm6QrFvIJdPdhan1Hjx8',
    alt: 'Elegant Indian bridal makeup at Royal Glow',
  },
  {
    name: 'Nails',
    price: '₹800',
    href: '/services#nails',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuB1DUVyiMfSF07pyFdu4aNeoXPdm72DWD40kVE9iIScW17pYqaWTs6-Lf_VP7vhCNV8SwsBozQkfOR__it01_TLzLm6UiSEZgIm3iRZuH9cMLd1SG0etrkuaQVQSYj-w28ww5QhXEF3AFYa9-CcJd5aDjSmtUpH_ioR3P8pz_ckCwpWTzaGiaIPejTI4RYbK2ZhOjwOLboHAHYXjlC1rn0cd9uXzfA_QEgA8xBQYQbYGpITgYHogc5SDypjmc4Rp2XwHTsbCKeq92c',
    alt: 'Premium nail art at Royal Glow Salon',
  },
]

export function ServicesSection() {
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

      {/* Horizontal scroll — cards start flush with the heading's left edge.
          No negative-margin tricks here; the section already provides the
          horizontal padding so the scroll track just needs to fill full width. */}
      <div className="relative">
        <div className="flex overflow-x-auto gap-5 snap-x snap-mandatory pb-1 scrollbar-hide">
          {services.map((service) => (
            <article
              key={service.name}
              className="flex-shrink-0 w-[280px] md:w-[300px] aspect-[3/4] relative rounded-[12px] overflow-hidden snap-start group cursor-pointer"
            >
              <img
                src={service.image}
                alt={service.alt}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6 md:p-8">
                <h3 className="font-display font-bold text-2xl text-white mb-1">{service.name}</h3>
                <p className="font-sans text-white/80 text-sm mb-5">From {service.price}</p>
                <Link
                  href={service.href}
                  className="font-ui font-bold text-sm flex items-center gap-2 text-white group-hover:gap-3 transition-all duration-200"
                >
                  Book <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>

        {/* Minimal bare-arrow scroll hint — no white fade, no circle container.
            Just a small gold animated chevron positioned at the right edge.
            Visible only on touch viewports where the 4th card peeks in. */}
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
