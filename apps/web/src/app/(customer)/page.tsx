/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 01-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : HomePage
 * Scope        : Customer Pages
 *
 * Description  : Main homepage of theroyalglow.in. Rebuilt to faithfully
 *                match the Stitch MCP design — "Homepage - Updated Font Stack".
 *                Renders: announcement bar, hero (2-col), brand logos,
 *                scrollable service cards, special offers, testimonials,
 *                FAQ accordion, booking CTA, footer.
 *
 * Responsibilities :
 * - Render hero with dark left card + image right card layout
 * - Render horizontally scrollable service category cards
 * - Render special offers 2-col grid
 * - Render testimonial 3-col grid
 * - Render FAQ left-right split with accordion
 * - Render 3-step booking CTA
 * - Emit JSON-LD structured data
 *
 * Tech Stack   : React, Next.js 16 App Router, Tailwind CSS v4, motion
 * Layer        : Presentation
 *
 * Dependencies : JsonLd, resolveFaqs, getActiveBanners, SEO helpers,
 *                next/link, motion
 *
 * Notes        :
 * - ISR with 1-hour revalidation for FAQ content from CMS
 * - The hero image is owner-managed via the Payload `banner` collection; it
 *   falls back to the bundled /hero-fallback.svg brand artwork when no banner
 *   is active. Remaining sections still use Stitch-generated assets.
 * - The hero image and the site-wide announcement strip are DECOUPLED even
 *   though both read the same `banner` record: the hero takes the first active,
 *   in-window banner (selectHeroBanner) whether or not it has a CTA link, while
 *   AnnouncementBar only shows a banner WITH a non-empty `ctaHref`. Leaving the
 *   CTA link blank therefore changes the hero photo alone. See lib/cms/banners.ts.
 ************************************************************/

import type { Metadata } from 'next'
import { JsonLd } from '@/components/seo/JsonLd'
import { selectHeroBanner } from '@/lib/cms/banners'
import { getActiveBanners } from '@/lib/cms/client'
import { resolveFaqs } from '@/lib/cms/faqs'
import {
  faqPageJsonLd,
  localBusinessJsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'
import { BookingCTASection } from './_components/BookingCTASection'
import { BrandLogosSection } from './_components/BrandLogosSection'
import { FaqSection } from './_components/FaqSection'
import { HeroSection } from './_components/HeroSection'
import { OffersSection } from './_components/OffersSection'
import { ServicesSection } from './_components/ServicesSection'
import { TestimonialsSection } from './_components/TestimonialsSection'

export const metadata: Metadata = buildMetadata({
  title: 'Premium Salon & Spa in Bengaluru',
  description:
    'Experience premium salon and spa services in Bengaluru. Expert haircuts, facials, body therapies, and luxury SPA treatments. Book your appointment today.',
  path: '/',
})

export const revalidate = 3600

export default async function HomePage() {
  const [faqList, banners] = await Promise.all([resolveFaqs(), getActiveBanners()])

  // The first active banner in `order` owns the hero image, CTA link or not.
  // Only the image crosses into HeroSection — the h1 is fixed brand copy, and the
  // headline/ctaHref belong to the announcement strip, which independently
  // requires a CTA link before it shows a banner at all.
  const heroImage = selectHeroBanner(banners)?.image ?? null

  return (
    <>
      {/* JSON-LD Structured Data */}
      <JsonLd
        data={[
          localBusinessJsonLd(),
          organizationJsonLd(),
          websiteJsonLd(),
          faqPageJsonLd(faqList),
        ]}
      />

      <div className="flex flex-col">
        <HeroSection image={heroImage} />
        <BrandLogosSection />
        <ServicesSection />
        <OffersSection />
        <TestimonialsSection />
        <FaqSection faqs={faqList} />
        <BookingCTASection />
      </div>
    </>
  )
}
