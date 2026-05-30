import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact Us | Royal Glow Salon & Spa',
  description:
    'Get in touch with Royal Glow Salon & Spa. Visit us at Narmada Complex, Rayasandra Main Road, Bengaluru or call +91 63601 35720.',
  openGraph: {
    title: 'Contact Us | Royal Glow Salon & Spa',
    description:
      'Get in touch with Royal Glow Salon & Spa. Visit us in Bengaluru or call +91 63601 35720.',
    url: 'https://theroyalglow.in/contact',
    siteName: 'Royal Glow Salon & Spa',
    locale: 'en_IN',
    type: 'website',
  },
}

export default function ContactPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'BeautySalon'],
    '@id': 'https://theroyalglow.in/#business',
    name: 'Royal Glow Salon & Spa',
    image: 'https://theroyalglow.in/og-image.jpg',
    url: 'https://theroyalglow.in',
    telephone: '+916360135720',
    email: 'hello@theroyalglow.in',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd, Above SBI Bank',
      addressLocality: 'Bengaluru',
      addressRegion: 'Karnataka',
      postalCode: '560100',
      addressCountry: 'IN',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 12.8845,
      longitude: 77.6480,
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
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
    priceRange: '₹₹',
    sameAs: [
      'https://instagram.com/theroyalglow',
      'https://facebook.com/theroyalglow',
    ],
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
        <section aria-labelledby="contact-heading" className="px-5">
          <div className="mx-auto max-w-[1278px] mt-6 lg:mt-10">
            <h1
              id="contact-heading"
              className="font-display text-cocoa-dark tracking-[-1.44px] leading-[1.03] text-[clamp(40px,6vw,72px)]"
            >
              Contact Us
            </h1>
            <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-4 max-w-[520px]">
              We&apos;d love to hear from you. Visit us, give us a call, or send a message below.
            </p>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* 2-COLUMN LAYOUT: MAP + INFO | FORM */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-label="Contact information and form" className="px-5 pb-20">
          <div className="mx-auto max-w-[1278px] grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            {/* LEFT COLUMN: Map + NAP */}
            <div>
              {/* Google Maps Embed Placeholder */}
              <div className="rounded-[6px] overflow-hidden border border-cloud-gray">
                <iframe
                  title="Royal Glow Salon & Spa location on Google Maps"
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3889.0!2d77.648!3d12.8845!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sRoyal+Glow+Salon+%26+Spa!5e0!3m2!1sen!2sin!4v1700000000000"
                  width="100%"
                  height="300"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="w-full"
                />
              </div>

              {/* NAP Info */}
              <address className="not-italic mt-8 space-y-4">
                <div>
                  <h2 className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold mb-2">
                    Address
                  </h2>
                  <p className="font-sans text-[15px] leading-[1.55] text-cocoa-dark">
                    1st Floor, Narmada Complex, 48/3,<br />
                    Rayasandra Main Rd, Above SBI Bank,<br />
                    Naganathapura, Parappana Agrahara,<br />
                    Bengaluru, Karnataka 560100, India
                  </p>
                </div>

                <div>
                  <h2 className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold mb-2">
                    Phone
                  </h2>
                  <a
                    href="tel:+916360135720"
                    className="font-sans text-[15px] text-cocoa-dark hover:text-deep-gold transition-colors duration-200"
                  >
                    +91 63601 35720
                  </a>
                </div>

                <div>
                  <h2 className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold mb-2">
                    Email
                  </h2>
                  <a
                    href="mailto:hello@theroyalglow.in"
                    className="font-sans text-[15px] text-cocoa-dark hover:text-deep-gold transition-colors duration-200"
                  >
                    hello@theroyalglow.in
                  </a>
                </div>

                <div>
                  <h2 className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold mb-2">
                    Hours
                  </h2>
                  <dl className="font-sans text-[15px] leading-[1.55] text-cocoa-dark space-y-1">
                    <div className="flex gap-2">
                      <dt className="text-warm-gray">Mon–Fri:</dt>
                      <dd>10:00 AM – 9:00 PM</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-warm-gray">Sat–Sun:</dt>
                      <dd>10:00 AM – 10:00 PM</dd>
                    </div>
                  </dl>
                </div>
              </address>
            </div>

            {/* RIGHT COLUMN: Contact Form */}
            <div>
              <h2 className="font-display text-cocoa-dark text-[28px] leading-[1.15]">
                Send us a message
              </h2>
              <p className="font-sans text-[15px] leading-[1.55] text-warm-gray mt-2">
                Have a question or want to book a group session? Drop us a message and we&apos;ll get back to you shortly.
              </p>

              <form className="mt-8 space-y-6" aria-label="Contact form">
                {/* Name */}
                <div>
                  <label
                    htmlFor="contact-name"
                    className="block font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark mb-2"
                  >
                    Name
                  </label>
                  <input
                    type="text"
                    id="contact-name"
                    name="name"
                    required
                    aria-required="true"
                    placeholder="Your full name"
                    className="w-full h-10 px-4 font-sans text-[15px] text-cocoa-dark bg-canvas-white border border-cloud-gray rounded-[6px] placeholder:text-dusty-gray focus:outline-2 focus:outline-deep-gold focus:outline-offset-2 transition-colors duration-200"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label
                    htmlFor="contact-phone"
                    className="block font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark mb-2"
                  >
                    Phone
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 h-10 font-sans text-[15px] text-warm-gray bg-cloud-gray border border-r-0 border-cloud-gray rounded-l-[6px]">
                      +91
                    </span>
                    <input
                      type="tel"
                      id="contact-phone"
                      name="phone"
                      required
                      aria-required="true"
                      placeholder="63601 35720"
                      pattern="[0-9]{10}"
                      className="w-full h-10 px-4 font-sans text-[15px] text-cocoa-dark bg-canvas-white border border-cloud-gray rounded-r-[6px] placeholder:text-dusty-gray focus:outline-2 focus:outline-deep-gold focus:outline-offset-2 transition-colors duration-200"
                    />
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label
                    htmlFor="contact-message"
                    className="block font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark mb-2"
                  >
                    Message
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    aria-required="true"
                    rows={5}
                    placeholder="How can we help you?"
                    className="w-full px-4 py-3 font-sans text-[15px] text-cocoa-dark bg-canvas-white border border-cloud-gray rounded-[6px] placeholder:text-dusty-gray resize-y focus:outline-2 focus:outline-deep-gold focus:outline-offset-2 transition-colors duration-200"
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="bg-royal-gold text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full px-8 h-10 inline-flex items-center justify-center hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all motion-safe:duration-200"
                >
                  Send Message
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
