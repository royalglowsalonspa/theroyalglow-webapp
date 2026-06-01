import { BUSINESS } from '@/lib/seo/business'
import { buildMetadata } from '@/lib/seo/metadata'

export const metadata = buildMetadata({
  title: 'Privacy Policy',
  description:
    'How Royal Glow Salon & Spa collects, uses, and protects your personal data under the Digital Personal Data Protection Act, 2023, and your rights as a data principal.',
  path: '/privacy',
  robotsIndex: true,
})

const LAST_UPDATED = '15 February 2026'
const tel = `tel:${BUSINESS.telephone.replace(/[^\d+]/g, '')}`
const mailto = `mailto:${BUSINESS.email}`

export default function PrivacyPolicyPage() {
  return (
    <article className="font-sans text-[16px] text-warm-gray leading-[1.7]">
      <header>
        <span className="font-ui text-[11px] text-deep-gold uppercase tracking-[2px]">Legal</span>
        <h1 className="mt-3 font-display text-[clamp(34px,5vw,52px)] text-cocoa-dark leading-[1.08] tracking-[-1px]">
          Privacy Policy
        </h1>
        <p className="mt-4 text-warm-gray/80 text-sm">
          Last updated: <time dateTime="2026-02-15">{LAST_UPDATED}</time>
        </p>
        <p className="mt-6">
          {BUSINESS.name} ("Royal Glow", "we", "us", or "our") is committed to protecting your
          privacy. This policy explains what personal data we collect when you visit our salon, use
          our website, or book an appointment, why we collect it, and the choices and rights you
          have. We process personal data in accordance with India's Digital Personal Data Protection
          Act, 2023 (the "DPDP Act") and applicable rules.
        </p>
      </header>

      <section aria-labelledby="data-we-collect" className="mt-10">
        <h2 id="data-we-collect" className="font-display text-2xl text-cocoa-dark">
          1. Personal data we collect
        </h2>
        <p className="mt-4">
          We collect only the data we need to serve you well. Depending on how you interact with us,
          this may include:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-6 marker:text-deep-gold">
          <li>
            <strong className="text-cocoa-dark">Identity and contact details</strong> — your name,
            mobile number, and email address.
          </li>
          <li>
            <strong className="text-cocoa-dark">Profile details</strong> — date of birth and gender,
            where you choose to share them, so we can offer birthday rewards and appropriate
            services.
          </li>
          <li>
            <strong className="text-cocoa-dark">Booking and service history</strong> — the
            appointments you make, services availed, staff preferences, notes relevant to your
            treatments, and attendance.
          </li>
          <li>
            <strong className="text-cocoa-dark">Billing details</strong> — invoices, amounts,
            payment method used (cash, UPI, or card), loyalty (gems) balance, and membership
            records. We do not store full card numbers; payments are taken at our counter.
          </li>
          <li>
            <strong className="text-cocoa-dark">Technical and usage data</strong> — limited
            information such as device and browser type and pages viewed, collected through cookies
            only where you have consented.
          </li>
        </ul>
      </section>

      <section aria-labelledby="why-we-use" className="mt-10">
        <h2 id="why-we-use" className="font-display text-2xl text-cocoa-dark">
          2. Why we use your data
        </h2>
        <p className="mt-4">We use your personal data to:</p>
        <ul className="mt-4 list-disc space-y-2 pl-6 marker:text-deep-gold">
          <li>create and manage your account and bookings;</li>
          <li>
            confirm, remind, reschedule, or cancel appointments and send service-related
            notifications;
          </li>
          <li>generate GST-compliant invoices and process payments at the counter;</li>
          <li>operate our loyalty (gems) programme and SPA memberships;</li>
          <li>respond to your enquiries and provide customer support; and</li>
          <li>
            send you offers, birthday wishes, and marketing communications, but only where you have
            given consent.
          </li>
        </ul>
      </section>

      <section aria-labelledby="lawful-basis" className="mt-10">
        <h2 id="lawful-basis" className="font-display text-2xl text-cocoa-dark">
          3. Lawful basis and consent
        </h2>
        <p className="mt-4">
          Under the DPDP Act, we process your personal data on the basis of your consent, which is
          sought at the point of collection (for example, during onboarding or booking), and for
          certain legitimate uses such as fulfilling a service you have requested. Where processing
          relies on consent, that consent is free, specific, informed, and unambiguous, and you may
          withdraw it at any time. Withdrawing consent will not affect the lawfulness of processing
          carried out before withdrawal, and some processing necessary to provide a service or to
          meet a legal obligation may continue.
        </p>
      </section>

      <section aria-labelledby="cookies" className="mt-10">
        <h2 id="cookies" className="font-display text-2xl text-cocoa-dark">
          4. Cookies
        </h2>
        <p className="mt-4">
          Our website uses a two-tier cookie approach. Strictly necessary cookies are always active
          because the site cannot function without them (for example, to keep you signed in and to
          remember your cookie choice). Analytics and marketing cookies are optional and load only
          after you opt in through our cookie banner. You can change your choice at any time using
          the "Cookie Preferences" link in our website footer. If you reject non-essential cookies,
          no analytics or marketing trackers are loaded.
        </p>
      </section>

      <section aria-labelledby="retention" className="mt-10">
        <h2 id="retention" className="font-display text-2xl text-cocoa-dark">
          5. How long we keep your data
        </h2>
        <p className="mt-4">
          We retain your personal data only for as long as necessary to fulfil the purposes
          described in this policy, including to provide our services, maintain your booking and
          billing history, and comply with legal, accounting, and tax obligations (such as retaining
          invoices for the period required under Indian tax law). When data is no longer required,
          we erase it or anonymise it.
        </p>
      </section>

      <section aria-labelledby="your-rights" className="mt-10">
        <h2 id="your-rights" className="font-display text-2xl text-cocoa-dark">
          6. Your rights as a data principal
        </h2>
        <p className="mt-4">
          The DPDP Act gives you the following rights in respect of your personal data:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-6 marker:text-deep-gold">
          <li>
            <strong className="text-cocoa-dark">Right to access</strong> — to obtain a summary of
            the personal data we hold about you and how we process it.
          </li>
          <li>
            <strong className="text-cocoa-dark">Right to correction</strong> — to ask us to correct
            inaccurate or update incomplete data.
          </li>
          <li>
            <strong className="text-cocoa-dark">Right to erasure</strong> — to ask us to delete
            personal data that is no longer needed for the purpose it was collected, subject to our
            legal retention duties.
          </li>
          <li>
            <strong className="text-cocoa-dark">Right to withdraw consent</strong> — to withdraw
            consent at any time, as easily as it was given.
          </li>
          <li>
            <strong className="text-cocoa-dark">Right to grievance redressal</strong> — to raise a
            complaint with us, and to nominate another person to exercise your rights in the event
            of death or incapacity.
          </li>
        </ul>
        <p className="mt-4">
          To exercise any of these rights, contact us using the details in the "Grievances and
          contact" section below. We may need to verify your identity before acting on a request.
        </p>
      </section>

      <section aria-labelledby="third-parties" className="mt-10">
        <h2 id="third-parties" className="font-display text-2xl text-cocoa-dark">
          7. Sharing and third-party processors
        </h2>
        <p className="mt-4">
          We do not sell your personal data. We share it only with trusted service providers who
          process it on our behalf and under contract, including:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-6 marker:text-deep-gold">
          <li>
            payment handling at our counter (cash, UPI, and card terminals) — we do not retain full
            card details;
          </li>
          <li>email and notification providers used to send confirmations and reminders;</li>
          <li>
            website hosting and analytics providers, where analytics cookies have been consented to.
          </li>
        </ul>
        <p className="mt-4">
          We require all processors to protect your data and to use it only for the purposes we
          specify.
        </p>
      </section>

      <section aria-labelledby="security" className="mt-10">
        <h2 id="security" className="font-display text-2xl text-cocoa-dark">
          8. How we protect your data
        </h2>
        <p className="mt-4">
          We apply reasonable security safeguards to protect your personal data against unauthorised
          access, disclosure, alteration, or loss. These include access controls, encrypted
          connections, and limiting access to staff who need it to do their work. No method of
          transmission or storage is completely secure, but we take our responsibilities seriously
          and review our safeguards regularly.
        </p>
      </section>

      <section aria-labelledby="children" className="mt-10">
        <h2 id="children" className="font-display text-2xl text-cocoa-dark">
          9. Children's data
        </h2>
        <p className="mt-4">
          Our services are intended for adults. Where a booking is made for a minor, we expect a
          parent or lawful guardian to provide the booking details and consent. We do not knowingly
          process children's personal data without verifiable parental consent as required by the
          DPDP Act.
        </p>
      </section>

      <section aria-labelledby="changes" className="mt-10">
        <h2 id="changes" className="font-display text-2xl text-cocoa-dark">
          10. Changes to this policy
        </h2>
        <p className="mt-4">
          We may update this policy from time to time to reflect changes in our practices or the
          law. When we make material changes, we will update the "Last updated" date above and,
          where appropriate, notify you.
        </p>
      </section>

      <section aria-labelledby="grievances" className="mt-10">
        <h2 id="grievances" className="font-display text-2xl text-cocoa-dark">
          11. Grievances and contact
        </h2>
        <p className="mt-4">
          If you have any questions about this policy, wish to exercise your rights, or want to
          raise a grievance about how we handle your personal data, please contact our Grievance
          Officer:
        </p>
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
        <p className="mt-4">
          We aim to acknowledge and respond to grievances within a reasonable period. If you remain
          dissatisfied, you may escalate your complaint to the Data Protection Board of India.
        </p>
      </section>
    </article>
  )
}
