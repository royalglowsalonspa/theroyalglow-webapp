/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : jobs
 * Scope        : Data Access — Background Jobs
 *
 * Description  : Query functions for all 19 background jobs — pg_cron mirrors
 *                and QStash data reads for scheduled/triggered automation.
 *
 * Responsibilities :
 * - pg_cron TS mirrors: expire memberships, offers, sessions (gems expiry
 *   lives in gems-ledger.ts, which knows which gems were spent)
 * - Build the daily sales summary (idempotent upsert) and the monthly GST
 *   summary per branch, issuer GSTIN and SAC code (idempotent rebuild)
 * - QStash reads: upcoming bookings, expiring memberships, birthdays
 * - QStash reads: nudge-eligible memberships, stale leads, gems expiry
 * - Report data aggregation (daily and weekly)
 * - Notification idempotency checks and staff resolution
 *
 * Features / Functionality :
 * - All pg_cron functions are idempotent (safe to re-run)
 * - IST calendar-aware date matching for India timezone
 * - Daily sales summary with revenue split by payment/service type
 * - Monthly GST summary for filing compliance
 * - Shared report aggregation for daily/weekly email reports
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index, ../schema/auth, ../schema/booking,
 *                ../schema/invoice, ../schema/lead, ../schema/loyalty,
 *                ../schema/membership, ../schema/notification, ../schema/offer,
 *                ../schema/profile, ../schema/system
 *
 * Notes        : This layer intentionally re-derives IST helpers to avoid
 *                importing @rgss/business (strict layer rule). Routes use
 *                @rgss/business/jobs/time.ts for the richer IST utilities.
 ************************************************************/

