import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Royal Glow Salon & Spa — Premium Beauty & Wellness in Bengaluru',
  description:
    'Experience premium salon and spa services in Bengaluru. Expert haircuts, facials, body therapies, and luxury SPA treatments. Book your appointment today.',
  openGraph: {
    title: 'Royal Glow Salon & Spa — Premium Beauty & Wellness in Bengaluru',
    description:
      'Experience premium salon and spa services in Bengaluru. Expert haircuts, facials, body therapies, and luxury SPA treatments.',
    url: 'https://theroyalglow.in',
    siteName: 'Royal Glow Salon & Spa',
    locale: 'en_IN',
    type: 'website',
  },
}

const serviceHighlights = [
  {
    icon: '💇',
    name: 'Haircut & Styling',
    price: '₹500',
    href: '/services#haircut',
  },
  {
    icon: '💆',
    name: 'Facial & Skincare',
    price: '₹1,499',
    href: '/services#facial',
  },
  {
    icon: '🧖',
    name: 'SPA & Massage',
    price: '₹2,500',
    href: '/services#spa',
  },
  {
    icon: '💅',
    name: 'Manicure & Pedicure',
    price: '₹800',
    href: '/services#nails',
  },
]

const testimonials = [
  {
    stars: 5,
    quote:
      'Best salon experience in Bengaluru! The staff is incredibly professional and the ambiance is so relaxing.',
    name: 'Priya S.',
  },
  {
    stars: 5,
    quote:
      'Amazing SPA treatments. I felt completely rejuvenated after my session. Highly recommend the aromatherapy.',
    name: 'Aisha K.',
  },
  {
    stars: 5,
    quote:
      'Love the premium feel of this place. The haircut was perfect and the head massage was divine.',
    name: 'Rahul M.',
  },
]

const faqs = [
  {
    question: 'What services do you offer?',
    answer:
      'We offer a full range of salon services including haircuts, styling, colouring, facials, waxing, manicure, pedicure, and makeup. Our SPA menu includes aromatherapy, deep tissue massage, and premium body treatments.',
  },
  {
    question: 'Do I need to book in advance?',
    answer:
      'While walk-ins are welcome, we recommend booking in advance to secure your preferred time slot. You can book instantly through our website using the Book Now button.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept cash, UPI (Google Pay, PhonePe, Paytm), and all major credit/debit cards at the salon.',
  },
  {
    question: 'Where are you located?',
    answer:
      'We are located at 1st Floor, Narmada Complex, 48/3, Rayasandra Main Road, Above SBI Bank, Naganathapura, Bengaluru 560100. Look for the SBI Bank building — we are on the first floor.',
  },
]

const categories = [
  { name: 'HAIR', active: true },
  { name: 'SPA', active: true },
  { name: 'SKIN', active: false },
  { name: 'BRIDAL', active: false },
  { name: 'NAILS', active: true },
  { name: 'GROOMING', active: false },
]

const brandLogos = [
  "L'ORÉAL",
  'SCHWARZKOPF',
  'LAKMÉ',
  'OLAPLEX',
  'WELLA',
  'MOROCCANOIL',
]

