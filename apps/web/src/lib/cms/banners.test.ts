/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 01-08-2026 & Updated - 01-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : banners.test
 * Scope        : CMS Integration — Tests
 *
 * Description  : Unit tests for the banner selection helpers that decouple the
 *                homepage hero image from the site-wide announcement strip.
 *                Covers the CTA-link split, whitespace-only CTA links, `order`
 *                precedence, and the empty case.
 *
 * Responsibilities :
 * - Test selectHeroBanner picks the first banner in `order`, CTA or not
 * - Test selectAnnouncementBanner requires a non-empty ctaHref
 * - Test both helpers are total (null on an empty list)
 * - Test the split end-to-end over an MSW-backed getActiveBanners() read
 *
 * Tech Stack   : TypeScript, Vitest, MSW
 * Layer        : Testing
 *
 * Dependencies : @/test/msw-server, msw, vitest, ./banners, ./client
 *
 * Notes        : Uses vi.stubEnv for per-test CMS URL control, as client.test.ts does
 ************************************************************/

import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw-server'
import { selectAnnouncementBanner, selectHeroBanner } from './banners'
import { getActiveBanners } from './client'
import type { Banner } from './types'

const CMS_URL = 'https://cms.test'

/** A mapped Banner view-model (what getActiveBanners resolves to). */
function banner(overrides?: Partial<Banner>): Banner {
  return {
    headline: 'Monsoon Glow Offer',
    image: { url: 'https://cdn.test/banner.jpg', alt: 'Monsoon offer', width: 1240, height: 1120 },
    ctaLabel: 'Book now',
    ctaHref: '/?book=1',
    order: 0,
    ...overrides,
  }
}

/** A raw Payload banner doc (headline + resolvable image required by the mapper). */
function bannerDoc(overrides?: Record<string, unknown>) {
  return {
    headline: 'Monsoon Glow Offer',
    image: { url: 'https://cdn.test/banner.jpg', alt: 'Monsoon offer' },
    ctaLabel: 'Book now',
    ctaHref: '/?book=1',
    order: 0,
    ...overrides,
  }
}

describe('selectHeroBanner', () => {
  it('returns the first banner in `order`, whether or not it has a CTA link', () => {
    const withoutCta = banner({ headline: 'Hero only', ctaHref: null, order: 1 })
    const withCta = banner({ headline: 'Announcement', ctaHref: '/offers', order: 2 })

    // Supplied out of order to prove `order` decides, not array position.
    expect(selectHeroBanner([withCta, withoutCta])).toBe(withoutCta)
  })

  it('still picks a CTA-less banner — the hero never requires a link', () => {
    const heroOnly = banner({ ctaHref: null })
    expect(selectHeroBanner([heroOnly])?.image.url).toBe('https://cdn.test/banner.jpg')
  })

  it('returns null when no banner is active (hero falls back to the bundled SVG)', () => {
    expect(selectHeroBanner([])).toBeNull()
  })
})

describe('selectAnnouncementBanner', () => {
  it('returns the banner when it carries a CTA link', () => {
    const withCta = banner({ ctaHref: '/offers' })
    expect(selectAnnouncementBanner([withCta])).toBe(withCta)
  })

  it('returns null for a banner with no CTA link (strip keeps its hardcoded copy)', () => {
    expect(selectAnnouncementBanner([banner({ ctaHref: null })])).toBeNull()
  })

  it.each([
    { label: 'spaces', ctaHref: '   ' },
    { label: 'tab', ctaHref: '\t' },
    { label: 'newline', ctaHref: '\n' },
    { label: 'empty string', ctaHref: '' },
  ])('treats a $label ctaHref as absent', ({ ctaHref }) => {
    expect(selectAnnouncementBanner([banner({ ctaHref })])).toBeNull()
  })

  it('skips an earlier CTA-less banner and picks the first CTA-bearing one', () => {
    const first = banner({ headline: 'Hero only', ctaHref: null, order: 1 })
    const second = banner({ headline: 'Blank too', ctaHref: '  ', order: 2 })
    const third = banner({ headline: 'Real announcement', ctaHref: '/offers', order: 3 })

    const picked = selectAnnouncementBanner([third, first, second])
    expect(picked?.headline).toBe('Real announcement')
    // The hero, meanwhile, still belongs to the lowest-`order` banner.
    expect(selectHeroBanner([third, first, second])?.headline).toBe('Hero only')
  })

  it('returns null when no banner is active', () => {
    expect(selectAnnouncementBanner([])).toBeNull()
  })
})

describe('banner split over a live getActiveBanners() read (MSW)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CMS_URL', CMS_URL)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('a banner WITH a ctaHref drives both the hero image and the strip', async () => {
    server.use(
      http.get(`${CMS_URL}/api/banner`, () =>
        HttpResponse.json({ docs: [bannerDoc({ headline: 'Diwali Glow', ctaHref: '/offers' })] }),
      ),
    )

    const banners = await getActiveBanners(new Date('2026-06-15T00:00:00.000Z'))
    expect(selectHeroBanner(banners)?.image.url).toBe('https://cdn.test/banner.jpg')
    expect(selectAnnouncementBanner(banners)?.headline).toBe('Diwali Glow')
  })

  it('a banner WITHOUT a ctaHref drives the hero image only', async () => {
    server.use(
      http.get(`${CMS_URL}/api/banner`, () =>
        HttpResponse.json({
          docs: [bannerDoc({ headline: 'Hero refresh', ctaHref: null, ctaLabel: null })],
        }),
      ),
    )

    const banners = await getActiveBanners(new Date('2026-06-15T00:00:00.000Z'))
    expect(selectHeroBanner(banners)?.image.url).toBe('https://cdn.test/banner.jpg')
    expect(selectAnnouncementBanner(banners)).toBeNull()
  })

  it('an out-of-window banner feeds neither surface', async () => {
    server.use(
      http.get(`${CMS_URL}/api/banner`, () =>
        HttpResponse.json({
          docs: [bannerDoc({ headline: 'Starts later', startAt: '2026-07-01T00:00:00.000Z' })],
        }),
      ),
    )

    // getActiveBanners still owns the window filter; the helpers only select.
    const banners = await getActiveBanners(new Date('2026-06-15T00:00:00.000Z'))
    expect(banners).toHaveLength(0)
    expect(selectHeroBanner(banners)).toBeNull()
    expect(selectAnnouncementBanner(banners)).toBeNull()
  })
})