import { and, asc, desc, eq, gte, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm'
import { db } from '../index'
import { session, user } from '../schema/auth'
import { booking } from '../schema/booking'
import { branch } from '../schema/branch'
import { invoice, invoiceItem } from '../schema/invoice'
import { lead } from '../schema/lead'
import { spaMembership } from '../schema/membership'
import { notification } from '../schema/notification'
import { offer } from '../schema/offer'
import { customerProfile } from '../schema/profile'
import { dailySalesSummary, monthlyGstSummary } from '../schema/system'
import {
  expireLapsedGems,
  type GemsExpiryResult,
  returnGemsOfEndedRedemptions,
} from './gems-ledger'

// ============================================================================
// Background-jobs query layer (Phase 6).
//
// Two groups live here:
//   1. pg_cron TS equivalents — callable mirrors of the SQL functions in
//      migrations/0001_pg_cron_jobs.sql, so the same maintenance logic can be
//      invoked on demand (e.g. a "rebuild summary" admin action) and reasoned
//      about in the typed codebase. Every function is idempotent, matching the
//      SQL's ON CONFLICT upserts / status-guarded updates.
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

// 'YYYY-MM' of the IST calendar month before the one containing `now`: the
// month the monthly GST summary closes when it runs early in the next month.
export function previousIstMonthKey(now: Date): string {
  const wall = new Date(now.getTime() + IST_OFFSET_MS)
  const month = wall.getUTCMonth() // 0-11: the current IST month
  const year = month === 0 ? wall.getUTCFullYear() - 1 : wall.getUTCFullYear()
  return `${year}-${pad2(month === 0 ? 12 : month)}`
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
// rows (is_active already false). (Property 2) Legacy admin offers only: a
// Payload offer ends by its dates, and its mirror keeps `active` as the CMS
// has it (offers.md).
export async function expireOffers(now: Date = new Date()): Promise<number> {
  const todayIST = new Date(`${istDateString(now)}T00:00:00.000Z`)
  const rows = await db
    .update(offer)
    .set({ isActive: false })
    .where(and(eq(offer.isActive, true), lt(offer.endDate, todayIST), isNull(offer.cmsId)))
    .returning()

  return rows.length
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

// Job 6 — rebuild the GST summary of one IST month ('YYYY-MM'): one row per
// branch, issuer GSTIN and SAC code (multi-branch R6.5), summed from the stored
// line amounts of the paid service and membership-purchase invoices whose tax
// point falls in the month, never from current rates. An invoice issued before
// the snapshots existed has no line tax: it counts under SAC 999721 with its
// header amounts and its creation day, CGST half the GST rounded down (the
// `splitIntraState` rule). invoice_count counts the invoices with a line under
// the code, so an invoice with lines under two codes counts in both rows.
//
// The month's rows are replaced in one transaction, so a re-run gives the same
// rows and an invoice that is no longer paid drops out. A duplicate delivery
// running at the same time updates the rows the first one inserted instead of
// failing on the unique key. (Property 4)
export async function buildMonthlyGstSummary(monthKey: string) {
  const results = await db.batch([
    db.delete(monthlyGstSummary).where(eq(monthlyGstSummary.month, monthKey)),
    db.execute(sql`
      INSERT INTO monthly_gst_summary
        (id, month, branch_id, issuer_gstin, sac_code, taxable_value_paise,
         gst_amount_paise, cgst_paise, sgst_paise, invoice_count)
      SELECT
        md5(${monthKey}::text || ':' || l.branch_id || ':' || coalesce(l.issuer_gstin, '') || ':' || l.sac_code),
        ${monthKey}::text,
        l.branch_id,
        l.issuer_gstin,
        l.sac_code,
        sum(l.taxable_value_paise)::int,
        sum(l.tax_paise)::int,
        sum(l.cgst_paise)::int,
        sum(l.sgst_paise)::int,
        count(DISTINCT l.invoice_id)::int
      FROM (
        SELECT i.id AS invoice_id, i.branch_id, i.issuer_gstin, ii.sac_code,
               ii.taxable_value_paise, ii.tax_paise, ii.cgst_paise, ii.sgst_paise
          FROM invoice i
          JOIN invoice_item ii ON ii.invoice_id = i.id
         WHERE i.tax_point_at IS NOT NULL
           AND i.payment_status = 'paid'
           AND i.invoice_type IN ('service', 'membership_purchase')
           AND to_char(i.tax_point_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = ${monthKey}::text
        UNION ALL
        SELECT i.id, i.branch_id, i.issuer_gstin, '999721',
               i.taxable_value_paise, i.gst_amount_paise,
               i.gst_amount_paise / 2, i.gst_amount_paise - i.gst_amount_paise / 2
          FROM invoice i
         WHERE i.tax_point_at IS NULL
           AND i.payment_status = 'paid'
           AND i.invoice_type IN ('service', 'membership_purchase')
           AND to_char(i.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = ${monthKey}::text
      ) l
      GROUP BY l.branch_id, l.issuer_gstin, l.sac_code
      ON CONFLICT ON CONSTRAINT monthly_gst_summary_month_branch_issuer_sac_unique DO UPDATE SET
        taxable_value_paise = EXCLUDED.taxable_value_paise,
        gst_amount_paise    = EXCLUDED.gst_amount_paise,
        cgst_paise          = EXCLUDED.cgst_paise,
        sgst_paise          = EXCLUDED.sgst_paise,
        invoice_count       = EXCLUDED.invoice_count
    `),
    db
      .select()
      .from(monthlyGstSummary)
      .where(eq(monthlyGstSummary.month, monthKey))
      .orderBy(
        asc(monthlyGstSummary.branchId),
        asc(monthlyGstSummary.issuerGstin),
        asc(monthlyGstSummary.sacCode),
      ),
  ])
  return results[2]
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
      // The reminder names the branch (multi-branch R7.2).
      branchName: branch.name,
      customerName: user.name,
      customerEmail: user.email,
      appointmentRemindersEnabled: customerProfile.appointmentRemindersEnabled,
    })
    .from(booking)
    .innerJoin(branch, eq(branch.id, booking.branchId))
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
// customer with the total expiring amount: each batch's unspent gems only, so a
// customer is never warned about gems they already spent (settlement.md). The
// day match is computed in JS via daysUntilIST. Returns one entry per affected
// customer.
export async function getGemsExpiringInDays(days: number, now: Date = new Date()) {
  const result = await db.execute<{
    customer_id: string
    unspent: string | number
    expires_at: string | Date
  }>(sql`
    select la.customer_id, u.unspent, e.expires_at
      from loyalty_transaction e
      join loyalty_account la on la.id = e.loyalty_account_id
     cross join lateral (select loyalty_batch_unspent(e.id) as unspent) u
     where e.type = 'earned'
       and e.expires_at is not null
       and e.expires_at > ${now.toISOString()}::timestamptz
       and u.unspent > 0
  `)

  const byCustomer = new Map<string, number>()
  for (const r of result.rows) {
    if (daysUntilIST(new Date(r.expires_at), now) !== days) {
      continue
    }
    byCustomer.set(r.customer_id, (byCustomer.get(r.customer_id) ?? 0) + Number(r.unspent))
  }

  return Array.from(byCustomer.entries()).map(([customerId, expiringGems]) => ({
    customerId,
    expiringGems,
  }))
}

// One branch's report figures over a period. Structurally the same as
// @rgss/business ReportFigures (this layer can't import that package).
export type BranchReportFigures = {
  services: { name: string; qty: number; revenuePaise: number }[]
  revenue: { salonPaise: number; spaPaise: number; membershipPaise: number; totalPaise: number }
  bookings: { completed: number; noShows: number; cancelled: number; walkIns: number }
  customers: { newCount: number; returning: number }
  membershipSessions: number
}

function emptyBranchReportFigures(): BranchReportFigures {
  return {
    services: [],
    revenue: { salonPaise: 0, spaPaise: 0, membershipPaise: 0, totalPaise: 0 },
    bookings: { completed: 0, noShows: 0, cancelled: 0, walkIns: 0 },
    customers: { newCount: 0, returning: 0 },
    membershipSessions: 0,
  }
}

// Shared aggregation for the daily (job 13) and weekly (job 14) reports, one
// set of figures per branch (multi-branch R6.5, R7.4). Revenue is summed over
// PAID invoices in the [invStart, invEnd) instant range, by the invoice's
// branch. Booking counters run over bookings whose booking_date falls in
// [bkStart, bkEnd] (inclusive), by the booking's branch. A new customer is
// one whose first booking anywhere falls in the period, counted at that
// booking's branch; every other customer seen at a branch is returning there.
// Only branches with activity appear. The four reads run in one db.batch().
// Mirrors the daily-summary mapping so report figures equal the underlying
// invoices/invoice items. (Property 11)
async function computeBranchReports(
  invStart: Date,
  invEnd: Date,
  bkStart: Date,
  bkEnd: Date,
): Promise<Map<string, BranchReportFigures>> {
  const invWhere = and(
    eq(invoice.paymentStatus, 'paid'),
    gte(invoice.createdAt, invStart),
    lt(invoice.createdAt, invEnd),
  )
  const bkWhere = and(gte(booking.bookingDate, bkStart), lte(booking.bookingDate, bkEnd))

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

  const [revenueRows, serviceRows, bookingRows, newCustomerRows] = await db.batch([
    db
      .select({
        branchId: invoice.branchId,
        totalPaise: sql<number>`coalesce(sum(${invoice.totalAmountPaise}), 0)::int`,
        salonPaise: sql<number>`coalesce(sum(case when ${invoice.invoiceType} = 'service' and ${booking.serviceType} = 'salon' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
        spaPaise: sql<number>`coalesce(sum(case when ${invoice.invoiceType} = 'service' and ${booking.serviceType} = 'spa' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
        membershipPaise: sql<number>`coalesce(sum(case when ${invoice.invoiceType} = 'membership_purchase' then ${invoice.totalAmountPaise} else 0 end), 0)::int`,
      })
      .from(invoice)
      .leftJoin(booking, eq(invoice.bookingId, booking.id))
      .where(invWhere)
      .groupBy(invoice.branchId),
    db
      .select({
        branchId: invoice.branchId,
        name: invoiceItem.serviceNameSnapshot,
        qty: sql<number>`coalesce(sum(${invoiceItem.quantity}), 0)::int`,
        revenuePaise: sql<number>`coalesce(sum(${invoiceItem.totalPricePaise}), 0)::int`,
      })
      .from(invoiceItem)
      .innerJoin(invoice, eq(invoiceItem.invoiceId, invoice.id))
      .where(invWhere)
      .groupBy(invoice.branchId, invoiceItem.serviceNameSnapshot)
      .orderBy(
        asc(invoice.branchId),
        desc(sql`sum(${invoiceItem.totalPricePaise})`),
        asc(invoiceItem.serviceNameSnapshot),
      ),
    db
      .select({
        branchId: booking.branchId,
        completed: sql<number>`count(*) filter (where ${booking.status} = 'completed')::int`,
        noShows: sql<number>`count(*) filter (where ${booking.status} = 'no_show')::int`,
        cancelled: sql<number>`count(*) filter (where ${booking.status} = 'cancelled')::int`,
        walkIns: sql<number>`count(*) filter (where ${booking.isWalkin} = true)::int`,
        membershipSessions: sql<number>`count(*) filter (where ${booking.isMembershipSession} = true)::int`,
        distinctCustomers: sql<number>`count(distinct ${booking.customerId})::int`,
      })
      .from(booking)
      .where(bkWhere)
      .groupBy(booking.branchId),
    db
      .select({ branchId: firstBooking.branchId, newCount: sql<number>`count(*)::int` })
      .from(firstBooking)
      .where(
        and(
          eq(firstBooking.rn, 1),
          gte(firstBooking.bookingDate, bkStart),
          lte(firstBooking.bookingDate, bkEnd),
        ),
      )
      .groupBy(firstBooking.branchId),
  ])

  const reports = new Map<string, BranchReportFigures>()
  const forBranch = (branchId: string): BranchReportFigures => {
    const existing = reports.get(branchId)
    if (existing) {
      return existing
    }
    const created = emptyBranchReportFigures()
    reports.set(branchId, created)
    return created
  }

  for (const row of revenueRows) {
    forBranch(row.branchId).revenue = {
      salonPaise: row.salonPaise,
      spaPaise: row.spaPaise,
      membershipPaise: row.membershipPaise,
      totalPaise: row.totalPaise,
    }
  }
  for (const row of serviceRows) {
    forBranch(row.branchId).services.push({
      name: row.name,
      qty: row.qty,
      revenuePaise: row.revenuePaise,
    })
  }
  const distinctCustomers = new Map<string, number>()
  for (const row of bookingRows) {
    const figures = forBranch(row.branchId)
    figures.bookings = {
      completed: row.completed,
      noShows: row.noShows,
      cancelled: row.cancelled,
      walkIns: row.walkIns,
    }
    figures.membershipSessions = row.membershipSessions
    distinctCustomers.set(row.branchId, row.distinctCustomers)
  }
  for (const row of newCustomerRows) {
    forBranch(row.branchId).customers.newCount = row.newCount
  }
  for (const [branchId, figures] of reports) {
    figures.customers.returning = Math.max(
      0,
      (distinctCustomers.get(branchId) ?? 0) - figures.customers.newCount,
    )
  }
  return reports
}

// Job 13 — each branch's figures for one IST day, from that day's PAID
// invoices and bookings. Branches without activity are absent.
export async function getDailyBranchReports(dateISO: string) {
  const { start, end } = istDayRange(dateISO)
  const bookingDate = new Date(`${dateISO}T00:00:00.000Z`)
  const branches = await computeBranchReports(start, end, bookingDate, bookingDate)
  return { date: bookingDate, branches }
}

// Job 14 — each branch's figures over [startISO, endISO] inclusive, plus the
// period bounds. Branches without activity are absent.
export async function getWeeklyBranchReports(startISO: string, endISO: string) {
  const invStart = istDayRange(startISO).start
  const invEnd = istDayRange(endISO).end
  const periodStart = new Date(`${startISO}T00:00:00.000Z`)
  const periodEnd = new Date(`${endISO}T00:00:00.000Z`)
  const branches = await computeBranchReports(invStart, invEnd, periodStart, periodEnd)
  return { date: periodStart, periodStart, periodEnd, branches }
}

// Job 17 — a single booking by id, or null. The stale-pending route alerts the
// receptionists only while it is still 'pending'. (Property 12)
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
      // The review request names the branch and links its own Google listing.
      branchName: branch.name,
      branchGoogleMapsUrl: branch.googleMapsUrl,
    })
    .from(booking)
    .innerJoin(branch, eq(branch.id, booking.branchId))
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

// Daily idempotency for the jobs that send one message per person per day
// (lead follow-ups, the missing-Manager reminder): has this user had a
// notification of this type since `since`? Suppresses repeats on re-runs and
// QStash retries the same day. (Property 6)
export async function hasNotificationSince(
  userId: string,
  type: NotificationType,
  since: Date,
): Promise<boolean> {
  const rows = await db
    .select({ id: notification.id })
    .from(notification)
    .where(
      and(
        eq(notification.userId, userId),
        eq(notification.type, type),
        gte(notification.createdAt, since),
      ),
    )
    .limit(1)

  return rows.length > 0
}

// Operational alerts (stale-pending, no-show, lead follow-ups) go to the
// branch's own people: see getBranchPeople (branch-recipients.ts) and
// frontDeskRecipients in @rgss/business (multi-branch R7.4).

// Job 21 — Pending-booking closeout (route: /api/jobs/pending-booking-closeout,
// 30 16 * * * UTC = 10:00 PM IST, after the 21:00 close). A booking the salon
// never confirmed, rejected or cancelled must not stay 'pending' once its
// appointment is over, so every still-pending booking whose IST end instant
// (booking_date + end_time) is at or before `now` becomes 'no_show'.
//
// - Status-guarded UPDATE → idempotent: a QStash retry or re-run matches only
//   rows that are still pending, i.e. nothing it already closed.
// - The end-instant predicate (not "booking_date < today") means a manual or
//   early run never closes an appointment that has not happened yet, and the
//   first run also sweeps the whole backlog of earlier days.
// - Deliberately does NOT touch customer_profile.noshow_count: the salon never
//   confirmed these bookings, so they must not count toward no-show tiers.
// - No booking_status_log row: changed_by_id is a NOT NULL user FK and a system
//   transition has no acting user (same as the other system status jobs).
// - A booking made with gems gives them back to their batches in the same
//   transaction (settlement.md ST-03); the return also catches any earlier
//   ended booking whose gems were never returned.
//
// Returns the closed bookings so the route can log/publish them.
export async function closeLapsedPendingBookings(now: Date = new Date()) {
  const [closed] = await db.batch([
    db
      .update(booking)
      .set({ status: 'no_show' })
      .where(
        and(
          eq(booking.status, 'pending'),
          sql`(${booking.bookingDate} + ${booking.endTime}) AT TIME ZONE 'Asia/Kolkata' <= ${now.toISOString()}::timestamptz`,
        ),
      )
      .returning({
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        branchId: booking.branchId,
        customerId: booking.customerId,
      }),
    ...returnGemsOfEndedRedemptions(sql`true`),
  ])
  return closed
}

// ============================================================================
// 3. pg_cron → QStash VERBATIM SQL ports (Phase 6 migration)
// ----------------------------------------------------------------------------
// WHY THESE EXIST
//   The 6 functions below were MIGRATED OUT of pg_cron
//   (migrations/0001_pg_cron_jobs.sql). pg_cron only runs while the Neon
//   compute is awake, but the free-tier prod compute scales to zero after
//   ~5 min idle, so the late-night pg_cron windows would silently never fire.
//   QStash instead POSTs an HTTP endpoint that WAKES the compute, so each job
//   runs reliably at the same UTC time at ₹0. Each route below calls exactly
//   one of these query functions.
//
// WHY RAW SQL (db.execute(sql`...`)) RATHER THAN THE TYPED MIRRORS ABOVE
//   The pg_cron function BODIES are the canonical, reviewed, idempotent source
//   of truth. To guarantee the QStash port behaves byte-for-byte like the
//   pg_cron job it replaces, each body is ported VERBATIM here — the SQL is the
//   same statement pg_cron executed (CTE + ON CONFLICT upserts, status-guarded
//   UPDATEs). The gems expiry is the exception: the original expired spent gems
//   too, so it was rewritten (job 7 below). The typed Drizzle mirrors in
//   section 1 remain for on-demand/admin use; these raw ports are what the
//   scheduled routes invoke.
//
// IDEMPOTENCY / AT-LEAST-ONCE SAFETY
//   QStash delivers at-least-once and retries on any non-2xx, so a job body may
//   run more than once over the same data. Every body below is idempotent:
//     - nightly sales / monthly GST  → INSERT ... ON CONFLICT DO UPDATE (re-run
//       recomputes the same row),
//     - membership / offer auto-expire → status-guarded UPDATE (re-run matches
//       zero rows),
//     - session cleanup → DELETE of already-gone rows is a no-op,
//     - gems auto-expire → expires each batch's unspent gems, so a re-run finds
//       nothing left to expire and conserves the balance.
//
// All cron windows are UTC (Postgres/Neon runs UTC); calendar-day boundaries
// are converted to 'Asia/Kolkata' inside the SQL exactly as pg_cron did.
// ============================================================================

// Job 1 — Nightly Sales Summary (route: /api/jobs/nightly-sales-summary,
// heartbeat SALES_SUMMARY, 0 18 * * * UTC = 11:30 PM IST). Aggregates the
// PREVIOUS IST day's PAID invoices + that day's bookings into one
// daily_sales_summary row per branch. Idempotent via the (date, branch_id)
// unique constraint → ON CONFLICT DO UPDATE. Ported verbatim from
// job_nightly_sales_summary() in migrations/0001_pg_cron_jobs.sql.
export async function jobNightlySalesSummary(): Promise<void> {
  await db.execute(sql`
    WITH target AS (
      SELECT (((NOW() AT TIME ZONE 'Asia/Kolkata')::date) - INTERVAL '1 day')::date AS ist_date
    ),
    inv AS (
      SELECT
        i.branch_id,
        SUM(i.total_amount_paise)::int AS total_revenue_paise,
        SUM(CASE WHEN i.invoice_type = 'service' AND b.service_type = 'salon'
                 THEN i.total_amount_paise ELSE 0 END)::int AS salon_revenue_paise,
        SUM(CASE WHEN i.invoice_type = 'service' AND b.service_type = 'spa'
                 THEN i.total_amount_paise ELSE 0 END)::int AS spa_revenue_paise,
        SUM(CASE WHEN i.invoice_type = 'membership_purchase'
                 THEN i.total_amount_paise ELSE 0 END)::int AS membership_revenue_paise,
        SUM(CASE WHEN i.payment_method = 'cash'   THEN i.total_amount_paise ELSE 0 END)::int AS cash_revenue_paise,
        SUM(CASE WHEN i.payment_method = 'upi'    THEN i.total_amount_paise ELSE 0 END)::int AS upi_revenue_paise,
        SUM(CASE WHEN i.payment_method = 'card'   THEN i.total_amount_paise ELSE 0 END)::int AS card_revenue_paise,
        SUM(CASE WHEN i.payment_method = 'online' THEN i.total_amount_paise ELSE 0 END)::int AS online_revenue_paise,
        SUM(i.discount_amount_paise)::int AS discount_given_paise,
        SUM(i.gems_redeemed)::int AS gems_redeemed_count
      FROM invoice i
      LEFT JOIN booking b ON i.booking_id = b.id
      CROSS JOIN target t
      WHERE i.payment_status = 'paid'
        AND (i.created_at AT TIME ZONE 'Asia/Kolkata')::date = t.ist_date
      GROUP BY i.branch_id
    ),
    bk AS (
      SELECT
        b.branch_id,
        COUNT(*)::int AS total_bookings,
        COUNT(*) FILTER (WHERE b.status = 'completed')::int AS completed_bookings,
        COUNT(*) FILTER (WHERE b.status = 'cancelled')::int AS cancelled_bookings,
        COUNT(*) FILTER (WHERE b.status = 'no_show')::int   AS no_show_bookings,
        COUNT(*) FILTER (WHERE b.is_walkin = true)::int     AS walkin_bookings
      FROM booking b
      CROSS JOIN target t
      WHERE b.booking_date = t.ist_date
      GROUP BY b.branch_id
    ),
    first_booking AS (
      SELECT b.customer_id, b.branch_id, b.booking_date,
             ROW_NUMBER() OVER (PARTITION BY b.customer_id ORDER BY b.created_at ASC) AS rn
      FROM booking b
    ),
    newc AS (
      SELECT fb.branch_id, COUNT(*)::int AS new_customers
      FROM first_booking fb
      CROSS JOIN target t
      WHERE fb.rn = 1 AND fb.booking_date = t.ist_date
      GROUP BY fb.branch_id
    ),
    branches AS (
      SELECT branch_id FROM inv
      UNION
      SELECT branch_id FROM bk
    )
    INSERT INTO daily_sales_summary (
      id, date, branch_id,
      total_bookings, completed_bookings, cancelled_bookings, no_show_bookings, walkin_bookings,
      total_revenue_paise, salon_revenue_paise, spa_revenue_paise, membership_revenue_paise,
      cash_revenue_paise, upi_revenue_paise, card_revenue_paise, online_revenue_paise,
      discount_given_paise, gems_redeemed_count, new_customers
    )
    SELECT
      md5(t.ist_date::text || ':' || br.branch_id),
      t.ist_date,
      br.branch_id,
      COALESCE(bk.total_bookings, 0),
      COALESCE(bk.completed_bookings, 0),
      COALESCE(bk.cancelled_bookings, 0),
      COALESCE(bk.no_show_bookings, 0),
      COALESCE(bk.walkin_bookings, 0),
      COALESCE(inv.total_revenue_paise, 0),
      COALESCE(inv.salon_revenue_paise, 0),
      COALESCE(inv.spa_revenue_paise, 0),
      COALESCE(inv.membership_revenue_paise, 0),
      COALESCE(inv.cash_revenue_paise, 0),
      COALESCE(inv.upi_revenue_paise, 0),
      COALESCE(inv.card_revenue_paise, 0),
      COALESCE(inv.online_revenue_paise, 0),
      COALESCE(inv.discount_given_paise, 0),
      COALESCE(inv.gems_redeemed_count, 0),
      COALESCE(newc.new_customers, 0)
    FROM branches br
    CROSS JOIN target t
    LEFT JOIN inv  ON inv.branch_id  = br.branch_id
    LEFT JOIN bk   ON bk.branch_id   = br.branch_id
    LEFT JOIN newc ON newc.branch_id = br.branch_id
    ON CONFLICT (date, branch_id) DO UPDATE SET
      total_bookings           = EXCLUDED.total_bookings,
      completed_bookings       = EXCLUDED.completed_bookings,
      cancelled_bookings       = EXCLUDED.cancelled_bookings,
      no_show_bookings         = EXCLUDED.no_show_bookings,
      walkin_bookings          = EXCLUDED.walkin_bookings,
      total_revenue_paise      = EXCLUDED.total_revenue_paise,
      salon_revenue_paise      = EXCLUDED.salon_revenue_paise,
      spa_revenue_paise        = EXCLUDED.spa_revenue_paise,
      membership_revenue_paise = EXCLUDED.membership_revenue_paise,
      cash_revenue_paise       = EXCLUDED.cash_revenue_paise,
      upi_revenue_paise        = EXCLUDED.upi_revenue_paise,
      card_revenue_paise       = EXCLUDED.card_revenue_paise,
      online_revenue_paise     = EXCLUDED.online_revenue_paise,
      discount_given_paise     = EXCLUDED.discount_given_paise,
      gems_redeemed_count      = EXCLUDED.gems_redeemed_count,
      new_customers            = EXCLUDED.new_customers
  `)
}

/** Why the expiry job cancelled a membership session that never started. */
export const MEMBERSHIP_EXPIRED_SESSION_REASON =
  'The membership expired before this session started.'

// Job 2 — Membership Auto-Expire (route: /api/jobs/membership-auto-expire,
// heartbeat MEMBERSHIP_EXPIRE, 30 18 * * * UTC = 12:00 AM IST). In one
// transaction: cancels the sessions of expired memberships that never started,
// which gives back their held minutes (0026; they can't start any more,
// MS-04, MS-06), then flips active memberships past their expiry to
// 'expired'. Sessions already in progress keep their minutes and complete
// later. Status-guarded, so a re-run matches nothing. No status log: a system
// change has no acting user (as in the other status jobs).
export async function jobMembershipAutoExpire(): Promise<{
  expired: number
  cancelledSessions: number
}> {
  const [cancelled, expired] = await db.batch([
    db.execute<{ n: number }>(sql`
      WITH unstarted AS (
        UPDATE booking b
           SET status = 'cancelled', cancellation_reason = ${MEMBERSHIP_EXPIRED_SESSION_REASON},
               cancelled_at = now(), updated_at = now()
         WHERE b.is_membership_session
           AND b.status IN ('pending', 'confirmed')
           AND b.spa_membership_id IN (SELECT m.id FROM spa_membership m
                                        WHERE m.status IN ('active', 'expired')
                                          AND m.expires_at < now())
        RETURNING 1
      )
      SELECT count(*)::int AS n FROM unstarted
    `),
    db.execute<{ n: number }>(sql`
      WITH flipped AS (
        UPDATE spa_membership
           SET status = 'expired', updated_at = now()
         WHERE status = 'active'
           AND expires_at < now()
        RETURNING 1
      )
      SELECT count(*)::int AS n FROM flipped
    `),
  ])
  return {
    expired: Number(expired.rows[0]?.n ?? 0),
    cancelledSessions: Number(cancelled.rows[0]?.n ?? 0),
  }
}

// Job 3 — Offer Auto-Expire (route: /api/jobs/offer-auto-expire, heartbeat
// OFFER_EXPIRE, 35 18 * * * UTC = 12:05 AM IST). Deactivates offers whose
// end_date (a DATE) has passed the current IST calendar date. Status-guarded →
// idempotent. Ported verbatim from job_offer_auto_expire(). Since 31/10/2026
// only legacy admin offers (`cms_id IS NULL`): a Payload offer ends by its
// dates, which checkout and every list check, and its mirror keeps `active`
// as the CMS has it, so the drift check stays clean (offers.md).
export async function jobOfferAutoExpire(): Promise<void> {
  await db.execute(sql`
    UPDATE offer
    SET is_active = false, updated_at = NOW()
    WHERE is_active = true
      AND cms_id IS NULL
      AND end_date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date
  `)
}

// Job 4 — Session Cleanup (route: /api/jobs/session-cleanup, heartbeat
// SESSION_CLEANUP, 0 21 * * 0 UTC = 2:30 AM IST Sunday). Deletes expired Better
// Auth session rows. Idempotent: a re-run deletes zero rows. Ported verbatim
// from job_session_cleanup().
export async function jobSessionCleanup(): Promise<void> {
  await db.execute(sql`
    DELETE FROM session
    WHERE expires_at < NOW()
  `)
}

// Job 6 — Monthly GST Summary (route: /api/jobs/monthly-gst-summary, heartbeat
// MONTHLY_GST, 30 19 1 * * UTC = 01:00 IST on the 2nd). Rebuilds the
// PREVIOUS IST month's rows per branch, issuer GSTIN and SAC code; see
// buildMonthlyGstSummary. Idempotent: a re-run replaces the month's rows with
// the same values.
export async function jobMonthlyGstSummary(now: Date = new Date()) {
  return buildMonthlyGstSummary(previousIstMonthKey(now))
}

// Job 7 — Gems Auto-Expire (route: /api/jobs/gems-auto-expire, heartbeat
// GEMS_EXPIRE, 40 18 * * * UTC = 12:10 AM IST). Each earned batch past its
// expiry loses its UNSPENT gems only: its amount less what redemptions took
// from it and what has already expired of it. The old port expired a batch's
// full amount even when the customer had spent it, which could drive the
// balance negative (settlement.md); the database now refuses that.
//
// One transaction (gems-ledger.ts expireLapsedGems): lock the affected
// accounts, give back the gems of any ended booking that still holds them,
// then expire what is left unspent and debit the balances. Idempotent: a
// re-run finds nothing unspent, so QStash retries expire nothing twice.
export async function jobGemsAutoExpire(): Promise<GemsExpiryResult> {
  return expireLapsedGems()
}
