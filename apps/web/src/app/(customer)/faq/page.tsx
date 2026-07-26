/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : FAQPage
 * Scope        : Customer Pages
 *
 * Description  : Frequently Asked Questions page rendering CMS-driven FAQs
 *                in an accessible Radix accordion (shadcn/ui) with FAQPage
 *                JSON-LD schema.
 *
 * Responsibilities :
 * - Fetch FAQ entries from CMS via resolveFaqs()
 * - Render an accessible Radix accordion
 * - Emit FAQPage JSON-LD structured data for rich snippet eligibility
 *
 * Features / Functionality :
 * - ISR with 1-hour revalidation for FAQ content
 * - Radix accordion with animated expand + gold hover
 * - Breadcrumb JSON-LD for search engine navigation
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui,
 *                Radix, motion, JSON-LD
 * Layer        : Presentation
 *
 * Dependencies : JsonLd, resolveFaqs, SEO helpers, @/components/ui/accordion,
 *                @/components/ui/motion/reveal
 *
 * Notes        :
 * - FAQ content sourced from Payload CMS with local fallback
 ************************************************************/

import type { Metadata } from 'next'
import { JsonLd } from '@/components/seo/JsonLd'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Reveal } from '@/components/ui/motion/reveal'
import { resolveFaqs } from '@/lib/cms/faqs'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, faqPageJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = buildMetadata({
  title: 'FAQ',
  description:
    'Find answers to frequently asked questions about Royal Glow Salon & Spa — services, booking, payments, location, memberships, and more.',
  path: '/faq',
})

export const revalidate = 3600

export default async function FAQPage() {
  const faqs = await resolveFaqs()

  return (
    <>
      <JsonLd
        data={[
          faqPageJsonLd(faqs),
          breadcrumbJsonLd([{ name: 'Home', url: SITE_URL }, { name: 'FAQ' }]),
        ]}
      />

      <div className="flex flex-col gap-20">
        {/* ── HEADING ── */}
        <section aria-labelledby="faq-page-heading" className="px-5">
          <Reveal className="mx-auto mt-6 max-w-[1278px] lg:mt-10" as="div">
            <h1
              id="faq-page-heading"
              className="font-display font-black text-[clamp(40px,6vw,72px)] leading-[1.03] tracking-[-1.44px] text-cocoa-dark"
            >
              Frequently Asked Questions
            </h1>
            <p className="mt-4 max-w-[520px] font-sans text-[17px] leading-[1.6] text-warm-gray">
              Everything you need to know about Royal Glow Salon & Spa. Can&apos;t find your answer?
              Feel free to{' '}
              <a
                href="/contact"
                className="text-gold-ink underline underline-offset-2 transition-colors duration-200 hover:text-cocoa-dark"
              >
                contact us
              </a>
              .
            </p>
          </Reveal>
        </section>

        {/* ── FAQ ACCORDION ── */}
        <section aria-labelledby="faq-list-heading" className="px-5 pb-20">
          <div className="mx-auto max-w-[1278px]">
            {/* Radix renders each AccordionTrigger as an h3, so without this h2 the
                document jumped h1 -> h3 and failed Lighthouse's heading-order audit.
                sr-only keeps the visual design unchanged while restoring the outline
                (and it now labels the section instead of a bare aria-label). */}
            <h2 className="sr-only" id="faq-list-heading">
              Frequently asked questions
            </h2>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq) => (
                <AccordionItem
                  key={faq.question}
                  value={faq.question}
                  className="border-outline-gray"
                >
                  <AccordionTrigger className="py-5 font-ui text-[17px] font-medium text-cocoa-dark hover:text-gold-ink hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="pr-12 font-sans text-[15px] leading-[1.55] text-warm-gray">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </div>
    </>
  )
}
