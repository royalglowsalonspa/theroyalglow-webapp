/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : RefundPolicyPage
 * Scope        : Legal Pages
 *
 * Description  : Refund & Cancellation Policy page covering appointment cancellation,
 *                rescheduling, no-shows, membership expiry, and refund procedures.
 *
 * Responsibilities :
 * - Document cancellation and rescheduling rules for appointments
 * - Explain no-show consequences and membership hour expiry
 * - Detail refund request process and processing timelines
 *
 * Features / Functionality :
 * - 8-section legal document with semantic headings
 * - Accessible section navigation via aria-labelledby
 * - Contact details for refund enquiries from BUSINESS constant
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
  title: 'Refund & Cancellation Policy',
  description:
    'Royal Glow Salon & Spa refund and cancellation policy — cancellation windows, no-show and rescheduling rules, membership hour expiry, and how to request a refund.',
  path: '/refund-policy',
  robotsIndex: true,
})

const LAST_UPDATED = '15 February 2026'
const tel = `tel:${BUSINESS.telephone.replace(/[^\d+]/g, '')}`
const mailto = `mailto:${BUSINESS.email}`

export default function RefundPolicyPage() {
  return (
    <article className="font-sans text-[16px] text-warm-gray leading-[1.7]">
      <header>
        <span className="font-ui text-[11px] text-deep-gold uppercase tracking-[2px]">Legal</span>
        <h1 className="mt-3 font-display text-[clamp(34px,5vw,52px)] text-cocoa-dark leading-[1.08] tracking-[-1px]">
          Refund &amp; Cancellation Policy
        </h1>
        <p className="mt-4 font-ui text-warm-gray/80 text-sm">
          Last updated: <time dateTime="2026-02-15">{LAST_UPDATED}</time>
        </p>
        <p className="mt-6">
          This policy explains how cancellations, rescheduling, no-shows, and refunds work at{' '}
          {BUSINESS.name} ("Royal Glow", "we", "us", or "our"). It forms part of our Terms of
          Service. Because most services are paid at our counter after the service is rendered, this
          policy mainly applies to prepaid items such as memberships and any advance payments.
        </p>
      </header>

      <section aria-labelledby="cancellation" className="mt-10">
        <h2 id="cancellation" className="font-display text-2xl text-cocoa-dark">
          1. Cancelling an appointment
        </h2>
        <p className="mt-4">
          You can cancel an appointment at any time from your bookings page or by calling us. To
          help us offer the slot to other guests, we request that you give us as much notice as
          possible — ideally at least a few hours before your appointment. There is no cancellation
          charge for standard salon and spa appointments, as these are paid at the counter.
        </p>
      </section>

      <section aria-labelledby="rescheduling" className="mt-10">
        <h2 id="rescheduling" className="font-display text-2xl text-cocoa-dark">
          2. Rescheduling
        </h2>
        <p className="mt-4">
          You may reschedule a confirmed appointment to another available slot from your bookings
          page or by calling us, subject to availability. We recommend rescheduling early so we can
          accommodate your preferred date and time.
        </p>
      </section>

      <section aria-labelledby="no-show" className="mt-10">
        <h2 id="no-show" className="font-display text-2xl text-cocoa-dark">
          3. No-shows
        </h2>
        <p className="mt-4">
          A no-show is when you miss a confirmed appointment without cancelling. Occasional no-shows
          carry no penalty, but repeated no-shows within a short period may mean that future
          bookings require our approval before they are confirmed. A consistent record of attended
          appointments restores normal booking. If you anticipate missing an appointment, please
          cancel or reschedule so the slot can be reused.
        </p>
      </section>

      <section aria-labelledby="prepaid" className="mt-10">
        <h2 id="prepaid" className="font-display text-2xl text-cocoa-dark">
          4. Refunds for prepaid services
        </h2>
        <p className="mt-4">
          Where you have made an advance or prepaid payment for a service that has not yet been
          rendered, you may request a refund by contacting us. Refunds are issued to the original
          payment method where possible. Services that have already been rendered are not
          refundable, as salon and spa treatments cannot be returned once provided.
        </p>
      </section>

      <section aria-labelledby="memberships" className="mt-10">
        <h2 id="memberships" className="font-display text-2xl text-cocoa-dark">
          5. Memberships and loyalty
        </h2>
        <p className="mt-4">
          SPA memberships are sold as a fixed number of service hours valid for a set term.
          Membership hours have a hard expiry: any unused hours lapse at the end of the membership
          term and are not carried forward, extended, or refunded, except where required by law.
          Loyalty "gems" have no cash value and are not refundable or exchangeable for money. If you
          believe there is an error in your membership hours or gems balance, contact us and we will
          review it.
        </p>
      </section>

      <section aria-labelledby="how-to-request" className="mt-10">
        <h2 id="how-to-request" className="font-display text-2xl text-cocoa-dark">
          6. How to request a refund
        </h2>
        <p className="mt-4">
          To request a refund, contact us by phone or email with your name, the booking or invoice
          number, and the reason for your request. We may need to verify your identity and the
          details of the payment before processing a refund.
        </p>
      </section>

      <section aria-labelledby="timelines" className="mt-10">
        <h2 id="timelines" className="font-display text-2xl text-cocoa-dark">
          7. Processing timelines
        </h2>
        <p className="mt-4">
          Once a refund is approved, we process it promptly. The time for the amount to reach you
          depends on your bank or payment provider and is typically within 7 to 10 business days
          from approval. We will keep you informed of the status of your request.
        </p>
      </section>

      <section aria-labelledby="contact" className="mt-10">
        <h2 id="contact" className="font-display text-2xl text-cocoa-dark">
          8. Contact us
        </h2>
        <p className="mt-4">For any questions about refunds or cancellations, please contact us:</p>
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