export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['LocalBusiness', 'BeautySalon'],
        '@id': 'https://theroyalglow.in/#business',
        name: 'Royal Glow Salon & Spa',
        image: 'https://theroyalglow.in/og-image.jpg',
        url: 'https://theroyalglow.in',
        telephone: '+916360135720',
        email: 'hello@theroyalglow.in',
        address: {
          '@type': 'PostalAddress',
          streetAddress:
            '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd, Above SBI Bank',
          addressLocality: 'Bengaluru',
          addressRegion: 'Karnataka',
          postalCode: '560100',
          addressCountry: 'IN',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: 12.8845,
          longitude: 77.648,
        },
        openingHoursSpecification: [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: [
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
            ],
            opens: '10:00',
            closes: '21:00',
          },
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: ['Saturday', 'Sunday'],
            opens: '10:00',
            closes: '22:00',
          },
        ],
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.9',
          reviewCount: '86',
        },
        priceRange: '₹₹',
        sameAs: [
          'https://instagram.com/theroyalglow',
          'https://facebook.com/theroyalglow',
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      },
    ],
  }

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="flex flex-col gap-20 lg:gap-28">
        {/* ═══════════════════════════════════════════════════════ */}
        {/* SECTION 2: HERO — Two-Column Layout */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-labelledby="hero-heading" className="px-5">
          <div className="mx-auto max-w-[1278px] mt-6 lg:mt-10">
            <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
              {/* Left Column — Dark Hero Card */}
              <div className="bg-cocoa-dark rounded-[6px] p-8 sm:p-12 lg:p-16 flex flex-col justify-between">
                <div>
                  {/* Eyebrow Pill */}
                  <span className="inline-flex items-center bg-royal-gold/20 text-royal-gold rounded-full px-3 py-1 font-ui text-[11px] uppercase tracking-[1px] mb-6">
                    Royal Glow Salon &amp; Spa
                  </span>

                  {/* Headline */}
                  <h1
                    id="hero-heading"
                    className="font-display text-canvas-white tracking-[-1.44px] leading-[1.03] text-[clamp(40px,6vw,72px)]"
                  >
                    Where beauty meets royalty.
                  </h1>

                  {/* Body */}
                  <p className="font-sans text-[17px] leading-[1.6] text-dusty-gray mt-6 max-w-[520px]">
                    A premium salon and spa experience in Bengaluru. Hair, skin,
                    nails and signature rituals — crafted by master artists in a
                    calm, golden sanctuary.
                  </p>

                  {/* Buttons */}
                  <div className="mt-8 flex flex-wrap items-center gap-4">
                    <Link
                      href="/?book=1"
                      className="bg-royal-gold text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full px-8 h-10 inline-flex items-center justify-center hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all motion-safe:duration-200"
                      aria-label="Book an appointment at Royal Glow"
                    >
                      Book Now
                    </Link>
                    <Link
                      href="/services"
                      className="border border-white/25 text-canvas-white font-ui text-xs uppercase tracking-[0.5px] rounded-full px-8 h-10 inline-flex items-center justify-center hover:bg-white/10 motion-safe:transition-all motion-safe:duration-200"
                    >
                      Explore Services
                    </Link>
                  </div>
                </div>

                {/* Category Pills */}
                <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {categories.map((cat) => (
                    <span
                      key={cat.name}
                      className={`font-ui text-xs tracking-[0.5px] ${
                        cat.active
                          ? 'text-deep-gold font-bold'
                          : 'text-dusty-gray'
                      }`}
                    >
                      {cat.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right Column — Image + Location */}
              <div className="flex flex-col gap-6">
                {/* Placeholder Image */}
                <div className="bg-warm-cream rounded-[6px] aspect-[3/4] flex items-center justify-center">
                  <span className="font-sans text-warm-gray text-sm">
                    Salon Interior
                  </span>
                </div>

                {/* Location Bar */}
                <div className="border border-cloud-gray rounded-[6px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark">
                      Rayasandra · Bengaluru
                    </p>
                    <p className="font-sans text-sm text-warm-gray mt-0.5">
                      Open today · 10:00 — 21:00
                    </p>
                  </div>
                  <Link
                    href="/contact"
                    className="font-ui text-xs uppercase tracking-[0.5px] text-deep-gold hover:text-cocoa-dark transition-colors duration-200"
                  >
                    Visit
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* SECTION 3: SOCIAL PROOF BAR */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-label="Social proof" className="px-5">
          <div className="mx-auto max-w-[1278px] text-center">
            <p className="font-sans text-[17px] leading-[1.6] text-warm-gray">
              Trusted by over{' '}
              <strong className="text-cocoa-dark font-medium">
                12,000 guests
              </strong>{' '}
              across Bengaluru.{' '}
              <Link
                href="#testimonials-heading"
                className="text-deep-gold hover:text-cocoa-dark transition-colors duration-200 underline underline-offset-2"
              >
                Read their stories.
              </Link>
            </p>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* SECTION 4: BRAND LOGOS */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-label="Trusted product brands" className="px-5">
          <div className="mx-auto max-w-[1278px] text-center">
            <p className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold mb-8">
              Products We Trust
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-12">
              {brandLogos.map((brand) => (
                <span
                  key={brand}
                  className="font-display text-cocoa-dark text-lg lg:text-xl opacity-70"
                >
                  {brand}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* SECTION 5: SERVICES */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-labelledby="services-heading" className="px-5">
          <div className="mx-auto max-w-[1278px]">
            <h2
              id="services-heading"
              className="font-display text-cocoa-dark text-[clamp(32px,4.5vw,48px)] tracking-[-0.96px] leading-[1.1]"
            >
              See what Royal Glow can do for you
            </h2>

            {/* 2x2 Grid */}
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {serviceHighlights.map((service) => (
                <article
                  key={service.name}
                  className="border border-cloud-gray rounded-[6px] p-6 motion-safe:transition-all motion-safe:duration-250 hover:border-golden-mist hover:-translate-y-[2px] hover:shadow-card-hover"
                >
                  <span className="text-3xl" aria-hidden="true">
                    {service.icon}
                  </span>
                  <h3 className="font-sans font-medium text-cocoa-dark text-lg mt-3">
                    {service.name}
                  </h3>
                  <p className="font-ui text-cocoa-dark font-bold text-sm mt-1">
                    from {service.price}
                  </p>
                  <Link
                    href={service.href}
                    className="inline-flex items-center gap-1 font-ui text-xs text-deep-gold mt-4 hover:text-cocoa-dark transition-colors duration-200"
                  >
                    Book <span aria-hidden="true">→</span>
                  </Link>
                </article>
              ))}
            </div>

            {/* View All Link */}
            <div className="mt-8">
              <Link
                href="/services"
                className="font-ui text-xs text-deep-gold hover:text-cocoa-dark transition-colors duration-200"
              >
                View All Services →
              </Link>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* SECTION 6: BOOK YOUR ROYAL EXPERIENCE CTA */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-labelledby="booking-cta-heading" className="px-5">
          <div className="mx-auto max-w-[1278px]">
            <div className="bg-warm-cream rounded-[6px] p-8 sm:p-12 lg:p-16">
              {/* Eyebrow */}
              <p className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold mb-4">
                Ready to Glow?
              </p>

              {/* Heading */}
              <h2
                id="booking-cta-heading"
                className="font-display text-cocoa-dark text-[clamp(32px,4.5vw,48px)] tracking-[-0.96px] leading-[1.1]"
              >
                Book your royal experience today
              </h2>

              {/* 3-Step Process */}
              <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Step 1 */}
                <div className="flex flex-col items-start gap-3">
                  <span className="w-10 h-10 rounded-full bg-royal-gold/20 text-cocoa-dark font-ui text-sm flex items-center justify-center">
                    1
                  </span>
                  <h3 className="font-sans font-medium text-cocoa-dark">
                    Tell us your needs.
                  </h3>
                  <p className="font-sans text-[15px] leading-[1.55] text-warm-gray">
                    Hair, skin, spa, bridal — share what you&apos;re looking
                    for.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="flex flex-col items-start gap-3">
                  <span className="w-10 h-10 rounded-full bg-royal-gold/20 text-cocoa-dark font-ui text-sm flex items-center justify-center">
                    2
                  </span>
                  <h3 className="font-sans font-medium text-cocoa-dark">
                    Pick your slot.
                  </h3>
                  <p className="font-sans text-[15px] leading-[1.55] text-warm-gray">
                    Choose your artist, date and a time that suits you.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="flex flex-col items-start gap-3">
                  <span className="w-10 h-10 rounded-full bg-royal-gold/20 text-cocoa-dark font-ui text-sm flex items-center justify-center">
                    3
                  </span>
                  <h3 className="font-sans font-medium text-cocoa-dark">
                    Step into royalty.
                  </h3>
                  <p className="font-sans text-[15px] leading-[1.55] text-warm-gray">
                    Arrive, unwind and let our team take care of the rest.
                  </p>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  href="/?book=1"
                  className="bg-royal-gold text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full px-8 h-10 inline-flex items-center justify-center hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all motion-safe:duration-200"
                  aria-label="Book now or call us"
                >
                  Book Now · +91 63601 35720
                </Link>
                <Link
                  href="/contact"
                  className="border border-cocoa-dark text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full px-8 h-10 inline-flex items-center justify-center hover:bg-cocoa-dark hover:text-canvas-white motion-safe:transition-all motion-safe:duration-200"
                >
                  Contact Us
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TESTIMONIALS */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-labelledby="testimonials-heading" className="px-5">
          <div className="mx-auto max-w-[1278px]">
            <h2
              id="testimonials-heading"
              className="font-display text-cocoa-dark text-[clamp(32px,4.5vw,48px)] tracking-[-0.96px] leading-[1.1]"
            >
              What Our Clients Say
            </h2>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((review) => (
                <article
                  key={review.name}
                  className="bg-canvas-white border border-cloud-gray rounded-[10px] p-6 motion-safe:transition-all motion-safe:duration-250 hover:border-golden-mist hover:-translate-y-[2px] hover:shadow-card-hover"
                >
                  {/* Stars */}
                  <div
                    className="flex items-center gap-0.5"
                    aria-label={`${review.stars} out of 5 stars`}
                  >
                    {[...Array(review.stars)].map((_, i) => (
                      <svg
                        key={i}
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="#C8A961"
                        aria-hidden="true"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    ))}
                  </div>

                  {/* Quote */}
                  <blockquote className="font-sans text-[15px] leading-[1.55] text-warm-gray mt-4">
                    &ldquo;{review.quote}&rdquo;
                  </blockquote>

                  {/* Name */}
                  <p className="font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark mt-4">
                    — {review.name}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* FAQ */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-labelledby="faq-heading" className="px-5">
          <div className="mx-auto max-w-[1278px]">
            <h2
              id="faq-heading"
              className="font-display text-cocoa-dark text-[clamp(32px,4.5vw,48px)] tracking-[-0.96px] leading-[1.1]"
            >
              Frequently Asked Questions
            </h2>

            <div className="mt-8 divide-y divide-outline-gray">
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

        {/* ═══════════════════════════════════════════════════════ */}
        {/* FOOTER CTA */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-labelledby="footer-cta-heading" className="px-5 pb-20">
          <div className="mx-auto max-w-[1278px]">
            <div className="bg-cocoa-dark rounded-[6px] p-8 sm:p-12 lg:p-16 text-center">
              <h2
                id="footer-cta-heading"
                className="font-display text-canvas-white text-[clamp(32px,4.5vw,48px)] tracking-[-0.96px] leading-[1.1]"
              >
                Your glow awaits.
              </h2>
              <p className="font-sans text-[17px] leading-[1.6] text-dusty-gray mt-4 max-w-[440px] mx-auto">
                Book your appointment today and experience the royal treatment
                you deserve.
              </p>
              <Link
                href="/?book=1"
                className="mt-8 inline-flex bg-royal-gold text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full px-8 h-10 items-center justify-center hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all motion-safe:duration-200"
                aria-label="Book an appointment at Royal Glow"
              >
                Book Now
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
