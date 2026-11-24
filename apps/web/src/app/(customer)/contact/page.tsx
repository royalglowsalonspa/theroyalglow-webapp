/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ContactPage
 * Scope        : Customer Pages
 *
 * Description  : The public branch directory and contact enquiry form.
 *
 * Responsibilities :
 * - Render address, phone, email, and operating hours
 * - Link to directions and list branch closures
 * - Provide a contact form for name, phone, and message
 *
 * Features / Functionality :
 * - Two-column layout: map + NAP info on left, contact form on right
 * - Branch navigation on pages listing more than one location
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

import { formatCalendarDateIN } from '@rgss/business'
import type { Metadata } from 'next'
import { JsonLd } from '@/components/seo/JsonLd'
import { loadPublicLocations, type PublicLocation } from '@/lib/branch-directory'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, localBusinessJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'
import { ContactForm } from './ContactForm'

export const metadata: Metadata = buildMetadata({
  title: 'Contact Us',
  description:
    'Find Royal Glow Salon & Spa locations, opening hours and contact details in Bengaluru.',
  path: '/contact',
})

const DETAIL_HEADING = 'mb-2 font-ui text-[11px] uppercase tracking-[2px] text-gold-ink'
const DETAIL_LINK = 'font-sans text-[15px] text-cocoa-dark underline-offset-4 hover:underline'

function LocationDetails({ location }: { location: PublicLocation }) {
  const anchor = `location-${location.id ?? 'primary'}`
  return (
    <article
      id={anchor}
      aria-labelledby={`${anchor}-heading`}
      className="scroll-mt-32 rounded-[6px] border border-cloud-gray p-5 sm:p-6"
    >
      <h2 id={`${anchor}-heading`} className="font-display text-[28px] text-cocoa-dark">
        {location.name}
      </h2>
      {location.status && <p className="mt-1 font-ui text-sm text-gold-ink">{location.status}</p>}
      <address className="mt-4 space-y-1 font-sans text-[15px] text-cocoa-dark not-italic">
        <p className="whitespace-pre-line">{location.addressLines.join('\n')}</p>
        {location.phone && (
          <p>
            <a href={location.phone.href} className={DETAIL_LINK}>
              {location.phone.label}
            </a>
          </p>
        )}
        {location.email && (
          <p>
            <a href={`mailto:${location.email}`} className={DETAIL_LINK}>
              {location.email}
            </a>
          </p>
        )}
        {location.directions && (
          <p>
            <a href={location.directions} className={DETAIL_LINK}>
              Get directions
            </a>
          </p>
        )}
      </address>
      <div className="mt-5">
        <h3 className={DETAIL_HEADING}>Regular hours</h3>
        {location.hours ? (
          <dl className="space-y-1 font-sans text-[15px] text-cocoa-dark">
            {location.hours.map((row) => (
              <div key={row.days} className="flex flex-wrap gap-x-3">
                <dt className="text-warm-gray">{row.days}</dt>
                <dd>{row.hours}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="font-sans text-[15px] text-warm-gray">Hours are unavailable.</p>
        )}
      </div>
      {location.closures.length > 0 && (
        <div className="mt-5">
          <h3 className={DETAIL_HEADING}>Upcoming closures</h3>
          <ul className="space-y-1 font-sans text-[15px] text-cocoa-dark">
            {location.closures.map(({ date, name }) => (
              <li key={date}>
                <time dateTime={date}>{formatCalendarDateIN(date)}</time> · {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

export default async function ContactPage() {
  const locations = await loadPublicLocations()
  const branches = locations.flatMap(({ id, name }) => (id ? [{ id, name }] : []))

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
            <div className="space-y-5">
              {branches.length > 1 && (
                <nav aria-label="Choose a branch">
                  <ul className="flex flex-wrap gap-2">
                    {branches.map(({ id, name }) => (
                      <li key={id}>
                        <a
                          href={`#location-${id}`}
                          className="inline-block rounded-full border border-cloud-gray px-4 py-2 font-ui text-sm text-cocoa-dark hover:border-gold-ink"
                        >
                          {name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              {locations.map((location) => (
                <LocationDetails key={location.id ?? 'primary'} location={location} />
              ))}
              {locations.length === 0 && (
                <p className="font-sans text-warm-gray">No locations are listed right now.</p>
              )}
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
              <ContactForm branches={branches} />
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
