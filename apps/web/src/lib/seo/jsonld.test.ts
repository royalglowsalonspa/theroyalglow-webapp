/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : jsonld.test
 * Scope        : SEO — JSON-LD Tests
 *
 * Description  : Unit tests for JSON-LD builder functions verifying correct
 *                Schema.org output, NAP consistency, and price calculations.
 *
 * Responsibilities :
 * - Verify localBusinessJsonLd contains required NAP fields
 * - Verify serviceJsonLd produces correct INR Offer from paise
 * - Verify breadcrumbJsonLd numbering and item omission
 * - Verify faqPageJsonLd and blogPostingJsonLd structure
 *
 * Features / Functionality :
 * - Tests for all JSON-LD builder functions
 * - Price conversion verification (paise → whole rupees)
 * - Schema.org @context and @type assertions
 *
 * Tech Stack   : TypeScript, Vitest
 * Layer        : Testing
 *
 * Dependencies : vitest, ./jsonld
 *
 * Notes        : None
 ************************************************************/

import { describe, expect, it } from 'vitest'
import {
  blogPostingJsonLd,
  breadcrumbJsonLd,
  faqPageJsonLd,
  imageObjectJsonLd,
  localBusinessJsonLd,
  serviceJsonLd,
} from './jsonld'

describe('localBusinessJsonLd', () => {
  it('declares schema.org context and a LocalBusiness @type with NAP', () => {
    const ld = localBusinessJsonLd()
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toContain('LocalBusiness')
    expect(ld.name).toBeTruthy()
    expect(ld.telephone).toBeTruthy()
    expect(ld.address).toBeTruthy()
  })
})

describe('serviceJsonLd', () => {
  it('produces an INR Offer with a whole-rupee price from paise', () => {
    const ld = serviceJsonLd({
      name: 'Deep Tissue Massage',
      description: 'A deep tissue massage',
      pricePaise: 250_000,
      slug: 'deep-tissue-massage',
    })
    expect(ld['@type']).toBe('Service')
    const offer = ld.offers as Record<string, unknown>
    expect(offer.priceCurrency).toBe('INR')
    expect(offer.price).toBe('2500')
  })
})

describe('breadcrumbJsonLd', () => {
  it('numbers items from 1 and omits item on the crumb without a url', () => {
    const ld = breadcrumbJsonLd([
      { name: 'Home', url: 'https://theroyalglow.in' },
      { name: 'Blog' },
    ])
    const items = ld.itemListElement as Array<Record<string, unknown>>
    expect(items[0]?.position).toBe(1)
    expect(items[0]?.item).toBe('https://theroyalglow.in')
    expect(items[1]?.position).toBe(2)
    expect(items[1]?.item).toBeUndefined()
  })
})

describe('faqPageJsonLd', () => {
  it('maps questions to Question/acceptedAnswer', () => {
    const ld = faqPageJsonLd([{ question: 'Q?', answer: 'A.' }])
    expect(ld['@type']).toBe('FAQPage')
    const main = ld.mainEntity as Array<Record<string, unknown>>
    expect(main[0]?.['@type']).toBe('Question')
    expect(main[0]?.name).toBe('Q?')
  })
})

describe('blogPostingJsonLd', () => {
  it('builds a BlogPosting with ISO datePublished and mainEntityOfPage', () => {
    const ld = blogPostingJsonLd({
      title: 'Best Facials',
      description: 'About facials',
      slug: 'best-facials',
      publishedAt: '2026-05-30T00:00:00.000Z',
    })
    expect(ld['@type']).toBe('BlogPosting')
    expect(ld.headline).toBe('Best Facials')
    expect(ld.datePublished).toBe('2026-05-30T00:00:00.000Z')
    expect(String(ld.mainEntityOfPage)).toContain('/blog/best-facials')
  })
})

describe('imageObjectJsonLd', () => {
  it('builds an ImageObject carrying the alt text', () => {
    const ld = imageObjectJsonLd({
      url: 'https://cdn.theroyalglow.in/1.jpg',
      alt: 'Salon interior',
    })
    expect(ld['@type']).toBe('ImageObject')
    expect(String(ld.contentUrl ?? ld.url)).toContain('1.jpg')
  })
})
