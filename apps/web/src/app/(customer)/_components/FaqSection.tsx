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
 *                resolveFaqs, static fallback otherwise).
 *
 * Responsibilities :
 * - Present the most frequently asked questions with answers
 * - Provide an editorial intro with a WhatsApp support mention
 * - Offer an accessible accordion-style question list
 *
 * Features / Functionality :
 * - Two-column editorial + accordion layout
 * - Bordered rows with gold hover affordance
 * - Shows up to five FAQs from the resolved list
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/lib/seo/business
 *
 * Notes        :
 * - Data is resolved on the server; this component is presentational only.
 ************************************************************/

import type { Faq } from '@/lib/seo/business'

const HOMEPAGE_FAQ_LIMIT = 5

export function FaqSection({ faqs }: { faqs: Faq[] }) {
  const visibleFaqs = faqs.slice(0, HOMEPAGE_FAQ_LIMIT)

  return (
    <section
      aria-labelledby="faq-heading"
      className="px-4 md:px-8 py-16 mx-auto w-full max-w-[1280px]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        <div className="flex flex-col justify-center">
          <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 mb-2">
            Got a question?
          </p>
          <h2
            id="faq-heading"
            className="font-display font-black text-cocoa-dark text-[clamp(36px,4.5vw,56px)] tracking-tight leading-[1.05] mb-7"
          >
            Frequently asked
          </h2>
          <p className="font-sans text-lg text-warm-gray leading-relaxed max-w-xl">
            Can&apos;t find the answer you&apos;re looking for?
            <br />
            Don&apos;t hesitate to connect with us via{' '}
            <span className="font-semibold text-cocoa-dark">phone</span> or{' '}
            <span className="font-bold" style={{ color: '#25D366' }}>
              WhatsApp
            </span>{' '}
            to get in touch with our receptionist.
          </p>
        </div>

        <div className="space-y-0">
          {visibleFaqs.map((faq) => (
            <details key={faq.question} className="group border-b border-outline-gray">
              <summary className="flex justify-between items-center cursor-pointer list-none py-5 gap-4">
                <span className="font-sans font-bold text-lg text-cocoa-dark group-hover:text-deep-gold transition-colors duration-200">
                  {faq.question}
                </span>
                <span className="text-warm-gray flex-shrink-0 text-xl group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200">
                  ⌄
                </span>
              </summary>
              <p className="font-sans text-warm-gray text-sm leading-relaxed pb-5 pr-8">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
