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

import { formatINR } from '@rgss/business'
import { cmsFetch } from './config'
import { resolveMedia } from './media'
import { lexicalToHtml, lexicalToPlainText } from './richtext'
import type {
  Banner,
  BlogListItem,
  BlogPost,
  CmsFaq,
  GalleryImage,
  Offer,
  Service,
  ServiceCardItem,
  TeamMember,
  Testimonial,
} from './types'

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

const WORDS_PER_MINUTE = 200

/** Reading time in minutes from a word count (min 1). */
function readingMinutesFromText(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

/** Reading time from an HTML string (tags stripped). Used for mock fallbacks. */
function readingMinutesFromHtml(html: string): number {
  return readingMinutesFromText(html.replace(/<[^>]+>/g, ' '))
}

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
    // Computed from the full body (CMS-driven; no manual field needed).
    readingMinutes: readingMinutesFromText(lexicalToPlainText(doc.body, 0)),
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

/** Clamp a rating into the inclusive 1–5 star range. */
function clampRating(value: unknown): number {
  const raw = asNumber(value, 5)
  if (raw < 1) {
    return 1
  }
  if (raw > 5) {
    return 5
  }
  return Math.round(raw)
}

function mapTestimonial(doc: unknown): Testimonial | null {
  if (!isRecord(doc)) {
    return null
  }
  const reviewerName = asString(doc.reviewerName)
  const reviewText = asString(doc.reviewText)
  if (reviewerName === null || reviewText === null) {
    return null
  }
  return {
    reviewerName,
    rating: clampRating(doc.rating),
    reviewText,
    timeLabel: asString(doc.timeLabel) ?? '',
  }
}

function mapOffer(doc: unknown): Offer | null {
  if (!isRecord(doc)) {
    return null
  }
  const title = asString(doc.title)
  if (title === null) {
    return null
  }
  const image = resolveMedia(doc.image)
  if (image === null) {
    return null
  }
  const id = asId(doc.id)
  return {
    id: id !== '' ? id : title,
    title,
    description: asString(doc.description) ?? '',
    discountLabel: asString(doc.discountLabel),
    image,
    ctaLabel: asString(doc.ctaLabel) ?? 'Book Now',
    ctaHref: asString(doc.ctaHref) ?? '/?book=1',
    category: asString(doc.category) ?? 'all',
    validUntil: asString(doc.validUntil),
  }
}

/**
 * An offer is shown only when `now` falls within its `[validFrom, validUntil]`
 * window; an absent bound is treated as open-ended.
 */
function isWithinValidityWindow(doc: unknown, now: Date): boolean {
  if (!isRecord(doc)) {
    return true
  }
  const start = parseDate(doc.validFrom)
  const end = parseDate(doc.validUntil)
  const at = now.getTime()
  if (start !== null && start.getTime() > at) {
    return false
  }
  if (end !== null && at > end.getTime()) {
    return false
  }
  return true
}

function mapServiceCard(doc: unknown): ServiceCardItem | null {
  if (!isRecord(doc)) {
    return null
  }
  const name = asString(doc.name)
  const fromPrice = asString(doc.fromPrice)
  if (name === null || fromPrice === null) {
    return null
  }
  const image = resolveMedia(doc.image)
  if (image === null) {
    return null
  }
  const id = asId(doc.id)
  const imageAlt = asString(doc.imageAlt) ?? image.alt ?? `${name} at Royal Glow`
  return {
    id: id !== '' ? id : name,
    name,
    fromPrice,
    image: { ...image, alt: imageAlt },
    imageAlt,
    bookingHref: asString(doc.bookingHref) ?? '/?book=1',
  }
}

function mapService(doc: unknown): Service | null {
  if (!isRecord(doc)) {
    return null
  }
  const name = asString(doc.name)
  const type = asString(doc.type)
  if (name === null || (type !== 'salon' && type !== 'spa')) {
    return null
  }
  const image = resolveMedia(doc.image)
  if (image === null) {
    return null
  }
  const durationMinutes = asNumber(doc.durationMinutes, 0)
  const pricePaise = asNumber(doc.pricePaise, -1)
  if (durationMinutes <= 0 || pricePaise < 0) {
    return null
  }
  const id = asId(doc.id)
  return {
    id: id !== '' ? id : name,
    name,
    type,
    category: asString(doc.category),
    image,
    description: asString(doc.description) ?? '',
    durationMinutes,
    priceFormatted: formatINR(pricePaise),
    bookingRef: asString(doc.bookingRef),
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
// Mock Data Fallbacks (used when CMS is unconfigured or unreachable)
// ---------------------------------------------------------------------------

const MOCK_POSTS_RAW: Omit<BlogPost, 'readingMinutes'>[] = [
  {
    slug: 'hair-color-stay-longer',
    title: 'How to make hair color stay longer: Expert Secrets',
    excerpt:
      'Discover the professional rituals and essential products needed to maintain vibrant, salon-fresh hair color long after your appointment. Our master colorists reveal their top strategies.',
    category: 'Hair Care',
    publishedAt: '2024-10-12T08:00:00.000Z',
    updatedAt: '2024-10-12T08:00:00.000Z',
    coverImage: {
      url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&q=80&w=800',
      alt: 'Professional hair wash and color treatment',
      width: 800,
      height: 500,
    },
    author: {
      name: 'Priya Sharma',
      photo: null,
    },
    tags: ['hair care', 'hair color', 'expert secrets'],
    seo: {
      metaTitle: 'How to make hair color stay longer: Expert Secrets',
      metaDescription:
        'Discover the professional rituals and essential products needed to maintain vibrant, salon-fresh hair color long after your appointment.',
      ogImageUrl:
        'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&q=80&w=800',
    },
    bodyHtml: `
      <h2>The Science of Hair Color Fade</h2>
      <p>Every time you wash your hair, the hair cuticles swell, allowing color molecules to escape. Hard water, UV rays, heat styling, and aggressive shampoos accelerate this process. To maintain that fresh-from-the-salon radiance, you need a combination of structural protection and moisture retention.</p>
      
      <h2>1. The 72-Hour Rule</h2>
      <p>Do not wash your hair for at least 72 hours after coloring. It can take up to three days for the hair cuticle to fully close and trap the color molecules. Washing too early is the number one cause of premature fading.</p>

      <h2>2. Turn Down the Temperature</h2>
      <p>Hot water opens the cuticle, allowing color to wash right out. Always wash your hair with lukewarm water and rinse with cool water. Cool water seals the cuticle, locks in moisture, and adds a beautiful shine.</p>

      <h2>3. Choose Sulfate-Free Shampoos</h2>
      <p>Sulfates are harsh cleansing agents that strip away natural oils and color pigments. Always choose professional, sulfate-free, color-safe shampoos. Our stylists recommend products enriched with antioxidants to defend against environmental fade.</p>

      <h2>4. Protect from Heat Styling</h2>
      <p>Heat styling tools like blow dryers, flat irons, and curling wands are color enemies. They dry out the hair shaft, making it porous and unable to hold color. Always apply a high-quality heat protectant spray before using any heat tool, and keep the temperature setting moderate.</p>
    `,
  },
  {
    slug: 'hot-stone-therapy',
    title: 'The profound benefits of hot stone therapy',
    excerpt:
      'Melt away tension and improve circulation with this ancient wellness practice. Learn why stone therapy is a cornerstone of deep relaxation.',
    category: 'Spa & Wellness',
    publishedAt: '2024-10-08T09:00:00.000Z',
    updatedAt: '2024-10-08T09:00:00.000Z',
    coverImage: {
      url: 'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&q=80&w=800',
      alt: 'Relaxing hot stone massage therapy',
      width: 800,
      height: 500,
    },
    author: {
      name: 'Elena Gilbert',
      photo: null,
    },
    tags: ['spa', 'wellness', 'massage', 'hot stone'],
    seo: {
      metaTitle: 'The profound benefits of hot stone therapy',
      metaDescription:
        'Melt away tension and improve circulation with this ancient wellness practice. Learn why stone therapy is a cornerstone of deep relaxation.',
      ogImageUrl:
        'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&q=80&w=800',
    },
    bodyHtml: `
      <h2>Ancient Healing with Modern Solace</h2>
      <p>Hot stone therapy is more than just a luxurious spa treatment—it is a deeply therapeutic practice that dates back thousands of years. By placing smooth, heated basalt stones on key energy points of the body, our therapists can target deep muscle tension and promote profound cellular relaxation.</p>
      
      <h2>1. Deep Muscle Relaxation</h2>
      <p>The heat from the stones penetrates deep into your muscles, expanding blood vessels and increasing blood flow. This thermal effect relaxes muscle fibers far more efficiently than standard manual massage, allowing the therapist to address chronic tension without excessive pressure.</p>

      <h2>2. Stress and Anxiety Reduction</h2>
      <p>The combination of warmth and rhythmic massage strokes triggers the release of endorphins while reducing cortisol (the stress hormone). Many clients report entering a meditative, near-sleep state during their session, providing a much-needed mental sanctuary.</p>

      <h2>3. Improved Circulation and Flow</h2>
      <p>As blood vessels open, oxygen-rich blood floods your tissues, accelerating the removal of metabolic waste. This boosts lymphatic drainage and leaves you feeling refreshed and rejuvenated.</p>
    `,
  },
  {
    slug: 'daily-skincare-rituals',
    title: 'Elevating your daily skin care rituals',
    excerpt:
      'Building a consistent routine is the foundation of a lasting glow. We break down the essential steps for morning and evening care.',
    category: 'Skincare',
    publishedAt: '2024-10-05T10:00:00.000Z',
    updatedAt: '2024-10-05T10:00:00.000Z',
    coverImage: {
      url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&q=80&w=800',
      alt: 'Luxury skincare bottles and natural cream',
      width: 800,
      height: 500,
    },
    author: {
      name: 'Dr. Ananya Rao',
      photo: null,
    },
    tags: ['skincare', 'daily routine', 'glowing skin'],
    seo: {
      metaTitle: 'Elevating your daily skin care rituals',
      metaDescription:
        'Building a consistent routine is the foundation of a lasting glow. We break down the essential steps for morning and evening care.',
      ogImageUrl:
        'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&q=80&w=800',
    },
    bodyHtml: `
      <h2>The Power of Consistency</h2>
      <p>True skin radiance is rarely the result of a single treatment. It is built day by day, step by step, through deliberate, mindful skincare rituals. By understanding how to layer products correctly, you can amplify their benefits and maintain a gorgeous, healthy glow year-round.</p>
      
      <h2>The Morning Routine: Protect and Hydrate</h2>
      <p>Your daytime routine should focus on shielding your skin from environmental damage (pollution, UV rays) and locking in hydration:</p>
      <ul>
        <li><strong>Step 1: Gentle Cleanse</strong> — Start with a mild, hydrating cleanser to remove overnight buildup without stripping your moisture barrier.</li>
        <li><strong>Step 2: Hydrating Toner</strong> — Prep your skin to absorb active ingredients.</li>
        <li><strong>Step 3: Antioxidant Serum</strong> — Apply a Vitamin C serum to neutralize free radicals and brighten the skin tone.</li>
        <li><strong>Step 4: Moisturize</strong> — Lock in hydration with a lightweight moisturizer suited to your skin type.</li>
        <li><strong>Step 5: SPF</strong> — Never skip sunscreen. A broad-spectrum SPF 30+ is the ultimate defense against premature aging.</li>
      </ul>

      <h2>The Evening Routine: Repair and Renew</h2>
      <p>At night, your skin goes into recovery mode. This is the time to feed it active, restorative ingredients:</p>
      <ul>
        <li><strong>Step 1: Double Cleanse</strong> — Use an oil-based cleanser first to break down makeup and SPF, followed by a water-based cleanser to deep-clean pores.</li>
        <li><strong>Step 2: Treat</strong> — Apply targeted treatments like retinoids, peptide serums, or exfoliating acids (AHA/BHAs).</li>
        <li><strong>Step 3: Nourish</strong> — Use a richer night cream or facial oil to repair the skin barrier and prevent overnight water loss.</li>
      </ul>
    `,
  },
  {
    slug: 'bridal-hair-rituals',
    title: 'Bridal hair rituals: Preparation for the perfect day',
    excerpt:
      'Your wedding day look starts months in advance. Learn how to prepare your hair for optimal health, styling hold, and undeniable radiance as you walk down the aisle.',
    category: 'Bridal',
    publishedAt: '2024-09-28T11:00:00.000Z',
    updatedAt: '2024-09-28T11:00:00.000Z',
    coverImage: {
      url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=800',
      alt: 'Beautiful bride with elegant hair styling',
      width: 800,
      height: 500,
    },
    author: {
      name: 'Rohan Mehra',
      photo: null,
    },
    tags: ['bridal', 'hair styling', 'wedding preparation'],
    seo: {
      metaTitle: 'Bridal hair rituals: Preparation for the perfect day',
      metaDescription:
        'Your wedding day look starts months in advance. Learn how to prepare your hair for optimal health, styling hold, and undeniable radiance.',
      ogImageUrl:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=800',
    },
    bodyHtml: `
      <h2>The Journey to Bridal Radiance</h2>
      <p>Every bride wants perfect, shiny hair as she walks down the aisle. However, the complex updos, extensions, and styling heat used on your wedding day require strong, healthy hair structure. The best bridal hair looks are planned months in advance.</p>
      
      <h2>3 Months Before: Trim and Strengthen</h2>
      <p>Schedule a trim to eliminate split ends. Begin a bi-weekly deep conditioning routine or in-salon Olaplex treatment to rebuild bonds. Avoid major color transitions close to the wedding date; now is the time to establish your base shade.</p>

      <h2>1 Month Before: Final Color and Trial</h2>
      <p>Complete your final color refresh. Ensure you book a complete hair styling trial. Bring your headpiece, veil, and dress photos so your stylist can tailor the volume, drape, and hold to your bridal outfit.</p>

      <h2>The Week of: Hydration and Rest</h2>
      <p>Enjoy a signature spa hair ritual to boost cuticle shine. Wash your hair the night before the wedding (not the day of)—slightly textured "day-two" hair holds pins, braids, and curls significantly better than freshly washed, slippery hair.</p>
    `,
  },
  {
    slug: 'nail-trends-season',
    title: '5 Nails trends you should try this season',
    excerpt:
      'From chrome finishes to minimalist line art, discover the hottest nail trends that will elevate your style this season.',
    category: 'Nails',
    publishedAt: '2024-09-20T08:00:00.000Z',
    updatedAt: '2024-09-20T08:00:00.000Z',
    coverImage: {
      url: 'https://images.unsplash.com/photo-1604654894610-df4906b1850a?auto=format&fit=crop&q=80&w=800',
      alt: 'Premium manicured nails with chrome finish',
      width: 800,
      height: 500,
    },
    author: {
      name: 'Meera Nair',
      photo: null,
    },
    tags: ['nails', 'nail art', 'manicure', 'trends'],
    seo: {
      metaTitle: '5 Nails trends you should try this season',
      metaDescription:
        'From chrome finishes to minimalist line art, discover the hottest nail trends that will elevate your style this season.',
      ogImageUrl:
        'https://images.unsplash.com/photo-1604654894610-df4906b1850a?auto=format&fit=crop&q=80&w=800',
    },
    bodyHtml: `
      <h2>Elevate Your Fingertips</h2>
      <p>Nail art has transitioned from occasional pampering to an essential extension of personal style. This season, the trends focus on tactile finishes, subtle geometric linework, and soft metallic glazes. Here are the top five styles our nail artists are requested for right now.</p>
      
      <h2>1. The Glazed Donut & Chrome Finish</h2>
      <p>Made popular globally, a pearlescent chrome powder buffed over a neutral base remains highly desired. It adds a futuristic yet clean sheen to short or almond nails.</p>

      <h2>2. Minimalist Negative Space</h2>
      <p>Instead of full coverage, this style pairs clear gel bases with single black, gold, or gold-foil accent lines. It is low maintenance, modern, and pairs beautifully with any jewelry.</p>
    `,
  },
  {
    slug: 'monsoon-skincare-tips',
    title: '10 Skincare tips for the rainy monsoon season',
    excerpt:
      'Humidity and rain can play havoc with your skin. Keep your glow intact with these dermatologist-approved monsoon skincare habits.',
    category: 'Tips & Tricks',
    publishedAt: '2024-09-15T09:00:00.000Z',
    updatedAt: '2024-09-15T09:00:00.000Z',
    coverImage: {
      url: 'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?auto=format&fit=crop&q=80&w=800',
      alt: 'Skincare products in a clean fresh layout',
      width: 800,
      height: 500,
    },
    author: {
      name: 'Dr. Ananya Rao',
      photo: null,
    },
    tags: ['skincare', 'monsoon', 'skin tips', 'humidity'],
    seo: {
      metaTitle: '10 Skincare tips for the rainy monsoon season',
      metaDescription:
        'Humidity and rain can play havoc with your skin. Keep your glow intact with these dermatologist-approved monsoon skincare habits.',
      ogImageUrl:
        'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?auto=format&fit=crop&q=80&w=800',
    },
    bodyHtml: `
      <h2>Navigating Monsoon Humidity</h2>
      <p>Monsoon brings a welcome relief from heat, but the sudden rise in humidity combined with rainy dampness creates a perfect breeding ground for acne, fungal skin issues, and excessive oil production. Adjusting your skincare habits during this transition is critical to maintaining a healthy glow.</p>
    `,
  },
  {
    slug: 'understanding-hair-health',
    title: 'Understanding hair health: porosity, texture, and care',
    excerpt:
      'Unlock the secrets to your hair type. Learn how hair porosity and texture dictate the products and cuts that will serve you best.',
    category: 'Hair',
    publishedAt: '2024-09-02T10:00:00.000Z',
    updatedAt: '2024-09-02T10:00:00.000Z',
    coverImage: {
      url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=800',
      alt: 'Healthy shiny hair strands close up',
      width: 800,
      height: 500,
    },
    author: {
      name: 'Priya Sharma',
      photo: null,
    },
    tags: ['hair care', 'hair texture', 'hair porosity'],
    seo: {
      metaTitle: 'Understanding hair health: porosity, texture, and care',
      metaDescription:
        'Unlock the secrets to your hair type. Learn how hair porosity and texture dictate the products and cuts that will serve you best.',
      ogImageUrl:
        'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=800',
    },
    bodyHtml: `
      <h2>The Foundation of Hair Care</h2>
      <p>Why does a product that gives your friend silky, manageable curls leave your hair dry or weighed down? The answer lies in your hair structure. Beyond curl pattern, your hair's porosity (its ability to absorb and hold moisture) and texture dictate what treatments it requires.</p>
    `,
  },
]

// Mock posts with reading time derived from their HTML body.
const MOCK_POSTS: BlogPost[] = MOCK_POSTS_RAW.map((post) => ({
  ...post,
  readingMinutes: readingMinutesFromHtml(post.bodyHtml),
}))

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
    { tags: ['blog'] },
  )
  const items: BlogListItem[] = []
  for (const doc of extractDocs(response)) {
    const item = mapBlogListItem(doc)
    if (item !== null) {
      items.push(item)
    }
  }
  if (items.length === 0) {
    return MOCK_POSTS.slice(0, limit)
  }
  return items
}

/** A single published post by slug, or null when missing/unpublished. */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const response = await cmsFetch<unknown>(
    `/api/blog?where[slug][equals]=${encodeURIComponent(slug)}&where[status][equals]=published&depth=1&limit=1`,
    { tags: ['blog'] },
  )
  const [first] = extractDocs(response)
  const post = first === undefined ? null : mapBlogPost(first)
  if (post === null) {
    return MOCK_POSTS.find((p) => p.slug === slug) ?? null
  }
  return post
}

