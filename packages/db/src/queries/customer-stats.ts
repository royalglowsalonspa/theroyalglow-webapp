/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : customer-stats
 * Scope        : Data Access — CRM customer KPIs
 *
 * Description  : Keeps the denormalised CRM KPIs on customer_profile
 *                (total_visits, total_spent_paise, first_visit_at,
 *                last_visit_at) equal to what the source-of-truth tables say.
 *
 * Responsibilities :
 * - Build ONE set-based recompute statement for a set of customers
 * - Expose it as a batch item so write paths refresh inside their own
 *   atomic db.batch() (the booking/invoice rows are visible to it)
 * - Expose a standalone refresh for the nightly reconcile / backfill
 *
 * Features / Functionality :
 * - Recompute, never increment: re-running converges to the same values,
 *   so QStash retries and repeated runs can never double count
 * - Writes only rows whose values actually changed (IS DISTINCT FROM),
 *   so a no-op reconcile does not churn updated_at
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index
 *
 * Notes        : Definitions (the read model the CRM list/profile shows):
 *                - visit        = a booking with status 'completed' (service,
 *                                 walk-in, membership session, gems redemption)
 *                - visit instant = booking_date + start_time, read as IST
 *                - LTV          = sum of PAID invoice totals of every type
 *                                 (service + membership purchase; sessions are ₹0)
 *                The aggregation is set-based SQL on purpose: reading rows into
 *                JS and writing back would be N+1 and non-atomic. It sits beside
 *                the other aggregate read models (daily_sales_summary) in this
 *                package. noshow_count is deliberately NOT derived here — it is
 *                a manager-adjustable counter (PATCH /api/customers/[id]).
 ************************************************************/

import { type SQL, sql } from 'drizzle-orm'
import { db } from '../index'

// Which customer_profile rows to recompute. `null` = every profile (nightly
// reconcile / first-run backfill); a list = only those customers' rows.
type StatsTarget = readonly string[] | null

function targetSelect(customerIds: StatsTarget): SQL {
  if (customerIds === null) {
    return sql`SELECT user_id FROM customer_profile`
  }
  const ids = sql.join(
    customerIds.map((id) => sql`${id}`),
    sql`, `,
  )
  return sql`SELECT user_id FROM customer_profile WHERE user_id IN (${ids})`
}

// One statement: aggregate visits + spend for the target customers from
// booking/invoice, then write the four KPI columns where they differ. Uses the
// booking_customer_id_idx / invoice_customer_id_idx indexes via the target join.
export function customerStatsRefreshSql(customerIds: StatsTarget): SQL {
  return sql`
    WITH target AS (${targetSelect(customerIds)}),
    visits AS (
      SELECT b.customer_id,
             count(*)::int AS total_visits,
             min((b.booking_date + b.start_time) AT TIME ZONE 'Asia/Kolkata') AS first_visit_at,
             max((b.booking_date + b.start_time) AT TIME ZONE 'Asia/Kolkata') AS last_visit_at
        FROM booking b
        JOIN target t ON t.user_id = b.customer_id
       WHERE b.status = 'completed'
       GROUP BY b.customer_id
    ),
    spend AS (
      SELECT i.customer_id,
             sum(i.total_amount_paise)::int AS total_spent_paise
        FROM invoice i
        JOIN target t ON t.user_id = i.customer_id
       WHERE i.payment_status = 'paid'
       GROUP BY i.customer_id
    ),
    computed AS (
      SELECT t.user_id,
             COALESCE(v.total_visits, 0)      AS total_visits,
             COALESCE(s.total_spent_paise, 0) AS total_spent_paise,
             v.first_visit_at,
             v.last_visit_at
        FROM target t
        LEFT JOIN visits v ON v.customer_id = t.user_id
        LEFT JOIN spend  s ON s.customer_id = t.user_id
    )
    UPDATE customer_profile cp
       SET total_visits      = c.total_visits,
           total_spent_paise = c.total_spent_paise,
           first_visit_at    = c.first_visit_at,
           last_visit_at     = c.last_visit_at,
           updated_at        = now()
      FROM computed c
     WHERE cp.user_id = c.user_id
       AND (cp.total_visits, cp.total_spent_paise, cp.first_visit_at, cp.last_visit_at)
           IS DISTINCT FROM
           (c.total_visits, c.total_spent_paise, c.first_visit_at, c.last_visit_at)
    RETURNING cp.user_id
  `
}

// Batch item that refreshes ONE customer's KPIs. Append it to a write path's
// db.batch() AFTER the booking/invoice statements: the batch is one transaction,
// so the recompute sees those rows and the KPIs commit (or roll back) with them.
export function refreshCustomerStatsStatement(customerId: string) {
  return db.execute(customerStatsRefreshSql([customerId]))
}

// Standalone refresh. With no argument it reconciles every customer (nightly
// job; also the backfill for profiles written before the KPIs were maintained).
// Returns how many profiles actually changed.
export async function refreshCustomerStats(customerIds?: readonly string[]): Promise<number> {
  if (customerIds !== undefined && customerIds.length === 0) {
    return 0
  }
  const result = await db.execute(customerStatsRefreshSql(customerIds ?? null))
  return result.rows.length
}
