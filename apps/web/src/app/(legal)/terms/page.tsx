/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : TermsOfServicePage
 * Scope        : Legal Pages
 *
 * Description  : Terms of Service page governing website use, bookings, payments,
 *                memberships, loyalty programme, conduct, IP, and jurisdiction.
 *
 * Responsibilities :
 * - Define acceptance terms, service descriptions, and booking rules
 * - Document pricing, payment, and cancellation policies
 * - Cover loyalty/membership terms, conduct expectations, and governing law
 *
 * Features / Functionality :
 * - 12-section legal document with semantic headings
 * - Cross-link to Refund & Cancellation Policy
 * - Contact details for enquiries from BUSINESS constant
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : BUSINESS, buildMetadata
 *
 * Notes        :
 * - Statically generated (SSG) — no runtime data fetching
 ************************************************************/

import { BUSINESS } from '@/lib/seo/business'
import { buildMetadata } from '@/lib/seo/metadata'

export const metadata = buildMetadata({
  title: 'Terms of Service',
  description:
    'The terms governing your use of Royal Glow Salon & Spa services, bookings, payments, memberships, and loyalty programme, including pricing, conduct, and governing law.',
  path: '/terms',
  robotsIndex: true,
})

const LAST_UPDATED = '15 February 2026'
const tel = `tel:${BUSINESS.telephone.replace(/[^\d+]/g, '')}`
const mailto = `mailto:${BUSINESS.email}`

