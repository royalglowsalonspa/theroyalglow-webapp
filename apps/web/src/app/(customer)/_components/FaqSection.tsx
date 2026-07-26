/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : FaqSection
 * Scope        : Customer Pages
 *
 * Description  : Homepage FAQ block — editorial heading column beside an
 *                expandable list of customer questions. Receives a pre-resolved
 *                FAQ list from the homepage server component (CMS-first via
 *                resolveFaqs, static fallback otherwise). Rebuilt on the
 *                shadcn/ui Accordion (Radix) primitive with a motion Reveal.
 *
 * Responsibilities :
 * - Present the most frequently asked questions with answers
 * - Provide an editorial intro with a WhatsApp support mention
 * - Offer an accessible Radix accordion question list
 *
 * Features / Functionality :
 * - Two-column editorial + accordion layout
 * - Radix accordion with gold hover affordance + animated expand
 * - Shows up to five FAQs from the resolved list
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui,
 *                Radix, motion
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/lib/seo/business, @/components/ui/accordion,
 *                @/components/ui/motion/reveal
 *
 * Notes        :
 * - Data is resolved on the server; this component is presentational only.
 ************************************************************/

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Reveal } from '@/components/ui/motion/reveal'
import type { Faq } from '@/lib/seo/business'

const HOMEPAGE_FAQ_LIMIT = 5

export function FaqSection({ faqs }: { faqs: Faq[] }) {
  const visibleFaqs = faqs.slice(0, HOMEPAGE_FAQ_LIMIT)

  return (
    <section
      aria-labelledby="faq-heading"
      className="mx-auto w-full max-w-[1280px] px-4 py-16 md:px-8"
    >
      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
        <Reveal className="flex flex-col justify-center" as="div">
          {/* No opacity: at 60% this small bold text fell under the 4.5:1 AA floor.
              gold-ink matches the eyebrow treatment used elsewhere and is compliant. */}
          <p className="mb-2 font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-gold-ink">
            Got a question?
          </p>
          <h2
            id="faq-heading"
            className="mb-7 font-display text-[clamp(36px,4.5vw,56px)] font-black leading-[1.05] tracking-tight text-cocoa-dark"
          >
            Frequently asked
          </h2>
          <p className="max-w-xl font-sans text-lg leading-relaxed text-warm-gray">
            Can&apos;t find the answer you&apos;re looking for?
            <br />
            Don&apos;t hesitate to connect with us via{' '}
            <span className="font-semibold text-cocoa-dark">phone</span> or{' '}
            <span className="font-bold text-[#25D366]">WhatsApp</span> to get in touch with our
            receptionist.
          </p>
        </Reveal>

        <Reveal as="div">
          <Accordion type="single" collapsible className="w-full">
            {visibleFaqs.map((faq) => (
              <AccordionItem
                key={faq.question}
                value={faq.question}
                className="border-outline-gray"
              >
                <AccordionTrigger className="py-5 font-sans text-lg font-bold text-cocoa-dark hover:text-gold-ink hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pr-8 font-sans text-sm leading-relaxed text-warm-gray">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}
