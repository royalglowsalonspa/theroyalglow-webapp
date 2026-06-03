/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : client
 * Scope        : CMS Integration
 *
 * Description  : Single read seam between the web app and Payload CMS REST API.
 *                Maps raw Payload documents into stable view-models defensively.
 *
 * Responsibilities :
 * - Fetch and map blog posts, gallery images, team, banners, and FAQs
 * - Normalise Payload docs into typed view-models (never leak Payload types)
 * - Handle graceful degradation when CMS is unconfigured or unreachable
 *
 * Features / Functionality :
 * - getPublishedPosts() / getPostBySlug() / getAllPostSlugs()
 * - getGalleryImages() / getTeamMembers() / getActiveBanners()
 * - getCmsFaqs() — CMS-managed FAQ entries with static fallback
 * - All functions are TOTAL (never throw, return [] or null)
 *
 * Tech Stack   : TypeScript, Payload CMS REST API
 * Layer        : Data Fetching
 *
 * Dependencies : ./config, ./media, ./richtext, ./types
 *
 * Notes        : Never imports from `payload` package directly
 ************************************************************/

import { cmsFetch } from './config'
import { resolveMedia } from './media'
import { lexicalToHtml } from './richtext'
import type { Banner, BlogListItem, BlogPost, CmsFaq, GalleryImage, TeamMember } from './types'

// The single read seam between the web app and Payload's REST API. Every
// exported function is TOTAL: it leans on `cmsFetch` (which already returns
// `null` on unconfigured / network error / non-2xx / parse failure) and maps
// the raw Payload documents into the stable view-models in `types.ts`. Mapping
// is defensive — a doc that cannot yield its required fields (e.g. a post with
// no slug/title, an image that fails to resolve) is skipped, and missing
// optionals resolve to safe defaults (`null`, `[]`, `''`). Nothing here throws.
//
// We model the raw Payload docs as `unknown` / `Record<string, unknown>` and
// narrow them locally rather than importing Payload's generated types — the web
// app must never depend on `payload`.

const DEFAULT_POST_LIMIT = 12
const DEFAULT_POST_PAGE = 1
const ALL_SLUGS_LIMIT = 200

// ---------------------------------------------------------------------------
// Local type guards / coercion helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** A non-empty string, or null. */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** An ISO-8601-ish date string as-is, or '' when absent. */
function asDateString(value: unknown): string {
  return asString(value) ?? ''
}

/** A finite number, or the supplied fallback. */
function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** A stable string id from a string/number field, or '' when absent. */
function asId(value: unknown): string {
  if (typeof value === 'string' && value.trim() !== '') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return ''
}

/** Coerce a `hasMany` text field into a clean string array. */
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: string[] = []
  for (const item of value) {
    const str = asString(item)
    if (str !== null) {
      out.push(str)
    }
  }
  return out
}

/**
 * Coerce Payload's `array` field shape (`[{ value }]`) — and, defensively, a
 * plain `string[]` — into a clean string array.
 */
function asSpecializations(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: string[] = []
  for (const item of value) {
    if (isRecord(item)) {
      const str = asString(item.value)
      if (str !== null) {
        out.push(str)
      }
      continue
    }
    const str = asString(item)
    if (str !== null) {
      out.push(str)
    }
  }
  return out
}

