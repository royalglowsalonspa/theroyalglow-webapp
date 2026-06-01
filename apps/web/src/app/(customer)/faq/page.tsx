import { JsonLd } from '@/components/seo/JsonLd'
import { resolveFaqs } from '@/lib/cms/faqs'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, faqPageJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'

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
      {/* JSON-LD Structured Data */}
      <JsonLd
        data={[
          faqPageJsonLd(faqs),
          breadcrumbJsonLd([{ name: 'Home', url: SITE_URL }, { name: 'FAQ' }]),
        ]}
      />

      <div className="flex flex-col gap-20">
        {/* ═══════════════════════════════════════════════════════ */}
        {/* HEADING */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-labelledby="faq-page-heading" className="px-5">
          <div className="mx-auto max-w-[1278px] mt-6 lg:mt-10">
            <h1
              id="faq-page-heading"
              className="font-display text-cocoa-dark tracking-[-1.44px] leading-[1.03] text-[clamp(40px,6vw,72px)]"
            >
              Frequently Asked Questions
            </h1>
            <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-4 max-w-[520px]">
              Everything you need to know about Royal Glow Salon & Spa. Can&apos;t find your answer?
              Feel free to{' '}
              <a
                href="/contact"
                className="text-deep-gold hover:text-cocoa-dark transition-colors duration-200 underline underline-offset-2"
              >
                contact us
              </a>
              .
            </p>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* FAQ ACCORDION */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-label="Frequently asked questions" className="px-5 pb-20">
          <div className="mx-auto max-w-[1278px]">
            <div className="divide-y divide-outline-gray">
              {faqs.map((faq) => (
                <details key={faq.question} className="group py-5">
                  <summary className="flex items-center justify-between cursor-pointer list-none">
                    <span className="font-sans text-[17px] font-medium text-cocoa-dark pr-4">
                      {faq.question}
                    </span>
                    <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-outline-gray text-cocoa-dark group-open:rotate-45 motion-safe:transition-transform motion-safe:duration-200">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <line x1="7" y1="1" x2="7" y2="13" />
                        <line x1="1" y1="7" x2="13" y2="7" />
                      </svg>
                    </span>
                  </summary>
                  <p className="font-sans text-[15px] leading-[1.55] text-warm-gray mt-3 pr-12">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
