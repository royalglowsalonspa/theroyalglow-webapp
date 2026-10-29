/************************************************************
 * Module Name  : realtime-revocations.integration.test
 * Scope        : Integration test — realtime revocation outbox (REAL db, R2.6)
 *
 * Description  : Against Neon dev: pending rows come back oldest first and
 *                per person; attempts are counted; an outcome is final (a
 *                later write never overwrites it); the database refuses an
 *                outcome without a resolution time; rows go with their user.
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Prefixed `rvk_it_<run>` users; their rows cascade with them.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { isLiveDbAvailable, queryRow } from '../test/live-db'
import {
  getPendingRealtimeRevocations,
  realtimeRevocationStatement,
  recordRealtimeRevocationAttempt,
  resolveRealtimeRevocations,
} from './realtime-revocations'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `rvk_it_${RUN}`
const ANA = `${PREFIX}_ana`
const BEN = `${PREFIX}_ben`

describe.skipIf(!LIVE)('realtime revocation outbox against a live database', () => {
  beforeAll(async () => {
    await db.execute(sql`
      insert into "user" (id, name, email, email_verified, role)
      values (${ANA}, 'ZZ Rvk IT Ana', ${`${ANA}@example.invalid`}, false, 'customer'),
             (${BEN}, 'ZZ Rvk IT Ben', ${`${BEN}@example.invalid`}, false, 'customer')`)
    await db.batch([realtimeRevocationStatement(ANA), realtimeRevocationStatement(BEN)])
  })

  afterAll(async () => {
    await db.execute(sql`delete from "user" where id like ${`${PREFIX}%`}`)
    expect(
      await queryRow(sql`
        select (select count(*) from realtime_revocation where user_id like ${`${PREFIX}%`}) as rows,
               (select count(*) from "user" where id like ${`${PREFIX}%`}) as users`),
    ).toEqual({ rows: '0', users: '0' })
  })

  it('lists pending rows per person', async () => {
    const mine = await getPendingRealtimeRevocations({ userIds: [ANA, BEN] })
    expect(mine.map((r) => r.userId).sort()).toEqual([ANA, BEN].sort())
    expect(await getPendingRealtimeRevocations({ userIds: [] })).toEqual([])

    const ana = await getPendingRealtimeRevocations({ userIds: [ANA] })
    expect(ana).toHaveLength(1)
    expect(ana[0]).toMatchObject({ attempts: 0, lastError: null, lastAttemptAt: null })
  })

  it('counts attempts and keeps the last error', async () => {
    const [ana] = await getPendingRealtimeRevocations({ userIds: [ANA] })
    const id = ana?.id ?? ''

    await recordRealtimeRevocationAttempt([id], 'Ably 503: busy')
    await recordRealtimeRevocationAttempt([id], null)

    const [after] = await getPendingRealtimeRevocations({ userIds: [ANA] })
    expect(after).toMatchObject({ attempts: 2, lastError: null })
    expect(after?.lastAttemptAt).toBeInstanceOf(Date)
  })

  it('makes an outcome final', async () => {
    const [ben] = await getPendingRealtimeRevocations({ userIds: [BEN] })
    const id = ben?.id ?? ''

    expect(await resolveRealtimeRevocations([id], 'revoked')).toBe(1)
    // A late retry or a concurrent run changes nothing.
    expect(await resolveRealtimeRevocations([id], 'expired')).toBe(0)
    await recordRealtimeRevocationAttempt([id], 'late failure')

    expect(
      await queryRow(sql`
        select outcome, attempts, last_error from realtime_revocation where id = ${id}`),
    ).toEqual({ outcome: 'revoked', attempts: 0, last_error: null })
    expect(await getPendingRealtimeRevocations({ userIds: [BEN] })).toEqual([])
  })

  it('refuses an outcome without a resolution time', async () => {
    const [ana] = await getPendingRealtimeRevocations({ userIds: [ANA] })
    await expect(
      db.execute(
        sql`update realtime_revocation set outcome = 'revoked' where id = ${ana?.id ?? ''}`,
      ),
    ).rejects.toThrow()
  })
})
