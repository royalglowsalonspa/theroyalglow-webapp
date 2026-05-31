'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatTime12h } from '@/lib/admin/bookings'

// ─── API shapes (mirror GET /api/admin/schedule → apiSuccess({ dates, staff })) ───

interface ScheduleEntry {
  id: string
  staffId: string
  dayOfWeek: number
  startTime: string | null
  endTime: string | null
  isWorking: boolean
}

interface StaffWeekRow {
  staff: { id: string; userId: string; name: string }
  schedule: ScheduleEntry[]
  leaveDates: string[]
  bookingCountsByDate: Record<string, number>
}

interface GridData {
  dates: string[]
  staff: StaffWeekRow[]
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const DAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

// ─── Date helpers (UTC arithmetic so calendar dates never drift) ───

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function startOfWeekISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function dayOfWeekOf(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay()
}

function formatRangeLabel(weekStart: string): string {
  const end = addDaysISO(weekStart, 6)
  const s = new Date(`${weekStart}T00:00:00.000Z`)
  const e = new Date(`${end}T00:00:00.000Z`)
  const sLabel = `${s.getUTCDate()} ${MONTH_SHORT[s.getUTCMonth()]}`
  const eLabel = `${e.getUTCDate()} ${MONTH_SHORT[e.getUTCMonth()]} ${e.getUTCFullYear()}`
  return `${sLabel} – ${eLabel}`
}

// "HH:MM:SS" | "HH:MM" | null → "HH:MM" | '' (for <input type="time">).
function toHHMM(value: string | null): string {
  if (!value) {
    return ''
  }
  return value.slice(0, 5)
}

function workingHoursLabel(entry: ScheduleEntry | undefined): string | null {
  if (!entry || !entry.isWorking || !entry.startTime || !entry.endTime) {
    return null
  }
  return `${formatTime12h(entry.startTime)} – ${formatTime12h(entry.endTime)}`
}

// The 7-entry editor state, indexed by dayOfWeek 0..6.
type EditorEntry = { isWorking: boolean; startTime: string; endTime: string }

function buildEditorEntries(schedule: ScheduleEntry[]): EditorEntry[] {
  const byDay = new Map<number, ScheduleEntry>()
  for (const row of schedule) {
    byDay.set(row.dayOfWeek, row)
  }
  return Array.from({ length: 7 }, (_, day) => {
    const row = byDay.get(day)
    return {
      isWorking: row?.isWorking ?? false,
      startTime: toHHMM(row?.startTime ?? null),
      endTime: toHHMM(row?.endTime ?? null),
    }
  })
}

export function ScheduleGrid() {
  const [weekStart, setWeekStart] = useState(() => startOfWeekISO(todayISO()))
  const [data, setData] = useState<GridData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/schedule?weekStart=${weekStart}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load the schedule.')
      }
      setData(json.data as GridData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load the schedule.')
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => {
    load()
  }, [load])

  const goToday = () => setWeekStart(startOfWeekISO(todayISO()))
  const goPrev = () => setWeekStart((w) => addDaysISO(w, -7))
  const goNext = () => setWeekStart((w) => addDaysISO(w, 7))

