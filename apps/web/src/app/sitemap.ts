/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sitemap
 * Scope        : SEO Configuration
 *
 * Description  : XML sitemap generator combining static routes with dynamic
 *                service slugs and blog post slugs from DB/CMS.
 *
 * Responsibilities :
 * - Define static route priorities and change frequencies
 * - Fetch dynamic service URLs from database
 * - Fetch dynamic blog URLs from CMS
 * - Gracefully degrade if DB/CMS reads fail
 *
 * Features / Functionality :
 * - 11 static routes with SEO priorities
 * - Dynamic per-service entries (priority 0.8)
 * - Dynamic per-blog-post entries (priority 0.7)
 * - Never-throws design (returns static entries on failure)
 *
 * Tech Stack   : Next.js 16 (MetadataRoute.Sitemap)
 * Layer        : Infrastructure (SEO)
 *
 * Dependencies : next, @/lib/cms/client, @/lib/seo/business, @rgss/db
 *
 * Notes        :
 * - Excludes: /admin, /api, /profile, /staff, /book, /sign-in
 ************************************************************/
import { getAllPostSlugs } from '@/lib/cms/client'
import { SITE_URL } from '@/lib/seo/business'
import { getAllServicesGrouped } from '@rgss/db/queries'
import type { MetadataRoute } from 'next'

/**
 * XML sitemap for the public site.
 *
 * Static entries use the priorities / change frequencies from `seo.md` Part 3.
 * Dynamic entries are one per active service slug, pulled from
 * `getAllServicesGrouped()`, plus one per published blog slug from
 * `getAllPostSlugs()`. Both dynamic reads are wrapped in try/catch so the route
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
  { path: '/blog', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/gallery', changeFrequency: 'monthly', priority: 0.5 },
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

  const entries: MetadataRoute.Sitemap = [...staticEntries]

  try {
    const categories = await getAllServicesGrouped()
    for (const category of categories) {
      for (const service of category.services) {
        entries.push({
          url: `${SITE_URL}/services/${service.slug}`,
          lastModified,
          changeFrequency: 'monthly',
          priority: 0.8,
        })
      }
    }
  } catch {
    // Service catalogue read failed — keep the static entries and carry on.
  }

  // Phase 8: one entry per published blog slug. `getAllPostSlugs()` already
  // swallows errors (returns `[]` when the CMS is unconfigured/unreachable),
  // so this guard is belt-and-braces — an empty/failed read leaves the output
  // identical to the Phase 7 sitemap.
  try {
    const slugs = await getAllPostSlugs()
    for (const slug of slugs) {
      entries.push({
        url: `${SITE_URL}/blog/${slug}`,
        lastModified,
        changeFrequency: 'monthly',
        priority: 0.7,
      })
    }
  } catch {
    // getAllPostSlugs already swallows; belt-and-braces.
  }

  return entries
}
