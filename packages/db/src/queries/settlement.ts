/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settlement
 * Scope        : Data Access — cross-branch settlement (R10)
 *
 * Description  : Monthly statements between branches for SPA membership
 *                sessions and gems (settlement.md): closing ended IST months,
 *                reading statements, entries and the open months, recording a
 *                payment, correcting an entry with a reversing entry, and each
 *                branch's figures for its reports.
 *
 * Responsibilities :
 * - closeSettlementMonths: one statement per pair of branches with entries,
 *   and each branch's net position, for every ended month not closed yet
 * - listSettlementStatements / getSettlementStatement / getOpenSettlementMonths
 * - markSettlementPaid: the payment date and reference, once
 * - reverseSettlementEntry: a correction, never an edit (MS-24)
 * - getBranchSettlementReport: a branch's settlement figures for a period
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index
 *
 * Notes        :
 * - Entries are written by the statements that deliver the service
 *   (memberships.ts, admin-bookings.ts via gems-ledger.ts). The database
 *   picks an entry's month and keeps a closed month's entries, statements
 *   and positions unchanged (migration 0022).
 * - A statement's entries are its month's entries between its two branches,
 *   in either direction. A reversal counts with the kind it reverses.
 * - Branch pairs are ordered by byte value (COLLATE "C").
 * - Who may see what is decided by the caller (@rgss/business settlement
 *   access); these queries take the branches the viewer may see.
 ************************************************************/

import type {
  BranchSettlementReport,
  ResolvedReportRange,
  SettlementAmounts,
  SettlementBranchRef,
  SettlementEntryKind,
  SettlementEntryView,
  SettlementNetView,
  SettlementOpenMonthView,
  SettlementStatementView,
} from '@rgss/types'
import { addDaysISO } from '@rgss/types'
import { type SQL, sql } from 'drizzle-orm'
import { db } from '../index'
import { isConstraintViolation, SQLSTATE } from './driver-errors'

/** The branches a viewer may see statements for: every branch, or these. */
export type SettlementScope = { all: true } | { all: false; branchIds: readonly string[] }

/** A statement as read, before the viewer's permissions are applied. */
export type SettlementStatementRecord = Omit<SettlementStatementView, 'canMarkPaid'> & {
  payingBranchId: string | null
}

type Numeric = string | number | null

function n(value: Numeric | undefined): number {
  return value === null || value === undefined ? 0 : Number(value)
}

