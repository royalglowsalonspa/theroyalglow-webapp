/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : client.test
 * Scope        : CMS Integration — Tests
 *
 * Description  : Unit tests for the CMS client layer. Verifies graceful
 *                degradation when unconfigured and correct mapping of Payload
 *                docs when MSW-backed.
 *
 * Responsibilities :
 * - Test unconfigured CMS returns the seeded MOCK_POSTS fallback with no network calls
 * - Test configured CMS maps Payload docs into view-model types
 * - Test error handling (500 responses → seeded fallback, never throws)
 * - Test banner time-window filtering
 *
 * Features / Functionality :
 * - Unconfigured: getPublishedPosts → seeded fallback, getAllPostSlugs → seeded slugs, getPostBySlug → null
 * - Configured: maps blogDoc/bannerDoc into typed results
 * - Active banner window filtering (startAt/endAt)
 *
 * Tech Stack   : TypeScript, Vitest, MSW
 * Layer        : Testing
 *
 * Dependencies : @/test/msw-server, msw, vitest, ./client
 *
 * Notes        : Uses vi.stubEnv for per-test env var control
 ************************************************************/

import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw-server'
import { getActiveBanners, getAllPostSlugs, getPostBySlug, getPublishedPosts } from './client'

// `lib/cms` reads `process.env.NEXT_PUBLIC_CMS_URL` directly (NOT `@/env`) so it
// degrades gracefully when the CMS is unconfigured. Every exported read is
// TOTAL: it returns `[]` / `null` and never throws — on unconfigured, non-2xx,
// or network error. MSW intercepts the Payload REST calls when a base URL is
// set; with `onUnhandledRequest: 'error'`, the unconfigured cases must make no
// request at all. We use `vi.stubEnv` so the env var is set/cleared per case
// and restored automatically.

const CMS_URL = 'https://cms.test'

/** A minimal Payload blog doc the mapper accepts (slug + title required). */
function blogDoc(overrides?: Record<string, unknown>) {
  return {
    slug: 'best-facials',
    title: 'Best Facials in Bengaluru',
    excerpt: 'A guide to facials.',
    category: 'skincare',
    publishedAt: '2026-05-30T00:00:00.000Z',
    ...overrides,
  }
}

/** A minimal Payload banner doc (headline + resolvable image required). */
function bannerDoc(overrides?: Record<string, unknown>) {
  return {
    headline: 'Monsoon Glow Offer',
    image: { url: 'https://cdn.test/banner.jpg', alt: 'Monsoon offer' },
    ctaLabel: 'Book now',
    ctaHref: '/?book=1',
    order: 1,
    ...overrides,
  }
}

describe('cms client — unconfigured (no NEXT_PUBLIC_CMS_URL)', () => {
  beforeEach(() => {
    // `undefined` clears the var so `isCmsConfigured()` is false and no request
    // is made (which `onUnhandledRequest: 'error'` would otherwise flag).
    vi.stubEnv('NEXT_PUBLIC_CMS_URL', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('getPublishedPosts returns the seeded fallback with no network call', async () => {
    // Unconfigured → cmsFetch yields null → no request made (MSW
    // `onUnhandledRequest: 'error'` would flag any leaked call). Documented
    // "graceful degradation": the listing serves the seeded MOCK_POSTS so the
    // /blog page is never empty.
    const posts = await getPublishedPosts()
    expect(posts.length).toBeGreaterThan(0)
    // Every item is a well-formed BlogListItem (slug + title present).
    expect(posts.every((p) => p.slug !== '' && p.title !== '')).toBe(true)
    // Seeded content, not CMS content.
    expect(posts.some((p) => p.slug === 'hair-color-stay-longer')).toBe(true)
  })

  it('getPostBySlug returns null with no network call', async () => {
    // Unconfigured falls back to MOCK_POSTS.find; an unknown slug stays null.
    await expect(getPostBySlug('anything')).resolves.toBeNull()
  })

  it('getAllPostSlugs returns the seeded slugs with no network call', async () => {
    // Unconfigured → no request made; falls back to the seeded MOCK_POSTS slugs.
    const slugs = await getAllPostSlugs()
    expect(slugs.length).toBeGreaterThan(0)
    expect(slugs).toContain('hair-color-stay-longer')
  })
})

describe('cms client — configured (MSW-backed)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CMS_URL', CMS_URL)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('getPublishedPosts maps a Payload doc into a BlogListItem', async () => {
    server.use(http.get(`${CMS_URL}/api/blog`, () => HttpResponse.json({ docs: [blogDoc()] })))

    const posts = await getPublishedPosts()
    expect(posts).toHaveLength(1)
    expect(posts[0]?.slug).toBe('best-facials')
    expect(posts[0]?.title).toBe('Best Facials in Bengaluru')
    expect(posts[0]?.publishedAt).toBe('2026-05-30T00:00:00.000Z')
  })

  it('getPublishedPosts returns the seeded fallback on a 500 (total)', async () => {
    server.use(
      http.get(`${CMS_URL}/api/blog`, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
    )

    // cmsFetch maps the non-2xx to null → no docs → seeded fallback (never throws).
    const posts = await getPublishedPosts()
    expect(posts.length).toBeGreaterThan(0)
    expect(posts.some((p) => p.slug === 'hair-color-stay-longer')).toBe(true)
  })

  it('getActiveBanners returns only the in-window banner', async () => {
    const now = new Date('2026-06-15T00:00:00.000Z')
    server.use(
      http.get(`${CMS_URL}/api/banner`, () =>
        HttpResponse.json({
          docs: [
            bannerDoc({
              headline: 'Active Now',
              startAt: '2026-06-01T00:00:00.000Z',
              endAt: '2026-06-30T00:00:00.000Z',
            }),
            bannerDoc({
              headline: 'Starts Later',
              image: { url: 'https://cdn.test/future.jpg', alt: 'future' },
              startAt: '2026-07-01T00:00:00.000Z',
            }),
          ],
        }),
      ),
    )

    const banners = await getActiveBanners(now)
    expect(banners).toHaveLength(1)
    expect(banners[0]?.headline).toBe('Active Now')
  })
})
