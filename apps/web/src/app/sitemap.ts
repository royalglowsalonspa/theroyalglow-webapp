import { SITE_URL } from '@/lib/seo/business'
import { getAllServicesGrouped } from '@rgss/db/queries'
import type { MetadataRoute } from 'next'

/**
 * XML sitemap for the public site.
 *
 * Static entries use the priorities / change frequencies from `seo.md` Part 3.
 * Dynamic entries are one per active service slug, pulled from
 * `getAllServicesGrouped()`. The DB read is wrapped in try/catch so the route
 * always returns at least the static entries and never throws.
 *
 * Private surfaces (`/admin`, `/api`, `/profile`, `/staff`, `/book`,
 * `/sign-in`) are deliberately never listed.
 */

type SitemapEntry = MetadataRoute.Sitemap[number]

const STATIC_ROUTES: readonly {
  path: string
  changeFrequency: SitemapEntry['changeFrequency']
  priority: number
}[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/services', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/offers', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/refund-policy', changeFrequency: 'yearly', priority: 0.3 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  try {
    const categories = await getAllServicesGrouped()
    const serviceEntries: MetadataRoute.Sitemap = categories.flatMap((category) =>
      category.services.map((service) => ({
        url: `${SITE_URL}/services/${service.slug}`,
        lastModified,
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      }))
    )
    return [...staticEntries, ...serviceEntries]
  } catch {
    return staticEntries
  }
}
