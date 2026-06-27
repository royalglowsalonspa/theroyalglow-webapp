/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : MeSchedulePage (staff self-service)
 * Scope        : Admin Portal — Staff Self-Service
 *
 * Description  : Displays the authenticated staff member's weekly working
 *                schedule (read-only). Relocated from apps/web/staff/schedule
 *                during the admin-web-separation feature. Shows each day of the
 *                week with start/end times or "Off".
 *
 * Responsibilities :
 * - Authenticate the staff session and resolve the staff profile
 * - Fetch the weekly schedule and render by day
 * - Display a "no profile" state when the account isn't linked
 *
 * Tech Stack   : React, Next.js 16 (App Router), Better Auth, Drizzle ORM
 * Layer        : Presentation
 *
 * Notes        :
 * - Schedule is read-only for staff; changes go through manager/admin (/schedule).
 ************************************************************/

import { EmptyState } from '@/components/ui/state/empty-state'
import { formatTime12h } from '@/lib/admin/bookings'
import { auth } from '@/lib/auth-server'
import { dayOfWeekLabel } from '@rgss/business'
import { getStaffProfileByUserId, getStaffSchedule } from '@rgss/db/queries'
import { UserX } from 'lucide-react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

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

export default async function MeSchedulePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('https://theroyalglow.in')
  }

  const staff = await getStaffProfileByUserId(session.user.id)
  const schedule = staff ? await getStaffSchedule(staff.id) : []

  const byDay = new Map<number, ScheduleRow>()
  for (const row of schedule) {
    byDay.set(row.dayOfWeek, row)
  }

  return (
    <div className="mx-auto max-w-[960px]">
      <header className="mb-8">
        <p className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-2">
          Your working hours
        </p>
        <h1 className="font-display text-[clamp(28px,5vw,40px)] text-cocoa-dark tracking-tight leading-[1.05]">
          My Schedule
        </h1>
      </header>

      {!staff ? (
        <EmptyState
          icon={UserX}
          title="No staff profile found"
          message="Your account isn't linked to a staff profile yet. Ask your manager to set this up so your schedule and leave appear here."
        />
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
                  <article className="flex items-center justify-between gap-3 rounded-cards border border-cloud-gray bg-canvas-white px-4 py-3">
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
            Your schedule is set by your manager. To request a change, speak to the front desk.
          </p>
        </section>
      )}
    </div>
  )
}
