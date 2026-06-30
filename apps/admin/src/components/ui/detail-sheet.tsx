/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : ui/detail-sheet
 * Scope        : Admin — Right-edge detail panel
 *
 * Description  : Right-edge slide-over detail panel for the admin design
 *                system, composing the owned-source shadcn `Sheet`
 *                (Radix Dialog). Used for `[id]` detail inspection where a
 *                slide-over improves flow over a full-page navigation. Radix
 *                supplies the focus trap, focus return to the opener, `Esc` /
 *                backdrop close, scroll lock, and `role="dialog"` +
 *                `aria-modal` for free; the panel slides in from the right over
 *                a dimming backdrop and the slide is neutralised under
 *                `prefers-reduced-motion` by the shared reduced-motion base
 *                rule in `@rgss/ui/theme.css`.
 *
 * Responsibilities :
 * - Present a controlled (open / onOpenChange) right-edge dialog panel
 * - Expose an accessible name via `SheetTitle` and optional `SheetDescription`
 * - Provide a scrollable body and an optional footer region
 *
 * Tech Stack   : React (Client Component), shadcn Sheet (Radix Dialog),
 *                Tailwind CSS v4 (Brand Tokens), TypeScript
 * Layer        : Presentation (primitive, no I/O, no business logic)
 *
 * Dependencies : @/components/ui/sheet
 *
 * Notes        : Replaces the hand-rolled `slide-over-panel.tsx`, which is now
 *                a thin re-export shim so existing import sites keep working.
 *                Req 15.1–15.8.
 ************************************************************/

'use client'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { type ReactNode, useRef } from 'react'

/**
 * Props for {@link DetailSheet}. Mirrors the legacy `SlideOverPanelProps` so
 * existing call sites migrate without change.
 */
export type DetailSheetProps = {
  /** Whether the panel is open (controlled). */
  open: boolean
  /** Called when Radix requests an open-state change (toggle / Esc / backdrop). */
  onOpenChange: (open: boolean) => void
  /** Accessible name rendered as the panel heading via `SheetTitle`. */
  title: string
  /** Optional supporting description rendered via `SheetDescription`. */
  description?: string | undefined
  /** Panel body content. */
  children: ReactNode
  /** Optional footer region (e.g. action buttons). */
  footer?: ReactNode
}

/**
 * A right-edge slide-over dialog panel built on the shadcn `Sheet`.
 *
 * Presentation-only: no I/O, no business logic.
 *
 * @param props - {@link DetailSheetProps}
 * @returns The rendered detail sheet.
 */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: DetailSheetProps) {
  // The control that opened the panel, captured on the closed→open transition
  // so focus can be returned to it on close. This panel is controlled (no
  // Radix SheetTrigger), so Radix has no trigger to restore focus to — we
  // restore the captured opener explicitly via onCloseAutoFocus (Req 15.5).
  const openerRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  if (open && !wasOpenRef.current && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null
  }
  wasOpenRef.current = open

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 border-l border-cloud-gray bg-canvas-white p-0 sm:max-w-md"
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current
          if (opener && typeof opener.focus === 'function') {
            event.preventDefault()
            opener.focus()
          }
        }}
      >
        <SheetHeader className="gap-1 border-b border-cloud-gray p-5">
          <SheetTitle className="font-display text-lg tracking-tight text-cocoa-dark">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="font-sans text-sm text-warm-gray">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {footer ? (
          <SheetFooter className="border-t border-cloud-gray p-5">{footer}</SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
