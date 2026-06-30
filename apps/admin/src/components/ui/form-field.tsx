import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Reusable labelled form field. Renders a brand-styled `Label` (associated to a
 * control via `htmlFor`), the control (children), an optional hint, and an
 * optional inline error. Replaces the per-file `Field` + `inputClass` helpers
 * so every admin form shares one consistent, accessible layout.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  /** Visible field label. */
  label: string
  /** Associates the label with the control's `id` (recommended for a11y). */
  htmlFor?: string
  /** Optional helper text shown beneath the control. */
  hint?: ReactNode
  /** Inline error message (also gives the control `aria-invalid` via the caller). */
  error?: string | null
  /** Appends a required asterisk to the label. */
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label
        htmlFor={htmlFor}
        className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray"
      >
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </Label>
      {children}
      {hint ? <p className="font-sans text-xs text-dusty-gray">{hint}</p> : null}
      {error ? (
        <p className="font-sans text-xs text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Shared Cancel / Submit action row for dialogs and forms. The submit button is
 * a real `type="submit"` so it works with native form submission.
 */
export function FormActions({
  busy,
  onCancel,
  submitLabel,
  busyLabel = 'Saving…',
}: {
  busy: boolean
  onCancel: () => void
  submitLabel: string
  busyLabel?: string
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy} aria-busy={busy}>
        {busy ? busyLabel : submitLabel}
      </Button>
    </div>
  )
}
