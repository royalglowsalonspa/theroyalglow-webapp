/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BlogFeed
 * Scope        : Customer Pages
 *
 * Description  : Bento-grid blog feed with category filtering, search, and
 *                client-side pagination over the initial post list. Rebuilt on
 *                the shadcn/ui Button, Input, and Badge primitives with lucide
 *                icons, following the homepage/blog font system.
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
 * Tech Stack   : React, TypeScript, Next.js 16, Tailwind CSS v4, shadcn/ui,
 *                lucide-react
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/lib/cms/types, @rgss/business, next/link, react,
 *                @/components/ui/{button,input,badge}, @/lib/utils, lucide-react
 *
 * Notes        : Pagination resets to page 1 on filter/search change.
 ************************************************************/

'use client'
import { formatDateIN } from '@rgss/business'
import { ArrowRight, Search } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BlogListItem } from '@/lib/cms/types'
import { cn } from '@/lib/utils'

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
    <div className="flex items-center gap-2 font-ui text-xs font-semibold tracking-wider text-dusty-gray">
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
    <div className="relative size-full overflow-hidden bg-warm-cream">
      {coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImage.url}
          alt={coverImage.alt}
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center font-display text-4xl text-deep-gold/30">
          RG
        </div>
      )}
      {category && (
        <Badge className="absolute left-4 top-4 rounded bg-golden-mist font-ui text-[9px] font-bold uppercase tracking-wider text-cocoa-dark shadow-sm">
          {category}
        </Badge>
      )}
    </div>
  )

  const readMore = (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-ui text-xs font-bold uppercase tracking-wider text-cocoa-dark transition-colors hover:text-deep-gold"
    >
      Read Article
      <ArrowRight
        className="size-3.5 transition-transform group-hover:translate-x-1"
        aria-hidden="true"
      />
    </Link>
  )

  // Featured: wide (2 cols), image + content side-by-side on web, stacked on mobile.
  if (featured) {
    return (
      <article className="group grid grid-cols-1 overflow-hidden rounded-xl border border-outline-gray/15 bg-canvas-white transition-all duration-300 hover:border-deep-gold/30 hover:shadow-card-hover sm:grid-cols-2 lg:col-span-2">
        <div className="relative aspect-[16/10] w-full sm:aspect-auto sm:min-h-[300px]">
          {cover}
        </div>
        <div className="flex flex-col justify-between p-6 sm:p-8">
          <div>
            <CardMeta publishedAt={publishedAt} readingMinutes={readingMinutes} />
            <h2 className="mt-3 font-display text-2xl font-black leading-snug tracking-tight text-cocoa-dark transition-colors duration-200 group-hover:text-deep-gold lg:text-[28px]">
              <Link href={href}>{title}</Link>
            </h2>
            {excerpt && (
              <p className="mt-3 line-clamp-4 font-sans text-sm leading-relaxed text-warm-gray">
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
    <article className="group flex flex-col overflow-hidden rounded-xl border border-outline-gray/15 bg-canvas-white transition-all duration-300 hover:border-deep-gold/30 hover:shadow-card-hover lg:col-span-1">
      <div className="relative aspect-[16/10] w-full">{cover}</div>
      <div className="flex flex-1 flex-col justify-between p-6">
        <div>
          <CardMeta publishedAt={publishedAt} readingMinutes={readingMinutes} />
          <h3 className="mt-3 font-display text-xl font-black leading-snug tracking-tight text-cocoa-dark transition-colors duration-200 group-hover:text-deep-gold">
            <Link href={href}>{title}</Link>
          </h3>
          {excerpt && (
            <p className="mt-2.5 line-clamp-3 font-sans text-[13px] leading-relaxed text-warm-gray">
              {excerpt}
            </p>
          )}
        </div>
        <div className="mt-6 border-t border-outline-gray/10 pt-4">{readMore}</div>
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
    <div id="blog-feed-start" className="flex scroll-mt-28 flex-col gap-10">
      {/* ── Search & Filter Controls Bar ── */}
      <div className="flex flex-col justify-between gap-6 border-b border-outline-gray/15 pb-6 md:flex-row md:items-center">
        {/* Category Filters */}
        <div className="scrollbar-hide -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0 md:pb-0">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              type="button"
              variant={activeCategory === cat ? 'gold' : 'secondary'}
              size="sm"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'shrink-0 rounded-full font-ui text-xs font-bold tracking-[0.5px]',
                activeCategory !== cat && 'bg-cloud-gray/50 text-cocoa-dark hover:bg-cloud-gray',
              )}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full shrink-0 md:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-dusty-gray"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles, tips, rituals..."
            aria-label="Search articles"
            className="h-10 rounded-full pl-10"
          />
        </div>
      </div>

      {/* ── Empty State ── */}
      {filteredPosts.length === 0 ? (
        <div className="rounded-[6px] border border-outline-gray/25 bg-warm-cream p-12 text-center sm:p-20">
          <p className="font-display text-2xl font-bold text-cocoa-dark">
            No matching articles found
          </p>
          <p className="mx-auto mt-3 max-w-[420px] font-sans text-[15px] leading-[1.55] text-warm-gray">
            We couldn&apos;t find any stories matching your search criteria. Try adjusting your
            query or category filters.
          </p>
          <Button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setActiveCategory('All')
            }}
            className="mt-6 rounded-lg font-ui text-xs font-bold uppercase tracking-[0.5px]"
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {/* ── Blog grid: featured (2-col) + uniform cards ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {paginatedPosts.map((post, idx) => (
              <BlogCard key={post.slug} post={post} featured={currentPage === 1 && idx === 0} />
            ))}
          </div>

          {/* ── Pagination Controls ── */}
          {totalPages > 1 && (
            <nav
              aria-label="Blog pagination"
              className="mt-8 flex items-center justify-center gap-1.5 border-t border-outline-gray/10 pt-8"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="font-ui text-xs font-bold"
              >
                Previous
              </Button>

              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1
                return (
                  <Button
                    key={pageNum}
                    type="button"
                    variant={currentPage === pageNum ? 'secondary' : 'outline'}
                    size="icon"
                    onClick={() => handlePageChange(pageNum)}
                    aria-current={currentPage === pageNum ? 'page' : undefined}
                    className={cn(
                      'font-ui text-sm font-bold',
                      currentPage === pageNum && 'border border-deep-gold/30 bg-golden-mist',
                    )}
                  >
                    {pageNum}
                  </Button>
                )
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="font-ui text-xs font-bold"
              >
                Next
              </Button>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}
