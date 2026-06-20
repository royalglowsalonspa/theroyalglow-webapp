/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : ReconnectIndicator
 * Scope        : Realtime UI
 *
 * Description  : Small accessible banner shown when the realtime connection is
 *                lost and the client is attempting to reconnect (Req 8.5).
 *                Rendered by RealtimeProvider; surfaces within 2s of a
 *                connection loss and hides automatically on recovery.
 *
 * Responsibilities :
 * - Render a visible "reconnecting" banner while disconnected
 * - Announce status changes to assistive tech (aria-live)
 * - Render nothing while connected / unavailable
 *
 * Features / Functionality :
 * - Fixed bottom banner with animated pulse dot
 * - prefers-reduced-motion respected (pulse only when motion allowed)
 *
 * Tech Stack   : React (Client Component), TypeScript, Tailwind CSS
 * Layer        : Presentation (Realtime UI)
 *
 * Dependencies : none
 *
 * Notes        : Styling uses the shared design tokens (cocoa-dark, deep-gold,
 *                canvas-white) consistent with NotificationBell.
 ************************************************************/

'use client'

type ReconnectIndicatorProps = {
  /** Whether the realtime connection is currently lost / reconnecting. */
  reconnecting: boolean
}

export function ReconnectIndicator({ reconnecting }: ReconnectIndicatorProps) {
  // role="status" + aria-live="polite" so the banner is announced when it
  // appears without stealing focus. Always mounted so the live region exists
  // before the message changes; visually hidden when connected.
  return (
    <output
      aria-live="polite"
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transition-opacity duration-200 ${
        reconnecting ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {reconnecting && (
        <div className="flex items-center gap-2 rounded-full border border-cloud-gray bg-cocoa-dark px-4 py-2 shadow-xl">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-deep-gold motion-safe:animate-pulse"
            aria-hidden="true"
          />
          <span className="font-ui text-xs text-canvas-white">Reconnecting to live updates…</span>
        </div>
      )}
    </output>
  )
}
