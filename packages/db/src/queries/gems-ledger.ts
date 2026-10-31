/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : gems-ledger
 * Scope        : Data Access — gems batches (multi-branch R10)
 *
 * Description  : The statements every gems write path shares, so that each
 *                spent gem traces back to the branch that issued it
 *                (settlement.md): spend a redemption from the batches that
 *                expire first, give the gems back when the free service
 *                doesn't happen, record what the issuing branch owes when it
 *                does, and expire only what a batch still has unspent.
 *
 * Responsibilities :
 * - lockLoyaltyAccount / lockAccountsOfEndedRedemptions: the account lock
 *   every path takes before it reads batches
 * - allocateRedemption: earliest-expiring gems first, in the redemption's
 *   transaction; aborts the transaction when the batches can't cover it
 * - returnGemsOfEndedRedemptions: release a rejected, cancelled or missed
 *   redemption's gems to its batches, expiring straight away whatever came
 *   from a batch that has expired meanwhile (ST-03)
 * - gemsSettlementEntries: one entry per earning branch when the free
 *   service is completed (ST-01, ST-02)
 * - expireLapsedGems: the nightly expiry of unspent gems only (ST-04)
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index
 *
 * Notes        :
 * - Every path locks the customer's loyalty account first and reads batches
 *   in a later statement, so it sees what concurrent paths committed while it
 *   waited (READ COMMITTED takes a fresh snapshot per statement). The
 *   database also refuses any write that would spend or expire a batch beyond
 *   what it earned (migration 0022), so a path that forgot the lock still
 *   can't double-spend.
 * - Gems returned in a transaction are found again by `released_at = now()`:
 *   now() is the transaction's start time, the same in every statement.
 * - The statements are batch items: run them in the db.batch() of the write
 *   they belong to, never on their own.
 ************************************************************/

