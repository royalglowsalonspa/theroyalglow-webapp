/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : post-onboarding-destination
 * Scope        : Authentication — post-onboarding routing
 *
 * Description  : Resolves where a customer goes once their profile row exists.
 *
 * Responsibilities :
 * - Default to the homepage
 * - Replay a pending booking intent that the onboarding detour interrupted
 * - Merge the saved pre-sign-in context with the onboarding URL's context
 *
 * Features / Functionality :
 * - Pure and total: takes the saved pre-sign-in context, returns a path
 *
 * Tech Stack   : TypeScript
 * Layer        : Frontend (pure helper)
 *
 * Dependencies : none
 *
 * Notes        :
 * - Input comes from sessionStorage key `rgss_auth_context`, populated by
 *   preserveAuthContext() in `@/lib/google-signin` from visitor-controlled URL
 *   params — so values are URL-encoded here, never interpolated raw.
 ************************************************************/

/**
 * Where to send the customer once the profile row exists.
 *
 * Defaults to the homepage. When the pre-sign-in context carried `book=1` (set
 * by BookingDialog before it handed off to Google), the booking dialog is
 * reopened by replaying `?book=1` plus any `service` preselection.
 *
 * This matters because `newUserCallbackURL` deliberately overrides
 * BookingDialog's own `/?book=1` callback for first-time users: a new customer
 * is onboarded first, so the booking intent only survives if it is replayed
 * here. Returning users never reach this code — Better Auth sends them straight
 * to their `callbackURL`.
 *
 * Only the two params the homepage actually reads are replayed, and
 * URLSearchParams encodes both.
 */
export function buildPostOnboardingDestination(context: Record<string, string>): string {
  if (context.book !== '1') {
    return '/'
  }
  const params = new URLSearchParams({ book: '1' })
  if (context.service) {
    params.set('service', context.service)
  }
  return `/?${params.toString()}`
}

/**
 * Combine the two places onboarding context comes from:
 *
 * - `stored`: the sessionStorage context saved before Google sign-in (or by
 *   the booking dialog), i.e. what the visitor arrived with in this tab.
 * - `fromUrl`: the onboarding page's own query string, set when Book Now sent
 *   a signed-in customer here (onboardingPathForBooking).
 *
 * Attribution (UTM parameters, `leadId`) keeps the stored value, the first
 * touch in this tab, and takes the URL's only where nothing was stored. When
 * the URL carries booking intent, the whole intent (`book` and `service`) comes
 * from the URL, because that is the Book Now the customer just tapped; a
 * service saved from an earlier visit is dropped.
 */
export function mergeOnboardingContext(
  stored: Record<string, string>,
  fromUrl: Record<string, string>,
): Record<string, string> {
  const merged = { ...fromUrl, ...stored }
  if (fromUrl.book !== '1') {
    return merged
  }
  const attribution = Object.fromEntries(
    Object.entries(merged).filter(([key]) => key !== 'book' && key !== 'service'),
  )
  return fromUrl.service
    ? { ...attribution, book: '1', service: fromUrl.service }
    : { ...attribution, book: '1' }
}
