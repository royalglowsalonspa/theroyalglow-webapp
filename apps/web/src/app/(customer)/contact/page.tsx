/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ContactPage
 * Scope        : Customer Pages
 *
 * Description  : Contact page displaying salon location, NAP info, Google Maps embed,
 *                business hours, and a message form for enquiries.
 *
 * Responsibilities :
 * - Render address, phone, email, and operating hours
 * - Embed Google Maps iframe showing salon location
 * - Provide a contact form for name, phone, and message
 *
 * Features / Functionality :
 * - Two-column layout: map + NAP info on left, contact form on right
 * - Google Maps embed with lazy loading
 * - Accessible form with validation and ARIA attributes
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, JSON-LD
 * Layer        : Presentation
 *
 * Dependencies : JsonLd, SITE_URL, breadcrumbJsonLd, localBusinessJsonLd, buildMetadata
 *
 * Notes        :
 * - Form is wired to POST /api/contact via the ContactForm client component
 ************************************************************/

import type { Metadata } from 'next'
import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, localBusinessJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'
import { ContactForm } from './ContactForm'

export const metadata: Metadata = buildMetadata({
  title: 'Contact Us',
  description:
    'Get in touch with Royal Glow Salon & Spa. Visit us at Narmada Complex, Rayasandra Main Road, Bengaluru or call +91 63601 35720.',
  path: '/contact',
})

export default function ContactPage() {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <JsonLd
        data={[
          localBusinessJsonLd(),
          breadcrumbJsonLd([{ name: 'Home', url: SITE_URL }, { name: 'Contact' }]),
        ]}
      />

      <div className="flex flex-col gap-20">
        {/* ═══════════════════════════════════════════════════════ */}
        {/* HEADING */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-labelledby="contact-heading" className="px-5">
          <div className="mx-auto max-w-[1278px] mt-6 lg:mt-10">
            <h1
              id="contact-heading"
              className="font-display font-black text-cocoa-dark tracking-[-1.44px] leading-[1.03] text-[clamp(40px,6vw,72px)]"
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
              {/* Google Maps embed — official keyless "Embed a map" iframe for
                  the real Royal Glow Salon & Spa Business Profile (feature ID
                  0x3bae6d5cd0552b29:0xb87793c64005049e). No Maps Embed API key
                  required; allowed by the middleware CSP frame-src
                  (https://www.google.com). Width is responsive (100%); height
                  fixed to the contact-card design. */}
              <div className="rounded-[6px] overflow-hidden border border-cloud-gray">
                <iframe
                  title="Royal Glow Salon & Spa location on Google Maps"
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3889.5204681262835!2d77.66475897572211!3d12.874219217004518!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bae6d5cd0552b29%3A0xb87793c64005049e!2sROYAL%20GLOW%20SALON%20%26%20SPA!5e0!3m2!1sen!2sin!4v1782664203581!5m2!1sen!2sin"
                  width="100%"
                  height="300"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
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
                    1st Floor, Narmada Complex, 48/3,
                    <br />
                    Rayasandra Main Rd, Above SBI Bank,
                    <br />
                    Naganathapura, Parappana Agrahara,
                    <br />
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
                Have a question or want to book a group session? Drop us a message and we&apos;ll
                get back to you shortly.
              </p>

              {/* Interactive enquiry form — client component wired to POST /api/contact */}
              <ContactForm />
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
