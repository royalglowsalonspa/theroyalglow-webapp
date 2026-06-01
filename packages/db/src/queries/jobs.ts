import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm'
import { db } from '../index'
import { session, user } from '../schema/auth'
import { booking } from '../schema/booking'
import { invoice, invoiceItem } from '../schema/invoice'
import { lead } from '../schema/lead'
import { loyaltyAccount, loyaltyTransaction } from '../schema/loyalty'
import { spaMembership } from '../schema/membership'
import { notification } from '../schema/notification'
import { offer } from '../schema/offer'
import { customerProfile } from '../schema/profile'
import { dailySalesSummary, monthlyGstSummary } from '../schema/system'

// ============================================================================
// Background-jobs query layer (Phase 6).
//
// Two groups live here:
//   1. pg_cron TS equivalents — callable mirrors of the SQL functions in
//      migrations/0001_pg_cron_jobs.sql, so the same maintenance logic can be
//      invoked on demand (e.g. a "rebuild summary" admin action) and reasoned
//      about in the typed codebase. Every function is idempotent, matching the
//      SQL's ON CONFLICT upserts / status-guarded updates / `expired:<id>` gems
//      marker.
//   2. QStash data reads — the DB side of the 12 job routes. They only read (or,
//      for the stale/no-show routes, are paired with mutations elsewhere) and
//      shape rows so the routes can build notification content + dispatch.
//
// LAYER NOTE: packages/db must not import packages/business (the STRICT layer
// rule, and @rgss/business is not a dependency of @rgss/db). The handful of IST
// calendar helpers below intentionally re-derive the same math as
// @rgss/business/jobs/time.ts so this layer stays self-contained. Routes that
// need the richer IST window classification (reminderWindowMatch, etc.) use the
// business helpers directly and pass already-computed ISO strings into these
// queries.
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000
// Asia/Kolkata is UTC+5:30 with no DST, so a fixed offset is exact.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// 'YYYY-MM-DD' of `now` in IST (mirror of @rgss/business istToday).
function istDateString(now: Date): string {
  const wall = new Date(now.getTime() + IST_OFFSET_MS)
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`
}

// IST midnight (as a UTC ms value of the IST calendar fields) of `date`. Used
// for whole-calendar-day differences regardless of the time-of-day component.
function istCalendarMs(date: Date): number {
  const wall = new Date(date.getTime() + IST_OFFSET_MS)
  return Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
}

// Whole IST calendar days from `now` to `target` (positive when target is in the
// future). Mirrors @rgss/business daysUntilIST: both instants reduce to their
// IST midnight before differencing, so this is a calendar-day count.
function daysUntilIST(target: Date, now: Date): number {
  return Math.round((istCalendarMs(target) - istCalendarMs(now)) / DAY_MS)
}

// UTC midnight Date for an IST calendar day string ('YYYY-MM-DD') — the
// [start, end) instant range that IST day occupies in UTC. Used to filter
// timestamptz columns (invoice.created_at, membership.expires_at) by IST day.
function istDayRange(dateISO: string): { start: Date; end: Date } {
  const start = new Date(`${dateISO}T00:00:00+05:30`)
  return { start, end: new Date(start.getTime() + DAY_MS) }
}

// [start, end) UTC instant range for an IST calendar month ('YYYY-MM'). The
// monthly GST summary aggregates every paid invoice whose IST creation day falls
// inside this range.
function istMonthRange(monthISO: string): { start: Date; end: Date } {
  const year = Number(monthISO.slice(0, 4))
  const month = Number(monthISO.slice(5, 7)) // 1-12
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const start = new Date(`${monthISO}-01T00:00:00+05:30`)
  const end = new Date(`${nextYear}-${pad2(nextMonth)}-01T00:00:00+05:30`)
  return { start, end }
}

// Idempotency marker stored on the offsetting `expired` loyalty_transaction.
// Matches @rgss/business gemsExpiredMarker and the `'expired:' || id` SQL.
function expiredMarker(txId: string): string {
  return `expired:${txId}`
}

type NotificationType = (typeof notification.$inferSelect)['type']

// ============================================================================
// 1. pg_cron TS equivalents (mirror migrations/0001_pg_cron_jobs.sql)
// ============================================================================

// Job 2 — flip active memberships whose expiry has passed to 'expired'. Returns
// the number of rows affected. Idempotent: a second immediate run matches zero
// rows (status already 'expired'). `updated_at` is bumped by the schema's
// $onUpdate hook. (Property 1)
export async function expireMemberships(now: Date = new Date()): Promise<number> {
  const rows = await db
    .update(spaMembership)
    .set({ status: 'expired' })
    .where(and(eq(spaMembership.status, 'active'), lt(spaMembership.expiresAt, now)))
    .returning()

  return rows.length
}

// Job 3 — deactivate offers whose end_date has passed (compared against the IST
// calendar date, mirroring the SQL's `end_date < (NOW() AT TIME ZONE
// 'Asia/Kolkata')::date`). end_date is a date-mode column, so the cutoff is a
// UTC-midnight Date of the IST "today". Idempotent: a second run matches zero
// rows (is_active already false). (Property 2)
export async function expireOffers(now: Date = new Date()): Promise<number> {
  const todayIST = new Date(`${istDateString(now)}T00:00:00.000Z`)
  const rows = await db
    .update(offer)
    .set({ isActive: false })
    .where(and(eq(offer.isActive, true), lt(offer.endDate, todayIST)))
    .returning()

  return rows.length
}

// Job 7 — for each EARNED loyalty_transaction whose gems have expired and which
// has not already been offset, insert one offsetting 'expired' transaction
// (gems_amount = -original) marked `expired:<txId>` and decrement the owning
// loyalty_account.gems_balance by the same amount. The `expired:<txId>` marker
// makes this idempotent: an already-offset transaction is skipped, so a re-run
// conserves balance and offsets nothing twice. The offset insert + balance
// decrement run together in one db.batch() (atomic on neon-http) per account.
// (Property 3)
export async function expireGems(
  now: Date = new Date(),
): Promise<{ accountsAffected: number; gemsExpired: number }> {
  const candidates = await db
    .select({
      id: loyaltyTransaction.id,
      loyaltyAccountId: loyaltyTransaction.loyaltyAccountId,
      gemsAmount: loyaltyTransaction.gemsAmount,
    })
    .from(loyaltyTransaction)
    .where(
      and(
        eq(loyaltyTransaction.type, 'earned'),
        gt(loyaltyTransaction.gemsAmount, 0),
        isNotNull(loyaltyTransaction.expiresAt),
        lt(loyaltyTransaction.expiresAt, now),
      ),
    )

  if (candidates.length === 0) {
    return { accountsAffected: 0, gemsExpired: 0 }
  }

  // Drop any earned transaction that already has its `expired:<id>` offset row.
  const markers = candidates.map((c) => expiredMarker(c.id))
  const existing = await db
    .select({ description: loyaltyTransaction.description })
    .from(loyaltyTransaction)
    .where(
      and(eq(loyaltyTransaction.type, 'expired'), inArray(loyaltyTransaction.description, markers)),
    )
  const alreadyOffset = new Set(existing.map((e) => e.description))

  const pending = candidates.filter((c) => !alreadyOffset.has(expiredMarker(c.id)))
  if (pending.length === 0) {
    return { accountsAffected: 0, gemsExpired: 0 }
  }

  const affectedAccounts = new Set<string>()
  let gemsExpired = 0
  for (const tx of pending) {
    affectedAccounts.add(tx.loyaltyAccountId)
    gemsExpired += tx.gemsAmount
    await db.batch([
      db.insert(loyaltyTransaction).values({
        loyaltyAccountId: tx.loyaltyAccountId,
        type: 'expired',
        gemsAmount: -tx.gemsAmount,
        description: expiredMarker(tx.id),
      }),
      db
        .update(loyaltyAccount)
        .set({ gemsBalance: sql`${loyaltyAccount.gemsBalance} - ${tx.gemsAmount}` })
        .where(eq(loyaltyAccount.id, tx.loyaltyAccountId)),
    ])
  }

  return { accountsAffected: affectedAccounts.size, gemsExpired }
}

// Job 4 — delete expired Better Auth session rows. Returns the number deleted.
// Idempotent: a second run deletes zero rows.
export async function cleanupExpiredSessions(now: Date = new Date()): Promise<number> {
  const rows = await db.delete(session).where(lt(session.expiresAt, now)).returning()
  return rows.length
}

// Job 1 — aggregate the given IST date's PAID invoices + that date's bookings
// into one daily_sales_summary row per branch, upserting on the (date, branch)
// unique constraint. Mirrors the SQL column mapping exactly: salon/spa splits
// come from service invoices joined to their booking's service_type, membership
// revenue from membership_purchase invoices, payment-method splits from
// payment_method, plus booking counters and the new-customer count (a customer
// whose first-ever booking falls on the date). Idempotent via ON CONFLICT DO
// UPDATE. (Properties 4, 11)
export async function buildDailySalesSummary(dateISO: string) {
  const { start, end } = istDayRange(dateISO)
  const bookingDate = new Date(`${dateISO}T00:00:00.000Z`)

  // Revenue side: paid invoices created on the target IST day, per branch.
  const invAgg = await db
    .select({
      branchId: invoice.branchId,
      totalRevenuePaise: sql<number>`coalesce(sum(${invoice.totalAmountPaise}), 0)::int`,
      salonRevenuePaise: sql<number>`coalesce(sum(case when ${invoice.invoiceType} = 'service' and ${booking.serviceType} = 'salon' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
      spaRevenuePaise: sql<number>`coalesce(sum(case when ${invoice.invoiceType} = 'service' and ${booking.serviceType} = 'spa' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
      membershipRevenuePaise: sql<number>`coalesce(sum(case when ${invoice.invoiceType} = 'membership_purchase' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
      cashRevenuePaise: sql<number>`coalesce(sum(case when ${invoice.paymentMethod} = 'cash' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
      upiRevenuePaise: sql<number>`coalesce(sum(case when ${invoice.paymentMethod} = 'upi' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
      cardRevenuePaise: sql<number>`coalesce(sum(case when ${invoice.paymentMethod} = 'card' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
      onlineRevenuePaise: sql<number>`coalesce(sum(case when ${invoice.paymentMethod} = 'online' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
      discountGivenPaise: sql<number>`coalesce(sum(${invoice.discountAmountPaise}), 0)::int`,
      gemsRedeemedCount: sql<number>`coalesce(sum(${invoice.gemsRedeemed}), 0)::int`,
    })
    .from(invoice)
    .leftJoin(booking, eq(invoice.bookingId, booking.id))
    .where(
      and(
        eq(invoice.paymentStatus, 'paid'),
        gte(invoice.createdAt, start),
        lt(invoice.createdAt, end),
      ),
    )
    .groupBy(invoice.branchId)

  // Booking side: all bookings on the target IST day, per branch.
  const bkAgg = await db
    .select({
      branchId: booking.branchId,
      totalBookings: sql<number>`count(*)::int`,
      completedBookings: sql<number>`count(*) filter (where ${booking.status} = 'completed')::int`,
      cancelledBookings: sql<number>`count(*) filter (where ${booking.status} = 'cancelled')::int`,
      noShowBookings: sql<number>`count(*) filter (where ${booking.status} = 'no_show')::int`,
      walkinBookings: sql<number>`count(*) filter (where ${booking.isWalkin} = true)::int`,
    })
    .from(booking)
    .where(eq(booking.bookingDate, bookingDate))
    .groupBy(booking.branchId)

  // New customers: users whose first-ever booking (by created_at) falls on the
  // target IST day, attributed to that first booking's branch.
  const firstBooking = db
    .select({
      branchId: booking.branchId,
      bookingDate: booking.bookingDate,
      rn: sql<number>`row_number() over (partition by ${booking.customerId} order by ${booking.createdAt} asc)`.as(
        'rn',
      ),
    })
    .from(booking)
    .as('fb')

  const newcAgg = await db
    .select({
      branchId: firstBooking.branchId,
      newCustomers: sql<number>`count(*)::int`,
    })
    .from(firstBooking)
    .where(and(eq(firstBooking.rn, 1), eq(firstBooking.bookingDate, bookingDate)))
    .groupBy(firstBooking.branchId)

  const invByBranch = new Map(invAgg.map((r) => [r.branchId, r]))
  const bkByBranch = new Map(bkAgg.map((r) => [r.branchId, r]))
  const newcByBranch = new Map(newcAgg.map((r) => [r.branchId, r.newCustomers]))

  const branchIds = new Set<string>()
  for (const r of invAgg) {
    branchIds.add(r.branchId)
  }
  for (const r of bkAgg) {
    branchIds.add(r.branchId)
  }

  const dateValue = new Date(`${dateISO}T00:00:00.000Z`)
  const results: (typeof dailySalesSummary.$inferSelect)[] = []

  for (const branchId of branchIds) {
    const inv = invByBranch.get(branchId)
    const bk = bkByBranch.get(branchId)
    const metrics = {
      totalBookings: bk?.totalBookings ?? 0,
      completedBookings: bk?.completedBookings ?? 0,
      cancelledBookings: bk?.cancelledBookings ?? 0,
      noShowBookings: bk?.noShowBookings ?? 0,
      walkinBookings: bk?.walkinBookings ?? 0,
      totalRevenuePaise: inv?.totalRevenuePaise ?? 0,
      salonRevenuePaise: inv?.salonRevenuePaise ?? 0,
      spaRevenuePaise: inv?.spaRevenuePaise ?? 0,
      membershipRevenuePaise: inv?.membershipRevenuePaise ?? 0,
      cashRevenuePaise: inv?.cashRevenuePaise ?? 0,
      upiRevenuePaise: inv?.upiRevenuePaise ?? 0,
      cardRevenuePaise: inv?.cardRevenuePaise ?? 0,
      onlineRevenuePaise: inv?.onlineRevenuePaise ?? 0,
      discountGivenPaise: inv?.discountGivenPaise ?? 0,
      gemsRedeemedCount: inv?.gemsRedeemedCount ?? 0,
      newCustomers: newcByBranch.get(branchId) ?? 0,
    }

    const [row] = await db
      .insert(dailySalesSummary)
      .values({ date: dateValue, branchId, ...metrics })
      .onConflictDoUpdate({
        target: [dailySalesSummary.date, dailySalesSummary.branchId],
        set: metrics,
      })
      .returning()

    if (row) {
      results.push(row)
    }
  }

  return results
}

// Job 6 — aggregate the given IST month's ('YYYY-MM') PAID service +
// membership_purchase invoices into one monthly_gst_summary row, upserting on
// the unique `month` column. Totals equal the sum of taxable value / GST amount
// over the matching invoices. Idempotent via ON CONFLICT DO UPDATE. (Property 4)
export async function buildMonthlyGstSummary(monthISO: string) {
  const { start, end } = istMonthRange(monthISO)

  const [agg] = await db
    .select({
      taxableValuePaise: sql<number>`coalesce(sum(${invoice.taxableValuePaise}), 0)::int`,
      gstAmountPaise: sql<number>`coalesce(sum(${invoice.gstAmountPaise}), 0)::int`,
      invoiceCount: sql<number>`count(*)::int`,
    })
    .from(invoice)
    .where(
      and(
        eq(invoice.paymentStatus, 'paid'),
        inArray(invoice.invoiceType, ['service', 'membership_purchase']),
        gte(invoice.createdAt, start),
        lt(invoice.createdAt, end),
      ),
    )

  const summary = {
    taxableValuePaise: agg?.taxableValuePaise ?? 0,
    gstAmountPaise: agg?.gstAmountPaise ?? 0,
    invoiceCount: agg?.invoiceCount ?? 0,
    sacCode: '999721',
  }

  const [row] = await db
    .insert(monthlyGstSummary)
    .values({ month: monthISO, ...summary })
    .onConflictDoUpdate({ target: monthlyGstSummary.month, set: summary })
    .returning()

  return row as typeof monthlyGstSummary.$inferSelect
}

// ============================================================================
// 2. QStash data reads (the DB side of the 12 job routes)
// ============================================================================

// Job 8 — confirmed bookings on or after today (IST), each with the customer's
// name/email and their appointment-reminder preference. The route computes each
// booking's start instant from bookingDate + startTime, classifies it via
// reminderWindowMatch (24h/1h), de-dupes via hasNotification, and sends.
export async function getUpcomingConfirmedBookings(now: Date = new Date()) {
  const today = new Date(`${istDateString(now)}T00:00:00.000Z`)
  return db
    .select({
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      customerId: booking.customerId,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      customerName: user.name,
      customerEmail: user.email,
      appointmentRemindersEnabled: customerProfile.appointmentRemindersEnabled,
    })
    .from(booking)
    .innerJoin(user, eq(booking.customerId, user.id))
    .leftJoin(customerProfile, eq(customerProfile.userId, user.id))
    .where(and(eq(booking.status, 'confirmed'), gte(booking.bookingDate, today)))
    .orderBy(asc(booking.bookingDate), asc(booking.startTime))
}

// Job 9 — active memberships expiring in exactly `days` IST calendar days. The
// day match is computed in JS via daysUntilIST so the 30/7/1-day tiers are exact
// and a membership lands in at most one tier per run. Carries the owning
// customer (userId, name) and their membership-alert preference. (Property 5)
export async function getMembershipsExpiringInDays(days: number, now: Date = new Date()) {
  const rows = await db
    .select({
      id: spaMembership.id,
      membershipNumber: spaMembership.membershipNumber,
      customerId: spaMembership.customerId,
      tierNameSnapshot: spaMembership.tierNameSnapshot,
      expiresAt: spaMembership.expiresAt,
      userId: user.id,
      customerName: user.name,
      membershipAlertsEnabled: customerProfile.membershipAlertsEnabled,
    })
    .from(spaMembership)
    .innerJoin(user, eq(spaMembership.customerId, user.id))
    .leftJoin(customerProfile, eq(customerProfile.userId, user.id))
    .where(eq(spaMembership.status, 'active'))

  return rows.filter((r) => daysUntilIST(r.expiresAt, now) === days)
}

// Job 10 — customers whose date_of_birth (month + day) is today (IST) and who
// have marketing_consent. The month/day match is done in JS against the IST
// calendar day. Carries the user for content + delivery.
export async function getBirthdayCustomers(now: Date = new Date()) {
  const today = new Date(`${istDateString(now)}T00:00:00.000Z`)
  const month = today.getUTCMonth()
  const day = today.getUTCDate()

  const rows = await db
    .select({
      userId: user.id,
      customerName: user.name,
      customerEmail: user.email,
      dateOfBirth: customerProfile.dateOfBirth,
    })
    .from(customerProfile)
    .innerJoin(user, eq(customerProfile.userId, user.id))
    .where(and(eq(customerProfile.marketingConsent, true), isNotNull(customerProfile.dateOfBirth)))

  return rows.filter((r) => {
    const dob = r.dateOfBirth
    return dob !== null && dob.getUTCMonth() === month && dob.getUTCDate() === day
  })
}

// Job 11 — active memberships with unused hours remaining (used < total),
// candidates for a usage nudge. Carries the owning customer + their
// membership-alert preference. The route picks a random eligible subset and
// skips anyone nudged recently (via hasNotification).
export async function getNudgeEligibleMemberships() {
  return db
    .select({
      id: spaMembership.id,
      membershipNumber: spaMembership.membershipNumber,
      customerId: spaMembership.customerId,
      tierNameSnapshot: spaMembership.tierNameSnapshot,
      totalHoursMinutes: spaMembership.totalHoursMinutes,
      usedHoursMinutes: spaMembership.usedHoursMinutes,
      expiresAt: spaMembership.expiresAt,
      userId: user.id,
      customerName: user.name,
      membershipAlertsEnabled: customerProfile.membershipAlertsEnabled,
    })
    .from(spaMembership)
    .innerJoin(user, eq(spaMembership.customerId, user.id))
    .leftJoin(customerProfile, eq(customerProfile.userId, user.id))
    .where(
      and(
        eq(spaMembership.status, 'active'),
        lt(spaMembership.usedHoursMinutes, spaMembership.totalHoursMinutes),
      ),
    )
}

// Job 12 — leads in 'follow_up' status whose last contact is older than `hours`
// hours. Full lead rows (including assignedTo) so the route can notify the
// assigned staff member. A null last_contacted_at can't be "older than", so it
// is excluded.
export async function getStaleFollowUpLeads(hours: number, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000)
  return db
    .select()
    .from(lead)
    .where(
      and(
        eq(lead.status, 'follow_up'),
        isNotNull(lead.lastContactedAt),
        lt(lead.lastContactedAt, cutoff),
      ),
    )
}

// Job 15 — earned gems expiring in exactly `days` IST calendar days, grouped by
// customer with the total expiring amount. The day match is computed in JS via
// daysUntilIST. Returns one entry per affected customer.
export async function getGemsExpiringInDays(days: number, now: Date = new Date()) {
  const rows = await db
    .select({
      customerId: loyaltyAccount.customerId,
      gemsAmount: loyaltyTransaction.gemsAmount,
      expiresAt: loyaltyTransaction.expiresAt,
    })
    .from(loyaltyTransaction)
    .innerJoin(loyaltyAccount, eq(loyaltyTransaction.loyaltyAccountId, loyaltyAccount.id))
    .where(and(eq(loyaltyTransaction.type, 'earned'), isNotNull(loyaltyTransaction.expiresAt)))

  const byCustomer = new Map<string, number>()
  for (const r of rows) {
    if (r.expiresAt === null || daysUntilIST(r.expiresAt, now) !== days) {
      continue
    }
    byCustomer.set(r.customerId, (byCustomer.get(r.customerId) ?? 0) + r.gemsAmount)
  }

  return Array.from(byCustomer.entries()).map(([customerId, expiringGems]) => ({
    customerId,
    expiringGems,
  }))
}

// Shared aggregation for the daily (job 13) and weekly (job 14) reports. Revenue
// is summed over PAID invoices in the [invStart, invEnd) instant range; booking
// counters + new-customer detection run over bookings whose booking_date falls
// in [bkStart, bkEnd] (inclusive). Mirrors the daily-summary mapping so report
// figures equal the underlying invoices/invoice items. (Property 11)
async function computeReportData(invStart: Date, invEnd: Date, bkStart: Date, bkEnd: Date) {
  const invWhere = and(
    eq(invoice.paymentStatus, 'paid'),
    gte(invoice.createdAt, invStart),
    lt(invoice.createdAt, invEnd),
  )
  const bkWhere = and(gte(booking.bookingDate, bkStart), lte(booking.bookingDate, bkEnd))

  const [rev] = await db
    .select({
      totalPaise: sql<number>`coalesce(sum(${invoice.totalAmountPaise}), 0)::int`,
      salonPaise: sql<number>`coalesce(sum(case when ${invoice.invoiceType} = 'service' and ${booking.serviceType} = 'salon' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
      spaPaise: sql<number>`coalesce(sum(case when ${invoice.invoiceType} = 'service' and ${booking.serviceType} = 'spa' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
      membershipPaise: sql<number>`coalesce(sum(case when ${invoice.invoiceType} = 'membership_purchase' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
    })
    .from(invoice)
    .leftJoin(booking, eq(invoice.bookingId, booking.id))
    .where(invWhere)

  const serviceRows = await db
    .select({
      name: invoiceItem.serviceNameSnapshot,
      qty: sql<number>`coalesce(sum(${invoiceItem.quantity}), 0)::int`,
      revenuePaise: sql<number>`coalesce(sum(${invoiceItem.totalPricePaise}), 0)::int`,
    })
    .from(invoiceItem)
    .innerJoin(invoice, eq(invoiceItem.invoiceId, invoice.id))
    .where(invWhere)
    .groupBy(invoiceItem.serviceNameSnapshot)
    .orderBy(desc(sql`sum(${invoiceItem.totalPricePaise})`))

  const [bk] = await db
    .select({
      completed: sql<number>`count(*) filter (where ${booking.status} = 'completed')::int`,
      noShows: sql<number>`count(*) filter (where ${booking.status} = 'no_show')::int`,
      cancelled: sql<number>`count(*) filter (where ${booking.status} = 'cancelled')::int`,
      walkIns: sql<number>`count(*) filter (where ${booking.isWalkin} = true)::int`,
      membershipSessions: sql<number>`count(*) filter (where ${booking.isMembershipSession} = true)::int`,
      distinctCustomers: sql<number>`count(distinct ${booking.customerId})::int`,
    })
    .from(booking)
    .where(bkWhere)

  const firstBooking = db
    .select({
      customerId: booking.customerId,
      bookingDate: booking.bookingDate,
      rn: sql<number>`row_number() over (partition by ${booking.customerId} order by ${booking.createdAt} asc)`.as(
        'rn',
      ),
    })
    .from(booking)
    .as('fb')

  const [newc] = await db
    .select({ newCount: sql<number>`count(*)::int` })
    .from(firstBooking)
    .where(
      and(
        eq(firstBooking.rn, 1),
        gte(firstBooking.bookingDate, bkStart),
        lte(firstBooking.bookingDate, bkEnd),
      ),
    )

  const newCount = newc?.newCount ?? 0
  const distinctCustomers = bk?.distinctCustomers ?? 0

  return {
    services: serviceRows.map((s) => ({
      name: s.name,
      qty: s.qty,
      revenuePaise: s.revenuePaise,
    })),
    revenue: {
      salonPaise: rev?.salonPaise ?? 0,
      spaPaise: rev?.spaPaise ?? 0,
      membershipPaise: rev?.membershipPaise ?? 0,
      totalPaise: rev?.totalPaise ?? 0,
    },
    bookings: {
      completed: bk?.completed ?? 0,
      noShows: bk?.noShows ?? 0,
      cancelled: bk?.cancelled ?? 0,
      walkIns: bk?.walkIns ?? 0,
    },
    customers: { newCount, returning: Math.max(0, distinctCustomers - newCount) },
    membershipSessions: bk?.membershipSessions ?? 0,
  }
}

// Job 13 — the day's report figures (shape matches @rgss/business
// DailyReportData), computed directly from the day's PAID invoices + bookings.
export async function getDailyReportData(dateISO: string) {
  const { start, end } = istDayRange(dateISO)
  const bookingDate = new Date(`${dateISO}T00:00:00.000Z`)
  const figures = await computeReportData(start, end, bookingDate, bookingDate)
  return { date: bookingDate, ...figures }
}

// Job 14 — the period's report figures (shape matches @rgss/business
// WeeklyReportData) over [startISO, endISO] inclusive, plus the period bounds.
export async function getWeeklyReportData(startISO: string, endISO: string) {
  const invStart = istDayRange(startISO).start
  const invEnd = istDayRange(endISO).end
  const periodStart = new Date(`${startISO}T00:00:00.000Z`)
  const periodEnd = new Date(`${endISO}T00:00:00.000Z`)
  const figures = await computeReportData(invStart, invEnd, periodStart, periodEnd)
  return { date: periodStart, periodStart, periodEnd, ...figures }
}

// Job 17 — a single booking by id, or null. The stale-pending route checks it is
// still 'pending' (and >24h old) before auto-rejecting. (Property 12)
export async function getPendingBooking(id: string) {
  const rows = await db.select().from(booking).where(eq(booking.id, id)).limit(1)
  return rows[0] ?? null
}

// Job 16 — a single booking by id with the owning customer's name/email and
// their marketing-consent flag, or null. The post-service-followup route only
// sends a review request when the booking is 'completed' AND the customer has
// marketing consent (consent is null when the user has no customer_profile —
// treated as no-consent by the caller). (Requirement 6.1)
export async function getBookingForFollowup(id: string) {
  const rows = await db
    .select({
      id: booking.id,
      status: booking.status,
      serviceType: booking.serviceType,
      customerId: booking.customerId,
      customerName: user.name,
      customerEmail: user.email,
      marketingConsent: customerProfile.marketingConsent,
    })
    .from(booking)
    .innerJoin(user, eq(booking.customerId, user.id))
    .leftJoin(customerProfile, eq(customerProfile.userId, user.id))
    .where(eq(booking.id, id))
    .limit(1)

  return rows[0] ?? null
}

// Job 18 — a single booking by id with the customer's name/email, or null. The
// no-show route notifies receptionists when it is still 'confirmed' past its end.
export async function getBookingForNoShow(id: string) {
  const rows = await db
    .select({
      booking,
      customerName: user.name,
      customerEmail: user.email,
    })
    .from(booking)
    .innerJoin(user, eq(booking.customerId, user.id))
    .where(eq(booking.id, id))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  return {
    ...found.booking,
    customerName: found.customerName,
    customerEmail: found.customerEmail,
  }
}

// Idempotency check shared by the notification-sending jobs: does a notification
// already exist for this user + type (optionally scoped to a booking)? Used to
// suppress duplicate sends across re-runs and QStash retries. (Property 6)
export async function hasNotification(
  userId: string,
  type: NotificationType,
  bookingId?: string,
): Promise<boolean> {
  const conditions = [eq(notification.userId, userId), eq(notification.type, type)]
  if (bookingId !== undefined) {
    conditions.push(eq(notification.bookingId, bookingId))
  }

  const rows = await db
    .select({ id: notification.id })
    .from(notification)
    .where(and(...conditions))
    .limit(1)

  return rows.length > 0
}

// User ids of staff who should receive operational alerts (stale-pending,
// no-show). Anyone at receptionist level or above.
export async function getReceptionistUserIds(): Promise<string[]> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.role, ['receptionist', 'manager', 'owner', 'developer']))

  return rows.map((r) => r.id)
}
