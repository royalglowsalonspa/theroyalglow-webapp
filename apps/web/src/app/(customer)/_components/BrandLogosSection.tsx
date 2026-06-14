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
 *                marquee so all 7 brands fit on one continuous, seamless line.
 *
 * Responsibilities :
 * - Display the trusted-product brand wall with per-brand typography
 * - Infinite horizontal marquee on mobile/tablet (<lg) via CSS animation
 * - Centred multi-column row on desktop
 * - Greyscale default, full colour on row hover
 *
 * Features / Functionality :
 * - Research-matched fonts per brand (see notes)
 * - Two identical back-to-back groups + uniform seam gap → glitch-free loop
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
 * - TRESEMMÉ → Prata (elegant high-contrast Didone serif wordmark)
 ************************************************************/

import {
  Big_Shoulders,
  Cormorant_SC,
  Josefin_Sans,
  Oxanium,
  Playfair_Display,
  Prata,
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

// TRESemmé — elegant high-contrast Didone serif wordmark
const prata = Prata({
  subsets: ['latin'],
  weight: ['400'],
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
  {
    name: 'TRESEMMÉ',
    fontClass: prata.className,
    style: { letterSpacing: '0.1em', fontSize: '1.2rem' } as React.CSSProperties,
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

      {/* Mobile / tablet: infinite scrolling marquee.
          Two IDENTICAL groups sit back-to-back. Each group carries its own
          trailing gap (pr-14) equal to the internal gap (gap-x-14), so the
          spacing at the seam matches the spacing everywhere else. The track
          animates by exactly -50% (one full group), giving a perfectly
          seamless, glitch-free loop. */}
      <div className="lg:hidden flex items-center opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
        <div
          className="relative w-full overflow-hidden"
          style={{
            maskImage:
              'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
          }}
        >
          <div className="rg-marquee-track flex w-max">
            {/* Two identical groups — duplicate keeps the loop seamless */}
            {[0, 1].map((copy) => (
              <div
                key={`copy-${copy}`}
                className="flex shrink-0 items-center gap-x-14 pr-14"
                aria-hidden={copy === 1}
              >
                {brands.map((brand) => (
                  <span
                    key={`${copy}-${brand.name}`}
                    className={`${brand.fontClass} text-cocoa-dark leading-none whitespace-nowrap`}
                    style={brand.style}
                  >
                    {brand.name}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
