/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : CookiePreferencesButton
 * Scope        : Cookie Consent UI
 *
 * Description  : Client wrapper for the footer "Cookie Preferences" control.
 *                Dispatches event to re-open the consent banner.
 *
 * Responsibilities :
 * - Dispatch OPEN_PREFERENCES_EVENT on window when clicked
 * - Keep the Footer component a server component
 *
 * Features / Functionality :
 * - "Cookie Preferences" button with emoji and hover styling
 * - Event dispatch to re-open CookieConsent banner
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS
 * Layer        : Frontend
 *
 * Dependencies : @/components/consent/CookieConsent
 *
 * Notes        : None
 ************************************************************/

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
