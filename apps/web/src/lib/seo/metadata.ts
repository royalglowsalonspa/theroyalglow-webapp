/**
 * Shared page-metadata helper.
 *
 * Produces a Next.js `Metadata` object with a brand-suffixed title, an absolute
 * canonical URL (no double slashes), OpenGraph + Twitter cards, and robots
 * directives. Centralising this guarantees every public page meets the per-page
 * checklist in `seo.md` Part 4e / Part 5 without copy-paste drift.
 */

import { SITE_URL } from '@/lib/seo/business'
import type { Metadata } from 'next'

const BRAND = 'Royal Glow Salon & Spa'
const DEFAULT_OG_IMAGE = '/og-default.jpg'

type BuildMetadataInput = {
  /** Page-specific title (the brand suffix is appended automatically). */
  title: string
  /** Meta description (aim for 150–160 chars). */
  description: string
  /** Absolute path beginning with `/` (e.g. `/services`). */
  path: string
  /** Optional OG/Twitter image paths; defaults to the site OG image. */
  images?: string[]
  /** Whether the page is indexable. Defaults to `true`. */
  robotsIndex?: boolean
}

/**
 * Join `SITE_URL` with a page path, normalising slashes so the result never
 * contains a double slash and always has exactly one separator.
 */
function canonicalUrl(path: string): string {
  const normalisedPath = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${normalisedPath}`.replace(/([^:]\/)\/+/g, '$1')
}

export function buildMetadata({
  title,
  description,
  path,
  images,
  robotsIndex,
}: BuildMetadataInput): Metadata {
  const fullTitle = `${title} | ${BRAND}`
  const canonical = canonicalUrl(path)
  const ogImages = images ?? [DEFAULT_OG_IMAGE]
  const index = robotsIndex ?? true

  return {
    // `absolute` so the root layout's title template never double-appends the
    // brand suffix (this helper already includes ` | Royal Glow Salon & Spa`).
    title: { absolute: fullTitle },
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: fullTitle,
      description,
      url: canonical,
      siteName: BRAND,
      locale: 'en_IN',
      type: 'website',
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: ogImages,
    },
    robots: {
      index,
      follow: index,
    },
  }
}