export default function TermsOfServicePage() {
  return (
    <article className="font-sans text-[16px] text-warm-gray leading-[1.7]">
      <header>
        <span className="font-ui text-[11px] text-deep-gold uppercase tracking-[2px]">Legal</span>
        <h1 className="mt-3 font-display text-[clamp(34px,5vw,52px)] text-cocoa-dark leading-[1.08] tracking-[-1px]">
          Terms of Service
        </h1>
        <p className="mt-4 text-warm-gray/80 text-sm">
          Last updated: <time dateTime="2026-02-15">{LAST_UPDATED}</time>
        </p>
        <p className="mt-6">
          These Terms of Service ("Terms") govern your use of the website, bookings, and services of{' '}
          {BUSINESS.name} ("Royal Glow", "we", "us", or "our"). By booking an appointment, visiting
          our salon, or using our website, you agree to these Terms. Please read them carefully.
        </p>
      </header>

      <section aria-labelledby="acceptance" className="mt-10">
        <h2 id="acceptance" className="font-display text-2xl text-cocoa-dark">
          1. Acceptance of terms
        </h2>
        <p className="mt-4">
          By accessing our website or availing our services, you confirm that you are at least 18
          years of age (or are acting with the consent and supervision of a parent or lawful
          guardian) and that you accept these Terms and our Privacy Policy. If you do not agree,
          please do not use our services.
        </p>
      </section>

      <section aria-labelledby="services" className="mt-10">
        <h2 id="services" className="font-display text-2xl text-cocoa-dark">
          2. Our services
        </h2>
        <p className="mt-4">
          Royal Glow provides salon and spa services including hair care, skincare, beauty
          treatments, massage and wellness therapies, bridal packages, and related offerings.
          Service availability, duration, and outcomes may vary based on individual needs, staff
          availability, and product suitability. Our team may decline or modify a treatment where it
          is unsafe or unsuitable for you.
        </p>
      </section>

      <section aria-labelledby="bookings" className="mt-10">
        <h2 id="bookings" className="font-display text-2xl text-cocoa-dark">
          3. Bookings and appointments
        </h2>
        <p className="mt-4">
          When you request a booking, it is initially recorded as pending and is confirmed once we
          accept it. We will make reasonable efforts to honour confirmed appointment times, but
          slots may shift due to operational factors. Please arrive a few minutes before your
          appointment; late arrivals may result in a shortened service to avoid delaying other
          guests. We may require approval for bookings from guests with a record of repeated
          no-shows.
        </p>
      </section>

      <section aria-labelledby="pricing" className="mt-10">
        <h2 id="pricing" className="font-display text-2xl text-cocoa-dark">
          4. Pricing and payment
        </h2>
        <p className="mt-4">
          All prices shown are in Indian Rupees (INR) and are inclusive of Goods and Services Tax
          (GST) at the applicable rate. Prices may change without prior notice, but the price
          applicable to your service is the one in effect at the time the service is rendered.
          Payment is made at our counter by cash, UPI, or card. We do not currently offer an online
          payment gateway. A GST-compliant invoice is issued for every paid service.
        </p>
      </section>

      <section aria-labelledby="cancellation" className="mt-10">
        <h2 id="cancellation" className="font-display text-2xl text-cocoa-dark">
          5. Cancellation, rescheduling, and refunds
        </h2>
        <p className="mt-4">
          You may cancel or reschedule an appointment from your bookings page or by calling us.
          Repeated no-shows may affect your ability to make future bookings without approval.
          Refunds, where applicable, are governed by our{' '}
          <a
            href="/refund-policy"
            className="text-deep-gold underline underline-offset-2 hover:text-cocoa-dark"
          >
            Refund &amp; Cancellation Policy
          </a>
          , which forms part of these Terms.
        </p>
      </section>

      <section aria-labelledby="loyalty" className="mt-10">
        <h2 id="loyalty" className="font-display text-2xl text-cocoa-dark">
          6. Loyalty (gems) and memberships
        </h2>
        <p className="mt-4">
          Our loyalty programme awards "gems" on eligible salon services. Gems have no cash value,
          cannot be exchanged for money, and may be redeemed only against eligible catalogue
          services. Gems expire 365 days after they are earned and cannot be combined with other
          offers on the same booking. SPA memberships are sold as a number of service hours valid
          for a fixed term; unused hours expire at the end of the membership term and are not
          extended or refunded except as stated in our Refund &amp; Cancellation Policy. Only one
          active membership may be held per customer. We may vary the terms of the loyalty programme
          and memberships with reasonable notice.
        </p>
      </section>

      <section aria-labelledby="conduct" className="mt-10">
        <h2 id="conduct" className="font-display text-2xl text-cocoa-dark">
          7. Your conduct
        </h2>
        <p className="mt-4">
          We are committed to a safe and respectful environment for our guests and staff. You agree
          to provide accurate information, to disclose any allergies, medical conditions, or
          sensitivities relevant to your treatment, and to behave respectfully towards our team and
          other guests. We reserve the right to refuse or discontinue service in cases of abusive
          behaviour, non-payment, or misuse of our services.
        </p>
      </section>

      <section aria-labelledby="ip" className="mt-10">
        <h2 id="ip" className="font-display text-2xl text-cocoa-dark">
          8. Intellectual property
        </h2>
        <p className="mt-4">
          All content on our website — including the Royal Glow name, logo, text, graphics, and
          images — is owned by us or our licensors and is protected by applicable intellectual
          property laws. You may not copy, reproduce, or use our content for commercial purposes
          without our prior written permission.
        </p>
      </section>

      <section aria-labelledby="liability" className="mt-10">
        <h2 id="liability" className="font-display text-2xl text-cocoa-dark">
          9. Limitation of liability
        </h2>
        <p className="mt-4">
          We strive to deliver our services with reasonable skill and care. To the extent permitted
          by law, Royal Glow is not liable for indirect or consequential losses, or for reactions
          arising from undisclosed allergies or medical conditions. Nothing in these Terms excludes
          liability that cannot be excluded under applicable law.
        </p>
      </section>

      <section aria-labelledby="governing-law" className="mt-10">
        <h2 id="governing-law" className="font-display text-2xl text-cocoa-dark">
          10. Governing law and jurisdiction
        </h2>
        <p className="mt-4">
          These Terms are governed by and construed in accordance with the laws of India. Any
          disputes arising out of or in connection with these Terms or our services are subject to
          the exclusive jurisdiction of the courts at Bengaluru, Karnataka.
        </p>
      </section>

      <section aria-labelledby="changes" className="mt-10">
        <h2 id="changes" className="font-display text-2xl text-cocoa-dark">
          11. Changes to these terms
        </h2>
        <p className="mt-4">
          We may update these Terms from time to time. When we make material changes, we will update
          the "Last updated" date above. Your continued use of our services after changes take
          effect constitutes acceptance of the revised Terms.
        </p>
      </section>

      <section aria-labelledby="contact" className="mt-10">
        <h2 id="contact" className="font-display text-2xl text-cocoa-dark">
          12. Contact us
        </h2>
        <p className="mt-4">For any questions about these Terms, please contact us:</p>
        <address className="mt-4 space-y-1 text-warm-gray not-italic">
          <p className="text-cocoa-dark">{BUSINESS.name}</p>
          <p>{BUSINESS.formattedAddress}</p>
          <p className="pt-2">
            Email:{' '}
            <a
              href={mailto}
              className="text-deep-gold underline underline-offset-2 hover:text-cocoa-dark"
            >
              {BUSINESS.email}
            </a>
          </p>
          <p>
            Phone:{' '}
            <a
              href={tel}
              className="text-deep-gold underline underline-offset-2 hover:text-cocoa-dark"
            >
              {BUSINESS.telephone}
            </a>
          </p>
        </address>
      </section>
    </article>
  )
}
