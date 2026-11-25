import { ERROR_CODES } from '@rgss/errors'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { isLiveDbAvailable, queryRows } from '../test/live-db'
import {
  getActivePushSubscriptions,
  pruneGonePushSubscription,
  removePushSubscription,
  savePushSubscription,
} from './notifications'

const LIVE = isLiveDbAvailable()
const prefix = `push_it_${crypto.randomUUID()}`
const first = `${prefix}_first`
const next = `${prefix}_next`

function subscription(name: string) {
  return {
    endpoint: `https://example.invalid/push/${prefix}/${name}`,
    keys: { p256dh: 'test-public-key', auth: 'test-auth-secret' },
  }
}

describe.skipIf(!LIVE)('push subscription concurrency', () => {
  beforeAll(async () => {
    await db.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, role)
      VALUES (${first}, 'Test customer', ${`${first}@example.invalid`}, false, 'customer'),
             (${next}, 'Test customer', ${`${next}@example.invalid`}, false, 'customer')
    `)
  })

  afterAll(async () => {
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${first}, ${next})`)
  })

  it('concurrent registrations converge on a single active endpoint', async () => {
    const input = subscription('concurrent')
    const results = await Promise.all([
      savePushSubscription(first, input),
      savePushSubscription(first, input),
    ])
    expect(new Set(results.map((row) => row.id)).size).toBe(1)
    expect(results.map((row) => row.bindingVersion).sort()).toEqual([1, 2])
    const active = (await getActivePushSubscriptions(first)).filter(
      (s) => s.endpoint === input.endpoint,
    )
    expect(active).toHaveLength(1)
  })

  it('stale unsubscribe and provider pruning cannot remove a rebound or refreshed endpoint', async () => {
    const input = subscription('account-switch')
    const old = await savePushSubscription(first, input)
    await expect(
      savePushSubscription(next, {
        ...input,
        keys: { ...input.keys, auth: 'wrong-key' },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CONFLICT, statusCode: 409 })

    const rebound = await savePushSubscription(next, input)
    await removePushSubscription(first, input.endpoint)
    await pruneGonePushSubscription(old)
    expect(await getActivePushSubscriptions(next)).toContainEqual(rebound)

    // An older app writes the endpoint keys without setting binding_version.
    await db.execute(sql`UPDATE push_subscription SET auth_key = auth_key WHERE id = ${rebound.id}`)
    await pruneGonePushSubscription(rebound)
    const [fresh] = await getActivePushSubscriptions(next)
    expect(fresh).toMatchObject({ id: rebound.id, bindingVersion: rebound.bindingVersion + 1 })
    if (!fresh) throw new Error('the refreshed subscription should still be active')

    await pruneGonePushSubscription(fresh)
    const replacement = await savePushSubscription(next, input)
    expect(replacement.id).not.toBe(fresh.id)
    expect(
      await queryRows(sql`
      SELECT is_active FROM push_subscription WHERE endpoint = ${input.endpoint} ORDER BY is_active
    `),
    ).toEqual([{ is_active: false }, { is_active: true }])
  })
})
