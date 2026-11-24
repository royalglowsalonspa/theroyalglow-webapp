/************************************************************
 * Module Name  : branches.integration.test
 * Scope        : Integration test — creating a branch with its Owner (REAL db)
 *
 * Description  : createBranch against Neon dev, with migration 0006's
 *                enforcement live: a branch is written with its Owner, a
 *                Customer chosen as Owner becomes one in the same transaction,
 *                and someone holding another role is refused with nothing
 *                written.
 *
 * Skip behaviour : Skips without packages/db/.env (CI). Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : Prefixed `branch_it_<run>` rows, deleted in one transaction in
 *                afterAll (the deferred triggers need the branch and its Owner
 *                to go together), then zero residue is proven.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import { createBranch } from './branches'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `branch_it_${RUN}`
const CUSTOMER = `${PREFIX}_customer`
const MANAGER = `${PREFIX}_manager`
const MANAGED = `${PREFIX}_managed`
const NAME = `ZZ Branch IT ${RUN}`

const fields = (name: string, ownerUserId: string) => ({
  name,
  addressLine1: 'Test',
  pincode: '560100',
  phone: '+91 80 0000 0000',
  displayOrder: 950,
  ownerUserId,
})

describe.skipIf(!LIVE)('createBranch against a live database', () => {
  beforeAll(async () => {
    // A Manager needs a branch and a profile from the start; seed them together.
    const owner = await queryRow<{ id: string }>(
      sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
    )
    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${CUSTOMER}, 'ZZ Branch IT customer', ${`${CUSTOMER}@example.invalid`}, false, 'customer'),
               (${MANAGER}, 'ZZ Branch IT manager', ${`${MANAGER}@example.invalid`}, false, 'manager')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order,
                            owner_user_id, manager_user_id)
        values (${MANAGED}, ${9900 + Math.floor(Math.random() * 90)}, ${`${PREFIX}_m`},
                'ZZ Branch IT managed', 'Test', '560100', '0000000000', 951,
                ${owner?.id ?? ''}, ${MANAGER})`),
      db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, role_witness)
        values (${`${MANAGER}_p`}, ${MANAGER}, 'manager', true, 'manager')`),
    ])
  })

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(sql`delete from staff_profile where user_id like ${like}`),
      db.execute(sql`delete from branch where id like ${like} or name like ${`${NAME}%`}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from branch where id like ${like} or name like ${`${NAME}%`}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({ branches: '0', users: '0' })
  })

  it('creates a branch whose new Owner becomes one in the same transaction', async () => {
    const result = await createBranch(fields(NAME, CUSTOMER))

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.branch).toMatchObject({ name: NAME, ownerUserId: CUSTOMER })
    expect(await queryRow(sql`select role from "user" where id = ${CUSTOMER}`)).toEqual({
      role: 'owner',
    })
  })

  it('refuses an Owner who holds another role, writing nothing', async () => {
    const result = await createBranch(fields(`${NAME} refused`, MANAGER))

    expect(result).toEqual({ ok: false, reason: 'owner_unavailable' })
    expect(await queryRows(sql`select id from branch where name = ${`${NAME} refused`}`)).toEqual(
      [],
    )
    expect(await queryRow(sql`select role from "user" where id = ${MANAGER}`)).toEqual({
      role: 'manager',
    })
  })
})
