/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : CookieConsent
 * Scope        : Cookie Consent UI
 *
 * Description  : Cookie consent banner — a slim, brand-aligned bottom bar
 *                (adapted from the shadcn-space "cookie-consent-01" block).
 *                The collapsed bar is accept-forward: a cookie chip + short
 *                consent sentence on the left, a settings (preferences) icon
 *                button + a single "Accept" button on the right. There is NO
 *                prominent "Reject all" button; granular opt-out (analytics /
 *                marketing) remains available behind the settings button so the
 *                2-tier DPDP consent model is preserved.
 *
 * Responsibilities :
 * - Show the bar for undecided visitors; animate entry (translate+opacity)
 * - Accept-all from the bar; per-category opt-in via the settings panel
 * - Re-open (with the settings panel) via OPEN_PREFERENCES_EVENT (footer button)
 * - Render accessible role=switch toggles for each consent category
 *
 * Features / Functionality :
 * - 2-tier consent: necessary (always on) + analytics + marketing
 * - Settings panel with accessible toggles + "Save selection"
 * - Privacy Policy link in the bar copy
 * - Persistent state via lib/consent/consent.ts
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS (brand tokens, no extra deps)
 * Layer        : Frontend
 *
 * Dependencies : @/lib/consent/consent, @/lib/utils, next/link
 *
 * Notes        : Icons are inlined SVGs (the web app does not depend on
 *                lucide-react). Colours use Royal Glow Brand Tokens only.
 ************************************************************/

'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { acceptAll, type ConsentState, getConsent, setConsent } from '@/lib/consent/consent'
import { cn } from '@/lib/utils'

/**
 * Custom `window` event the footer "Cookie Preferences" button dispatches to
 * re-open this banner (with the settings panel) after a choice has been made.
 */
export const OPEN_PREFERENCES_EVENT = 'rgss:open-cookie-preferences'

/** Inline cookie glyph (lucide "cookie" geometry) — sized via `className`. */
function CookieIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
      <path d="M8.5 8.5v.01" />
      <path d="M16 15.5v.01" />
      <path d="M12 12v.01" />
      <path d="M11 17v.01" />
      <path d="M7 14v.01" />
    </svg>
  )
}

/** Inline sliders glyph (lucide "settings-2" geometry) — sized via `className`. */
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 7h-9" />
      <path d="M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </svg>
  )
}

type SwitchProps = {
  id: string
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onToggle?: (next: boolean) => void
}

/** A small accessible on/off switch built from a real `<button>` (light theme). */
function ConsentSwitch({
  id,
  label,
  description,
  checked,
  disabled = false,
  onToggle,
}: SwitchProps) {
  const labelId = `${id}-label`
  const descriptionId = `${id}-description`

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <span id={labelId} className="block font-ui text-sm text-cocoa-dark">
          {label}
        </span>
        <span
          id={descriptionId}
          className="mt-0.5 block font-sans text-[13px] leading-[1.5] text-warm-gray"
        >
          {description}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onToggle?.(!checked)}
        className={cn(
          'relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-gold',
          disabled
            ? 'cursor-not-allowed border-transparent bg-royal-gold/40'
            : 'cursor-pointer border-transparent',
          !disabled && checked ? 'bg-royal-gold' : '',
          !disabled && !checked ? 'border-outline-gray bg-cloud-gray' : '',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-canvas-white shadow-sm motion-safe:transition-transform motion-safe:duration-200',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  )
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const [entered, setEntered] = useState(false)
  const [showCustomise, setShowCustomise] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const regionRef = useRef<HTMLDivElement | null>(null)
  const focusOnOpenRef = useRef(false)
  const headingId = useId()
  const descriptionId = useId()

  // Mount: decide initial visibility from persisted consent and subscribe to
  // the "open preferences" signal so the footer button can re-open the banner.
  useEffect(() => {
    const current = getConsent()
    setAnalytics(current.analytics)
    setMarketing(current.marketing)
    if (!current.decided) {
      setVisible(true)
    }

    const handleOpenPreferences = () => {
      const latest: ConsentState = getConsent()
      setAnalytics(latest.analytics)
      setMarketing(latest.marketing)
      setShowCustomise(true)
      focusOnOpenRef.current = true
      setVisible(true)
    }

    window.addEventListener(OPEN_PREFERENCES_EVENT, handleOpenPreferences)
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, handleOpenPreferences)
  }, [])

  // Drive the entry transition once the banner is mounted.
  useEffect(() => {
    if (!visible) {
      setEntered(false)
      return
    }

    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [visible])

  // Move focus to the banner only when it is re-opened via the footer button,
  // so first-visit rendering never steals focus from the page.
  useEffect(() => {
    if (visible && focusOnOpenRef.current) {
      regionRef.current?.focus()
      focusOnOpenRef.current = false
    }
  }, [visible])

  if (!visible) {
    return null
  }

  const close = () => {
    setVisible(false)
    setShowCustomise(false)
  }

  const handleAccept = () => {
    acceptAll()
    close()
  }

  const handleSave = () => {
    setConsent({ analytics, marketing })
    close()
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center p-3 sm:p-4">
      <section
        ref={regionRef}
        aria-label="Cookie consent"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={cn(
          'pointer-events-auto w-full max-w-[1278px] rounded-2xl border border-outline-gray bg-canvas-white text-cocoa-dark shadow-elevated',
          'px-5 py-4 sm:px-6 sm:py-5',
          'motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out',
          entered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        )}
      >
        <h2 id={headingId} className="sr-only">
          Cookie consent
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-4 md:flex-nowrap">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cloud-gray">
              <CookieIcon className="size-4 text-warm-gray" />
            </span>
            <p id={descriptionId} className="font-sans text-sm text-warm-gray sm:text-base">
              By clicking accept, you consent to our use of cookies.{' '}
              <Link
                href="/privacy"
                className="text-royal-gold underline underline-offset-2 transition-colors duration-200 hover:text-warm-gold"
              >
                Learn more
              </Link>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-expanded={showCustomise}
              aria-controls={`${headingId}-options`}
              aria-label="Cookie settings"
              onClick={() => setShowCustomise((prev) => !prev)}
              className="inline-flex size-10 items-center justify-center rounded-full text-warm-gray transition-colors duration-200 hover:bg-cloud-gray hover:text-cocoa-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-gold"
            >
              <SettingsIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="inline-flex h-10 items-center justify-center rounded-full bg-cocoa-dark px-6 font-ui text-sm font-medium text-canvas-white transition-colors duration-200 hover:bg-cocoa-dark/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-gold"
            >
              Accept
            </button>
          </div>
        </div>

        {showCustomise ? (
          <div id={`${headingId}-options`} className="mt-4 border-t border-outline-gray pt-4">
            <div className="divide-y divide-outline-gray">
              <ConsentSwitch
                id="consent-necessary"
                label="Strictly necessary"
                description="Required for core features like security, sessions, and your booking flow. Always on."
                checked
                disabled
              />
              <ConsentSwitch
                id="consent-analytics"
                label="Analytics"
                description="Helps us understand how the site is used so we can improve it."
                checked={analytics}
                onToggle={setAnalytics}
              />
              <ConsentSwitch
                id="consent-marketing"
                label="Marketing"
                description="Used to measure campaigns and show you more relevant offers."
                checked={marketing}
                onToggle={setMarketing}
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex h-10 items-center justify-center rounded-full border border-outline-gray px-6 font-ui text-sm font-medium text-cocoa-dark transition-colors duration-200 hover:bg-cloud-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-gold"
              >
                Save selection
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
