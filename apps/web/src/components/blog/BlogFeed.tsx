/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BlogFeed
 * Scope        : Customer Pages
 *
 * Description  : Bento-grid blog feed with category filtering, search, and
 *                client-side pagination over the initial post list.
 *
 * Responsibilities :
 * - Render blog posts in a varied bento-grid layout
 * - Filter posts by category and free-text search
 * - Paginate results and reset paging when filters change
 *
 * Features / Functionality :
 * - Category pill filters + search input
 * - Index-driven bento card layouts
 * - Accessible pagination nav with empty state
 *
 * Tech Stack   : React, TypeScript, Next.js 16, Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/lib/cms/types, @rgss/business, next/link, react
 *
 * Notes        : Pagination resets to page 1 on filter/search change.
 ************************************************************/

'use client'
import type { BlogListItem } from '@/lib/cms/types'
import { formatDateIN } from '@rgss/business'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type BlogFeedProps = {
  initialPosts: BlogListItem[]
}

const CATEGORIES = ['All', 'Skincare', 'Hair', 'Spa & Wellness', 'Bridal', 'Nails', 'Tips & Tricks']

// Page 1 shows a featured (2-col) card + 4 uniform = 5. Page 2+ are a plain
// 3×3 uniform grid (9 per page), no featured card.
const FIRST_PAGE_SIZE = 5
const REST_PAGE_SIZE = 9

/* ── Shared metadata row: date • read time ── */
function CardMeta({
  publishedAt,
  readingMinutes,
}: {
  publishedAt: string
  readingMinutes: number
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-ui text-dusty-gray font-semibold tracking-wider">
      {publishedAt && <span>{formatDateIN(new Date(publishedAt))}</span>}
      {publishedAt && <span aria-hidden="true">•</span>}
      <span>{readingMinutes} min read</span>
    </div>
  )
}

/* ── Blog card — uniform metadata; `featured` spans 2 cols, horizontal on web ── */
interface BlogCardProps {
  post: BlogListItem
  featured?: boolean
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
  const { slug, title, excerpt, coverImage, category, publishedAt, readingMinutes } = post
  const href = `/blog/${slug}`

  const cover = (
    <div className="relative h-full w-full overflow-hidden bg-warm-cream">
      {coverImage ? (
        <img
          src={coverImage.url}
          alt={coverImage.alt}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center font-display text-4xl text-deep-gold/30">
          RG
        </div>
      )}
      {category && (
        <span className="absolute top-4 left-4 bg-[#FFF8E7] text-[#1A0F0A] font-ui text-[9px] uppercase tracking-wider font-bold px-2.5 py-1 rounded shadow-sm">
          {category}
        </span>
      )}
    </div>
  )

  const readMore = (
    <Link
      href={href}
      className="font-ui font-bold text-xs uppercase tracking-wider text-cocoa-dark hover:text-deep-gold transition-colors"
    >
      Read Article{' '}
      <span className="inline-block group-hover:translate-x-1 transition-transform">→</span>
    </Link>
  )

  // Featured: wide (2 cols), image + content side-by-side on web, stacked on mobile.
  if (featured) {
    return (
      <article className="group lg:col-span-2 bg-canvas-white border border-outline-gray/15 rounded-xl overflow-hidden grid grid-cols-1 sm:grid-cols-2 hover:shadow-card-hover hover:border-deep-gold/30 transition-all duration-300">
        <div className="relative w-full aspect-[16/10] sm:aspect-auto sm:min-h-[300px]">
          {cover}
        </div>
        <div className="p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <CardMeta publishedAt={publishedAt} readingMinutes={readingMinutes} />
            <h2 className="font-display font-black text-cocoa-dark text-2xl lg:text-[28px] leading-snug tracking-tight mt-3 group-hover:text-deep-gold transition-colors duration-200">
              <Link href={href}>{title}</Link>
            </h2>
            {excerpt && (
              <p className="font-sans text-sm text-warm-gray mt-3 leading-relaxed line-clamp-4">
                {excerpt}
              </p>
            )}
          </div>
          <div className="mt-6">{readMore}</div>
        </div>
      </article>
    )
  }

  // Standard: uniform vertical card (1 col).
  return (
    <article className="group lg:col-span-1 bg-canvas-white border border-outline-gray/15 rounded-xl overflow-hidden flex flex-col hover:shadow-card-hover hover:border-deep-gold/30 transition-all duration-300">
      <div className="relative w-full aspect-[16/10]">{cover}</div>
      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          <CardMeta publishedAt={publishedAt} readingMinutes={readingMinutes} />
          <h3 className="font-display font-black text-cocoa-dark text-xl leading-snug tracking-tight mt-3 group-hover:text-deep-gold transition-colors duration-200">
            <Link href={href}>{title}</Link>
          </h3>
          {excerpt && (
            <p className="font-sans text-[13px] text-warm-gray mt-2.5 leading-relaxed line-clamp-3">
              {excerpt}
            </p>
          )}
        </div>
        <div className="mt-6 pt-4 border-t border-outline-gray/10">{readMore}</div>
      </div>
    </article>
  )
}

