import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'FAQ | Royal Glow Salon & Spa',
  description:
    'Find answers to frequently asked questions about Royal Glow Salon & Spa — services, booking, payments, location, memberships, and more.',
  openGraph: {
    title: 'FAQ | Royal Glow Salon & Spa',
    description:
      'Find answers to frequently asked questions about Royal Glow Salon & Spa.',
    url: 'https://theroyalglow.in/faq',
    siteName: 'Royal Glow Salon & Spa',
    locale: 'en_IN',
    type: 'website',
  },
}

const faqs = [
  {
    question: 'What services do you offer?',
    answer:
      'We offer a comprehensive range of salon services including haircuts, styling, colouring, facials, waxing, manicure, pedicure, and bridal makeup. Our SPA menu features aromatherapy, deep tissue massage, Swedish massage, and premium body treatments across Standard, Premium, and VVIP tiers.',
  },
  {
    question: 'How do I book an appointment?',
    answer:
      'You can book instantly through our website by clicking the "Book Now" button on any page. Select your preferred date, time slot, and services — you\'ll receive a confirmation once our team approves your booking. You can also call us at +91 63601 35720 to book over the phone.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept cash, UPI (Google Pay, PhonePe, Paytm), and all major credit and debit cards. Payment is collected at the salon after your service is completed.',
  },
  {
    question: 'Where are you located?',
    answer:
      'We are located at 1st Floor, Narmada Complex, 48/3, Rayasandra Main Road, Above SBI Bank, Naganathapura, Parappana Agrahara, Bengaluru, Karnataka 560100. Look for the SBI Bank building — we are on the first floor.',
  },
  {
    question: 'What is your cancellation policy?',
    answer:
      'You can cancel or reschedule your booking at any time before your appointment through your bookings page. We appreciate advance notice so we can offer the slot to other clients. Repeated no-shows may require future bookings to be pre-approved.',
  },
  {
    question: 'Do you offer memberships?',
    answer:
      'Yes! We offer SPA memberships in Silver, Gold, and Platinum tiers. Memberships give you a bank of hours to use across all SPA services at a discounted rate. Visit the salon or contact us to learn more about current membership plans and pricing.',
  },
  {
    question: 'Do you accept walk-ins?',
    answer:
      'Walk-ins are always welcome, subject to availability. However, we recommend booking in advance — especially on weekends and evenings — to guarantee your preferred time slot and avoid waiting.',
  },
  {
    question: 'Is parking available?',
    answer:
      'Yes, there is parking available near Narmada Complex. Two-wheeler parking is available directly outside the building, and car parking is available on the adjacent road. The area is well-connected by public transport as well.',
  },
  {
    question: 'What are your working hours?',
    answer:
      'We are open Monday to Friday from 10:00 AM to 9:00 PM, and Saturday to Sunday from 10:00 AM to 10:00 PM. We are open on most public holidays — check our social media for any special closures.',
  },
  {
    question: 'What is the Royal Glow Gems loyalty programme?',
    answer:
      'Every time you complete a service at Royal Glow, you earn Gems (1 gem per ₹100 spent). Accumulated gems can be redeemed against select services from our catalogue. Gems are valid for 365 days from the date earned.',
  },
]

export default function FAQPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
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

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
              Everything you need to know about Royal Glow Salon & Spa. Can&apos;t find your answer? Feel free to{' '}
              <a
                href="/contact"
                className="text-deep-gold hover:text-cocoa-dark transition-colors duration-200 underline underline-offset-2"
              >
                contact us
              </a>.
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