import type { SettlementSetting } from '@rgss/types'
import { type SQL, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '../index'
import { isConstraintViolation, isGuardAbort, SQLSTATE } from './driver-errors'

/** The booking statuses in which a free service won't happen: its gems go back. */
const ENDED_STATUSES = sql`('rejected', 'cancelled', 'no_show')`

/** The batch guards (migration 0022) that refuse spending gems a batch doesn't have. */
const BATCH_GUARDS = [
  'loyalty_batch_overspent',
  'loyalty_batch_expired',
  'loyalty_redemption_overallocated',
] as const

/**
 * True when a gems write rolled back because the gems weren't there: a
 * balance guard or the allocation matched nothing (division by zero), or a
 * batch guard refused the spend. Callers answer GEMS_INSUFFICIENT_BALANCE.
 */
export function isGemsShortfall(error: unknown): boolean {
  return isGuardAbort(error) || isConstraintViolation(error, SQLSTATE.checkViolation, BATCH_GUARDS)
}

/** Lock one customer's loyalty account until the transaction ends. */
export function lockLoyaltyAccount(accountId: string): BatchItem<'pg'> {
  return db.execute(sql`select id from loyalty_account where id = ${accountId} for update`)
}

/**
 * Spend redemption `redemptionId` from its account's unexpired batches,
 * earliest expiry first. When the batches can't cover it, or the redemption
 * wasn't written (its balance guard failed), the trailing division by zero
 * aborts the whole transaction: callers map it to GEMS_INSUFFICIENT_BALANCE.
 * Run it after the statement that locked the account.
 */
export function allocateRedemption(redemptionId: string): BatchItem<'pg'> {
  return db.execute(sql`
    with spent as (
      select r.id, r.loyalty_account_id, r.gems_amount as cost
        from loyalty_transaction r
       where r.id = ${redemptionId}
         and r.type = 'redeemed'
    ),
    ordered as (
      select e.id,
             u.unspent,
             sum(u.unspent) over (order by e.expires_at asc nulls last, e.created_at, e.id) as running
        from loyalty_transaction e
        join spent s on s.loyalty_account_id = e.loyalty_account_id
        cross join lateral (select loyalty_batch_unspent(e.id) as unspent) u
       where e.type = 'earned'
         and (e.expires_at is null or e.expires_at > now())
         and u.unspent > 0
    ),
    take as (
      select o.id as batch_id, least(o.unspent, s.cost - (o.running - o.unspent))::int as gems
        from ordered o
       cross join spent s
       where o.running - o.unspent < s.cost
    ),
    allocated as (
      insert into loyalty_allocation (redemption_id, batch_id, gems)
      select ${redemptionId}, t.batch_id, t.gems from take t
      returning gems
    )
    select 1 / (case
                  when (select cost from spent) = (select coalesce(sum(gems), 0) from allocated) then 1
                  else 0
                end) as ok
  `)
}

/**
 * Lock the accounts of the redemptions `scope` selects that still hold gems
 * while their booking won't happen. `scope` is a condition on the redemption
 * transaction `r`.
 */
export function lockAccountsOfEndedRedemptions(scope: SQL): BatchItem<'pg'> {
  return db.execute(sql`
    select la.id
      from loyalty_account la
     where la.id in (
             select r.loyalty_account_id
               from loyalty_transaction r
               join loyalty_allocation a on a.redemption_id = r.id and a.released_at is null
               join booking b on b.id = r.booking_id
              where r.type = 'redeemed'
                and b.status in ${ENDED_STATUSES}
                and (${scope}))
     order by la.id
       for update
  `)
}

/**
 * Give back the gems of the redemptions `scope` selects whose booking won't
 * happen (rejected, cancelled or missed), to the batches they came from. Gems
 * from a batch that has expired meanwhile expire straight away; nothing else
 * is lost, and no settlement entry is recorded (ST-03). A redemption is given
 * back once: its allocations are released once. `scope` is a condition on the
 * redemption transaction `r`. Run after the booking's status change and the
 * account lock, in the same transaction.
 */
export function returnGemsStatements(scope: SQL): BatchItem<'pg'>[] {
  return [
    db.execute(sql`
      update loyalty_allocation a
         set released_at = now()
        from loyalty_transaction r
       where a.redemption_id = r.id
         and a.released_at is null
         and r.type = 'redeemed'
         and (${scope})
         and exists (select 1 from booking b
                      where b.id = r.booking_id and b.status in ${ENDED_STATUSES})
    `),
    db.execute(sql`
      insert into loyalty_transaction
        (id, loyalty_account_id, type, gems_amount, booking_id, branch_id, redemption_id,
         description, created_at)
      select gen_random_uuid()::text, r.loyalty_account_id, 'returned', sum(a.gems)::int,
             r.booking_id, r.branch_id, r.id,
             'Returned: booking ' || coalesce(b.booking_number, r.booking_id) || ' did not go ahead',
             now()
        from loyalty_allocation a
        join loyalty_transaction r on r.id = a.redemption_id
        left join booking b on b.id = r.booking_id
       where a.released_at = now()
       group by r.id, r.loyalty_account_id, r.booking_id, r.branch_id, b.booking_number
    `),
    db.execute(sql`
      insert into loyalty_transaction
        (id, loyalty_account_id, type, gems_amount, batch_id, description, created_at)
      select gen_random_uuid()::text, e.loyalty_account_id, 'expired', -sum(a.gems)::int, e.id,
             'Expired: gems earned on '
               || to_char(e.created_at AT TIME ZONE 'Asia/Kolkata', 'DD/MM/YYYY'),
             now()
        from loyalty_allocation a
        join loyalty_transaction e on e.id = a.batch_id
       where a.released_at = now()
         and e.expires_at is not null
         and e.expires_at <= now()
       group by e.id, e.loyalty_account_id, e.created_at
    `),
    db.execute(sql`
      update loyalty_account la
         set gems_balance        = la.gems_balance + d.back,
             total_gems_redeemed = la.total_gems_redeemed - d.released,
             updated_at          = now()
        from (select r.loyalty_account_id as account_id,
                     sum(a.gems)::int as released,
                     coalesce(sum(a.gems) filter (where e.expires_at is null or e.expires_at > now()),
                              0)::int as back
                from loyalty_allocation a
                join loyalty_transaction r on r.id = a.redemption_id
                join loyalty_transaction e on e.id = a.batch_id
               where a.released_at = now()
               group by r.loyalty_account_id) d
       where la.id = d.account_id
    `),
  ]
}

/** Lock the accounts, then give back the gems: see returnGemsStatements. */
export function returnGemsOfEndedRedemptions(scope: SQL): BatchItem<'pg'>[] {
  return [lockAccountsOfEndedRedemptions(scope), ...returnGemsStatements(scope)]
}

/**
 * What each earning branch owes `branchId` for the gems spent on booking
 * `bookingId`, recorded as the free service is completed: one entry per
 * redemption and earning branch, at the value per gem and share in force
 * (ST-01, ST-02, ST-05). Gems earned at `branchId` itself make an internal
 * entry. Inserts nothing when no gems were spent on the booking.
 */
export function gemsSettlementEntries(params: {
  bookingId: string
  branchId: string
  actorId: string
  settlement: SettlementSetting
}): BatchItem<'pg'> {
  const { bookingId, branchId, actorId, settlement } = params
  return db.execute(sql`
    insert into settlement_entry
      (kind, owing_branch_id, owed_branch_id, booking_id, loyalty_transaction_id, gems,
       gem_value_paise, value_paise, gst_share_paise, amount_owed_paise, share_bps, created_by)
    select 'gems_redemption', e.branch_id, ${branchId}, ${bookingId}, r.id, sum(a.gems)::int,
           ${settlement.gemValuePaise}::int,
           sum(a.gems)::bigint * ${settlement.gemValuePaise}::int,
           0,
           (sum(a.gems)::bigint * ${settlement.gemValuePaise}::int * ${settlement.shareBps}::int)
             / 10000,
           ${settlement.shareBps}::int,
           ${actorId}
      from loyalty_transaction r
      join loyalty_allocation a on a.redemption_id = r.id and a.released_at is null
      join loyalty_transaction e on e.id = a.batch_id
     where r.booking_id = ${bookingId}
       and r.type = 'redeemed'
     group by r.id, e.branch_id
  `)
}

export type GemsExpiryResult = {
  /** Batches whose unspent gems expired. */
  batches: number
  /** Gems that expired. */
  gems: number
  /** Redemptions whose gems were given back by the sweep. */
  returned: number
}

/**
 * The nightly expiry (job 7). First gives back the gems of any redemption
 * whose booking ended without them being returned, then expires each lapsed
 * batch's unspent gems, never what was spent (ST-04). The earning branch keeps
 * the value of expired gems. Idempotent: a rerun finds nothing unspent to
 * expire and nothing left to return.
 */
export async function expireLapsedGems(): Promise<GemsExpiryResult> {
  const results = await db.batch([
    db.execute(sql`
      select la.id
        from loyalty_account la
       where exists (select 1 from loyalty_transaction e
                      where e.loyalty_account_id = la.id
                        and e.type = 'earned'
                        and e.expires_at is not null
                        and e.expires_at <= now()
                        and loyalty_batch_unspent(e.id) > 0)
          or exists (select 1
                       from loyalty_transaction r
                       join loyalty_allocation a on a.redemption_id = r.id and a.released_at is null
                       join booking b on b.id = r.booking_id
                      where r.loyalty_account_id = la.id
                        and r.type = 'redeemed'
                        and b.status in ${ENDED_STATUSES})
       order by la.id
         for update
    `),
    ...returnGemsStatements(sql`true`),
    db.execute<{ batches: number; gems: number; returned: number }>(sql`
      with lapsed as (
        select e.id, e.loyalty_account_id, e.created_at, loyalty_batch_unspent(e.id) as unspent
          from loyalty_transaction e
         where e.type = 'earned'
           and e.expires_at is not null
           and e.expires_at <= now()
      ),
      expired as (
        insert into loyalty_transaction
          (id, loyalty_account_id, type, gems_amount, batch_id, description, created_at)
        select gen_random_uuid()::text, l.loyalty_account_id, 'expired', -l.unspent::int, l.id,
               'Expired: gems earned on '
                 || to_char(l.created_at AT TIME ZONE 'Asia/Kolkata', 'DD/MM/YYYY'),
               now()
          from lapsed l
         where l.unspent > 0
        returning loyalty_account_id, gems_amount
      ),
      debited as (
        update loyalty_account la
           set gems_balance = la.gems_balance + d.amount,
               updated_at   = now()
          from (select loyalty_account_id, sum(gems_amount)::int as amount
                  from expired
                 group by loyalty_account_id) d
         where la.id = d.loyalty_account_id
        returning la.id
      )
      select (select count(*) from expired)::int as batches,
             (select coalesce(-sum(gems_amount), 0) from expired)::int as gems,
             (select count(*) from loyalty_transaction t
               where t.type::text = 'returned' and t.created_at = now())::int as returned
    `),
  ])
  const row = (results.at(-1) as { rows: { batches: number; gems: number; returned: number }[] })
    .rows[0]
  return { batches: row?.batches ?? 0, gems: row?.gems ?? 0, returned: row?.returned ?? 0 }
}
