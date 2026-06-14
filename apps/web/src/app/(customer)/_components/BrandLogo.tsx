/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BrandLogo
 * Scope        : Customer Pages
 *
 * Description  : Renders a single trusted-brand logo as a monochrome SVG/PNG
 *                image loaded from /public/brands/. If the asset is missing or
 *                fails to load, it gracefully falls back to the styled-text
 *                wordmark so the "Products We Trust" wall is never broken.
 *
 * Responsibilities :
 * - Render the brand's logo image, forced monochrome to match the site ink
 * - Fall back to the brand's styled-text wordmark on load error / missing file
 *
 * Features / Functionality :
 * - filter:brightness(0) renders any-coloured source logo as solid dark ink,
 *   so the row stays calm and on-brand (never colourful)
 * - opacity 80% default, 100% on hover (matches the text-row treatment)
 * - Lazy-loaded; fixed height + auto width for a consistent logo-wall rhythm
 *
 * Tech Stack   : React (client), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : react
 *
 * Notes        :
 * - Drop official monochrome/transparent SVGs into /public/brands/{slug}.svg.
 * - Until a file exists, the text fallback renders automatically.
 ************************************************************/

'use client'

import { useState } from 'react'

export interface BrandLogoData {
  name: string
  /** Path under /public, e.g. "/brands/loreal.svg". Set null for brands we
   *  intentionally keep as styled text only (e.g. SCHWARZKOPF). */
  logo: string | null
  /** Per-brand optical height (Tailwind arbitrary class) so the visible
   *  glyphs match across logos despite different viewBox padding. */
  heightClass: string
  /** Tailwind class from next/font used by the text fallback */
  fontClass: string
  /** Inline styles (letter-spacing, size, weight) for the text fallback */
  style: React.CSSProperties
}

export function BrandLogo({ brand }: { brand: BrandLogoData }) {
  const [failed, setFailed] = useState(false)

  // Render the styled-text wordmark when there is no logo asset (a deliberate
  // text-only brand) or when the image fails to load. Always on-brand.
  if (!brand.logo || failed) {
    return (
      <span className={`${brand.fontClass} leading-none whitespace-nowrap`} style={brand.style}>
        {brand.name}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand.logo}
      alt={brand.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${brand.heightClass} w-auto max-w-[160px] shrink-0 object-contain opacity-80 transition-opacity duration-300 hover:opacity-100 [filter:brightness(0)]`}
    />
  )
}
