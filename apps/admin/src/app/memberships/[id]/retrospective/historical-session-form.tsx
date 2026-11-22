'use client'

import { HISTORICAL_SESSION_LOOKBACK_DAYS, HISTORICAL_SESSION_MAX_MINUTES } from '@rgss/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Option = { id: string; name: string }

export function HistoricalSessionForm({
  membershipId,
  membershipNumber,
  branchId,
  branchName,
  staff,
  services,
}: {
  membershipId: string
  membershipNumber: string
  branchId: string
  branchName: string
  staff: (Option & { active: boolean })[]
  services: Option[]
}) {
  const router = useRouter()
  const detailPath = `/memberships/${encodeURIComponent(membershipId)}`
  const nextRow = useRef(1)
  const operation = useRef<{ payload: string; key: string } | null>(null)
  const [rows, setRows] = useState([0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const form = new FormData(event.currentTarget)
    const input = {
      branchId,
      staffId: form.get('staffId'),
      actualStart: `${form.get('actualStart')}:00+05:30`,
      actualEnd: `${form.get('actualEnd')}:00+05:30`,
      reason: form.get('reason'),
      evidenceReference: form.get('evidenceReference'),
      services: rows.map((row) => ({
        serviceId: form.get(`service-${row}`),
        durationMinutes: Number(form.get(`minutes-${row}`)),
      })),
    }
    const payload = JSON.stringify(input)
    if (operation.current?.payload !== payload) {
      operation.current = { payload, key: crypto.randomUUID() }
    }

    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`/api${detailPath}/sessions/retrospective`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, idempotencyKey: operation.current.key }),
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error?.message ?? 'Could not record the session.')
      }
      router.push(detailPath)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not record the session.')
      setSubmitting(false)
    }
  }

  const selectClassName = 'w-full rounded-md border border-outline-gray bg-canvas-white px-3 py-2'

  return (
    <section className="max-w-2xl space-y-4">
      <Link href={detailPath} className="text-deep-gold">
        Back to membership
      </Link>
      <h1 className="font-display text-2xl text-cocoa-dark">Record a past session</h1>
      <p className="text-sm text-warm-gray">
        Membership {membershipNumber} · {branchName}
      </p>
      <p className="text-sm text-warm-gray">
        Record a session delivered in the last {HISTORICAL_SESSION_LOOKBACK_DAYS} days. Use IST and
        enter the reference you reviewed for the staff member’s eligibility at this branch.
      </p>
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="history-staff">Staff member</Label>
          <select className={selectClassName} id="history-staff" name="staffId" required>
            <option value="">Choose staff</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
                {person.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="history-start">Actual start (IST)</Label>
            <Input required type="datetime-local" id="history-start" name="actualStart" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="history-end">Actual end (IST)</Label>
            <Input required type="datetime-local" id="history-end" name="actualEnd" />
          </div>
        </div>
        <fieldset className="space-y-3">
          <legend className="font-medium">Services</legend>
          {rows.map((row) => (
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_auto]" key={row}>
              <div className="space-y-2">
                <Label htmlFor={`service-${row}`}>SPA service</Label>
                <select
                  required
                  className={selectClassName}
                  id={`service-${row}`}
                  name={`service-${row}`}
                >
                  <option value="">Choose service</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`minutes-${row}`}>Minutes</Label>
                <Input
                  required
                  id={`minutes-${row}`}
                  name={`minutes-${row}`}
                  type="number"
                  min={1}
                  max={HISTORICAL_SESSION_MAX_MINUTES}
                />
              </div>
              {rows.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRows((current) => current.filter((id) => id !== row))}
                >
                  Remove service
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={rows.length >= 16}
            onClick={() => {
              const row = nextRow.current++
              setRows((current) => [...current, row])
            }}
          >
            Add service
          </Button>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="history-evidence">Historical eligibility evidence reference</Label>
          <Input
            required
            minLength={5}
            maxLength={300}
            id="history-evidence"
            name="evidenceReference"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="history-reason">Reason for late entry</Label>
          <Textarea required minLength={10} maxLength={500} id="history-reason" name="reason" />
        </div>
        {error && (
          <p role="alert" className="text-error">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Recording…' : 'Record session'}
        </Button>
      </form>
    </section>
  )
}
