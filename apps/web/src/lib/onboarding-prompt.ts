/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : onboarding-prompt
 * Scope        : Authentication — onboarding routing contract
 *
 * Description  : Dependency-free constants and pure helpers shared by the edge
 *                middleware, the server-side onboarding guard and the client
 *                sign-in helper.
 *
 *                It imports NOTHING on purpose, so it is safe in all three
 *                runtimes: the middleware cannot import the guard (Better Auth's
 *                auth-server and the DB client are not edge-compatible), and a
 *                client bundle must never pull in the DB client.
 *
 * Responsibilities :
 * - Own the onboarding path that every redirect into the form uses
 * - Own the "recently prompted" cookie behind the homepage re-prompt
 * - Recognise booking intent in the URL, and router prefetches
 * - Carry booking and acquisition context from the URL into onboarding
 *
 * Tech Stack   : TypeScript (no runtime dependencies)
 * Layer        : Shared (pure)
 ************************************************************/

/** Where a customer without a completed profile goes to complete it. */
export const ONBOARDING_PATH = '/onboarding'

/**
 * Set by the middleware whenever the onboarding form is served. While it is
 * present the homepage does not re-prompt, so a customer who skips onboarding
 * can browse freely and is asked again once it expires. httpOnly: only the
 * server reads it.
 */
export const ONBOARDING_PROMPTED_COOKIE = 'rgss_onboarding_prompted'

/** The homepage re-prompts a customer with no profile at most once per 24 hours. */
export const ONBOARDING_PROMPTED_MAX_AGE_SECONDS = 24 * 60 * 60

/** A page's query string as Next.js hands it to a Server Component. */
type SearchParams = Record<string, string | string[] | undefined>

/**
 * True when the URL asks to open the booking dialog. Mirrors
 * BookingDialogTrigger's `searchParams.get('book') === '1'`, where the first
 * value wins when the parameter is repeated.
 */
export function hasBookingIntent(searchParams: SearchParams): boolean {
  const book = searchParams.book
  const first = Array.isArray(book) ? book[0] : book
  return first === '1'
}

/**
 * The URL parameters that carry a visitor's booking and acquisition context
 * through sign-in and onboarding. `book` and `service` reopen the booking
 * dialog afterwards; the UTM parameters and `leadId` become the new profile's
 * acquisition source.
 */
export const BOOKING_CONTEXT_PARAMS = [
  'book',
  'utm_source',
  'utm_campaign',
  'utm_medium',
  'leadId',
  'service',
] as const

/** Longest context value kept, the same limit the lead form puts on UTM values. */
const MAX_CONTEXT_VALUE_LENGTH = 120

/**
 * The booking and acquisition context in a query string: the first non-empty
 * value of each parameter in BOOKING_CONTEXT_PARAMS, trimmed and capped in
 * length. Every other parameter is dropped. The values are visitor-controlled.
 */
export function readBookingContext(searchParams: SearchParams): Record<string, string> {
  const context: Record<string, string> = {}
  for (const key of BOOKING_CONTEXT_PARAMS) {
    const raw = searchParams[key]
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim()
    if (value) {
      context[key] = value.slice(0, MAX_CONTEXT_VALUE_LENGTH)
    }
  }
  return context
}

/**
 * Where to send an account without a completed profile that asked to book:
 * the onboarding form, with the booking and acquisition context in its query
 * string. The form uses it to reopen the booking dialog afterwards and to
 * attribute the new profile.
 */
export function onboardingPathForBooking(searchParams: SearchParams): string {
  const query = new URLSearchParams(readBookingContext(searchParams))
  query.set('book', '1')
  return `${ONBOARDING_PATH}?${query.toString()}`
}

/**
 * True for a Next.js router prefetch or a browser speculative prefetch. A
 * prefetch is not the customer seeing the page, so it must not start the 24h
 * quiet window.
 */
export function isPrefetchRequest(headers: Headers): boolean {
  if (headers.has('next-router-prefetch') || headers.has('next-router-segment-prefetch')) {
    return true
  }
  const purpose = headers.get('sec-purpose') ?? headers.get('purpose') ?? ''
  return purpose.toLowerCase().includes('prefetch')
}
