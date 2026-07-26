/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 07-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BlogPage
 * Scope        : Customer Pages
 *
 * Description  : Blog listing page displaying articles from the CMS/mock fallback.
 *                Uses the BlogFeed component for interactive client-side searching,
 *                category filtering, and pagination.
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, Payload CMS
 * Layer        : Presentation
 ************************************************************/

import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BlogFeed } from '@/components/blog/BlogFeed'
import { NewsletterForm } from '@/components/blog/NewsletterForm'
import { JsonLd } from '@/components/seo/JsonLd'
import { getPublishedPosts } from '@/lib/cms/client'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, localBusinessJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'

// ISR: revalidate the listing roughly hourly
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
              <span className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold font-bold">
                The Royal Glow Journal
              </span>
            </div>
            <h1
              id="blog-page-heading"
              className="font-display font-black text-cocoa-dark tracking-[-0.03em] leading-[1.05] text-[clamp(40px,5.5vw,68px)]"
            >
              Beauty tips, rituals &amp; stories
            </h1>
            <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-4 max-w-[560px]">
              Expert advice from our master artists — skincare routines, hair trends, bridal prep,
              and more.
            </p>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* INTERACTIVE FEED (Search, Filter, Pagination, Grid) */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-label="Blog articles" className="px-5">
          <div className="mx-auto max-w-[1278px]">
            <BlogFeed initialPosts={posts} />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* NEWSLETTER FORM */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-label="Newsletter subscription" className="px-5 pb-20">
          <Suspense fallback={null}>
            <NewsletterForm />
          </Suspense>
        </section>
      </div>
    </>
  )
}
