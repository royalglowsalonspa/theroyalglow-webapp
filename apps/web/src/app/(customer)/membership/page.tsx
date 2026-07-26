/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : MembershipPage
 * Scope        : SPA Memberships
 *
 * Description  : Customer SPA membership dashboard showing active membership
 *                status, hours balance, session history, and past memberships.
 *                Rebuilt on the shadcn/ui Card + Button + Accordion primitives
 *                with the shared font system and lucide icons.
 *
 * Responsibilities :
 * - Display active membership card with hours used/remaining/total
 * - Show urgency banners when membership is nearing expiry
 * - Render session history and collapsed past memberships section
 *
 * Features / Functionality :
 * - Visual progress bar for hours consumption
 * - Urgency alerts at 30-day and 7-day thresholds
 * - Empty state with call-to-action for non-members
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui,
 *                Better Auth, Drizzle ORM, lucide-react
 * Layer        : Presentation
 *
 * Dependencies : auth, formatDateIN, membership queries,
 *                @/components/ui/{card,button,accordion}, lucide-react
 *
 * Notes        :
 * - Protected route; redirects to / (homepage) if no session
 ************************************************************/

import { formatDateIN } from '@rgss/business'
import { getCustomerMembership, getMembershipSessions } from '@rgss/db/queries'
import { Sparkles } from 'lucide-react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { auth } from '@/lib/auth-server'

export const metadata: Metadata = {
  title: 'My SPA Membership',
  description: 'Track your Royal Glow SPA membership hours, validity and session history.',
  robots: { index: false, follow: false },
}

const SALON_PHONE = '+916360135720'
const SALON_PHONE_DISPLAY = '+91 63601 35720'
const MS_PER_DAY = 1000 * 60 * 60 * 24

// Urgency thresholds (days remaining) per the membership-flow design.
const URGENT_DAYS = 7
const REMINDER_DAYS = 30

type ActiveMembership = NonNullable<Awaited<ReturnType<typeof getCustomerMembership>>['active']>
type PastMembership = Awaited<ReturnType<typeof getCustomerMembership>>['past'][number]
type MembershipSession = Awaited<ReturnType<typeof getMembershipSessions>>[number]

const PAST_STATUS_LABELS: Record<string, string> = {
  expired: 'Expired',
  cancelled: 'Cancelled',
  active: 'Active',
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// Minutes → "Xh Ym" (e.g. 90 → "1h 30m", 60 → "1h 0m").
function formatHoursMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(safe / 60)
  const minutes = safe % 60
  return `${hours}h ${minutes}m`
}

// Whole days from `now` until `expiresAt`, rounded up. Expiry is stored as
// end-of-day IST, so a same-day expiry still counts as a day remaining.
function daysUntil(expiresAt: Date, now: Date): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY)
}

export default async function MembershipPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/')
  }

  const customerId = session.user.id
  const { active, past } = await getCustomerMembership(customerId)
  const sessions = active ? await getMembershipSessions(active.id) : []

  return (
    <div className="mx-auto max-w-[800px] px-5 py-10 lg:py-14">
      <header className="mb-8">
        <p className="mb-2 font-ui text-[11px] uppercase tracking-[2px] text-warm-stone">
          Your SPA membership
        </p>
        <h1 className="font-display font-black text-[clamp(32px,5vw,48px)] leading-[1.05] tracking-tight text-cocoa-dark">
          My Membership
        </h1>
      </header>

      {active ? <ActiveMembershipCard membership={active} sessions={sessions} /> : <EmptyState />}

      {past.length > 0 && <PastMemberships memberships={past} />}
    </div>
  )
}

