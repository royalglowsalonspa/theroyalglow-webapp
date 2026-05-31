'use client'

import { OPEN_PREFERENCES_EVENT } from '@/components/consent/CookieConsent'

/**
 * Tiny client wrapper for the footer "Cookie Preferences" control.
 *
 * Keeps the footer a server component: it dispatches the `OPEN_PREFERENCES_EVENT`
 * on `window` so the (client) `CookieConsent` banner re-opens after a choice has
 * already been made. Styling/classes and the aria-label match the original
 * inline footer button exactly.
 */
export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT))}
      className="mt-6 font-sans text-[15px] text-dusty-gray hover:text-canvas-white transition-colors duration-200"
      aria-label="Manage cookie preferences"
    >
      🍪 Cookie Preferences
    </button>
  )
}