function nullableNumber(value: Numeric | undefined): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function iso(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

/** "YYYY-MM" → the month's first day, "YYYY-MM-01". */
function monthStart(month: string): string {
  return `${month}-01`
}

/** A condition on a pair of branch columns: the pair touches the scope. */
function pairInScope(scope: SettlementScope, a: SQL, b: SQL): SQL {
  if (scope.all) {
    return sql`true`
  }
  if (scope.branchIds.length === 0) {
    return sql`false`
  }
  const ids = sql.join(
    scope.branchIds.map((id) => sql`${id}`),
    sql`, `,
  )
  return sql`(${a} in (${ids}) or ${b} in (${ids}))`
}

function amounts(prefix: string, row: Record<string, Numeric>): SettlementAmounts {
  const membershipPaise = n(row[`${prefix}_membership_paise`])
  const gemsPaise = n(row[`${prefix}_gems_paise`])
  return {
    membershipPaise,
    membershipValuePaise: n(row[`${prefix}_membership_value_paise`]),
    membershipGstSharePaise: n(row[`${prefix}_membership_gst_paise`]),
    gemsPaise,
    totalPaise: membershipPaise + gemsPaise,
  }
}

function netOf(
  aOwesB: SettlementAmounts,
  bOwesA: SettlementAmounts,
  branchA: SettlementBranchRef,
  branchB: SettlementBranchRef,
): SettlementNetView {
  const diff = aOwesB.totalPaise - bOwesA.totalPaise
  return {
    payingBranch: diff > 0 ? branchA : diff < 0 ? branchB : null,
    receivingBranch: diff > 0 ? branchB : diff < 0 ? branchA : null,
    amountPaise: Math.abs(diff),
  }
}

/* ── Closing ───────────────────────────────────────────────────────────── */

export type SettlementCloseResult = {
  /** The months this run closed, "YYYY-MM", oldest first, with their statement counts. */
  months: { month: string; statements: number }[]
}

/**
 * Close every ended IST month that isn't closed yet (ST-07, MS-24): one
 * statement per pair of branches with entries that month, netted, and each
 * branch's net position across its counterparts (ST-08). One transaction:
 * the months are marked closed first, which waits for any entry still being
 * recorded into them, so the statements see every entry. A missed run
 * catches up; a rerun or a concurrent run closes nothing twice, because the
 * statements and positions can only be made by the transaction that closes
 * their month.
 */
export async function closeSettlementMonths(): Promise<SettlementCloseResult> {
  const results = await db.batch([
    db.execute(sql`
      update settlement_period
         set closed_at = now()
       where closed_at is null
         and month < settlement_month_of(now())
    `),
    db.execute(sql`
      insert into branch_settlement
        (month, branch_a_id, branch_b_id,
         a_owes_b_membership_paise, a_owes_b_membership_value_paise,
         a_owes_b_membership_gst_paise, a_owes_b_gems_paise,
         b_owes_a_membership_paise, b_owes_a_membership_value_paise,
         b_owes_a_membership_gst_paise, b_owes_a_gems_paise,
         paying_branch_id, receiving_branch_id, net_paise, entry_count, closed_at)
      select x.month, x.a, x.b,
             x.ab_m, x.ab_mv, x.ab_mg, x.ab_g,
             x.ba_m, x.ba_mv, x.ba_mg, x.ba_g,
             case when x.ab_m + x.ab_g > x.ba_m + x.ba_g then x.a
                  when x.ab_m + x.ab_g < x.ba_m + x.ba_g then x.b end,
             case when x.ab_m + x.ab_g > x.ba_m + x.ba_g then x.b
                  when x.ab_m + x.ab_g < x.ba_m + x.ba_g then x.a end,
             abs((x.ab_m + x.ab_g) - (x.ba_m + x.ba_g)),
             x.entries,
             now()
        from (
          select e.posting_month as month,
                 least(e.owing_branch_id collate "C", e.owed_branch_id collate "C") as a,
                 greatest(e.owing_branch_id collate "C", e.owed_branch_id collate "C") as b,
                 coalesce(sum(e.amount_owed_paise) filter (where c.forward and c.kind = 'membership_session'), 0) as ab_m,
                 coalesce(sum(e.value_paise) filter (where c.forward and c.kind = 'membership_session'), 0) as ab_mv,
                 coalesce(sum(e.gst_share_paise) filter (where c.forward and c.kind = 'membership_session'), 0) as ab_mg,
                 coalesce(sum(e.amount_owed_paise) filter (where c.forward and c.kind = 'gems_redemption'), 0) as ab_g,
                 coalesce(sum(e.amount_owed_paise) filter (where not c.forward and c.kind = 'membership_session'), 0) as ba_m,
                 coalesce(sum(e.value_paise) filter (where not c.forward and c.kind = 'membership_session'), 0) as ba_mv,
                 coalesce(sum(e.gst_share_paise) filter (where not c.forward and c.kind = 'membership_session'), 0) as ba_mg,
                 coalesce(sum(e.amount_owed_paise) filter (where not c.forward and c.kind = 'gems_redemption'), 0) as ba_g,
                 count(*)::int as entries
            from settlement_entry e
            join settlement_period p on p.month = e.posting_month and p.closed_at = now()
            left join settlement_entry o on o.id = e.reverses_entry_id
           cross join lateral (
             select coalesce(o.kind, e.kind) as kind,
                    e.owing_branch_id collate "C" < e.owed_branch_id collate "C" as forward
           ) c
           where e.owing_branch_id <> e.owed_branch_id
           group by 1, 2, 3
        ) x
    `),
    db.execute(sql`
      insert into settlement_position
        (month, branch_id, receivable_paise, payable_paise, net_paise, closed_at)
      select s.month, v.branch_id, sum(v.receivable), sum(v.payable),
             sum(v.receivable) - sum(v.payable), now()
        from branch_settlement s
        join settlement_period p on p.month = s.month and p.closed_at = now()
       cross join lateral (values
         (s.branch_a_id,
          s.b_owes_a_membership_paise + s.b_owes_a_gems_paise,
          s.a_owes_b_membership_paise + s.a_owes_b_gems_paise),
         (s.branch_b_id,
          s.a_owes_b_membership_paise + s.a_owes_b_gems_paise,
          s.b_owes_a_membership_paise + s.b_owes_a_gems_paise)
       ) v(branch_id, receivable, payable)
       group by s.month, v.branch_id
    `),
    db.execute<{ month: string; statements: number }>(sql`
      select to_char(p.month, 'YYYY-MM') as month,
             (select count(*) from branch_settlement s where s.month = p.month)::int as statements
        from settlement_period p
       where p.closed_at = now()
       order by p.month
    `),
  ])
  const summary = results[3] as { rows: { month: string; statements: number }[] }
  return { months: summary.rows.map((r) => ({ month: r.month, statements: n(r.statements) })) }
}

/* ── Reading ───────────────────────────────────────────────────────────── */

const STATEMENT_COLUMNS = sql`
  s.id, to_char(s.month, 'YYYY-MM') as month,
  s.branch_a_id, ba.name as branch_a_name, ba.owner_user_id as branch_a_owner,
  s.branch_b_id, bb.name as branch_b_name, bb.owner_user_id as branch_b_owner,
  s.a_owes_b_membership_paise, s.a_owes_b_membership_value_paise,
  s.a_owes_b_membership_gst_paise, s.a_owes_b_gems_paise,
  s.b_owes_a_membership_paise, s.b_owes_a_membership_value_paise,
  s.b_owes_a_membership_gst_paise, s.b_owes_a_gems_paise,
  s.paying_branch_id, s.net_paise, s.entry_count, s.closed_at,
  to_char(s.paid_on, 'YYYY-MM-DD') as paid_on, s.payment_reference, s.internal_transfer,
  u.name as paid_recorded_by_name, s.paid_recorded_at
`

const STATEMENT_FROM = sql`
  from branch_settlement s
  join branch ba on ba.id = s.branch_a_id
  join branch bb on bb.id = s.branch_b_id
  left join "user" u on u.id = s.paid_recorded_by
`

type StatementRow = Record<string, Numeric> & {
  id: string
  month: string
  branch_a_id: string
  branch_a_name: string
  branch_a_owner: string | null
  branch_b_id: string
  branch_b_name: string
  branch_b_owner: string | null
  paying_branch_id: string | null
  closed_at: string | Date
  paid_on: string | null
  payment_reference: string | null
  internal_transfer: boolean
  paid_recorded_by_name: string | null
  paid_recorded_at: string | Date | null
}

function toStatement(row: StatementRow): SettlementStatementRecord {
  const branchA = { id: row.branch_a_id, name: row.branch_a_name }
  const branchB = { id: row.branch_b_id, name: row.branch_b_name }
  const aOwesB = amounts('a_owes_b', row)
  const bOwesA = amounts('b_owes_a', row)
  return {
    id: row.id,
    month: row.month,
    branchA,
    branchB,
    aOwesB,
    bOwesA,
    net: netOf(aOwesB, bOwesA, branchA, branchB),
    payingBranchId: row.paying_branch_id,
    entryCount: n(row.entry_count),
    closedAt: iso(row.closed_at),
    paid:
      row.paid_on === null
        ? null
        : {
            paidOn: row.paid_on,
            reference: row.payment_reference ?? '',
            internalTransfer: row.internal_transfer,
            recordedByName: row.paid_recorded_by_name,
            recordedAt: iso(row.paid_recorded_at),
          },
    sameOwner: row.branch_a_owner !== null && row.branch_a_owner === row.branch_b_owner,
  }
}

/** The scope's closed statements, newest month first; one month when given ("YYYY-MM"). */
export async function listSettlementStatements(
  scope: SettlementScope,
  options: { month?: string | undefined } = {},
): Promise<SettlementStatementRecord[]> {
  const monthFilter = options.month ? sql`s.month = ${monthStart(options.month)}::date` : sql`true`
  const result = await db.execute<StatementRow>(sql`
    select ${STATEMENT_COLUMNS}
    ${STATEMENT_FROM}
     where ${pairInScope(scope, sql`s.branch_a_id`, sql`s.branch_b_id`)}
       and ${monthFilter}
     order by s.month desc, ba.name, bb.name
     limit 500
  `)
  return result.rows.map(toStatement)
}

/** One statement, or null when it doesn't exist or isn't in the scope. */
export async function getSettlementStatement(
  id: string,
  scope: SettlementScope,
): Promise<SettlementStatementRecord | null> {
  const result = await db.execute<StatementRow>(sql`
    select ${STATEMENT_COLUMNS}
    ${STATEMENT_FROM}
     where s.id = ${id}
       and ${pairInScope(scope, sql`s.branch_a_id`, sql`s.branch_b_id`)}
  `)
  const row = result.rows[0]
  return row ? toStatement(row) : null
}

type EntryRow = {
  id: string
  kind: SettlementEntryKind
  reversed_kind: Exclude<SettlementEntryKind, 'reversal'> | null
  month: string
  created_at: string | Date
  owing_branch_id: string
  owing_branch_name: string
  owed_branch_id: string
  owed_branch_name: string
  membership_number: string | null
  booking_number: string | null
  minutes: Numeric
  gems: Numeric
  value_paise: Numeric
  gst_share_paise: Numeric
  amount_owed_paise: Numeric
  share_bps: Numeric
  gem_value_paise: Numeric
  reverses_entry_id: string | null
  note: string | null
  reversed_by_entry_id: string | null
}

function toEntry(row: EntryRow): SettlementEntryView {
  return {
    id: row.id,
    kind: row.kind,
    reversedKind: row.reversed_kind,
    month: row.month,
    recordedAt: iso(row.created_at),
    owingBranch: { id: row.owing_branch_id, name: row.owing_branch_name },
    owedBranch: { id: row.owed_branch_id, name: row.owed_branch_name },
    membershipNumber: row.membership_number,
    bookingNumber: row.booking_number,
    minutes: nullableNumber(row.minutes),
    gems: nullableNumber(row.gems),
    valuePaise: n(row.value_paise),
    gstSharePaise: n(row.gst_share_paise),
    amountOwedPaise: n(row.amount_owed_paise),
    shareBps: n(row.share_bps),
    gemValuePaise: nullableNumber(row.gem_value_paise),
    reversesEntryId: row.reverses_entry_id,
    note: row.note,
    reversedByEntryId: row.reversed_by_entry_id,
  }
}

const ENTRY_SELECT = sql`
  select e.id, e.kind, o.kind as reversed_kind, to_char(e.posting_month, 'YYYY-MM') as month,
         e.created_at,
         e.owing_branch_id, bo.name as owing_branch_name,
         e.owed_branch_id, bd.name as owed_branch_name,
         m.membership_number, bk.booking_number,
         e.minutes, e.gems, e.value_paise, e.gst_share_paise, e.amount_owed_paise,
         e.share_bps, e.gem_value_paise, e.reverses_entry_id, e.note,
         r.id as reversed_by_entry_id
    from settlement_entry e
    join branch bo on bo.id = e.owing_branch_id
    join branch bd on bd.id = e.owed_branch_id
    left join settlement_entry o on o.id = e.reverses_entry_id
    left join settlement_entry r on r.reverses_entry_id = e.id
    left join spa_membership m on m.id = e.spa_membership_id
    left join booking bk on bk.id = e.booking_id
`

/** A statement's entries: its month's entries between its two branches, oldest first. */
export async function getSettlementStatementEntries(
  statement: Pick<SettlementStatementRecord, 'month' | 'branchA' | 'branchB'>,
): Promise<SettlementEntryView[]> {
  const a = statement.branchA.id
  const b = statement.branchB.id
  const result = await db.execute<EntryRow>(sql`
    ${ENTRY_SELECT}
     where e.posting_month = ${monthStart(statement.month)}::date
       and ((e.owing_branch_id = ${a} and e.owed_branch_id = ${b})
         or (e.owing_branch_id = ${b} and e.owed_branch_id = ${a}))
     order by e.created_at, e.id
  `)
  return result.rows.map(toEntry)
}

/** One entry, or null when it doesn't exist or its branches aren't in the scope. */
export async function getSettlementEntry(
  id: string,
  scope: SettlementScope,
): Promise<SettlementEntryView | null> {
  const result = await db.execute<EntryRow>(sql`
    ${ENTRY_SELECT}
     where e.id = ${id}
       and ${pairInScope(scope, sql`e.owing_branch_id`, sql`e.owed_branch_id`)}
  `)
  const row = result.rows[0]
  return row ? toEntry(row) : null
}

type OpenRow = Record<string, Numeric> & {
  month: string
  branch_a_id: string
  branch_a_name: string
  branch_b_id: string
  branch_b_name: string
}

/**
 * The months not closed yet, per pair of branches in the scope: what each owes
 * the other so far. No statement exists for them until the month closes.
 */
export async function getOpenSettlementMonths(
  scope: SettlementScope,
): Promise<SettlementOpenMonthView[]> {
  const result = await db.execute<OpenRow>(sql`
    select to_char(x.month, 'YYYY-MM') as month,
           x.a as branch_a_id, ba.name as branch_a_name,
           x.b as branch_b_id, bb.name as branch_b_name,
           x.a_owes_b_membership_paise, x.a_owes_b_membership_value_paise,
           x.a_owes_b_membership_gst_paise, x.a_owes_b_gems_paise,
           x.b_owes_a_membership_paise, x.b_owes_a_membership_value_paise,
           x.b_owes_a_membership_gst_paise, x.b_owes_a_gems_paise,
           x.entries as entry_count
      from (
        select e.posting_month as month,
               least(e.owing_branch_id collate "C", e.owed_branch_id collate "C") as a,
               greatest(e.owing_branch_id collate "C", e.owed_branch_id collate "C") as b,
               coalesce(sum(e.amount_owed_paise) filter (where c.forward and c.kind = 'membership_session'), 0) as a_owes_b_membership_paise,
               coalesce(sum(e.value_paise) filter (where c.forward and c.kind = 'membership_session'), 0) as a_owes_b_membership_value_paise,
               coalesce(sum(e.gst_share_paise) filter (where c.forward and c.kind = 'membership_session'), 0) as a_owes_b_membership_gst_paise,
               coalesce(sum(e.amount_owed_paise) filter (where c.forward and c.kind = 'gems_redemption'), 0) as a_owes_b_gems_paise,
               coalesce(sum(e.amount_owed_paise) filter (where not c.forward and c.kind = 'membership_session'), 0) as b_owes_a_membership_paise,
               coalesce(sum(e.value_paise) filter (where not c.forward and c.kind = 'membership_session'), 0) as b_owes_a_membership_value_paise,
               coalesce(sum(e.gst_share_paise) filter (where not c.forward and c.kind = 'membership_session'), 0) as b_owes_a_membership_gst_paise,
               coalesce(sum(e.amount_owed_paise) filter (where not c.forward and c.kind = 'gems_redemption'), 0) as b_owes_a_gems_paise,
               count(*)::int as entries
          from settlement_entry e
          join settlement_period p on p.month = e.posting_month and p.closed_at is null
          left join settlement_entry o on o.id = e.reverses_entry_id
         cross join lateral (
           select coalesce(o.kind, e.kind) as kind,
                  e.owing_branch_id collate "C" < e.owed_branch_id collate "C" as forward
         ) c
         where e.owing_branch_id <> e.owed_branch_id
           and ${pairInScope(scope, sql`e.owing_branch_id`, sql`e.owed_branch_id`)}
         group by 1, 2, 3
      ) x
      join branch ba on ba.id = x.a
      join branch bb on bb.id = x.b
     order by x.month desc, ba.name, bb.name
  `)
  return result.rows.map((row) => {
    const branchA = { id: row.branch_a_id, name: row.branch_a_name }
    const branchB = { id: row.branch_b_id, name: row.branch_b_name }
    const aOwesB = amounts('a_owes_b', row)
    const bOwesA = amounts('b_owes_a', row)
    return {
      month: row.month,
      branchA,
      branchB,
      aOwesB,
      bOwesA,
      net: netOf(aOwesB, bOwesA, branchA, branchB),
      entryCount: n(row.entry_count),
    }
  })
}

/* ── Payment ───────────────────────────────────────────────────────────── */

export type MarkSettlementPaidResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'already_paid' | 'nothing_owed' | 'not_same_owner' }

