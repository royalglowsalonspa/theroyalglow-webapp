/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BlogPostPage
 * Scope        : Customer Pages
 *
 * Description  : Dynamic blog post detail page. Fetches a single article by slug
 *                from CMS and renders the full content with cover image, metadata, and CTA.
 *
 * Responsibilities :
 * - Resolve a post by slug with ISR and static param generation
 * - Render article header, cover image, rich-text body, and booking CTA
 * - Emit BlogPosting + Breadcrumb JSON-LD for SEO
 *
 * Features / Functionality :
 * - generateStaticParams for build-time pre-rendering of known slugs
 * - Dynamic metadata with OG images from CMS
 * - Rich text body rendering via RichText component
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, JSON-LD, Payload CMS
 * Layer        : Presentation
 *
 * Dependencies : RichText, JsonLd, getAllPostSlugs, getPostBySlug, SITE_URL, blogPostingJsonLd, breadcrumbJsonLd, buildMetadata, formatDateIN, next/link, next/navigation
 *
 * Notes        :
 * - Returns 404 via notFound() when slug is not found in CMS
 ************************************************************/

import { RichText } from '@/components/blog/RichText'
import { JsonLd } from '@/components/seo/JsonLd'
import { getAllPostSlugs, getPostBySlug } from '@/lib/cms/client'
import { SITE_URL } from '@/lib/seo/business'
import { blogPostingJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'
import { formatDateIN } from '@rgss/business'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

// ISR: revalidate each article roughly hourly (architecture.md ~1h window).
export const revalidate = 3600

type BlogPostPageProps = {
  params: Promise<{ slug: string }>
}

// Pre-render published slugs at build; returns [] when the CMS is absent, so
// all paths render on-demand (ISR) rather than breaking the build.
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await getAllPostSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)

  if (post === null) {
    return buildMetadata({
      title: 'Article',
      description: 'Read the latest from the Royal Glow Journal.',
      path: `/blog/${slug}`,
      robotsIndex: false,
    })
  }

  const ogImages = post.seo.ogImageUrl
    ? [post.seo.ogImageUrl]
    : post.coverImage
      ? [post.coverImage.url]
      : undefined

  return buildMetadata({
    title: post.seo.metaTitle ?? post.title,
    description: post.seo.metaDescription ?? post.excerpt,
    path: `/blog/${post.slug}`,
    // Omit `images` entirely when absent (exactOptionalPropertyTypes).
    ...(ogImages ? { images: ogImages } : {}),
  })
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params
  const post = await getPostBySlug(slug)

  if (post === null) {
    notFound()
  }

  return (
    <>
      <JsonLd
        data={[
          blogPostingJsonLd({
            title: post.title,
            description: post.excerpt,
            slug: post.slug,
            publishedAt: post.publishedAt,
            // Omit optionals entirely when absent (exactOptionalPropertyTypes).
            ...(post.coverImage ? { coverImageUrl: post.coverImage.url } : {}),
            ...(post.author ? { authorName: post.author.name } : {}),
            ...(post.updatedAt ? { updatedAt: post.updatedAt } : {}),
          }),
          breadcrumbJsonLd([
            { name: 'Home', url: SITE_URL },
            { name: 'Blog', url: `${SITE_URL}/blog` },
            { name: post.title },
          ]),
        ]}
      />

      <article className="flex flex-col gap-12">
        {/* ═══════════════════════════════════════════════════════ */}
        {/* HEADER */}
        {/* ═══════════════════════════════════════════════════════ */}
        <header className="px-5">
          <div className="mx-auto max-w-[760px] mt-6 lg:mt-10">
            <Link
              href="/blog"
              className="font-ui text-xs uppercase tracking-[1px] text-deep-gold motion-safe:transition-colors motion-safe:duration-200 hover:text-cocoa-dark"
            >
              ← Back to Journal
            </Link>

            {post.category ? (
              <p className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold mt-6">
                {post.category}
              </p>
            ) : null}

            <h1 className="font-display text-cocoa-dark tracking-[-1.2px] leading-[1.05] text-[clamp(34px,5vw,60px)] mt-3">
              {post.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-5">
              {post.author ? (
                <span className="font-sans text-[15px] text-warm-gray">By {post.author.name}</span>
              ) : null}
              {post.author && post.publishedAt ? (
                <span className="text-dusty-gray" aria-hidden="true">
                  ·
                </span>
              ) : null}
              {post.publishedAt ? (
                <time
                  dateTime={post.publishedAt}
                  className="font-ui text-xs uppercase tracking-[1px] text-dusty-gray"
                >
                  {formatDateIN(new Date(post.publishedAt))}
                </time>
              ) : null}
            </div>
          </div>
        </header>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* COVER IMAGE */}
        {/* ═══════════════════════════════════════════════════════ */}
        {/* Plain <img> (not next/image) to stay config-free for remote R2/CMS
            hosts; explicit width/height reserve space to avoid layout shift. */}
        {post.coverImage ? (
          <div className="px-5">
            <div className="mx-auto max-w-[960px]">
              <div className="relative w-full aspect-[16/9] overflow-hidden rounded-[6px] bg-warm-cream">
                <img
                  src={post.coverImage.url}
                  alt={post.coverImage.alt}
                  width={post.coverImage.width ?? 960}
                  height={post.coverImage.height ?? 540}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* BODY */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="px-5">
          <div className="mx-auto max-w-[760px]">
            <RichText html={post.bodyHtml} />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* CTA */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="px-5 pb-20">
          <div className="mx-auto max-w-[760px]">
            <div className="bg-warm-cream rounded-[6px] p-8 sm:p-12 text-center">
              <h2 className="font-display text-cocoa-dark text-[clamp(26px,4vw,40px)] tracking-[-0.8px] leading-[1.1]">
                Ready for the royal treatment?
              </h2>
              <p className="font-sans text-[16px] leading-[1.6] text-warm-gray mt-3 max-w-[420px] mx-auto">
                Book your appointment and experience Royal Glow for yourself.
              </p>
              <Link
                href="/?book=1"
                className="mt-7 inline-flex bg-royal-gold text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full px-8 h-10 items-center justify-center hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all motion-safe:duration-200"
                aria-label="Book an appointment at Royal Glow"
              >
                Book Now
              </Link>
            </div>
          </div>
        </div>
      </article>
    </>
  )
}
