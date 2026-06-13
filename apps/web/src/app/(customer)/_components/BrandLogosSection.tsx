/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BrandLogosSection
 * Scope        : Customer Pages
 *
 * Description  : Homepage "Products We Trust" logo wall. Each brand name is
 *                rendered in its closest available Google Font equivalent so the
 *                letterforms match the actual product packaging typography.
 *                Desktop: centred flex row. Mobile: infinite auto-scrolling
 *                marquee so all 6 brands fit on one continuous line.
 *
 * Responsibilities :
 * - Display the trusted-product brand wall with per-brand typography
 * - Infinite horizontal marquee on mobile/tablet (<lg) via CSS animation
 * - Centred multi-column row on desktop
 * - Greyscale default, full colour on row hover
 *
 * Features / Functionality :
 * - Research-matched fonts per brand (see notes)
 * - Double-row duplication for seamless marquee loop
 * - prefers-reduced-motion: marquee stops (no content hidden)
 *
 * Tech Stack   : React, Next.js 16 (next/font/google), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : next/font/google
 *
 * Notes        :
 * - L'ORÉAL  → Big Shoulders Bold (Trade Gothic / ITC Blair analogue —
 *              wide, bold, condensed grotesque)
 * - SCHWARZKOPF → Playfair Display Regular (Swift / serif professional line)
 * - LAKMÉ    → Cormorant SC Regular (smooth, light spaced small-caps display serif)
 * - OLAPLEX  → Josefin Sans SemiBold (clean geometric sans, wide tracking)
 * - WELLA    → Oxanium SemiBold (closest Google analogue to Conthrax —
 *              geometric, angular, slightly tech)
 * - MOROCCANOIL → Syne ExtraBold (ITC Bauhaus-inspired geometric, wide,
 *                retro-modern)
 ************************************************************/

import {
  Big_Shoulders,
  Cormorant_SC,
  Josefin_Sans,
  Oxanium,
  Playfair_Display,
  Syne,
} from 'next/font/google'

// ── Font instances ──────────────────────────────────────────
// L'ORÉAL — wide condensed grotesque (Trade Gothic / ITC Blair analogue)
const bigShoulders = Big_Shoulders({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
})

// SCHWARZKOPF — serif professional line (Swift Regular analogue)
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
})

// LAKMÉ — smooth light display serif with fine spacing
const cormorant = Cormorant_SC({
  subsets: ['latin'],
  weight: ['300'],
  display: 'swap',
})

// OLAPLEX — clean geometric sans, wide tracking
const josefin = Josefin_Sans({
  subsets: ['latin'],
  weight: ['600'],
  display: 'swap',
})

// WELLA — Conthrax-family geometric (angular, slightly tech)
const oxanium = Oxanium({
  subsets: ['latin'],
  weight: ['600'],
  display: 'swap',
})

// MOROCCANOIL — ITC Bauhaus-inspired wide geometric
const syne = Syne({
  subsets: ['latin'],
  weight: ['800'],
  display: 'swap',
})

// ── Brand definitions ───────────────────────────────────────
const brands = [
  {
    name: "L'ORÉAL",
    fontClass: bigShoulders.className,
    style: { letterSpacing: '0.18em', fontSize: '1.35rem' } as React.CSSProperties,
  },
  {
    name: 'SCHWARZKOPF',
    fontClass: playfair.className,
    style: {
      letterSpacing: '0.08em',
      fontSize: '1.1rem',
      fontVariant: 'small-caps',
    } as React.CSSProperties,
  },
  {
    name: 'LAKMÉ',
    fontClass: cormorant.className,
    style: { letterSpacing: '0.3em', fontSize: '1.25rem' } as React.CSSProperties,
  },
  {
    name: 'OLAPLEX',
    fontClass: josefin.className,
    style: { letterSpacing: '0.2em', fontSize: '1.05rem' } as React.CSSProperties,
  },
  {
    name: 'WELLA',
    fontClass: oxanium.className,
    style: { letterSpacing: '0.12em', fontSize: '1.2rem' } as React.CSSProperties,
  },
  {
    name: 'MOROCCANOIL',
    fontClass: syne.className,
    style: { letterSpacing: '0.08em', fontSize: '1rem' } as React.CSSProperties,
  },
]

// ── Component ───────────────────────────────────────────────
export function BrandLogosSection() {
  return (
    <section aria-label="Trusted product brands" className="py-12 w-full overflow-hidden">
      <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] opacity-50 mb-8 text-deep-gold text-center px-4">
        Products We Trust
      </p>

      {/* Desktop: static centred row */}
      <div className="hidden lg:flex justify-center items-center gap-x-14 px-8 max-w-[1280px] mx-auto opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
        {brands.map((brand) => (
          <span
            key={brand.name}
            className={`${brand.fontClass} text-cocoa-dark leading-none`}
            style={brand.style}
          >
            {brand.name}
          </span>
        ))}
      </div>

      {/* Mobile / tablet: infinite scrolling marquee */}
      {/* Duplicate the row so the loop is seamless */}
      <div
        className="lg:hidden flex items-center opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500"
        aria-hidden="false"
      >
        {/* Outer mask — fades edges so the scroll feels infinite */}
        <div
          className="relative w-full overflow-hidden"
          style={{
            maskImage:
              'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
          }}
        >
          {/* The animated track — two copies for seamless loop */}
          <div className="rg-marquee-track flex items-center gap-x-14 w-max">
            {/* First copy */}
            {brands.map((brand) => (
              <span
                key={`a-${brand.name}`}
                className={`${brand.fontClass} text-cocoa-dark leading-none whitespace-nowrap`}
                style={brand.style}
                aria-hidden="false"
              >
                {brand.name}
              </span>
            ))}
            {/* Spacer between first and second copy */}
            <span className="w-14 shrink-0" aria-hidden="true" />
            {/* Second copy (makes the loop seamless) */}
            {brands.map((brand) => (
              <span
                key={`b-${brand.name}`}
                className={`${brand.fontClass} text-cocoa-dark leading-none whitespace-nowrap`}
                style={brand.style}
                aria-hidden="true"
              >
                {brand.name}
              </span>
            ))}
            {/* Trailing spacer */}
            <span className="w-14 shrink-0" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  )
}
