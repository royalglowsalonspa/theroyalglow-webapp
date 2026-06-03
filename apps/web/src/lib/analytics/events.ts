/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : events
 * Scope        : Analytics
 *
 * Description  : Typed, no-op-safe analytics event helper. Forwards funnel events
 *                to PostHog and Meta Pixel when loaded, never throws.
 *
 * Responsibilities :
 * - Define typed analytics event names for the funnel
 * - Forward events to PostHog capture and Meta Pixel fbq
 * - Silently no-op when no provider or no window is present
 *
 * Features / Functionality :
 * - track() — fire-and-forget analytics event dispatch
 * - AnalyticsEvent union type for type-safe event names
 * - Automatic Meta standard vs. custom event routing
 *
 * Tech Stack   : TypeScript
 * Layer        : Frontend
 *
 * Dependencies : None (reads window.posthog / window.fbq at runtime)
 *
 * Notes        : None
 ************************************************************/

/**
 * Typed analytics event helper.
 *
 * `track()` is a no-op-safe wrapper that forwards funnel events to PostHog
 * and/or the Meta Pixel ONLY when those providers are already loaded on
 * `window`. It never throws and silently no-ops when no provider (or no
 * `window`) is present, so it is safe to import and call from anywhere.
 */

/** Funnel events referenced by the lead/booking flows. */
export type AnalyticsEvent =
  | 'PageView'
  | 'Lead'
  | 'InitiateCheckout'
  | 'AddToCart'
  | 'Booking'
  | 'CompleteRegistration'
  // Product funnel events (observability.md "Key events to track"). These are
  // NOT Meta standard events, so they route via fbq('trackCustom', ...).
  | 'booking_started'
  | 'booking_step_completed'
  | 'booking_request_submitted'
  | 'lead_form_submitted'
  | 'offer_clicked'

/**
 * Meta Pixel standard events. Anything in this set is forwarded to `fbq` via
 * `'track'`; everything else uses `'trackCustom'`.
 */
const META_STANDARD_EVENTS = new Set<AnalyticsEvent>([
  'PageView',
  'Lead',
  'InitiateCheckout',
  'AddToCart',
  'CompleteRegistration',
])

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, props?: Record<string, unknown>) => void
    }
    fbq?: (...args: unknown[]) => void
  }
}

/**
 * Forward an analytics event to every loaded provider. Each provider call is
 * independently guarded so a missing or throwing provider never affects the
 * others or the caller.
 */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.posthog?.capture(event, props)
  } catch {
    // Swallow provider errors — analytics must never break the app.
  }

  try {
    if (window.fbq) {
      const method = META_STANDARD_EVENTS.has(event) ? 'track' : 'trackCustom'
      window.fbq(method, event, props)
    }
  } catch {
    // Swallow provider errors — analytics must never break the app.
  }
}
