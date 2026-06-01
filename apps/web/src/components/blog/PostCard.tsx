import type { BlogListItem } from '@/lib/cms/types'
import { formatDateIN } from '@rgss/business'
import Link from 'next/link'

// Presentation-only listing card for a single published post. All data is
// pre-resolved by `lib/cms` — this component contains no fetch/business logic.
//
// Image choice: we render the resolved cover with a plain <img> (not next/image)
// to keep the build config-free — the cover URLs are remote (R2/CMS) and would
// otherwise require `images.remotePatterns` host config. Explicit width/height
// + a fixed aspect-ratio box reserve space so there is no layout shift (CLS).

type PostCardProps = {
  post: BlogListItem
}

export function PostCard({ post }: PostCardProps) {
  const { slug, title, excerpt, coverImage, category, publishedAt } = post
  const href = `/blog/${slug}`

  return (
    <article className="group flex flex-col overflow-hidden bg-canvas-white border border-cloud-gray rounded-[6px] motion-safe:transition-all motion-safe:duration-250 hover:border-golden-mist hover:-translate-y-[2px] hover:shadow-card-hover">
      {/* Cover image (or reserved-space placeholder) */}
      <div className="relative w-full aspect-[16/10] bg-warm-cream overflow-hidden">
        {coverImage ? (
          <img
            src={coverImage.url}
            alt={coverImage.alt}
            width={coverImage.width ?? 800}
            height={coverImage.height ?? 500}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-3xl text-deep-gold/40">RG</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6">
        {category ? (
          <span className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold">
            {category}
          </span>
        ) : null}

        <h3 className="font-display text-cocoa-dark text-xl leading-[1.2] mt-2">
          <Link
            href={href}
            className="motion-safe:transition-colors motion-safe:duration-200 hover:text-deep-gold"
          >
            {title}
          </Link>
        </h3>

        {excerpt ? (
          <p className="font-sans text-[15px] leading-[1.55] text-warm-gray mt-3">{excerpt}</p>
        ) : null}

        {publishedAt ? (
          <time
            dateTime={publishedAt}
            className="font-ui text-xs uppercase tracking-[1px] text-dusty-gray mt-auto pt-4"
          >
            {formatDateIN(new Date(publishedAt))}
          </time>
        ) : null}
      </div>
    </article>
  )
}
