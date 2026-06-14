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
 * - L'ORÉAL  → Archivo Bold (clean, slightly extended bold sans)
 * - TRESEMMÉ → Playfair Display Bold (bold elegant serif wordmark) [2nd slot]
 * - SCHWARZKOPF → Jost SemiBold (geometric professional sans)
 * - LAKMÉ    → Cormorant Garamond Bold (elegant serif, now bold + visible)
 * - OLAPLEX  → Josefin Sans Bold (clean geometric sans, wide tracking)
 * - WELLA    → Oxanium Bold (rounded geometric, Conthrax analogue)
 * - MOROCCANOIL → Syne ExtraBold (heavy geometric, ITC Bauhaus-inspired)
 * - All weights are bold/visible (no thin 300/400) and the row renders solid
 *   cocoa-dark (no grey wash) so the trust signal reads clearly.
 ************************************************************/

import {
  Archivo,
  Cormorant_Garamond,
  Josefin_Sans,
  Jost,
  Oxanium,
  Playfair_Display,
  Syne,
} from 'next/font/google'
import { BrandLogo } from './BrandLogo'

// ── Font instances (all bold/visible weights for a trust-building wall) ──
// L'ORÉAL — clean, slightly extended bold sans (modern L'Oréal wordmark)
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
})

// TRESemmé — bold elegant serif (matches their serif wordmark)
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
})

// SCHWARZKOPF — geometric professional sans (salon/pro line)
const jost = Jost({
  subsets: ['latin'],
  weight: ['600'],
  display: 'swap',
})

// LAKMÉ — elegant serif, now bold for clear visibility
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
})

// OLAPLEX — clean geometric sans, wide tracking
const josefin = Josefin_Sans({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
})

// WELLA — rounded geometric (Conthrax analogue)
const oxanium = Oxanium({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
})

// MOROCCANOIL — heavy geometric (ITC Bauhaus-inspired)
const syne = Syne({
  subsets: ['latin'],
  weight: ['800'],
  display: 'swap',
})

// ── Brand definitions — TRESemmé sits right after L'ORÉAL ──
// `logo` points at an official monochrome/transparent SVG you drop into
// /public/brands/. Until the file exists, BrandLogo falls back to the styled
// text wordmark (fontClass + style), so nothing ever looks broken.
const brands = [
  {
    name: "L'ORÉAL",
    logo: '/brands/loreal.svg',
    heightClass: 'h-[26px]',
    fontClass: archivo.className,
    style: { letterSpacing: '0.14em', fontSize: '1.3rem', fontWeight: 700 } as React.CSSProperties,
  },
  {
    name: 'GARNIER',
    logo: '/brands/garnier.svg',
    heightClass: 'h-[32px]',
    fontClass: archivo.className,
    style: { letterSpacing: '0.12em', fontSize: '1.2rem', fontWeight: 700 } as React.CSSProperties,
  },
  {
    name: 'TRESemmé',
    logo: '/brands/tresemme.svg',
    heightClass: 'h-[38px]',
    fontClass: playfair.className,
    style: { letterSpacing: '0.02em', fontSize: '1.35rem', fontWeight: 700 } as React.CSSProperties,
  },
  {
    name: 'SCHWARZKOPF',
    // Intentionally text-only (final decision) — no SVG asset.
    logo: null,
    heightClass: 'h-[24px]',
    fontClass: jost.className,
    style: { letterSpacing: '0.06em', fontSize: '1.25rem', fontWeight: 600 } as React.CSSProperties,
  },
  {
    name: 'LAKMÉ',
    logo: '/brands/lakme.svg',
    heightClass: 'h-[34px]',
    fontClass: cormorant.className,
    style: { letterSpacing: '0.16em', fontSize: '1.3rem', fontWeight: 700 } as React.CSSProperties,
  },
  {
    name: 'OLAPLEX',
    logo: '/brands/olaplex.svg',
    heightClass: 'h-[22px]',
    fontClass: josefin.className,
    style: { letterSpacing: '0.18em', fontSize: '1.2rem', fontWeight: 700 } as React.CSSProperties,
  },
  {
    name: 'WELLA',
    logo: '/brands/wella.svg',
    heightClass: 'h-[32px]',
    fontClass: oxanium.className,
    style: { letterSpacing: '0.1em', fontSize: '1.3rem', fontWeight: 700 } as React.CSSProperties,
  },
  {
    name: 'MOROCCANOIL',
    logo: '/brands/moroccanoil.svg',
    heightClass: 'h-[16px]',
    fontClass: syne.className,
    style: { letterSpacing: '0.05em', fontSize: '1.15rem', fontWeight: 800 } as React.CSSProperties,
  },
]

// ── Component ───────────────────────────────────────────────
/* ════════════════════════════════════════════════════════════
 * OLD — TEXT-ONLY IMPLEMENTATION (preserved per request, do not delete).
 * This renders every brand as a styled-text wordmark. It is kept here as a
 * reference and a safety net; the live implementation below now renders real
 * monochrome SVG logos and only falls back to this text styling per-brand when
 * an SVG asset is missing. To revert fully to text, comment out the new
 * BrandLogosSection below and uncomment this one.
 *
export function BrandLogosSection() {
  return (
    <section aria-label="Trusted product brands" className="py-12 w-full overflow-hidden">
      <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] opacity-50 mb-8 text-deep-gold text-center px-4">
        Products We Trust
      </p>

      <div className="hidden lg:flex justify-center items-baseline gap-x-14 px-8 max-w-[1280px] mx-auto text-cocoa-dark/85 hover:text-cocoa-dark transition-colors duration-300">
        {brands.map((brand) => (
          <span key={brand.name} className={`${brand.fontClass} leading-none`} style={brand.style}>
            {brand.name}
          </span>
        ))}
      </div>

      <div className="lg:hidden flex items-center text-cocoa-dark/85">
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
            {[0, 1].map((copy) => (
              <div
                key={`copy-${copy}`}
                className="flex shrink-0 items-baseline gap-x-14 pr-14"
                aria-hidden={copy === 1}
              >
                {brands.map((brand) => (
                  <span
                    key={`${copy}-${brand.name}`}
                    className={`${brand.fontClass} leading-none whitespace-nowrap`}
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
 * ════════════════════════════════════════════════════════════ */

// ── NEW — REAL MONOCHROME SVG LOGOS (with per-brand text fallback) ──
export function BrandLogosSection() {
  return (
    <section aria-label="Trusted product brands" className="py-12 w-full overflow-hidden">
      <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] opacity-50 mb-8 text-deep-gold text-center px-4">
        Products We Trust
      </p>

      {/* Desktop: static centred row. Logos align by vertical centre (logo-wall
          convention); BrandLogo renders the SVG monochrome, or the styled text
          fallback if the asset is missing. */}
      <div className="hidden lg:flex justify-center items-center gap-x-14 px-8 max-w-[1280px] mx-auto">
        {brands.map((brand) => (
          <BrandLogo key={brand.name} brand={brand} />
        ))}
      </div>

      {/* Mobile / tablet: seamless infinite marquee.
          Two IDENTICAL groups back-to-back; each carries a trailing gap (pr-14)
          equal to the internal gap (gap-x-14), so spacing is uniform across the
          seam. The track animates exactly -50% (one group) for a glitch-free loop. */}
      <div className="lg:hidden flex items-center">
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
            {[0, 1].map((copy) => (
              <div
                key={`copy-${copy}`}
                className="flex shrink-0 items-center gap-x-14 pr-14"
                aria-hidden={copy === 1}
              >
                {brands.map((brand) => (
                  <BrandLogo key={`${copy}-${brand.name}`} brand={brand} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