/** Parse a date field into a `Date`, or null when absent/invalid. */
function parseDate(value: unknown): Date | null {
  const str = asString(value)
  if (str === null) {
    return null
  }
  const date = new Date(str)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Extract the `docs` array from a Payload list response, totally. */
function extractDocs(response: unknown): unknown[] {
  if (isRecord(response) && Array.isArray(response.docs)) {
    return response.docs
  }
  return []
}

// ---------------------------------------------------------------------------
// Doc → view-model mappers (each returns null when a required field is missing)
// ---------------------------------------------------------------------------

function mapBlogListItem(doc: unknown): BlogListItem | null {
  if (!isRecord(doc)) {
    return null
  }
  const slug = asString(doc.slug)
  const title = asString(doc.title)
  if (slug === null || title === null) {
    return null
  }
  return {
    slug,
    title,
    excerpt: asString(doc.excerpt) ?? '',
    coverImage: resolveMedia(doc.coverImage),
    category: asString(doc.category),
    publishedAt: asDateString(doc.publishedAt),
  }
}

function mapAuthor(value: unknown): BlogPost['author'] {
  if (!isRecord(value)) {
    return null
  }
  const name = asString(value.name)
  if (name === null) {
    return null
  }
  return { name, photo: resolveMedia(value.photo) }
}

function mapSeo(value: unknown): BlogPost['seo'] {
  if (!isRecord(value)) {
    return { metaTitle: null, metaDescription: null, ogImageUrl: null }
  }
  return {
    metaTitle: asString(value.metaTitle),
    metaDescription: asString(value.metaDescription),
    ogImageUrl: resolveMedia(value.ogImage)?.url ?? null,
  }
}

function mapBlogPost(doc: unknown): BlogPost | null {
  const base = mapBlogListItem(doc)
  if (base === null || !isRecord(doc)) {
    return null
  }
  return {
    ...base,
    bodyHtml: lexicalToHtml(doc.body),
    author: mapAuthor(doc.author),
    tags: asStringArray(doc.tags),
    seo: mapSeo(doc.seo),
    updatedAt: asDateString(doc.updatedAt),
  }
}

function mapGalleryImage(doc: unknown): GalleryImage | null {
  if (!isRecord(doc)) {
    return null
  }
  const image = resolveMedia(doc.image)
  if (image === null) {
    return null
  }
  return {
    id: asId(doc.id),
    image,
    caption: asString(doc.caption),
    category: asString(doc.category),
  }
}

function mapTeamMember(doc: unknown): TeamMember | null {
  if (!isRecord(doc)) {
    return null
  }
  const name = asString(doc.name)
  const role = asString(doc.role)
  if (name === null || role === null) {
    return null
  }
  return {
    name,
    role,
    bio: asString(doc.bio) ?? '',
    photo: resolveMedia(doc.photo),
    specializations: asSpecializations(doc.specializations),
  }
}

function mapBanner(doc: unknown): Banner | null {
  if (!isRecord(doc)) {
    return null
  }
  const headline = asString(doc.headline)
  if (headline === null) {
    return null
  }
  const image = resolveMedia(doc.image)
  if (image === null) {
    return null
  }
  return {
    headline,
    image,
    ctaLabel: asString(doc.ctaLabel),
    ctaHref: asString(doc.ctaHref),
    order: asNumber(doc.order, 0),
  }
}

function mapCmsFaq(doc: unknown): CmsFaq | null {
  if (!isRecord(doc)) {
    return null
  }
  const question = asString(doc.question)
  const answer = asString(doc.answer)
  if (question === null || answer === null) {
    return null
  }
  return {
    question,
    answer,
    category: asString(doc.category),
  }
}

/**
 * A banner is shown only when `now` falls within its `[startAt, endAt]` window;
 * an absent `startAt`/`endAt` bound is treated as open-ended.
 */
function isWithinWindow(doc: unknown, now: Date): boolean {
  if (!isRecord(doc)) {
    return true
  }
  const start = parseDate(doc.startAt)
  const end = parseDate(doc.endAt)
  const at = now.getTime()
  if (start !== null && start.getTime() > at) {
    return false
  }
  if (end !== null && at > end.getTime()) {
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Public read functions
// ---------------------------------------------------------------------------

/** Published posts in reverse-chronological order for the `/blog` listing. */
export async function getPublishedPosts(opts?: {
  limit?: number
  page?: number
}): Promise<BlogListItem[]> {
  const limit = opts?.limit ?? DEFAULT_POST_LIMIT
  const page = opts?.page ?? DEFAULT_POST_PAGE
  const response = await cmsFetch<unknown>(
    `/api/blog?where[status][equals]=published&sort=-publishedAt&depth=1&limit=${limit}&page=${page}`,
  )
  const items: BlogListItem[] = []
  for (const doc of extractDocs(response)) {
    const item = mapBlogListItem(doc)
    if (item !== null) {
      items.push(item)
    }
  }
  return items
}

/** A single published post by slug, or null when missing/unpublished. */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const response = await cmsFetch<unknown>(
    `/api/blog?where[slug][equals]=${encodeURIComponent(slug)}&where[status][equals]=published&depth=1&limit=1`,
  )
  const [first] = extractDocs(response)
  return first === undefined ? null : mapBlogPost(first)
}

/** Slugs of all published posts (for `generateStaticParams` / sitemap). */
export async function getAllPostSlugs(): Promise<string[]> {
  const response = await cmsFetch<unknown>(
    `/api/blog?where[status][equals]=published&depth=0&limit=${ALL_SLUGS_LIMIT}&select[slug]=true`,
  )
  const slugs: string[] = []
  for (const doc of extractDocs(response)) {
    if (isRecord(doc)) {
      const slug = asString(doc.slug)
      if (slug !== null) {
        slugs.push(slug)
      }
    }
  }
  return slugs
}

/** Gallery images, optionally filtered to a single category. */
export async function getGalleryImages(opts?: {
  category?: string
}): Promise<GalleryImage[]> {
  const category = opts?.category
  const categoryClause =
    typeof category === 'string' && category.trim() !== ''
      ? `&where[category][equals]=${encodeURIComponent(category)}`
      : ''
  const response = await cmsFetch<unknown>(`/api/gallery?depth=1&sort=order${categoryClause}`)
  const images: GalleryImage[] = []
  for (const doc of extractDocs(response)) {
    const image = mapGalleryImage(doc)
    if (image !== null) {
      images.push(image)
    }
  }
  return images
}

/** Team members in display order, for the optional `/about` surface. */
export async function getTeamMembers(): Promise<TeamMember[]> {
  const response = await cmsFetch<unknown>('/api/team?depth=1&sort=order')
  const members: TeamMember[] = []
  for (const doc of extractDocs(response)) {
    const member = mapTeamMember(doc)
    if (member !== null) {
      members.push(member)
    }
  }
  return members
}

/** Active banners whose `[startAt, endAt]` window contains `now`. */
export async function getActiveBanners(now: Date = new Date()): Promise<Banner[]> {
  const response = await cmsFetch<unknown>(
    '/api/banner?where[active][equals]=true&depth=1&sort=order',
  )
  const banners: Banner[] = []
  for (const doc of extractDocs(response)) {
    const banner = mapBanner(doc)
    if (banner === null || !isWithinWindow(doc, now)) {
      continue
    }
    banners.push(banner)
  }
  return banners
}

/**
 * CMS-managed FAQ entries. Empty when the CMS is unconfigured/unreachable,
 * which lets callers fall back to the static `FAQS` list.
 */
export async function getCmsFaqs(): Promise<CmsFaq[]> {
  const response = await cmsFetch<unknown>('/api/faq?depth=0&sort=order')
  const faqs: CmsFaq[] = []
  for (const doc of extractDocs(response)) {
    const faq = mapCmsFaq(doc)
    if (faq !== null) {
      faqs.push(faq)
    }
  }
  return faqs
}
