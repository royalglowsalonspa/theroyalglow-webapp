/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : types
 * Scope        : CMS Integration — Types
 *
 * Description  : View-model types the web app renders. Stable contract between
 *                lib/cms and pages/components. Payload types never leak past this.
 *
 * Responsibilities :
 * - Define typed view-models for blog posts, gallery, team, banners, FAQs
 * - Provide the ResolvedMedia type for resolved image references
 *
 * Features / Functionality :
 * - ResolvedMedia — absolute URL + a11y/CLS metadata
 * - BlogListItem / BlogPost — blog listing and detail models
 * - GalleryImage / TeamMember / Banner / CmsFaq types
 *
 * Tech Stack   : TypeScript
 * Layer        : Types
 *
 * Dependencies : None
 *
 * Notes        : None
 ************************************************************/

// View-model types the web app renders. These are the stable contract between
// `lib/cms` and the pages/components — Payload's generated document types never
// leak past this layer. Every raw Payload doc is normalised into one of these
// shapes by `client.ts` (via `media.ts` / `richtext.ts`).

/** A resolved image reference with an absolute URL and a11y/CLS metadata. */
export type ResolvedMedia = {
  url: string
  alt: string
  width: number | null
  height: number | null
}

/** A blog post as it appears in the `/blog` listing. */
export type BlogListItem = {
  slug: string
  title: string
  excerpt: string
  coverImage: ResolvedMedia | null
  category: string | null
  publishedAt: string
}

/** A full blog post as rendered on `/blog/[slug]`. */
export type BlogPost = BlogListItem & {
  bodyHtml: string
  author: { name: string; photo: ResolvedMedia | null } | null
  tags: string[]
  seo: {
    metaTitle: string | null
    metaDescription: string | null
    ogImageUrl: string | null
  }
  updatedAt: string
}

/** A gallery image as rendered in the `/gallery` grid. */
export type GalleryImage = {
  id: string
  image: ResolvedMedia
  caption: string | null
  category: string | null
}

/** A team member as optionally surfaced on `/about`. */
export type TeamMember = {
  name: string
  role: string
  bio: string
  photo: ResolvedMedia | null
  specializations: string[]
}

/** A homepage promo banner. */
export type Banner = {
  headline: string
  image: ResolvedMedia
  ctaLabel: string | null
  ctaHref: string | null
  order: number
}

/** A CMS-managed FAQ entry (counterpart to the static `FAQS` list). */
export type CmsFaq = {
  question: string
  answer: string
  category: string | null
}
