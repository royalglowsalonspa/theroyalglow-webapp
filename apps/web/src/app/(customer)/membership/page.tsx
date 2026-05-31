import { auth } from '@/lib/auth-server'
import { formatDateIN } from '@rgss/business'
import { getCustomerMembership, getMembershipSessions } from '@rgss/db/queries'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

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
    redirect('/sign-in')
  }

  const customerId = session.user.id
  const { active, past } = await getCustomerMembership(customerId)
  const sessions = active ? await getMembershipSessions(active.id) : []

  return (
    <div className="mx-auto max-w-[800px] px-5 py-10 lg:py-14">
      <header className="mb-8">
        <p className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-2">
          Your SPA membership
        </p>
        <h1 className="font-display text-[clamp(32px,5vw,48px)] text-cocoa-dark tracking-tight leading-[1.05]">
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

      <section
        className="rounded-[6px] border border-cloud-gray bg-canvas-white p-6 mb-6"
        aria-labelledby="membership-card-heading"
      >
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h2
              id="membership-card-heading"
              className="font-display text-[24px] text-cocoa-dark tracking-tight leading-tight"
            >
              {membership.tierNameSnapshot} Membership
            </h2>
            <p className="font-ui text-[13px] text-warm-stone tracking-[0.5px] mt-1">
              #{membership.membershipNumber}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-ui text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Active
          </span>
        </div>

        {/* Hours balance bar. The bar itself is decorative (aria-hidden); the
            adjacent visually-hidden text conveys the same information to screen
            readers, avoiding a focusable static progressbar. */}
        <div className="mb-6">
          <div className="h-3 w-full overflow-hidden rounded-full bg-cloud-gray" aria-hidden="true">
            <div
              className="h-full rounded-full bg-royal-gold motion-safe:transition-[width] duration-500"
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="sr-only">
            {formatHoursMinutes(used)} used, {formatHoursMinutes(remaining)} remaining of{' '}
            {formatHoursMinutes(total)} total.
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[6px] bg-warm-cream px-4 py-3">
              <dt className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone mb-1">
                Used
              </dt>
              <dd className="font-display text-[20px] text-cocoa-dark">
                {formatHoursMinutes(used)}
              </dd>
            </div>
            <div className="rounded-[6px] bg-warm-cream px-4 py-3">
              <dt className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone mb-1">
                Remaining
              </dt>
              <dd className="font-display text-[20px] text-deep-gold">
                {formatHoursMinutes(remaining)}
              </dd>
            </div>
            <div className="rounded-[6px] bg-warm-cream px-4 py-3">
              <dt className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone mb-1">
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
            <span className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone mr-2">
              Valid until
            </span>
            {expiresAt ? (
              <time dateTime={expiresAt.toISOString().slice(0, 10)}>{formatDateIN(expiresAt)}</time>
            ) : (
              '—'
            )}
            {daysLeft !== null && daysLeft > 0 && (
              <span className="text-dusty-gray"> · {daysLeft} days left</span>
            )}
          </p>
        </div>
      </section>

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
      className={`rounded-[6px] border px-5 py-4 mb-6 ${
        urgent ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <p
        className={`font-ui text-[13px] uppercase tracking-[0.5px] mb-1 ${
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
        className={`inline-flex items-center mt-3 font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-5 py-2 motion-safe:transition-colors duration-200 ${
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
        className="font-display text-[20px] text-cocoa-dark tracking-tight mb-4"
      >
        Session history
      </h2>

      {sessions.length === 0 ? (
        <p className="font-sans text-[15px] text-dusty-gray py-4">
          No sessions recorded yet. Book your first SPA session to get started.
        </p>
      ) : (
        <ul className="space-y-3">
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
                <article className="flex items-center justify-between gap-3 rounded-[6px] border border-cloud-gray bg-canvas-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-sans text-[15px] text-cocoa-dark truncate">
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
                  <span className="font-ui text-[14px] whitespace-nowrap text-deep-gold">
                    {formatHoursMinutes(s.totalDurationMinutes)}
                  </span>
                </article>
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
      <details className="rounded-[6px] border border-cloud-gray bg-canvas-white">
        <summary className="cursor-pointer list-none px-5 py-4 font-ui text-[13px] uppercase tracking-[0.5px] text-cocoa-dark marker:content-none">
          <span id="past-memberships-heading">Past memberships ({memberships.length})</span>
        </summary>
        <ul className="border-t border-cloud-gray divide-y divide-cloud-gray">
          {memberships.map((m) => {
            const startsAt = toDate(m.startsAt)
            const expiresAt = toDate(m.expiresAt)
            return (
              <li key={m.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-sans text-[15px] text-cocoa-dark">
                      {m.tierNameSnapshot}
                      <span className="text-dusty-gray text-[13px]">
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
                  <span className="font-ui text-[11px] uppercase tracking-[0.5px] text-warm-stone whitespace-nowrap">
                    {PAST_STATUS_LABELS[m.status] ?? m.status}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </details>
    </section>
  )
}

function EmptyState() {
  return (
    <section className="flex flex-col items-center justify-center rounded-[6px] border border-cloud-gray bg-canvas-white py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-warm-cream flex items-center justify-center mb-5">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 21l-4.9-2.6.9-5.5-4-3.9 5.5-.8L12 3z"
            stroke="#C8A961"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="font-sans text-[16px] text-cocoa-dark mb-2">
        You don't have an active membership
      </p>
      <p className="font-sans text-[14px] text-dusty-gray mb-6 max-w-[420px]">
        SPA memberships give you pre-paid hours across all our SPA services. Call us to find the
        tier that suits you.
      </p>
      <a
        href={`tel:${SALON_PHONE}`}
        className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-8 py-3 bg-royal-gold text-cocoa-dark hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all duration-200"
      >
        Call us · {SALON_PHONE_DISPLAY}
      </a>
    </section>
  )
}