/**
 * Record that a statement's net was paid, once (MS-25): the IST date, the
 * reference, and whether it was a transfer between two branches of one
 * Owner. One guarded statement, so two people marking it at once record it
 * once. The caller checks who may mark it; this re-checks the facts.
 */
export async function markSettlementPaid(params: {
  id: string
  paidOn: string
  reference: string
  internalTransfer: boolean
  actorId: string
}): Promise<MarkSettlementPaidResult> {
  const { id, paidOn, reference, internalTransfer, actorId } = params
  const updated = await db.execute<{ id: string }>(sql`
    update branch_settlement s
       set paid_on = ${paidOn}::date,
           payment_reference = ${reference},
           internal_transfer = ${internalTransfer}::boolean,
           paid_recorded_by = ${actorId},
           paid_recorded_at = now()
     where s.id = ${id}
       and s.paid_on is null
       and s.net_paise > 0
       and (not ${internalTransfer}::boolean
            or (select a.owner_user_id from branch a where a.id = s.branch_a_id)
             = (select b.owner_user_id from branch b where b.id = s.branch_b_id))
    returning s.id
  `)
  if (updated.rows.length > 0) {
    return { ok: true }
  }

  const current = await db.execute<{ paid: boolean; net_paise: Numeric; same_owner: boolean }>(sql`
    select s.paid_on is not null as paid, s.net_paise,
           ba.owner_user_id = bb.owner_user_id as same_owner
      from branch_settlement s
      join branch ba on ba.id = s.branch_a_id
      join branch bb on bb.id = s.branch_b_id
     where s.id = ${id}
  `)
  const row = current.rows[0]
  if (!row) {
    return { ok: false, reason: 'not_found' }
  }
  if (row.paid) {
    return { ok: false, reason: 'already_paid' }
  }
  if (n(row.net_paise) <= 0) {
    return { ok: false, reason: 'nothing_owed' }
  }
  return { ok: false, reason: 'not_same_owner' }
}

