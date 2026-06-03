/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : robots
 * Scope        : SEO Configuration
 *
 * Description  : robots.txt configuration allowing public crawling while
 *                hiding admin/API surfaces, with explicit AI crawler permits.
 *
 * Responsibilities :
 * - Disallow private paths (admin, API, profile, staff, book)
 * - Explicitly allow 15+ AI crawler user-agents
 * - Reference the XML sitemap
 *
 * Features / Functionality :
 * - Default allow + selective disallow
 * - AI-friendly: GPTBot, ClaudeBot, PerplexityBot, etc.
 * - Dynamic sitemap URL from SITE_URL constant
 *
 * Tech Stack   : Next.js 16 (MetadataRoute.Robots)
 * Layer        : Infrastructure (SEO)
 *
 * Dependencies : next, @/lib/seo/business
 *
 * Notes        :
 * - AI crawler list from seo.md Part 9
 ************************************************************/
import { SITE_URL } from '@/lib/seo/business'
import type { MetadataRoute } from 'next'

/**
 * robots.txt for the public site.
 *
 * The default `*` agent is allowed everywhere except the private surfaces.
 * Every AI crawler user-agent listed in `seo.md` Part 9 gets an explicit
 * allow rule (so the salon stays maximally citable in AI answers). The
 * sitemap is referenced absolutely from `SITE_URL`.
 */

/** Paths hidden from every crawler. Mirrors the sitemap exclusions. */
const DISALLOWED_PATHS = ['/admin/', '/api/', '/profile/', '/staff/', '/book']

/** AI crawler user-agents to explicitly allow (verbatim from `seo.md` Part 9). */
const AI_CRAWLERS = [
  'Googlebot',
  'Googlebot-Extended',
  'Google-Extended',
  'GPTBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Claude-Web',
  'ClaudeBot',
  'anthropic-ai',
  'Bingbot',
  'FacebookBot',
  'Applebot',
  'Applebot-Extended',
  'CCBot',
  'cohere-ai',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOWED_PATHS,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
