/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : FeaturedPostCard
 * Scope        : Customer Pages
 *
 * Description  : Premium two-column hero card for the featured blog post with
 *                a zoom-on-hover cover image and gold brand accents.
 *
 * Responsibilities :
 * - Highlight the single featured blog post
 * - Link through to the full article
 *
 * Features / Functionality :
 * - Two-column editorial layout
 * - Hover image zoom + gold accent styling
 * - Indian-formatted publish date
 *
 * Tech Stack   : React, TypeScript, Next.js 16, Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/lib/cms/types, @rgss/business, next/link
 *
 * Notes        : None
 ************************************************************/

import type { BlogListItem } from '@/lib/cms/types'
import { formatDateIN } from '@rgss/business'
import Link from 'next/link'

type FeaturedPostCardProps = {
  post: BlogListItem
}

export function FeaturedPostCard({ post }: FeaturedPostCardProps) {
  const { slug, title, excerpt, coverImage, category, publishedAt } = post
  const href = `/blog/${slug}`

  return (
    <article className="group grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center bg-canvas-white border border-cloud-gray rounded-[6px] overflow-hidden p-6 sm:p-8 lg:p-10 motion-safe:transition-all motion-safe:duration-250 hover:border-golden-mist hover:shadow-card-hover">
      {/* Left Column — Cover Image (spans 7 cols on large screens) */}
      <div className="lg:col-span-7 relative w-full aspect-video sm:aspect-[16/10] lg:aspect-[16/9.5] rounded-[4px] overflow-hidden bg-warm-cream">
        {coverImage ? (
          <img
            src={coverImage.url}
            alt={coverImage.alt}
            width={coverImage.width ?? 1200}
            height={coverImage.height ?? 700}
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-5xl text-deep-gold/30">RG</span>
          </div>
        )}
      </div>

      {/* Right Column — Text Content (spans 5 cols on large screens) */}
      <div className="lg:col-span-5 flex flex-col justify-center h-full py-2">
        {/* Category & Metadata */}
        <div className="flex flex-wrap items-center gap-3">
          {category ? (
            <span className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold font-bold">
              {category}
            </span>
          ) : null}
          {category && publishedAt ? (
            <span className="text-dusty-gray text-[10px]" aria-hidden="true">
              ·
            </span>
          ) : null}
          {publishedAt ? (
            <time
              dateTime={publishedAt}
              className="font-ui text-[11px] uppercase tracking-[1px] text-dusty-gray font-semibold"
            >
              {formatDateIN(new Date(publishedAt))}
            </time>
          ) : null}
          <span className="text-dusty-gray text-[10px]" aria-hidden="true">
            ·
          </span>
          <span className="font-ui text-[11px] uppercase tracking-[1px] text-dusty-gray font-semibold">
            5 min read
          </span>
        </div>

        {/* Title */}
        <h2 className="font-display font-black text-cocoa-dark text-[clamp(24px,3vw,36px)] leading-[1.15] tracking-tight mt-4 group-hover:text-deep-gold transition-colors duration-200">
          <Link href={href}>{title}</Link>
        </h2>

        {/* Excerpt */}
        {excerpt ? (
          <p className="font-sans text-[16px] leading-[1.6] text-warm-gray mt-4 max-w-[460px]">
            {excerpt}
          </p>
        ) : null}

        {/* Action Button */}
        <div className="mt-8">
          <Link
            href={href}
            className="font-ui font-bold text-sm text-cocoa-dark hover:text-deep-gold transition-colors duration-200 inline-flex items-center gap-2"
          >
            Read Article{' '}
            <span aria-hidden="true" className="group-hover:translate-x-1 transition-transform">
              →
            </span>
          </Link>
        </div>
      </div>
    </article>
  )
}