  return (
    <div className="space-y-5">
      {/* Header + week navigator */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-cocoa-dark tracking-tight">
            Schedule
          </h1>
          <p className="font-sans text-sm text-dusty-gray mt-0.5">
            Week of {formatRangeLabel(weekStart)}
          </p>
        </div>

        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Change week"
        >
          <button
            type="button"
            onClick={goPrev}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-warm-gray hover:bg-cloud-gray transition-colors"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={goToday}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-cocoa-dark hover:bg-cloud-gray transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-warm-gray hover:bg-cloud-gray transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.staff.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-cloud-gray/60">
                  <th className="text-left px-4 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray sticky left-0 bg-cloud-gray/60 z-10">
                    Staff
                  </th>
                  {data.dates.map((date) => {
                    const dow = dayOfWeekOf(date)
                    const dayNum = new Date(`${date}T00:00:00.000Z`).getUTCDate()
                    return (
                      <th
                        key={date}
                        className="px-3 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray text-center whitespace-nowrap"
                      >
                        <span className="block text-cocoa-dark">
                          {DAY_SHORT[dow]}
                        </span>
                        <span className="block font-sans text-[11px] normal-case tracking-normal text-warm-stone">
                          {dayNum}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud-gray">
                {data.staff.map((row) => (
                  <StaffRow
                    key={row.staff.id}
                    row={row}
                    dates={data.dates}
                    isEditing={editingStaffId === row.staff.id}
                    onEdit={() => setEditingStaffId(row.staff.id)}
                    onCancel={() => setEditingStaffId(null)}
                    onSaved={() => {
                      setEditingStaffId(null)
                      load()
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StaffRow({
  row,
  dates,
  isEditing,
  onEdit,
  onCancel,
  onSaved,
}: {
  row: StaffWeekRow
  dates: string[]
  isEditing: boolean
  onEdit: () => void
  onCancel: () => void
  onSaved: () => void
}) {
  const scheduleByDay = useMemo(() => {
    const map = new Map<number, ScheduleEntry>()
    for (const entry of row.schedule) {
      map.set(entry.dayOfWeek, entry)
    }
    return map
  }, [row.schedule])

  const leaveSet = useMemo(() => new Set(row.leaveDates), [row.leaveDates])

  return (
    <>
      <tr className="hover:bg-cloud-gray/30 transition-colors align-top">
        <th
          scope="row"
          className="text-left px-4 py-3 font-sans text-cocoa-dark whitespace-nowrap sticky left-0 bg-canvas-white z-10"
        >
          <div className="flex items-center justify-between gap-3">
            <span>{row.staff.name}</span>
            {!isEditing && (
              <button
                type="button"
                onClick={onEdit}
                className="text-deep-gold hover:text-cocoa-dark text-xs font-ui transition-colors"
                aria-label={`Edit schedule for ${row.staff.name}`}
              >
                Edit
              </button>
            )}
          </div>
        </th>

        {dates.map((date) => {
          const dow = dayOfWeekOf(date)
          const entry = scheduleByDay.get(dow)
          const hours = workingHoursLabel(entry)
          const onLeave = leaveSet.has(date)
          const count = row.bookingCountsByDate[date] ?? 0

          return (
            <td key={date} className="px-3 py-3 text-center align-top">
              <div className="flex flex-col items-center gap-1">
                {onLeave && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-ui uppercase tracking-[0.5px] text-red-700">
                    Leave
                  </span>
                )}
                {hours ? (
                  <span className="font-ui text-[12px] text-deep-gold whitespace-nowrap">
                    {hours}
                  </span>
                ) : (
                  <span className="font-ui text-[11px] uppercase tracking-[0.5px] text-warm-stone">
                    Off
                  </span>
                )}
                {count > 0 && (
                  <span className="font-sans text-[11px] text-warm-gray">
                    {count} booking{count === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </td>
          )
        })}
      </tr>

      {isEditing && (
        <tr>
          <td colSpan={dates.length + 1} className="px-4 py-4 bg-warm-cream/40">
            <ScheduleEditor
              staffId={row.staff.id}
              staffName={row.staff.name}
              initialSchedule={row.schedule}
              onCancel={onCancel}
              onSaved={onSaved}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function ScheduleEditor({
  staffId,
  staffName,
  initialSchedule,
  onCancel,
  onSaved,
}: {
  staffId: string
  staffName: string
  initialSchedule: ScheduleEntry[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [entries, setEntries] = useState<EditorEntry[]>(() =>
    buildEditorEntries(initialSchedule),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const updateEntry = (day: number, patch: Partial<EditorEntry>) => {
    setEntries((prev) =>
      prev.map((entry, idx) => (idx === day ? { ...entry, ...patch } : entry)),
    )
  }

  // Mirror the server-side rule (assertValidScheduleEntry): a working day needs a
  // start and end with start < end. Surfaced inline before the PUT.
  const validationError = useMemo(() => {
    for (let day = 0; day < entries.length; day++) {
      const e = entries[day]
      if (!e || !e.isWorking) {
        continue
      }
      if (!e.startTime || !e.endTime) {
        return `${DAY_LONG[day]}: set both a start and end time.`
      }
      if (e.startTime >= e.endTime) {
        return `${DAY_LONG[day]}: start time must be before end time.`
      }
    }
    return null
  }, [entries])

  const save = async () => {
    if (validationError) {
      setSaveError(validationError)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        staffId,
        entries: entries.map((e, day) => ({
          dayOfWeek: day,
          isWorking: e.isWorking,
          startTime: e.isWorking ? e.startTime : null,
          endTime: e.isWorking ? e.endTime : null,
        })),
      }
      const res = await fetch('/api/admin/schedule', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not save the schedule.')
      }
      onSaved()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the schedule.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-ui text-sm text-cocoa-dark">
        Edit weekly schedule — {staffName}
      </h3>

      <ul className="space-y-2">
        {entries.map((entry, day) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: index IS the dayOfWeek (0..6), a stable key
          <li key={day} className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 w-[150px] shrink-0 font-sans text-sm text-cocoa-dark">
              <input
                type="checkbox"
                checked={entry.isWorking}
                onChange={(e) => updateEntry(day, { isWorking: e.target.checked })}
                className="h-4 w-4 rounded border-outline-gray text-deep-gold focus:ring-deep-gold"
              />
              {DAY_LONG[day]}
            </label>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5">
                <span className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
                  From
                </span>
                <input
                  type="time"
                  value={entry.startTime}
                  disabled={!entry.isWorking}
                  onChange={(e) => updateEntry(day, { startTime: e.target.value })}
                  className="h-9 px-2 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={`${DAY_LONG[day]} start time`}
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
                  To
                </span>
                <input
                  type="time"
                  value={entry.endTime}
                  disabled={!entry.isWorking}
                  onChange={(e) => updateEntry(day, { endTime: e.target.value })}
                  className="h-9 px-2 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={`${DAY_LONG[day]} end time`}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>

      {(saveError || validationError) && (
        <p className="font-sans text-sm text-error" role="alert">
          {saveError ?? validationError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-9 px-4 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save schedule'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-9 px-4 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-warm-gray hover:bg-cloud-gray transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      role="status"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading schedule…</span>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="border border-error/40 bg-error/5 rounded-[6px] px-5 py-10 text-center">
      <p className="font-sans text-sm text-error mb-3" role="alert">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors"
      >
        Try Again
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 text-center">
      <p className="font-sans text-sm text-cocoa-dark mb-1">No active staff</p>
      <p className="font-sans text-xs text-dusty-gray">
        Add staff members to manage their weekly schedules.
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-deep-gold"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
