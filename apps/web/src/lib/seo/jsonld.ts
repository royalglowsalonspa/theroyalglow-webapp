/**
 * Pure JSON-LD builder functions for Schema.org structured data.
 *
 * Every builder returns a plain serialisable object read from the canonical
 * `BUSINESS` constant (the single NAP source of truth). These are pure — no
 * I/O, no framework deps — so they are trivially unit-testable and safe to call
 * from server components. The output is serialised by the `<JsonLd>` component.
 *
 * Shapes match `seo.md` Part 2 verbatim.
 */

import { BUSINESS, type Faq } from '@/lib/seo/business'

type JsonLd = Record<string, unknown>

const SCHEMA_CONTEXT = 'https://schema.org'

/**
 * LocalBusiness / BeautySalon / DaySpa structured data for the whole site.
 * Populated entirely from `BUSINESS`.
 */
export function localBusinessJsonLd(): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': ['LocalBusiness', 'BeautySalon', 'DaySpa'],
    name: BUSINESS.name,
    url: BUSINESS.url,
    logo: BUSINESS.logo,
    image: [...BUSINESS.image],
    telephone: BUSINESS.telephone,
    email: BUSINESS.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: BUSINESS.address.streetAddress,
      addressLocality: BUSINESS.address.addressLocality,
      addressRegion: BUSINESS.address.addressRegion,
      postalCode: BUSINESS.address.postalCode,
      addressCountry: BUSINESS.address.addressCountry,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: BUSINESS.geo.latitude,
      longitude: BUSINESS.geo.longitude,
    },
    hasMap: BUSINESS.hasMap,
    openingHoursSpecification: BUSINESS.openingHours.map((block) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [...block.days],
      opens: block.opens,
      closes: block.closes,
    })),
    priceRange: BUSINESS.priceRange,
    paymentAccepted: BUSINESS.paymentAccepted,
    currenciesAccepted: BUSINESS.currenciesAccepted,
    amenityFeature: BUSINESS.amenityFeature.map((feature) => ({
      '@type': 'LocationFeatureSpecification',
      name: feature.name,
      value: feature.value,
    })),
    knowsAbout: [...BUSINESS.knowsAbout],
    isAccessibleForFree: BUSINESS.isAccessibleForFree,
    sameAs: [...BUSINESS.sameAs],
  }
}

/** Organization structured data (homepage). */
export function organizationJsonLd(): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Organization',
    name: BUSINESS.name,
    url: BUSINESS.url,
    logo: BUSINESS.logo,
    sameAs: [...BUSINESS.sameAs],
  }
}

/** WebSite structured data with a SearchAction (enables sitelinks search box). */
export function websiteJsonLd(): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebSite',
    name: BUSINESS.name,
    url: BUSINESS.url,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BUSINESS.url}/services?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

/**
 * BreadcrumbList structured data. Positions are 1-based; the `item` field is
 * omitted for crumbs without a URL (e.g. the current/last crumb).
 */
export function breadcrumbJsonLd(items: { name: string; url?: string }[]): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((entry, index) => {
      const listItem: JsonLd = {
        '@type': 'ListItem',
        position: index + 1,
        name: entry.name,
      }
      if (entry.url) {
        listItem.item = entry.url
      }
      return listItem
    }),
  }
}

/**
 * Service structured data with an Offer. Price is whole rupees derived from
 * integer paise (no floating-point artefacts), currency INR.
 */
export function serviceJsonLd(s: {
  name: string
  description: string
  pricePaise: number
  slug: string
}): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Service',
    serviceType: s.name,
    name: s.name,
    description: s.description,
    url: `${BUSINESS.url}/services/${s.slug}`,
    provider: {
      '@type': 'LocalBusiness',
      name: BUSINESS.name,
      url: BUSINESS.url,
    },
    offers: {
      '@type': 'Offer',
      price: String(Math.round(s.pricePaise / 100)),
      priceCurrency: 'INR',
    },
  }
}

/** FAQPage structured data from a question/answer list. */
export function faqPageJsonLd(faqs: readonly Faq[]): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
}

/**
 * BlogPosting structured data for `/blog/[slug]`. Date inputs are ISO-8601
 * strings (used verbatim per Schema.org). `publisher` is an Organization
 * derived from `BUSINESS`; `author` is a Person when `authorName` is supplied,
 * otherwise it falls back to the publisher Organization. `image` is included
 * only when a cover image is present.
 */
export function blogPostingJsonLd(post: {
  title: string
  description: string
  slug: string
  coverImageUrl?: string
  authorName?: string
  publishedAt: string
  updatedAt?: string
}): JsonLd {
  const url = `${BUSINESS.url}/blog/${post.slug}`
  const publisher: JsonLd = {
    '@type': 'Organization',
    name: BUSINESS.name,
    logo: {
      '@type': 'ImageObject',
      url: BUSINESS.logo,
    },
  }
  const jsonLd: JsonLd = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    mainEntityOfPage: url,
    url,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    publisher,
    author: post.authorName
      ? { '@type': 'Person', name: post.authorName }
      : { '@type': 'Organization', name: BUSINESS.name },
  }
  if (post.coverImageUrl) {
    jsonLd.image = post.coverImageUrl
  }
  return jsonLd
}

/**
 * ImageObject structured data for a gallery image. The image's `alt` text is
 * carried into both `name` and the `caption` fallback. `width`/`height` are
 * included only when provided.
 */
export function imageObjectJsonLd(image: {
  url: string
  caption?: string
  alt: string
  width?: number
  height?: number
}): JsonLd {
  const jsonLd: JsonLd = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'ImageObject',
    contentUrl: image.url,
    url: image.url,
    name: image.alt,
    caption: image.caption ?? image.alt,
  }
  if (image.width !== undefined) {
    jsonLd.width = image.width
  }
  if (image.height !== undefined) {
    jsonLd.height = image.height
  }
  return jsonLd
}
