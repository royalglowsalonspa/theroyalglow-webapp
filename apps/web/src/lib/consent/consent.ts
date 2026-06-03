/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : consent
 * Scope        : Cookie Consent
 *
 * Description  : Cookie consent core logic (2-tier: necessary always-on +
 *                opt-in analytics/marketing). Pure and SSR-safe.
 *
 * Responsibilities :
 * - Read/write consent state from localStorage
 * - Dispatch custom event on consent changes for provider loading
 * - Provide accept-all / reject-all convenience methods
 * - Guarantee SSR safety (no bare window/localStorage access)
 *
 * Features / Functionality :
 * - getConsent() / setConsent() — read/persist consent state
 * - acceptAll() / rejectNonEssential() — bulk consent actions
 * - CONSENT_EVENT — custom window event for consent change listeners
 *
 * Tech Stack   : TypeScript
 * Layer        : Frontend
 *
 * Dependencies : None
 *
 * Notes        : SSR-safe — no window/localStorage access at module top level
 ************************************************************/

/**
 * Cookie consent core (2-tier: necessary always-on + opt-in analytics/marketing).
 *
 * Pure and SSR-safe: there is NO `window`/`localStorage` access at module top
 * level. Every browser access is guarded so this module can be imported from
 * server components without crashing.
 */

export type ConsentState = {
  necessary: true
  analytics: boolean
  marketing: boolean
  decided: boolean
}

/** Event dispatched on `window` whenever consent changes. */
export const CONSENT_EVENT = 'rgss:consent-change'

/** `localStorage` key under which the consent state is persisted. */
export const CONSENT_STORAGE_KEY = 'rgss_cookie_consent'

/** The default state for a visitor who has not yet made a choice. */
function defaultConsent(): ConsentState {
  return { necessary: true, analytics: false, marketing: false, decided: false }
}

/** Coerce an unknown parsed value into a valid `ConsentState`. */
function coerceConsent(value: unknown): ConsentState {
  if (typeof value !== 'object' || value === null) {
    return defaultConsent()
  }

  const record = value as Record<string, unknown>

  return {
    necessary: true,
    analytics: record.analytics === true,
    marketing: record.marketing === true,
    decided: record.decided === true,
  }
}

/**
 * Read the persisted consent state.
 *
 * Returns the undecided default when there is no `window`, no stored value, or
 * the stored value cannot be parsed.
 */
export function getConsent(): ConsentState {
  if (typeof window === 'undefined') {
    return defaultConsent()
  }

  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!stored) {
      return defaultConsent()
    }

    return coerceConsent(JSON.parse(stored))
  } catch {
    return defaultConsent()
  }
}

/**
 * Persist a consent choice. Forces `necessary: true` and marks the state as
 * `decided`, writes it to `localStorage` (guarded), dispatches `CONSENT_EVENT`
 * so listeners (e.g. the analytics loader) can react, and returns the new state.
 */
export function setConsent(partial: {
  analytics?: boolean
  marketing?: boolean
}): ConsentState {
  const next: ConsentState = {
    necessary: true,
    analytics: partial.analytics ?? false,
    marketing: partial.marketing ?? false,
    decided: true,
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Ignore persistence failures (private mode, quota, disabled storage).
    }

    try {
      window.dispatchEvent(new Event(CONSENT_EVENT))
    } catch {
      // Ignore environments without an event constructor.
    }
  }

  return next
}

/** Grant all opt-in categories. */
export function acceptAll(): ConsentState {
  return setConsent({ analytics: true, marketing: true })
}

/** Reject every opt-in category, keeping only the necessary cookies. */
export function rejectNonEssential(): ConsentState {
  return setConsent({ analytics: false, marketing: false })
}
