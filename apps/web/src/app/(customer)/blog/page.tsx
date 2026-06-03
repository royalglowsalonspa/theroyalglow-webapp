/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BlogPage
 * Scope        : Customer Pages
 *
 * Description  : Blog listing page that displays all published articles
 *                from the CMS in a responsive grid with empty state handling.
 *
 * Responsibilities :
 * - Fetch published posts from Payload CMS
 * - Render posts in a responsive grid using PostCard components
 * - Display an empty state when no articles are available
 *
 * Features / Functionality :
 * - ISR with 1-hour revalidation for fresh blog content
 * - Responsive 1/2/3-column grid layout
 * - JSON-LD breadcrumb structured data for SEO
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, JSON-LD, Payload CMS
 * Layer        : Presentation
 *
 * Dependencies : PostCard, JsonLd, getPublishedPosts, SITE_URL, breadcrumbJsonLd, localBusinessJsonLd, buildMetadata
 *
 * Notes        :
 * - Posts are fetched server-side; no client-side data fetching on this page
 ************************************************************/

import { PostCard } from '@/components/blog/PostCard'
import { JsonLd } from '@/components/seo/JsonLd'
import { getPublishedPosts } from '@/lib/cms/client'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, localBusinessJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'

// ISR: revalidate the listing roughly hourly (architecture.md ~1h window).
export const revalidate = 3600

export const metadata: Metadata = buildMetadata({
  title: 'Blog',
  description:
    'Beauty and wellness tips, guides, and news from Royal Glow Salon & Spa in Bengaluru.',
  path: '/blog',
})

export default async function BlogPage() {
  const posts = await getPublishedPosts()

  return (
    <>
      <JsonLd
        data={[
          localBusinessJsonLd(),
          breadcrumbJsonLd([{ name: 'Home', url: SITE_URL }, { name: 'Blog' }]),
        ]}
      />

      <div className="flex flex-col gap-20">
        {/* ═══════════════════════════════════════════════════════ */}
        {/* HEADING */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-labelledby="blog-page-heading" className="px-5">
          <div className="mx-auto max-w-[1278px] mt-6 lg:mt-10">
            <div className="flex items-center gap-2 mb-6">
              <span className="w-2 h-2 rounded-full bg-royal-gold" aria-hidden="true" />
              <span className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold">
                Journal
              </span>
            </div>
            <h1
              id="blog-page-heading"
              className="font-display text-cocoa-dark tracking-[-1.44px] leading-[1.03] text-[clamp(40px,6vw,72px)]"
            >
              The Royal Glow Journal
            </h1>
            <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-4 max-w-[520px]">
              Beauty and wellness tips, guides, and news from our team in Bengaluru.
            </p>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* POSTS GRID / EMPTY STATE */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-label="Blog articles" className="px-5 pb-20">
          <div className="mx-auto max-w-[1278px]">
            {posts.length === 0 ? (
              <div className="bg-warm-cream rounded-[6px] p-8 sm:p-12 text-center">
                <p className="font-display text-cocoa-dark text-2xl">
                  No articles yet — check back soon.
                </p>
                <p className="font-sans text-[15px] leading-[1.55] text-warm-gray mt-3 max-w-[420px] mx-auto">
                  We&apos;re busy crafting beauty and wellness stories. In the meantime, explore our
                  services or book a visit.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