/** Slugs of all published posts (for `generateStaticParams` / sitemap). */
export async function getAllPostSlugs(): Promise<string[]> {
  const response = await cmsFetch<unknown>(
    `/api/blog?where[status][equals]=published&depth=0&limit=${ALL_SLUGS_LIMIT}&select[slug]=true`,
    { tags: ['blog'] },
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
  if (slugs.length === 0) {
    return MOCK_POSTS.map((p) => p.slug)
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
  const response = await cmsFetch<unknown>(`/api/gallery?depth=1&sort=order${categoryClause}`, {
    tags: ['gallery'],
  })
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
  const response = await cmsFetch<unknown>('/api/team?depth=1&sort=order', { tags: ['team'] })
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
    { tags: ['banner'] },
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
  const response = await cmsFetch<unknown>('/api/faq?depth=0&sort=order', { tags: ['faq'] })
  const faqs: CmsFaq[] = []
  for (const doc of extractDocs(response)) {
    const faq = mapCmsFaq(doc)
    if (faq !== null) {
      faqs.push(faq)
    }
  }
  return faqs
}

/**
 * Active customer testimonials in display order for the homepage carousel.
 * Empty when the CMS is unconfigured/unreachable/empty, which lets the caller
 * fall back to the curated hardcoded reviews.
 */
export async function getTestimonials(): Promise<Testimonial[]> {
  const response = await cmsFetch<unknown>(
    '/api/testimonial?where[active][equals]=true&depth=0&sort=order&limit=20',
    { tags: ['testimonial'] },
  )
  const testimonials: Testimonial[] = []
  for (const doc of extractDocs(response)) {
    const testimonial = mapTestimonial(doc)
    if (testimonial !== null) {
      testimonials.push(testimonial)
    }
  }
  return testimonials
}

/** Curated homepage offers shown when the CMS is unconfigured/unreachable/empty. */
export const FALLBACK_OFFERS: Offer[] = [
  {
    id: 'fallback-facials',
    title: '20% OFF All Facials — This week only!',
    description: 'Refresh your glow with our signature skincare rituals.',
    discountLabel: '20% OFF',
    image: {
      url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuChf_-S9qaSgh4ChgD4vHvHOXi0JaNdY6sbENglW-QFs2Y4_PxRHayjVgKBYvET6H1oc_jFCq-SpkAlMqZvATcX4vqOf_4Qv7lowJ0Z-yUpijd-prJwrxZL009WIpMoejD5h8E1v_-VX8fFsNU1Xw-qZCSpfkKGZXC8nFE4r2FGwMDV6aDAqywKydJi6rijlY3TMDjBOuQh3RIWyVZSVNguwgQ-dDaXeufdUkyJX6-zPdZ_AFn-rgIWM6Tpw4_aG2tbZyj4RDWqDmM',
      alt: '20% off facials at Royal Glow — skincare treatment',
      width: null,
      height: null,
    },
    ctaLabel: 'Book Now',
    ctaHref: '/?book=1',
    category: 'skincare',
    validUntil: null,
  },
  {
    id: 'fallback-head-massage',
    title: 'Free Head Massage with any SPA booking',
    description: 'Unwind a little deeper, on the house.',
    discountLabel: 'Free add-on',
    image: {
      url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDHedetGHswV5AvpWgVH4EwLo9_l2a4jGr_COWOvJIYh1S1t5nt6KYk_ERnSYzSlgQFVu-dClz4Ywcr6J5hT3fvWKZPoUQWt8Bw0Q7rDOmZp_8GxX0DDyqmt5p2yXE9RjXHzB6TRqveNgRpqTQS5VvXUcjda0g2-Nv3jDjp14f5HQW8rHnmgy3OXM3DCbhgWiuFZVF_Kk3EQ5GnGqLP0xBGMo-qR8C6yIgSEaPMB3L000XhYHYhsEj-8VEuCjzHXntthSt61iFilQA',
      alt: 'Free head massage offer at Royal Glow Spa',
      width: null,
      height: null,
    },
    ctaLabel: 'Book Now',
    ctaHref: '/?book=1',
    category: 'spa',
    validUntil: null,
  },
]

/**
 * Active marketing offers within their validity window, in display order.
 * Empty when the CMS is unconfigured/unreachable/empty.
 */
export async function getActiveOffers(now: Date = new Date()): Promise<Offer[]> {
  const response = await cmsFetch<unknown>(
    '/api/offer?where[active][equals]=true&depth=1&sort=order',
    { tags: ['offer'] },
  )
  const offers: Offer[] = []
  for (const doc of extractDocs(response)) {
    if (!isWithinValidityWindow(doc, now)) {
      continue
    }
    const offer = mapOffer(doc)
    if (offer !== null) {
      offers.push(offer)
    }
  }
  return offers
}

/** Curated homepage service cards shown when the CMS is unconfigured/unreachable/empty. */
export const FALLBACK_SERVICE_CARDS: ServiceCardItem[] = [
  {
    id: 'fallback-hair',
    name: 'Hair',
    fromPrice: '₹500',
    bookingHref: '/services#haircut',
    imageAlt: 'Professional hair styling at Royal Glow Salon',
    image: {
      url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAFTeivZU8LWDtg3w4QyhdnYdO7ClTd0NMYng9j-WdftV_EAGAci_BRb0riH6AP1ozu-uu7yf8HecmVVIYfeoqsO8bUS-L1tmeLpT4R2aY2MFBcDEcBJfHUb5OsACUndPHplAIEtT3ViZ6GAgUjH6LpaTyEhhdZ8f-mSdd4-dK05Ch7ovDP-PbhmhPMdqwMS0kdMK4llg45nS_JOWUf9jat6Rf_F3TLkfAUZmy1WgFGiHD9qFIQJ98SZJCEceMxxRY5cr4YY88T-gY',
      alt: 'Professional hair styling at Royal Glow Salon',
      width: null,
      height: null,
    },
  },
  {
    id: 'fallback-spa',
    name: 'Spa',
    fromPrice: '₹1,499',
    bookingHref: '/services#spa',
    imageAlt: 'Luxury spa treatment at Royal Glow',
    image: {
      url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZasmXlzNTRSrg_OR0jZFSrGXvcLd9jTCCEs2zzuTKxivasTAvIz-_UG6LI1C2u-L9kqDTvL3H9V9NQkNpahwhy0nqtTy42b7WG79I_OBeVID5PdpO8RrepTsicR84S-3WBVjyV9vSuFS52O8VrXC3QAzeUFmgmSXJ_qKV34NXixljTGYUIvjNqmctILdgFykX2jJ-mmC8bAv9V9X5e9pTcLMvHchNWPoiGq_xWWiRv2tt2TcmENwrkhdFNE5VXC02go2i_W_PxTs',
      alt: 'Luxury spa treatment at Royal Glow',
      width: null,
      height: null,
    },
  },
  {
    id: 'fallback-bridal',
    name: 'Bridal',
    fromPrice: '₹2,500',
    bookingHref: '/services#bridal',
    imageAlt: 'Elegant Indian bridal makeup at Royal Glow',
    image: {
      url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8w_Rdj8cu_NrcFjxGQmzAH61tYak6FEB5RtbTOEvIMQd50thOeF0TQvIWR-Am9y_lMXtdsy-C2x85kkH66qkTupeAYgLFRLlqM7Pj34dtR_dWcP5UejQAXH68ym48EYh4Ksms64FYgykRmLPSEGO9sxNkrAWnPzLRiJU4qTLOhjxRNTQkZ5IY3tHBadUiD7O4eLsgNIdsdL7r4T8WrOHB1phWjtrf8Z2ECbVbPj-EskCq641BsEDa4REkm6QrFvIJdPdhan1Hjx8',
      alt: 'Elegant Indian bridal makeup at Royal Glow',
      width: null,
      height: null,
    },
  },
  {
    id: 'fallback-nails',
    name: 'Nails',
    fromPrice: '₹800',
    bookingHref: '/services#nails',
    imageAlt: 'Premium nail art at Royal Glow Salon',
    image: {
      url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB1DUVyiMfSF07pyFdu4aNeoXPdm72DWD40kVE9iIScW17pYqaWTs6-Lf_VP7vhCNV8SwsBozQkfOR__it01_TLzLm6UiSEZgIm3iRZuH9cMLd1SG0etrkuaQVQSYj-w28ww5QhXEF3AFYa9-CcJd5aDjSmtUpH_ioR3P8pz_ckCwpWTzaGiaIPejTI4RYbK2ZhOjwOLboHAHYXjlC1rn0cd9uXzfA_QEgA8xBQYQbYGpITgYHogc5SDypjmc4Rp2XwHTsbCKeq92c',
      alt: 'Premium nail art at Royal Glow Salon',
      width: null,
      height: null,
    },
  },
]

/**
 * Active homepage service category cards in display order.
 * Empty when the CMS is unconfigured/unreachable/empty.
 */
export async function getServiceCards(): Promise<ServiceCardItem[]> {
  const response = await cmsFetch<unknown>(
    '/api/service-card?where[active][equals]=true&depth=1&sort=order',
    { tags: ['service-card'] },
  )
  const cards: ServiceCardItem[] = []
  for (const doc of extractDocs(response)) {
    const card = mapServiceCard(doc)
    if (card !== null) {
      cards.push(card)
    }
  }
  return cards
}

/**
 * Active catalogue services for /services, optionally filtered by type.
 * Empty when the CMS is unconfigured/unreachable/empty.
 */
export async function getServices(type?: 'salon' | 'spa'): Promise<Service[]> {
  const typeFilter = type !== undefined ? `&where[type][equals]=${encodeURIComponent(type)}` : ''
  const response = await cmsFetch<unknown>(
    `/api/service?where[active][equals]=true&depth=1&sort=order${typeFilter}`,
    { tags: ['service'] },
  )
  const services: Service[] = []
  for (const doc of extractDocs(response)) {
    const service = mapService(doc)
    if (service !== null) {
      services.push(service)
    }
  }
  return services
}