/* ── Main BlogFeed Wrapper ── */
export function BlogFeed({ initialPosts }: BlogFeedProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)

  // Reset page when filters change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reset pagination whenever the search query or active category changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, activeCategory])

  // Filter posts based on category and search query
  const filteredPosts = useMemo(() => {
    return initialPosts.filter((post) => {
      // 1. Category Filter
      let matchesCategory = false
      if (activeCategory === 'All') {
        matchesCategory = true
      } else {
        const postCat = post.category?.toLowerCase().trim() || ''
        const filterCat = activeCategory.toLowerCase().trim()

        if (filterCat === 'hair') {
          matchesCategory = postCat.includes('hair')
        } else if (filterCat === 'spa & wellness') {
          matchesCategory = postCat.includes('spa') || postCat.includes('wellness')
        } else {
          matchesCategory = postCat === filterCat
        }
      }

      // 2. Search Query Filter
      let matchesSearch = true
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim()
        const titleMatch = post.title.toLowerCase().includes(query)
        const excerptMatch = post.excerpt.toLowerCase().includes(query)
        const catMatch = post.category?.toLowerCase().includes(query) || false
        matchesSearch = titleMatch || excerptMatch || catMatch
      }

      return matchesCategory && matchesSearch
    })
  }, [initialPosts, activeCategory, searchQuery])

  // Pagination calculation — page 1 holds FIRST_PAGE_SIZE, pages 2+ hold
  // REST_PAGE_SIZE each.
  const totalPages = useMemo(() => {
    const rest = Math.max(0, filteredPosts.length - FIRST_PAGE_SIZE)
    return 1 + Math.ceil(rest / REST_PAGE_SIZE)
  }, [filteredPosts.length])

  // Get current page items
  const paginatedPosts = useMemo(() => {
    if (currentPage === 1) {
      return filteredPosts.slice(0, FIRST_PAGE_SIZE)
    }
    const start = FIRST_PAGE_SIZE + (currentPage - 2) * REST_PAGE_SIZE
    return filteredPosts.slice(start, start + REST_PAGE_SIZE)
  }, [filteredPosts, currentPage])

  // Scroll to top of feed on page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    const element = document.getElementById('blog-feed-start')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div id="blog-feed-start" className="flex flex-col gap-10 scroll-mt-28">
      {/* ── Search & Filter Controls Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-outline-gray/15">
        {/* Category Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`font-ui text-xs font-bold px-4 py-2 rounded-full tracking-[0.5px] transition-all duration-200 cursor-pointer whitespace-nowrap border ${
                activeCategory === cat
                  ? 'bg-warm-gold text-cocoa-dark border-transparent shadow-sm'
                  : 'bg-cloud-gray/50 text-cocoa-dark border-transparent hover:bg-cloud-gray'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:max-w-xs flex-shrink-0">
          <span
            className="absolute inset-y-0 left-3.5 flex items-center text-dusty-gray pointer-events-none"
            aria-hidden="true"
          >
            🔍
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles, tips, rituals..."
            className="w-full pl-10 pr-4 py-2.5 rounded-full border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark placeholder-dusty-gray focus:outline-none focus:ring-2 focus:ring-deep-gold focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* ── Empty State ── */}
      {filteredPosts.length === 0 ? (
        <div className="bg-warm-cream rounded-[6px] p-12 sm:p-20 text-center border border-outline-gray/25">
          <p className="font-display text-cocoa-dark text-2xl font-bold">
            No matching articles found
          </p>
          <p className="font-sans text-[15px] leading-[1.55] text-warm-gray mt-3 max-w-[420px] mx-auto">
            We couldn&apos;t find any stories matching your search criteria. Try adjusting your
            query or category filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setActiveCategory('All')
            }}
            className="mt-6 bg-cocoa-dark text-canvas-white font-ui font-bold text-xs uppercase tracking-[0.5px] px-6 py-3 rounded-lg hover:bg-warm-gray transition-colors cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {/* ── Blog grid: featured (2-col) + uniform cards ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {paginatedPosts.map((post, idx) => (
              <BlogCard key={post.slug} post={post} featured={currentPage === 1 && idx === 0} />
            ))}
          </div>

          {/* ── Pagination Controls ── */}
          {totalPages > 1 && (
            <nav
              aria-label="Blog pagination"
              className="flex items-center justify-center gap-1.5 mt-8 pt-8 border-t border-outline-gray/10"
            >
              {/* Previous button */}
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="font-ui font-bold text-xs px-4.5 py-2.5 rounded-[4px] border border-outline-gray/50 text-cocoa-dark bg-canvas-white hover:border-cocoa-dark disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
              >
                Previous
              </button>

              {/* Page numbers */}
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => handlePageChange(pageNum)}
                    aria-current={currentPage === pageNum ? 'page' : undefined}
                    className={`w-10 h-10 rounded-[4px] border font-ui font-bold text-sm flex items-center justify-center transition-all duration-200 cursor-pointer ${
                      currentPage === pageNum
                        ? 'bg-[#FFF8E7] text-cocoa-dark border-deep-gold/30 shadow-sm'
                        : 'bg-canvas-white text-cocoa-dark border-outline-gray/50 hover:border-cocoa-dark'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}

              {/* Next button */}
              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="font-ui font-bold text-xs px-4.5 py-2.5 rounded-[4px] border border-outline-gray/50 text-cocoa-dark bg-canvas-white hover:border-cocoa-dark disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
              >
                Next
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}
