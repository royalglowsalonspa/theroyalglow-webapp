/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : llms.txt
 * Scope        : AI Discovery (SEO)
 *
 * Description  : Concise AI-discovery file ("robots.txt for AI models")
 *                with live service names, NAP, and booking endpoints.
 *
 * Responsibilities :
 * - Render business info from canonical BUSINESS constant
 * - Pull live service names from database
 * - Provide structured API endpoints for agent integrations
 * - Gracefully degrade to static fallback on DB errors
 *
 * Features / Functionality :
 * - Live service name list from DB
 * - Key pages directory for AI citation
 * - API endpoint documentation for agents
 * - Contact block with opening hours
 *
 * Tech Stack   : Next.js 16 (Route Handler), force-dynamic
 * Layer        : Infrastructure (SEO)
 *
 * Dependencies : @/lib/seo/business, @rgss/db/queries
 *
 * Notes        :
 * - Always returns 200 (never 500s)
 * - Cached for 1 hour via Cache-Control header
 ************************************************************/

import { getAllServicesGrouped } from '@rgss/db/queries'
import { BUSINESS, SITE_URL } from '@/lib/seo/business'

/**
 * `/llms.txt` — the concise AI-discovery file (the "robots.txt for AI models").
 *
 * Renders the `seo.md` Part 8 template with live active service names pulled
 * from `getAllServicesGrouped()`. All NAP comes from the canonical `BUSINESS`
 * constant and all URLs from `SITE_URL`. The DB read is wrapped in try/catch:
 * on error we emit the same template without the live service-name list (a
 * static "Full menu" pointer instead) and still return 200 — this route never
 * 500s.
 */

export const dynamic = 'force-dynamic'

const TEXT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=3600',
} as const

/** Convert a 24h `HH:mm` string to a 12h `h:mm AM/PM` label. */
function to12h(time: string): string {
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr)
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${minuteStr} ${period}`
}

/** Render a human-readable hours line for an opening-hours block. */
function formatHoursBlock(block: (typeof BUSINESS.openingHours)[number]): string {
  const first = block.days[0]
  const last = block.days[block.days.length - 1]
  const dayRange = first === last ? first : `${first}–${last}`
  return `${dayRange} ${to12h(block.opens)} – ${to12h(block.closes)}`
}

/** The contact block, identical whether or not the live menu is available. */
function contactBlock(): string {
  const hours = BUSINESS.openingHours.map(formatHoursBlock).join('\n       ')
  return [
    '## Contact',
    `Phone: ${BUSINESS.telephone}`,
    `Email: ${BUSINESS.email}`,
    `Address: ${BUSINESS.formattedAddress}`,
    `Hours: ${hours}`,
  ].join('\n')
}

/** Render the full `llms.txt` body. `serviceNames` is empty on a DB error. */
function renderBody(serviceNames: string[]): string {
  const servicesLine =
    serviceNames.length > 0
      ? serviceNames.join(', ')
      : 'haircuts, hair colouring, facials, massages, bridal packages, nail art, and skincare treatments'

  return `# ${BUSINESS.name}
# Premium beauty salon and day spa in Bengaluru, India

## About
${BUSINESS.name} is a premium beauty salon and day spa located in
Parappana Agrahara, Bengaluru, Karnataka 560100, India.
We offer ${servicesLine}.

## Services
Full menu with prices: ${SITE_URL}/services
Online booking: ${SITE_URL}/?book=1
Google Maps booking link: ${SITE_URL}/?book=1&utm_source=gmb
In-store QR booking link: ${SITE_URL}/?book=1&utm_source=walkin

## Key Pages
- Homepage: ${SITE_URL}
- Services & Prices: ${SITE_URL}/services
- Book Appointment: ${SITE_URL}/?book=1
- About Us: ${SITE_URL}/about
- Contact & Location: ${SITE_URL}/contact
- Offers: ${SITE_URL}/offers
- FAQ: ${SITE_URL}/faq

${contactBlock()}

## API (for agent integrations)
Services list: ${SITE_URL}/api/services
Check availability: ${SITE_URL}/api/availability?service={slug}&date={YYYY-MM-DD}
Submit booking request: POST ${SITE_URL}/api/bookings
Submit campaign lead enquiry: POST ${SITE_URL}/api/leads

## Social
${BUSINESS.sameAs.map((url) => `- ${url}`).join('\n')}
`
}

export async function GET(): Promise<Response> {
  try {
    const categories = await getAllServicesGrouped()
    const serviceNames = categories.flatMap((category) =>
      category.services.map((service) => service.name),
    )
    return new Response(renderBody(serviceNames), { headers: TEXT_HEADERS })
  } catch {
    return new Response(renderBody([]), { headers: TEXT_HEADERS })
  }
}