function ActiveMembershipCard({
  membership,
  sessions,
}: {
  membership: ActiveMembership
  sessions: MembershipSession[]
}) {
  const total = membership.totalHoursMinutes
  const used = Math.min(membership.usedHoursMinutes, total)
  const remaining = Math.max(0, total - used)
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

  const expiresAt = toDate(membership.expiresAt)
  const daysLeft = expiresAt ? daysUntil(expiresAt, new Date()) : null

  return (
    <>
      {daysLeft !== null && daysLeft <= REMINDER_DAYS && (
        <UrgencyBanner daysLeft={daysLeft} remainingMinutes={remaining} />
      )}

      <Card className="mb-6 gap-6 p-6" aria-labelledby="membership-card-heading">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="membership-card-heading"
              className="font-display text-[24px] leading-tight tracking-tight text-cocoa-dark"
            >
              {membership.tierNameSnapshot} Membership
            </h2>
            <p className="mt-1 font-ui text-[13px] tracking-[0.5px] text-warm-stone">
              #{membership.membershipNumber}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 font-ui text-[11px] text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Active
          </span>
        </div>

        {/* Hours balance bar (decorative; sr-only text conveys the same data). */}
        <div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-cloud-gray" aria-hidden="true">
            <div
              className="h-full rounded-full bg-royal-gold transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="sr-only">
            {formatHoursMinutes(used)} used, {formatHoursMinutes(remaining)} remaining of{' '}
            {formatHoursMinutes(total)} total.
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[6px] bg-warm-cream px-4 py-3">
              <dt className="mb-1 font-ui text-[11px] uppercase tracking-[1px] text-warm-stone">
                Used
              </dt>
              <dd className="font-display text-[20px] text-cocoa-dark">
                {formatHoursMinutes(used)}
              </dd>
            </div>
            <div className="rounded-[6px] bg-warm-cream px-4 py-3">
              <dt className="mb-1 font-ui text-[11px] uppercase tracking-[1px] text-warm-stone">
                Remaining
              </dt>
              <dd className="font-display text-[20px] text-gold-ink">
                {formatHoursMinutes(remaining)}
              </dd>
            </div>
            <div className="rounded-[6px] bg-warm-cream px-4 py-3">
              <dt className="mb-1 font-ui text-[11px] uppercase tracking-[1px] text-warm-stone">
                Total
              </dt>
              <dd className="font-display text-[20px] text-cocoa-dark">
                {formatHoursMinutes(total)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Validity */}
        <div className="border-t border-cloud-gray pt-4">
          <p className="font-sans text-[15px] text-cocoa-dark">
            <span className="mr-2 font-ui text-[11px] uppercase tracking-[1px] text-warm-stone">
              Valid until
            </span>
            {expiresAt ? (
              <time className="font-ui" dateTime={expiresAt.toISOString().slice(0, 10)}>
                {formatDateIN(expiresAt)}
              </time>
            ) : (
              '—'
            )}
            {daysLeft !== null && daysLeft > 0 && (
              <span className="font-ui text-dusty-gray"> · {daysLeft} days left</span>
            )}
          </p>
        </div>
      </Card>

      <SessionHistory sessions={sessions} />
    </>
  )
}

function UrgencyBanner({
  daysLeft,
  remainingMinutes,
}: {
  daysLeft: number
  remainingMinutes: number
}) {
  const urgent = daysLeft <= URGENT_DAYS
  const dayLabel = daysLeft <= 0 ? 'today' : `in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`

  return (
    <section
      role="alert"
      className={`mb-6 rounded-[6px] border px-5 py-4 ${
        urgent ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <p
        className={`mb-1 font-ui text-[13px] uppercase tracking-[0.5px] ${
          urgent ? 'text-red-800' : 'text-amber-800'
        }`}
      >
        {urgent ? `Urgent · Expires ${dayLabel}` : `Expires ${dayLabel}`}
      </p>
      <p className={`font-sans text-[14px] ${urgent ? 'text-red-700' : 'text-amber-700'}`}>
        {remainingMinutes > 0
          ? `${formatHoursMinutes(remainingMinutes)} remaining — book before they're forfeited.`
          : 'Book your next session before your membership expires.'}
      </p>
      <a
        href={`tel:${SALON_PHONE}`}
        className={`mt-3 inline-flex items-center rounded-full px-5 py-2 font-ui text-[12px] uppercase tracking-[0.5px] transition-colors duration-200 motion-reduce:transition-none ${
          urgent
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-royal-gold text-cocoa-dark hover:bg-deep-gold'
        }`}
      >
        Call to book · {SALON_PHONE_DISPLAY}
      </a>
    </section>
  )
}

