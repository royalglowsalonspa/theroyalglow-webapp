/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : slide-over-panel
 * Scope        : Admin — SlideOverPanel primitive
 *
 * Description  : Right-edge slide-over panel for the admin design system,
 *                built on `@radix-ui/react-dialog`. Renders supplied content
 *                in a fixed panel anchored to the viewport's right edge over a
 *                dimming backdrop. Used for `[id]` detail inspection where a
 *                slide-over improves flow over a full page navigation.
 *
 * Responsibilities :
 * - Present a controlled (open / onOpenChange) right-edge dialog panel
 * - Slide the panel in from the right within ~300 ms over a backdrop
 * - Expose an accessible name via Dialog.Title and optional Dialog.Description
 * - Provide a labelled close control
 *
 * Features / Functionality :
 * - Radix Dialog supplies focus trap, focus return to trigger, Esc / backdrop
 *   close, scroll lock, and role="dialog" + aria-modal for free (Req 11.3–11.7)
 * - 300 ms slide / fade transitions gated by `motion-reduce:transition-none`
 *   so reduced-motion users get no slide (Req 11.8)
 * - Optional footer region for actions
 *
 * Tech Stack   : React, TypeScript, @radix-ui/react-dialog, Tailwind CSS v4
 * Layer        : Presentation (primitive, no I/O, no business logic)
 *
 * Dependencies : @radix-ui/react-dialog, lucide-react (X), @/components/ui/icon,
 *                @rgss/ui/lib/utils
 *
 * Notes        : Uses ONLY semantic Brand-Token utilities — no hex / raw
 *                Tailwind-palette literals (Req 1.2). 'use client' required for
 *                the controlled dialog interactivity.
 ************************************************************/

'use client'

import { Icon } from '@/components/ui/icon'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@rgss/ui/lib/utils'
import { X } from 'lucide-react'
import { useRef } from 'react'

/**
 * Props for {@link SlideOverPanel}.
 */
export type SlideOverPanelProps = {
  /** Whether the panel is open (controlled). */
  open: boolean
  /** Called when Radix requests an open-state change (toggle / Esc / backdrop). */
  onOpenChange: (open: boolean) => void
  /** Accessible name rendered as the panel heading via `Dialog.Title` (Req 11.7). */
  title: string
  /**
   * Optional supporting description rendered via `Dialog.Description`.
   *
   * Explicitly admits `undefined` so call sites under `exactOptionalPropertyTypes`
   * may forward an optional value (e.g. `description={maybeUndefined}`) without a
   * conditional spread.
   */
  description?: string | undefined
  /** Panel body content. */
  children: React.ReactNode
  /** Optional footer region (e.g. action buttons). */
  footer?: React.ReactNode
}

/**
 * A right-edge slide-over dialog panel.
 *
 * Built on `@radix-ui/react-dialog`, which provides the focus trap, focus
 * return to the trigger, `Esc` / backdrop close, scroll lock, and
 * `role="dialog"` + `aria-modal` semantics (Req 11.3–11.7). The content slides
 * in from the right over a dimming backdrop within ~300 ms; the slide / fade
 * transitions are gated by `motion-reduce:transition-none` so reduced-motion
 * users get no slide (Req 11.8).
 *
 * Presentation-only: no I/O, no business logic.
 *
 * @param props - {@link SlideOverPanelProps}
 * @returns The rendered slide-over panel.
 */
export function SlideOverPanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: SlideOverPanelProps) {
  // The control that opened the panel, captured at open time so focus can be
  // returned to it on close (Req 11.5). This panel is controlled and never
  // renders a `Dialog.Trigger`, so Radix's modal `onCloseAutoFocus` (which
  // targets the absent trigger) cannot restore focus on its own — we restore it
  // explicitly below.
  //
  // The opener is captured during render on the closed→open transition: the
  // panel is opened by the consumer setting `open` directly (not via a Radix
  // trigger), so `onOpenChange` does not fire on open. Capturing here — before
  // Radix's FocusScope (a descendant) moves focus into the panel in its mount
  // effect — records the still-focused opener rather than a control inside the
  // panel.
  const openerRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  if (open && !wasOpenRef.current && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null
  }
  wasOpenRef.current = open

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        {/* Dimming backdrop (Req 11.2) */}
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-cocoa-dark/40',
            'transition-opacity duration-300 ease-in-out motion-reduce:transition-none',
            'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
          )}
        />

        {/* Right-edge panel (Req 11.1) */}
        <Dialog.Content
          className={cn(
            'fixed right-0 inset-y-0 z-50 flex h-full w-full max-w-md flex-col',
            'bg-canvas-white border-l border-cloud-gray shadow-lg',
            'transition-transform duration-300 ease-in-out motion-reduce:transition-none',
            'data-[state=closed]:translate-x-full data-[state=open]:translate-x-0',
          )}
          onCloseAutoFocus={(event) => {
            // Return focus to the control that opened the panel (Req 11.5).
            // Radix's modal default focuses `triggerRef`, which is null here
            // (no Dialog.Trigger), so we restore the captured opener instead.
            const opener = openerRef.current
            if (opener && typeof opener.focus === 'function') {
              event.preventDefault()
              opener.focus()
            }
          }}
        >
          {/* Header: title + close control */}
          <div className="flex items-start justify-between gap-3 border-b border-cloud-gray px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-lg text-cocoa-dark tracking-tight">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 font-sans text-sm text-warm-gray">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>

            <Dialog.Close
              className="shrink-0 rounded-cards p-1.5 text-warm-gray transition-colors duration-150 hover:bg-cloud-gray motion-reduce:transition-none"
              aria-label="Close panel"
            >
              <Icon icon={X} decorative />
            </Dialog.Close>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {/* Optional footer */}
          {footer ? (
            <div className="border-t border-cloud-gray px-5 py-4">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
