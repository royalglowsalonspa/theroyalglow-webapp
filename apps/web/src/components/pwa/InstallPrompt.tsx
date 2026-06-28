/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : InstallPrompt
 * Scope        : PWA
 *
 * Description  : Accessible, dismissible "Install app" affordance driven by the
 *                browser `beforeinstallprompt` event. Captures and stashes the
 *                event, shows a tasteful banner using the site's design tokens,
 *                and triggers the native install flow on click.
 *
 * Responsibilities :
 * - Capture `beforeinstallprompt`, preventDefault, and stash the event
 * - Render a dismissible install banner only when installation is available
 * - Trigger prompt() + await userChoice on click, then hide
 * - Persist a dismissal so the prompt does not nag across visits
 * - Render nothing when unsupported / already installed / not yet eligible
 *
 * Features / Functionality :
 * - localStorage-persisted dismissal (best-effort, never throws)
 * - Hides automatically on the `appinstalled` event
 * - Respects prefers-reduced-motion (motion-safe: transitions only)
 *
 * Tech Stack   : React (Client Component), TypeScript, Tailwind CSS v4
 * Layer        : Presentation (PWA)
 *
 * Dependencies : React
 *
 * Notes        : 'use client'. All window/navigator access lives inside effects
 *                so the component is SSR-safe. WCAG 2.1 AA: real <button>s,
 *                labelled region, visible focus rings, dismiss control.
 ************************************************************/

'use client'

import { useCallback, useEffect, useState } from 'react'

// Minimal local typing for the non-standard `beforeinstallprompt` event — it is
// not in the DOM lib. We only use prompt() and userChoice.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// localStorage key recording that the user dismissed (or accepted) the prompt,
// so we never nag again on subsequent visits.
const DISMISSED_KEY = 'rgss:pwa-install-dismissed'

// Best-effort read of the dismissal flag. Never throws (private mode / disabled
// storage) — a failure simply means "not dismissed".
function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

// Best-effort persist of the dismissal flag.
function persistDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Ignore — dismissal just won't persist across reloads.
  }
}

// True when the app is already running as an installed PWA (standalone display
// mode, or the iOS Safari `navigator.standalone` flag). No point prompting then.
function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const mql = window.matchMedia?.('(display-mode: standalone)')
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return Boolean(mql?.matches) || iosStandalone
}

export function InstallPrompt() {
  // The stashed install event. null until the browser deems the app installable
  // (and stays null on unsupported browsers) — the banner only renders when set.
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  // Drives the show/hide transition independently of the captured event.
  const [visible, setVisible] = useState(false)
  // Guards the button while the native dialog is open.
  const [installing, setInstalling] = useState(false)

  // ── Capture beforeinstallprompt (SSR-safe: window access in effect) ──────
  useEffect(() => {
    // Already installed or previously dismissed → never show.
    if (isStandalone() || wasDismissed()) {
      return
    }

    function onBeforeInstallPrompt(event: Event) {
      // Prevent the browser's default mini-infobar so we can present our own
      // tasteful affordance, and stash the event for a later prompt() call.
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setVisible(true)
    }

    function onAppInstalled() {
      // Installed (via our button or the browser UI) → hide and remember.
      persistDismissed()
      setVisible(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  // Trigger the native install flow, then hide regardless of the user's choice.
  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return
    }
    setInstalling(true)
    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } catch {
      // The prompt can only be used once; any failure just closes our banner.
    } finally {
      // A deferred prompt is single-use — drop it and remember the interaction.
      persistDismissed()
      setVisible(false)
      setDeferredPrompt(null)
      setInstalling(false)
    }
  }, [deferredPrompt])

  // Dismiss without installing — persist so we don't nag again.
  const handleDismiss = useCallback(() => {
    persistDismissed()
    setVisible(false)
    setDeferredPrompt(null)
  }, [])

  // Nothing to show until the browser fires beforeinstallprompt.
  if (!(visible && deferredPrompt)) {
    return null
  }

  return (
    <section
      aria-label="Install Royal Glow app"
      className={`fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-[10px] border border-cloud-gray bg-canvas-white p-4 shadow-card-hover motion-safe:transition-opacity duration-200 sm:left-auto sm:right-4 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warm-cream"
          aria-hidden="true"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"
              stroke="#C8A961"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-display text-[16px] text-cocoa-dark leading-snug">
            Install Royal Glow
          </p>
          <p className="mt-0.5 font-sans text-[13px] text-warm-gray">
            Add our app to your home screen for faster booking and a full-screen experience.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              aria-busy={installing}
              className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full bg-royal-gold px-5 py-2 text-cocoa-dark hover:bg-deep-gold motion-safe:transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal-gold/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {installing ? 'Installing…' : 'Install app'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-4 py-2 text-warm-gray hover:text-cocoa-dark motion-safe:transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal-gold/40"
            >
              Not now
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="-mt-1 -mr-1 shrink-0 rounded-full p-1.5 text-warm-stone hover:text-cocoa-dark motion-safe:transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal-gold/40"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </section>
  )
}
