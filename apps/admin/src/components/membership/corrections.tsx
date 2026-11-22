'use client'

import Link from 'next/link'
import { type FormEvent, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTimeIST } from '@/lib/admin/format'
import type { CorrectionTarget, MembershipCorrection } from '@/lib/admin/memberships'
import { toast } from '@/lib/admin/toast'

export function CorrectionHistory({
  corrections,
  showInvoiceLinks = false,
}: {
  corrections: readonly MembershipCorrection[]
  showInvoiceLinks?: boolean
}) {
  const heading = useId()
  if (corrections.length === 0) return null

  return (
    <section
      aria-labelledby={heading}
      className="space-y-3 rounded-cards border border-cloud-gray bg-canvas-white p-5"
    >
      <h2 id={heading} className="font-ui font-medium text-cocoa-dark">
        Membership balance corrections
      </h2>
      <ul className="divide-y divide-cloud-gray">
        {corrections.map((correction) => (
          <li key={correction.id} className="space-y-1 py-3 font-sans text-sm text-warm-gray">
            <p className="font-medium text-cocoa-dark">
              {correction.availableMinutesDelta > 0 ? '+' : ''}
              {correction.availableMinutesDelta} available minutes
            </p>
            <p>{correction.reason}</p>
            {correction.evidenceReference && (
              <p className="break-words">Evidence reference: {correction.evidenceReference}</p>
            )}
            <p className="text-xs text-dusty-gray">
              {formatDateTimeIST(correction.performedAt)}
              {correction.performedByName ? ` · ${correction.performedByName}` : ''}
              {showInvoiceLinks && (
                <>
                  {' · '}
                  <Link
                    className="text-deep-gold underline"
                    href={`/billing/${encodeURIComponent(correction.originalInvoiceId)}`}
                  >
                    {correction.invoiceNumber}
                  </Link>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function MembershipCorrectionForm({
  target,
  onSaved,
}: {
  target: CorrectionTarget
  onSaved: () => void
}) {
  const labelId = useId()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const pendingRequest = useRef(false)
  const operation = useRef<{ payload: string; key: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pendingRequest.current) return

    const form = event.currentTarget
    const fields = new FormData(form)
    const availableMinutesDelta = Number(fields.get('availableMinutesDelta'))
    if (!Number.isInteger(availableMinutesDelta) || availableMinutesDelta === 0) {
      setError('Enter a nonzero number of whole minutes.')
      return
    }

    const { branchId, membershipId, bookingId, originalInvoiceId } = target
    const evidenceReference = String(fields.get('evidenceReference') ?? '').trim()
    const input = {
      branchId,
      membershipId,
      bookingId,
      originalInvoiceId,
      availableMinutesDelta,
      reason: String(fields.get('reason') ?? '').trim(),
      ...(evidenceReference ? { evidenceReference } : {}),
    }
    const payload = JSON.stringify(input)
    if (operation.current?.payload !== payload) {
      operation.current = { payload, key: crypto.randomUUID() }
    }

    pendingRequest.current = true
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/memberships/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, idempotencyKey: operation.current.key }),
      })
      const reply = await response.json().catch(() => null)
      if (!response.ok || !reply?.success) {
        throw new Error(reply?.error?.message ?? 'Could not save the correction.')
      }

      form.reset()
      operation.current = null
      toast.success('Membership balance corrected')
      onSaved()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the correction.')
    } finally {
      pendingRequest.current = false
      setSubmitting(false)
    }
  }

  return (
    <section
      aria-labelledby={labelId}
      className="max-w-2xl space-y-3 rounded-cards border border-cloud-gray bg-canvas-white p-5"
    >
      <h2 id={labelId} className="font-ui font-medium text-cocoa-dark">
        Correct the membership balance
      </h2>
      <p className="font-sans text-sm text-warm-gray">
        This entry adjusts available minutes at {target.branchName}. The original session and
        invoice remain in the record.
      </p>
      <form className="space-y-3" onSubmit={submit}>
        <fieldset className="space-y-3" disabled={submitting}>
          <div className="space-y-1">
            <Label htmlFor={`${labelId}-minutes`}>Available minutes change</Label>
            <Input
              aria-describedby={`${labelId}-direction`}
              id={`${labelId}-minutes`}
              name="availableMinutesDelta"
              type="number"
              min={-480}
              max={480}
              step={1}
              required
            />
            <p id={`${labelId}-direction`} className="font-sans text-xs text-dusty-gray">
              Enter a positive number to restore minutes or a negative number to deduct them.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${labelId}-reason`}>Reason for correction</Label>
            <Textarea
              id={`${labelId}-reason`}
              name="reason"
              minLength={10}
              maxLength={500}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${labelId}-evidence`}>Evidence reference (optional)</Label>
            <Input id={`${labelId}-evidence`} name="evidenceReference" maxLength={500} />
          </div>
        </fieldset>
        {error && (
          <p className="font-sans text-sm text-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save correction'}
        </Button>
      </form>
    </section>
  )
}
