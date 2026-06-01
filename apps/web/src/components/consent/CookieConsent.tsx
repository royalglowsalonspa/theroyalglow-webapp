'use client'

import {
  type ConsentState,
  acceptAll,
  getConsent,
  rejectNonEssential,
  setConsent,
} from '@/lib/consent/consent'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'

/**
 * Custom `window` event the footer "Cookie Preferences" button dispatches to
 * re-open this banner after a choice has already been made.
 */
export const OPEN_PREFERENCES_EVENT = 'rgss:open-cookie-preferences'

type SwitchProps = {
  id: string
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onToggle?: (next: boolean) => void
}

/** A small accessible on/off switch built from a real `<button>`. */
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
        <span id={labelId} className="block font-ui text-sm text-canvas-white">
          {label}
        </span>
        <span
          id={descriptionId}
          className="mt-0.5 block font-sans text-[13px] leading-[1.5] text-dusty-gray"
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
            ? 'cursor-not-allowed border-white/20 bg-white/20'
            : 'cursor-pointer border-transparent',
          !disabled && checked ? 'bg-royal-gold' : '',
          !disabled && !checked ? 'bg-white/15' : '',
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

  const handleAcceptAll = () => {
    acceptAll()
    close()
  }

  const handleReject = () => {
    rejectNonEssential()
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
          'pointer-events-auto w-full max-w-[1278px] rounded-[14px] border border-white/10 bg-cocoa-dark text-canvas-white shadow-elevated',
          'p-5 sm:p-6 lg:p-7',
          'motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out',
          entered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        )}
      >
        <div className="lg:flex lg:items-start lg:justify-between lg:gap-10">
          <div className="lg:max-w-2xl">
            <h2
              id={headingId}
              className="font-display text-lg tracking-tight text-canvas-white sm:text-xl"
            >
              We value your privacy
            </h2>
            <p
              id={descriptionId}
              className="mt-2 font-sans text-[15px] leading-[1.55] text-dusty-gray"
            >
              We use necessary cookies to make this site work. With your consent we also use
              analytics and marketing cookies to understand how the site is used and to improve our
              services. Read more in our{' '}
              <Link
                href="/privacy"
                className="text-royal-gold underline underline-offset-2 transition-colors duration-200 hover:text-warm-gold"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap lg:mt-0 lg:shrink-0 lg:flex-col">
            <button
              type="button"
              onClick={handleAcceptAll}
              className="inline-flex items-center justify-center rounded-full bg-royal-gold px-6 py-2.5 font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark transition-colors duration-200 hover:bg-warm-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-gold"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={handleReject}
              className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-2.5 font-ui text-xs uppercase tracking-[0.5px] text-canvas-white transition-colors duration-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-gold"
            >
              Reject non-essential
            </button>
            <button
              type="button"
              aria-expanded={showCustomise}
              aria-controls={`${headingId}-options`}
              onClick={() => setShowCustomise((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-full px-6 py-2.5 font-ui text-xs uppercase tracking-[0.5px] text-dusty-gray transition-colors duration-200 hover:text-canvas-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-gold"
            >
              {showCustomise ? 'Hide options' : 'Customise'}
            </button>
          </div>
        </div>

        {showCustomise ? (
          <div id={`${headingId}-options`} className="mt-5 border-t border-white/10 pt-4">
            <div className="divide-y divide-white/10">
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
                className="inline-flex items-center justify-center rounded-full bg-royal-gold px-6 py-2.5 font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark transition-colors duration-200 hover:bg-warm-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-gold"
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
