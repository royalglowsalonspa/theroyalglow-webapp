/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : llms-full.txt
 * Scope        : AI Discovery (SEO)
 *
 * Description  : Detailed AI-discovery file with full service menu,
 *                prices, durations, cancellation policy, and FAQ.
 *
 * Responsibilities :
 * - Render full service menu with prices (INR) and durations
 * - Include cancellation/rescheduling policy
 * - Include FAQ section from business constants
 * - Gracefully degrade to pointer URL on DB errors
 *
 * Features / Functionality :
 * - Per-category service listing (name, price, duration)
 * - INR formatting via formatINR (paise → ₹)
 * - Contact block with opening hours
 * - Booking and social links
 *
 * Tech Stack   : Next.js 16 (Route Handler), force-dynamic
 * Layer        : Infrastructure (SEO)
 *
 * Dependencies : @/lib/seo/business, @rgss/business, @rgss/db/queries
 *
 * Notes        :
 * - Always returns 200 (never 500s)
 * - Extends llms.txt with full menu detail
 ************************************************************/
import { BUSINESS, FAQS, SITE_URL } from '@/lib/seo/business'
import { formatINR } from '@rgss/business'
import { getAllServicesGrouped } from '@rgss/db/queries'

/**
 * `/llms-full.txt` — the detailed AI-discovery file (`seo.md` Part 8).
 *
 * Extends the concise `llms.txt` with the full live menu: per category, each
 * service name, price (`formatINR`, integer paise → ₹) and duration; plus the
 * cancellation / reschedule policy and the FAQ list. NAP comes from `BUSINESS`.
 * Same caching + static-fallback contract as `llms.txt`: on a DB error we drop
 * the live menu (pointing at `/services` instead) but still return 200.
 */

export const dynamic = 'force-dynamic'

const TEXT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=3600',
} as const

const CANCELLATION_POLICY = `## Cancellation & Rescheduling Policy
You can cancel or reschedule a booking from your bookings page at
${SITE_URL}/bookings, or by calling ${BUSINESS.telephone}. Please give us as
much notice as possible so we can offer the slot to other guests. Walk-ins are
welcome subject to availability; booking ahead guarantees your slot.`

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

/** Render the FAQ section from the canonical `FAQS` list. */
function faqSection(): string {
  const items = FAQS.map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n')
  return `## Frequently Asked Questions\n${items}`
}

type ServiceMenu = Awaited<ReturnType<typeof getAllServicesGrouped>>

/** Render the live full menu grouped by category. */
function menuSection(categories: ServiceMenu): string {
  const blocks = categories
    .filter((category) => category.services.length > 0)
    .map((category) => {
      const lines = category.services
        .map(
          (service) =>
            `- ${service.name} — ${formatINR(service.pricePaise)} — ${service.durationMinutes} min`,
        )
        .join('\n')
      return `### ${category.name}\n${lines}`
    })
    .join('\n\n')

  return `## Full Service Menu\n${blocks}`
}

/** Static menu fallback used when the DB read fails. */
function menuFallback(): string {
  return `## Full Service Menu
Our full menu is temporarily unavailable here. See current services and prices
at ${SITE_URL}/services.`
}

/** Render the full `llms-full.txt` body. */
function renderBody(menu: string): string {
  return `# ${BUSINESS.name} — Full Profile
# Premium beauty salon and day spa in Bengaluru, India

## About
${BUSINESS.name} is a premium beauty salon and day spa located in
Parappana Agrahara, Bengaluru, Karnataka 560100, India.
Price range: ${BUSINESS.priceRange}. Payments accepted: ${BUSINESS.paymentAccepted}.

${menu}

${CANCELLATION_POLICY}

${contactBlock()}

## Booking
Online booking: ${SITE_URL}/?book=1
Google Maps booking link: ${SITE_URL}/?book=1&utm_source=gmb
In-store QR booking link: ${SITE_URL}/?book=1&utm_source=walkin

${faqSection()}

## Social
${BUSINESS.sameAs.map((url) => `- ${url}`).join('\n')}
`
}

export async function GET(): Promise<Response> {
  try {
    const categories = await getAllServicesGrouped()
    return new Response(renderBody(menuSection(categories)), { headers: TEXT_HEADERS })
  } catch {
    return new Response(renderBody(menuFallback()), { headers: TEXT_HEADERS })
  }
}