/* ── Corrections ───────────────────────────────────────────────────────── */

export type ReverseSettlementEntryResult =
  | { ok: true; entryId: string; month: string }
  | { ok: false; reason: 'not_found' | 'already_reversed' | 'is_reversal' | 'internal' }

const REVERSAL_UNIQUE = 'settlement_entry_reversal_unique'

/**
 * Correct an entry by recording its reversal, never by editing it (MS-24).
 * The reversal copies the entry negated and lands in the month open now, so
 * a closed statement never changes. An entry is reversed at most once.
 */
export async function reverseSettlementEntry(params: {
  entryId: string
  note: string
  actorId: string
}): Promise<ReverseSettlementEntryResult> {
  const { entryId, note, actorId } = params
  const original = await db.execute<{
    kind: SettlementEntryKind
    internal: boolean
    reversed: boolean
  }>(sql`
    select e.kind, e.owing_branch_id = e.owed_branch_id as internal,
           exists (select 1 from settlement_entry r where r.reverses_entry_id = e.id) as reversed
      from settlement_entry e
     where e.id = ${entryId}
  `)
  const found = original.rows[0]
  if (!found) {
    return { ok: false, reason: 'not_found' }
  }
  if (found.kind === 'reversal') {
    return { ok: false, reason: 'is_reversal' }
  }
  if (found.internal) {
    return { ok: false, reason: 'internal' }
  }
  if (found.reversed) {
    return { ok: false, reason: 'already_reversed' }
  }

  try {
    // The trigger (0022) fills the branches, references and negated amounts
    // from the original, and picks the month.
    const inserted = await db.execute<{ id: string; month: string }>(sql`
      insert into settlement_entry (kind, reverses_entry_id, note, created_by)
      values ('reversal', ${entryId}, ${note}, ${actorId})
      returning id, to_char(posting_month, 'YYYY-MM') as month
    `)
    const row = inserted.rows[0]
    if (!row) {
      throw new Error('reverseSettlementEntry: the reversal was not recorded')
    }
    return { ok: true, entryId: row.id, month: row.month }
  } catch (error) {
    if (isConstraintViolation(error, SQLSTATE.uniqueViolation, [REVERSAL_UNIQUE])) {
      return { ok: false, reason: 'already_reversed' }
    }
    throw error
  }
}

