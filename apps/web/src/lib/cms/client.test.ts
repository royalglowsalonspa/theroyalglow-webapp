import { server } from '@/test/msw-server'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('getPublishedPosts returns [] with no network call', async () => {
    await expect(getPublishedPosts()).resolves.toEqual([])
  })

  it('getPostBySlug returns null with no network call', async () => {
    await expect(getPostBySlug('anything')).resolves.toBeNull()
  })

  it('getAllPostSlugs returns [] with no network call', async () => {
    await expect(getAllPostSlugs()).resolves.toEqual([])
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

  it('getPublishedPosts returns [] on a 500 (total)', async () => {
    server.use(
      http.get(`${CMS_URL}/api/blog`, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
    )

    await expect(getPublishedPosts()).resolves.toEqual([])
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
