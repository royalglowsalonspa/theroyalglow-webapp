/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 12-06-2026
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
 ************************************************************/

import type { Metadata } from 'next'
import { JsonLd } from '@/components/seo/JsonLd'
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

  // Banners are already sorted by `order`; the first one owns the hero image.
  // Only the image crosses into HeroSection — the h1 is fixed brand copy and the
  // banner's headline/ctaHref already drive the AnnouncementBar.
  const heroImage = banners[0]?.image ?? null

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