/* ── Reports ───────────────────────────────────────────────────────────── */

/**
 * A branch's settlement figures for a report period (settlement.md): session
 * minutes delivered here and used by its own members anywhere, gems issued
 * and redeemed, and what it is owed and owes, by entries recorded in the
 * period. Money is always returned; the route hides it from Managers.
 */
export async function getBranchSettlementReport(
  branchId: string,
  range: ResolvedReportRange,
): Promise<BranchSettlementReport> {
  const from = new Date(`${range.from}T00:00:00.000+05:30`)
  const toExclusive = new Date(`${addDaysISO(range.to, 1)}T00:00:00.000+05:30`)
  const result = await db.execute<Record<string, Numeric>>(sql`
    with entries as (
      select e.owing_branch_id, e.owed_branch_id, e.minutes, e.gems, e.value_paise,
             e.amount_owed_paise, coalesce(o.kind, e.kind) as kind
        from settlement_entry e
        left join settlement_entry o on o.id = e.reverses_entry_id
       where (e.owing_branch_id = ${branchId} or e.owed_branch_id = ${branchId})
         and e.created_at >= ${from.toISOString()}::timestamptz
         and e.created_at < ${toExclusive.toISOString()}::timestamptz
    )
    select
      coalesce(sum(minutes) filter (where kind = 'membership_session' and owed_branch_id = ${branchId}), 0) as delivered_minutes,
      coalesce(sum(value_paise) filter (where kind = 'membership_session' and owed_branch_id = ${branchId}), 0) as delivered_value,
      coalesce(sum(minutes) filter (where kind = 'membership_session' and owing_branch_id = ${branchId}), 0) as own_minutes,
      coalesce(sum(value_paise) filter (where kind = 'membership_session' and owing_branch_id = ${branchId}), 0) as own_value,
      coalesce(sum(amount_owed_paise) filter (where kind = 'membership_session' and owed_branch_id = ${branchId} and owing_branch_id <> ${branchId}), 0) as membership_receive,
      coalesce(sum(amount_owed_paise) filter (where kind = 'membership_session' and owing_branch_id = ${branchId} and owed_branch_id <> ${branchId}), 0) as membership_pay,
      coalesce(sum(gems) filter (where kind = 'gems_redemption' and owed_branch_id = ${branchId}), 0) as gems_redeemed,
      coalesce(sum(amount_owed_paise) filter (where kind = 'gems_redemption' and owed_branch_id = ${branchId} and owing_branch_id <> ${branchId}), 0) as gems_receive,
      coalesce(sum(amount_owed_paise) filter (where kind = 'gems_redemption' and owing_branch_id = ${branchId} and owed_branch_id <> ${branchId}), 0) as gems_pay,
      (select coalesce(sum(t.gems_amount), 0)
         from loyalty_transaction t
        where t.type = 'earned'
          and t.branch_id = ${branchId}
          and t.created_at >= ${from.toISOString()}::timestamptz
          and t.created_at < ${toExclusive.toISOString()}::timestamptz) as gems_issued
      from entries
  `)
  const row = result.rows[0] ?? {}
  return {
    memberships: {
      deliveredMinutes: n(row.delivered_minutes),
      deliveredValuePaise: n(row.delivered_value),
      ownMembersMinutes: n(row.own_minutes),
      ownMembersValuePaise: n(row.own_value),
      toReceivePaise: n(row.membership_receive),
      toPayPaise: n(row.membership_pay),
    },
    gems: {
      issued: n(row.gems_issued),
      redeemed: n(row.gems_redeemed),
      toReceivePaise: n(row.gems_receive),
      toPayPaise: n(row.gems_pay),
    },
  }
}
