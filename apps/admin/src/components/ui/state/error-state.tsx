/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : state/error-state
 * Scope        : Admin — State Presenters / Error State
 *
 * Description  : Error-state presenter for the admin design system. Shown when
 *                a data view fails to load (non-2xx, network failure, or
 *                timeout). Renders an error message plus a retry control, and
 *                announces the failure to assistive technology via an assertive
 *                live region.
 *
 * Responsibilities :
 * - Render an error message and a retry control (Req 12.3)
 * - Invoke `onRetry` when the retry control is activated (Req 12.4, 12.5)
 * - Announce the error assertively via `role="alert"` (Req 12.8)
 *
 * Features / Functionality :
 * - ErrorState — message + retry presenter
 *
 * Tech Stack   : React, TypeScript, lucide-react, Tailwind CSS v4 (Brand Tokens)
 * Layer        : Presentation (primitive, no I/O, no business logic)
 *
 * Dependencies : ../icon, @rgss/ui/lib/utils
 *
 * Notes        : Uses ONLY semantic Brand-Token utilities — no hex / raw
 *                colour literals (Req 1.2). All rendered message strings are
 *                treated as untrusted text (no `dangerouslySetInnerHTML`).
 *                The transition back to the loading state is owned by the
 *                caller's retry handler (e.g. `useAsyncData`).
 ************************************************************/

import { cn } from '@rgss/ui/lib/utils'
import { RotateCcw } from 'lucide-react'
import { Icon } from '../icon'

type ErrorStateProps = {
  /** Human-readable failure message (API message or generic fallback). */
  message: string
  /** Invoked when the retry control is activated; re-requests the data. */
  onRetry: () => void
  className?: string
}

/**
 * Error-state presenter.
 *
 * Rendered when a view fails to load. The wrapper uses `role="alert"`, an
 * assertive live region, so assistive technology announces the failure
 * immediately (Req 12.8). The retry button invokes `onRetry`, which re-requests
 * the data and returns the view to its loading state (Req 12.3, 12.4, 12.5).
 *
 * Presentation-only: no I/O, no business logic.
 *
 * @param props - {@link ErrorStateProps}
 * @returns The rendered error state.
 */
export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[6px] border border-error/30 bg-error/5 px-6 py-12 text-center',
        className,
      )}
      role="alert"
    >
      <p className="max-w-prose font-sans text-sm text-warm-gray">{message}</p>
      <button
        className="inline-flex items-center gap-2 rounded-[8px] border border-outline-gray bg-canvas-white px-4 py-2 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray"
        onClick={onRetry}
        type="button"
      >
        <Icon decorative icon={RotateCcw} size={16} />
        Retry
      </button>
    </div>
  )
}
