/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 01-08-2026 & Updated - 01-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : banners
 * Scope        : CMS Integration — Banners
 *
 * Description  : Selection helpers that split the single Payload `banner`
 *                record between its two independent consumers: the homepage
 *                hero image and the site-wide announcement strip.
 *
 * Responsibilities :
 * - Pick the banner that owns the homepage hero image
 * - Pick the banner that owns the announcement strip (must carry a CTA link)
 * - Apply `order` as the tie-breaker when several banners are active
 *
 * Features / Functionality :
 * - selectHeroBanner() — first active banner in display order, CTA or not
 * - selectAnnouncementBanner() — first active banner WITH a non-empty ctaHref
 * - Both are pure and TOTAL: they return null when nothing qualifies
 *
 * Tech Stack   : TypeScript
 * Layer        : Data Fetching (selection)
 *
 * Dependencies : ./types
 *
 * Notes        :
 * - Built on top of getActiveBanners(); the active + [startAt, endAt] window
 *   filtering stays in client.ts and is not duplicated here.
 * - The CTA link is the split: no ctaHref means "hero photo only".
 ************************************************************/

import type { Banner } from './types'

// Two unrelated pieces of UI read the same `banner` record, so the owner needs a
// way to change one without changing the other. The existing schema already
// carries the signal: an announcement with nowhere to click is useless, so a
// banner WITHOUT `ctaHref` is treated as hero artwork only, and one WITH it also
// drives the announcement strip. This keeps the CMS free of a new global,
// collection, or field (which would each require a generated migration).
//
// Both helpers are pure and TOTAL — matching the style of `client.ts`, they
// never throw and resolve to `null` when nothing qualifies.

/** True when the banner carries a clickable CTA (whitespace-only counts as absent). */
function hasCtaLink(banner: Banner): boolean {
  return typeof banner.ctaHref === 'string' && banner.ctaHref.trim() !== ''
}

/**
 * Banners in display order — `order` ascending. `Array.prototype.sort` is
 * stable, so banners sharing an `order` keep the sequence the CMS returned.
 */
function inDisplayOrder(banners: readonly Banner[]): Banner[] {
  return [...banners].sort((a, b) => a.order - b.order)
}

/**
 * The banner whose image is the homepage hero photo: the first active,
 * in-window banner in display order, regardless of whether it has a CTA link.
 *
 * Returns null when no banner is active, letting the hero fall back to the
 * bundled brand SVG.
 */
export function selectHeroBanner(banners: readonly Banner[]): Banner | null {
  return inDisplayOrder(banners)[0] ?? null
}

/**
 * The banner that drives the site-wide announcement strip: the first active,
 * in-window banner in display order that has a non-empty `ctaHref`.
 *
 * A banner with a blank CTA link is deliberately skipped — it only changes the
 * hero photo. Returns null when no banner qualifies, letting the strip fall
 * back to its hardcoded copy.
 */
export function selectAnnouncementBanner(banners: readonly Banner[]): Banner | null {
  return inDisplayOrder(banners).find(hasCtaLink) ?? null
}