function SessionHistory({ sessions }: { sessions: MembershipSession[] }) {
  return (
    <section className="mb-6" aria-labelledby="session-history-heading">
      <h2
        id="session-history-heading"
        className="mb-4 font-display text-[20px] tracking-tight text-cocoa-dark"
      >
        Session history
      </h2>

      {sessions.length === 0 ? (
        <p className="py-4 font-sans text-[15px] text-dusty-gray">
          No sessions recorded yet. Book your first SPA session to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((s) => {
            const bookingDate = toDate(s.bookingDate)
            const serviceNames = s.services.map((svc) => svc.serviceNameSnapshot).join(', ')
            const staffNames = [
              ...new Set(
                s.services
                  .map((svc) => svc.staffName)
                  .filter((name): name is string => Boolean(name)),
              ),
            ].join(', ')
            return (
              <li key={s.id}>
                <Card className="flex-row items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-sans text-[15px] text-cocoa-dark">
                      {serviceNames || 'SPA session'}
                    </p>
                    <p className="font-sans text-[12px] text-dusty-gray">
                      {bookingDate ? (
                        <time dateTime={bookingDate.toISOString().slice(0, 10)}>
                          {formatDateIN(bookingDate)}
                        </time>
                      ) : (
                        '—'
                      )}
                      {staffNames ? ` · ${staffNames}` : ''}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-ui text-[14px] text-gold-ink">
                    {formatHoursMinutes(s.totalDurationMinutes)}
                  </span>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function PastMemberships({ memberships }: { memberships: PastMembership[] }) {
  return (
    <section aria-labelledby="past-memberships-heading">
      <Accordion type="single" collapsible className="rounded-[6px] border border-cloud-gray px-5">
        <AccordionItem value="past" className="border-b-0">
          <AccordionTrigger className="font-ui text-[13px] uppercase tracking-[0.5px] text-cocoa-dark hover:no-underline">
            <span id="past-memberships-heading">Past memberships ({memberships.length})</span>
          </AccordionTrigger>
          <AccordionContent className="pb-2">
            <ul className="divide-y divide-cloud-gray border-t border-cloud-gray">
              {memberships.map((m) => {
                const startsAt = toDate(m.startsAt)
                const expiresAt = toDate(m.expiresAt)
                return (
                  <li key={m.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-sans text-[15px] text-cocoa-dark">
                          {m.tierNameSnapshot}
                          <span className="text-[13px] text-dusty-gray">
                            {' · '}#{m.membershipNumber}
                          </span>
                        </p>
                        <p className="font-sans text-[12px] text-dusty-gray">
                          {startsAt ? formatDateIN(startsAt) : '—'}
                          {' – '}
                          {expiresAt ? formatDateIN(expiresAt) : '—'}
                          {' · '}
                          {formatHoursMinutes(m.usedHoursMinutes)} of{' '}
                          {formatHoursMinutes(m.totalHoursMinutes)} used
                        </p>
                      </div>
                      <span className="whitespace-nowrap font-ui text-[11px] uppercase tracking-[0.5px] text-warm-stone">
                        {PAST_STATUS_LABELS[m.status] ?? m.status}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  )
}

function EmptyState() {
  return (
    <Card className="items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-warm-cream text-gold-ink">
        <Sparkles className="size-7" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <p className="mb-2 font-sans text-[16px] text-cocoa-dark">
        You don't have an active membership
      </p>
      <p className="mb-6 max-w-[420px] font-sans text-[14px] text-dusty-gray">
        SPA memberships give you pre-paid hours across all our SPA services. Call us to find the
        tier that suits you.
      </p>
      <Button
        asChild
        variant="gold"
        className="rounded-full font-ui text-[12px] uppercase tracking-[0.5px]"
      >
        <a href={`tel:${SALON_PHONE}`}>Call us · {SALON_PHONE_DISPLAY}</a>
      </Button>
    </Card>
  )
}
