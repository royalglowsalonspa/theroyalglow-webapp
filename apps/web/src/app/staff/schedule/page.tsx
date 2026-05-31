import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth-server'
import { formatTime12h } from '@/lib/admin/bookings'
import { dayOfWeekLabel } from '@rgss/business'
import { getStaffProfileByUserId, getStaffSchedule } from '@rgss/db/queries'

export const metadata: Metadata = {
  title: 'My Schedule',
  description: 'Your weekly working hours at Royal Glow.',
}

type ScheduleRow = Awaited<ReturnType<typeof getStaffSchedule>>[number]

// Days of the week in display order (0=Sun … 6=Sat).
const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6] as const

// `time` columns come back as "HH:MM" or "HH:MM:SS"; trim to a value
// formatTime12h understands, or return null when the slot is empty.
function displayTime(value: string | null): string | null {
  if (!value) return null
  return formatTime12h(value)
}

export default async function StaffSchedulePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/sign-in')
  }

  const staff = await getStaffProfileByUserId(session.user.id)
  const schedule = staff ? await getStaffSchedule(staff.id) : []

  const byDay = new Map<number, ScheduleRow>()
  for (const row of schedule) {
    byDay.set(row.dayOfWeek, row)
  }

  return (
    <div>
      <header className="mb-8">
        <p className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-2">
          Your working hours
        </p>
        <h1 className="font-display text-[clamp(28px,5vw,40px)] text-cocoa-dark tracking-tight leading-[1.05]">
          My Schedule
        </h1>
      </header>

      {!staff ? (
        <NoProfileState />
      ) : (
        <section aria-labelledby="weekly-schedule-heading">
          <h2 id="weekly-schedule-heading" className="sr-only">
            Weekly schedule
          </h2>
          <ul className="space-y-3">
            {DAY_INDICES.map((dayIndex) => {
              const row = byDay.get(dayIndex)
              const working = row?.isWorking ?? false
              const start = displayTime(row?.startTime ?? null)
              const end = displayTime(row?.endTime ?? null)
              const hasHours = working && start && end

              return (
                <li key={dayIndex}>
                  <article className="flex items-center justify-between gap-3 rounded-[6px] border border-cloud-gray bg-canvas-white px-4 py-3">
                    <span className="font-sans text-[15px] text-cocoa-dark">
                      {dayOfWeekLabel(dayIndex)}
                    </span>
                    {hasHours ? (
                      <span className="font-ui text-[14px] text-deep-gold whitespace-nowrap">
                        {start} – {end}
                      </span>
                    ) : (
                      <span className="font-ui text-[12px] uppercase tracking-[0.5px] text-warm-stone whitespace-nowrap">
                        Off
                      </span>
                    )}
                  </article>
                </li>
              )
            })}
          </ul>

          <p className="font-sans text-[13px] text-dusty-gray mt-5">
            Your schedule is set by your manager. To request a change, speak to
            the front desk.
          </p>
        </section>
      )}
    </div>
  )
}

function NoProfileState() {
  return (
    <section className="flex flex-col items-center justify-center rounded-[6px] border border-cloud-gray bg-canvas-white py-16 px-6 text-center">
      <p className="font-sans text-[16px] text-cocoa-dark mb-2">
        No staff profile found
      </p>
      <p className="font-sans text-[14px] text-dusty-gray max-w-[420px]">
        Your account isn't linked to a staff profile yet. Ask your manager to
        set this up so your schedule and leave appear here.
      </p>
    </section>
  )
}
