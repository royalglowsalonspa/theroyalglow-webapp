/************************************************************
 * Module Name  : branch-roles.test
 * Scope        : Data Access — Branch roles (multi-branch R1)
 *
 * Description  : getRoleSnapshot must read every branch and the people a
 *                change involves in one batch. applyBranchRolePlan must run
 *                the whole change as one transaction: defer the role keys,
 *                lock people then branches, re-check the snapshot, apply each
 *                write as a compare-and-set, sign people out, record their
 *                realtime token revocations and audit, and
 *                report a stale change only for the errors that mean one.
 *
 * Approach     : The real query functions run against a fake `db` whose query
 *                builders only record their calls. SQL is rendered with
 *                Drizzle's PgDialect. The database behaviour itself (deferred
 *                keys, locks, rollback) is covered by
 *                branch-roles.integration.test.ts against Neon dev.
 ************************************************************/

import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => {
  type Call = { method: string; args: unknown[] }
  type Recorded = {
    op: 'select' | 'update' | 'insert' | 'delete' | 'execute'
    args: unknown[]
    calls: Call[]
  }

  const records: Recorded[] = []
  const batches: Recorded[][] = []
  const byBuilder = new WeakMap<object, Recorded>()
  const state = {
    batchResult: [] as unknown,
    batchError: undefined as unknown,
  }

  function chain(record: Recorded): object {
    const builder: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (typeof prop === 'symbol' || prop === 'then') {
            return undefined
          }
          return (...args: unknown[]) => {
            record.calls.push({ method: prop, args })
            return builder
          }
        },
      },
    )
    byBuilder.set(builder, record)
    return builder
  }

  function start(op: Recorded['op'], args: unknown[]) {
    const record: Recorded = { op, args, calls: [] }
    records.push(record)
    return chain(record)
  }

  return {
    records,
    batches,
    state,
    db: {
      select: (...args: unknown[]) => start('select', args),
      update: (...args: unknown[]) => start('update', args),
      insert: (...args: unknown[]) => start('insert', args),
      delete: (...args: unknown[]) => start('delete', args),
      execute: (...args: unknown[]) => start('execute', args),
      async batch(items: object[]) {
        batches.push(items.map((item) => byBuilder.get(item) as Recorded))
        if (state.batchError !== undefined) {
          throw state.batchError
        }
        return state.batchResult
      },
    },
    reset() {
      records.length = 0
      batches.length = 0
      state.batchResult = []
      state.batchError = undefined
    },
  }
})

vi.mock('../index', () => ({ db: fake.db }))

import { session, user } from '../schema/auth'
import { branch } from '../schema/branch'
import { staffProfile } from '../schema/profile'
import { auditLog, realtimeRevocation } from '../schema/system'
import {
  applyBranchRolePlan,
  type BranchRoleAudit,
  type BranchRoleSnapshot,
  type BranchRoleWrite,
  getRoleSnapshot,
} from './branch-roles'

const dialect = new PgDialect()

type Recorded = (typeof fake.records)[number]

function render(value: unknown) {
  const { sql, params } = dialect.sqlToQuery(value as SQL)
  return { sql: sql.replace(/\s+/g, ' ').trim(), params }
}

function argOf(record: Recorded | undefined, method: string): unknown {
  return record?.calls.find((c) => c.method === method)?.args[0]
}

const BRANCH_ROW = {
  id: 'b1',
  name: 'Rayasandra',
  code: 'RS',
  status: 'operational' as const,
  isPrimary: true,
  displayOrder: 1,
  ownerUserId: 'own',
  managerUserId: 'mgr',
}

const SNAPSHOT: BranchRoleSnapshot = {
  users: [
    { id: 'dev', role: 'developer' },
    { id: 'mgr', role: 'manager' },
    { id: 'new', role: null },
    { id: 'own', role: 'owner' },
  ],
  profiles: [
    {
      userId: 'mgr',
      designation: 'manager',
      branchId: null,
      roleWitness: 'manager',
      isActive: true,
    },
  ],
  branches: [BRANCH_ROW],
}

const AUDIT: BranchRoleAudit = {
  actorId: 'dev',
  action: 'update',
  entityType: 'branch_role',
  entityId: 'new',
  branchId: 'b1',
  oldValues: { role: null },
  newValues: { change: 'set_owner' },
}

// The Owner handover the planner makes for "new becomes b1's Owner".
const HANDOVER: BranchRoleWrite[] = [
  { kind: 'branch_owner', branchId: 'b1', from: 'own', to: 'new' },
  { kind: 'user_role', userId: 'new', from: null, to: 'owner' },
  { kind: 'user_role', userId: 'own', from: 'owner', to: 'customer' },
  { kind: 'end_sessions', userId: 'own' },
]

beforeEach(() => {
  fake.reset()
})

describe('getRoleSnapshot', () => {
  it('reads the people involved and every branch in one batch', async () => {
    const users = [{ id: 'new', role: null }]
    fake.state.batchResult = [users, [], [BRANCH_ROW]]

    const snapshot = await getRoleSnapshot('b1', ['dev', 'new', 'new'])

    expect(snapshot).toEqual({ users, profiles: [], branches: [BRANCH_ROW] })
    expect(fake.batches).toHaveLength(1)
    const [userRead, profileRead, branchRead] = fake.batches[0] ?? []

    const holders =
      '(select "branch"."owner_user_id" from "branch" where "branch"."id" = $3 ' +
      'union select "branch"."manager_user_id" from "branch" where "branch"."id" = $4 ' +
      'union select "staff_profile"."user_id" from "staff_profile" ' +
      `where "staff_profile"."branch_id" = $5 and "staff_profile"."role_witness" = 'receptionist')`

    expect(argOf(userRead, 'from')).toBe(user)
    expect(render(argOf(userRead, 'where'))).toEqual({
      sql: `("user"."id" in ($1, $2) or "user"."id" in ${holders})`,
      params: ['dev', 'new', 'b1', 'b1', 'b1'],
    })

    expect(argOf(profileRead, 'from')).toBe(staffProfile)
    expect(render(argOf(profileRead, 'where'))).toEqual({
      sql: `("staff_profile"."user_id" in ($1, $2) or "staff_profile"."user_id" in ${holders})`,
      params: ['dev', 'new', 'b1', 'b1', 'b1'],
    })

    // Every branch: who owns or manages another branch decides demotions.
    expect(argOf(branchRead, 'from')).toBe(branch)
    expect(argOf(branchRead, 'where')).toBeUndefined()
  })
})

describe('applyBranchRolePlan', () => {
  it('writes nothing, not even an audit entry, for an empty plan', async () => {
    expect(await applyBranchRolePlan({ snapshot: SNAPSHOT, writes: [], audit: AUDIT })).toEqual({
      ok: true,
      signedOut: [],
    })
    expect(fake.records).toHaveLength(0)
  })

  it('runs the change as one transaction: defer, lock, re-check, write, audit', async () => {
    const result = await applyBranchRolePlan({ snapshot: SNAPSHOT, writes: HANDOVER, audit: AUDIT })

    expect(result).toEqual({ ok: true, signedOut: ['own'] })
    expect(fake.batches).toHaveLength(1)
    const statements = fake.batches[0] ?? []
    expect(statements.map((s) => s.op)).toEqual([
      'execute',
      'execute',
      'execute',
      'execute',
      'execute',
      'execute',
      'execute',
      'delete',
      'insert',
      'insert',
    ])
    const [
      defer,
      lockPeople,
      lockBranches,
      guard,
      owner,
      promote,
      demote,
      signOut,
      revocation,
      audit,
    ] = statements

    expect(render(defer?.args[0])).toEqual({
      sql: 'set constraints branch_owner_fk, branch_manager_fk, staff_profile_role_fk deferred',
      params: [],
    })
    // People, then branches, each in ID order, so concurrent changes queue.
    expect(render(lockPeople?.args[0])).toEqual({
      sql: 'select "user"."id" from "user" where "user"."id" in ($1, $2, $3, $4) order by "user"."id" for no key update',
      params: ['dev', 'mgr', 'new', 'own'],
    })
    expect(render(lockBranches?.args[0])).toEqual({
      sql: 'select "branch"."id" from "branch" order by "branch"."id" for no key update',
      params: [],
    })

    // The re-check compares the rows as read with the rows now, as sets.
    const check = render(guard?.args[0])
    expect(check.sql).toMatch(
      /^select 1 \/ \(case when \(u\.v @> \$1::jsonb and \$2::jsonb @> u\.v\)/,
    )
    expect(check.sql).toContain('from "user" where "user"."id" in ($7, $8, $9, $10)) u')
    expect(check.sql).toContain(
      'from "staff_profile" where "staff_profile"."user_id" in ($11, $12, $13, $14)) p',
    )
    expect(check.sql).toContain('from "branch") b')
    const [users, , profiles, , branches] = check.params as string[]
    expect(JSON.parse(users ?? '')).toEqual(SNAPSHOT.users)
    expect(JSON.parse(profiles ?? '')).toEqual(SNAPSHOT.profiles)
    expect(JSON.parse(branches ?? '')).toEqual([
      { id: 'b1', status: 'operational', ownerUserId: 'own', managerUserId: 'mgr' },
    ])

    // Each write is a compare-and-set that aborts the batch on no match.
    expect(render(owner?.args[0])).toEqual({
      sql:
        'with changed as (update "branch" set "owner_user_id" = $1, "updated_at" = now() ' +
        'where "branch"."id" = $2 and "branch"."owner_user_id" is not distinct from $3 returning 1) ' +
        'select 1 / count(*)::int as ok from changed',
      params: ['new', 'b1', 'own'],
    })
    expect(render(promote?.args[0])).toEqual({
      sql:
        'with changed as (update "user" set "role" = $1, "updated_at" = now() ' +
        'where "user"."id" = $2 and "user"."role" is not distinct from $3 returning 1) ' +
        'select 1 / count(*)::int as ok from changed',
      params: ['owner', 'new', null],
    })
    expect(render(demote?.args[0]).params).toEqual(['customer', 'own', 'owner'])

    expect(signOut?.args[0]).toBe(session)
    expect(render(argOf(signOut, 'where'))).toEqual({
      sql: '"session"."user_id" = $1',
      params: ['own'],
    })

    // Whoever is signed out also has their live-update tokens revoked; the
    // intent commits with the change (R2.6).
    expect(revocation?.args[0]).toBe(realtimeRevocation)
    expect(argOf(revocation, 'values')).toEqual({ userId: 'own' })

    expect(audit?.args[0]).toBe(auditLog)
    expect(argOf(audit, 'values')).toEqual({
      actorId: 'dev',
      action: 'update',
      entityType: 'branch_role',
      entityId: 'new',
      branchId: 'b1',
      oldValues: { role: null },
      newValues: { change: 'set_owner' },
      ipAddress: null,
    })
  })

  it('deactivates a profile without its witness and keeps its branch', async () => {
    await applyBranchRolePlan({
      snapshot: SNAPSHOT,
      writes: [{ kind: 'profile_deactivate', userId: 'mgr' }],
      audit: AUDIT,
    })

    const write = fake.batches[0]?.[4]
    expect(render(write?.args[0])).toEqual({
      sql:
        'with changed as (update "staff_profile" set "is_active" = false, "role_witness" = null, ' +
        '"updated_at" = now() where "staff_profile"."user_id" = $1 and "staff_profile"."is_active" = true ' +
        'returning 1) select 1 / count(*)::int as ok from changed',
      params: ['mgr'],
    })
  })

  it('clears a branch Manager with a compare-and-set on the current one', async () => {
    await applyBranchRolePlan({
      snapshot: SNAPSHOT,
      writes: [{ kind: 'branch_manager', branchId: 'b1', from: 'mgr', to: null }],
      audit: AUDIT,
    })

    expect(render(fake.batches[0]?.[4]?.args[0])).toEqual({
      sql:
        'with changed as (update "branch" set "manager_user_id" = $1, "updated_at" = now() ' +
        'where "branch"."id" = $2 and "branch"."manager_user_id" is not distinct from $3 returning 1) ' +
        'select 1 / count(*)::int as ok from changed',
      params: [null, 'b1', 'mgr'],
    })
  })

  it.each([
    ['keeps the stored specialization when none is given', undefined, {}],
    ['clears it when null', null, { specialization: null }],
    ['sets it when given', 'Bridal makeup', { specialization: 'Bridal makeup' }],
  ] as const)('activates a profile as an upsert and %s', async (_label, specialization, extra) => {
    await applyBranchRolePlan({
      snapshot: SNAPSHOT,
      writes: [
        {
          kind: 'profile_activate',
          userId: 'new',
          designation: 'stylist',
          roleWitness: 'staff',
          branchId: 'b1',
          specialization,
        },
      ],
      audit: AUDIT,
    })

    const upsert = fake.batches[0]?.[4]
    const fields = {
      designation: 'stylist',
      isActive: true,
      branchId: 'b1',
      roleWitness: 'staff',
      ...extra,
    }
    expect(upsert?.op).toBe('insert')
    expect(upsert?.args[0]).toBe(staffProfile)
    expect(argOf(upsert, 'values')).toEqual({ userId: 'new', ...fields })
    // user_id is unique: re-adding someone reactivates their earlier profile.
    expect(argOf(upsert, 'onConflictDoUpdate')).toEqual({
      target: staffProfile.userId,
      set: { ...fields, updatedAt: expect.any(Date) },
    })
  })

  it('refuses a write that touches someone outside the snapshot', async () => {
    await expect(
      applyBranchRolePlan({
        snapshot: SNAPSHOT,
        writes: [{ kind: 'user_role', userId: 'stranger', from: 'customer', to: 'staff' }],
        audit: AUDIT,
      }),
    ).rejects.toThrow('outside its snapshot')
    await expect(
      applyBranchRolePlan({
        snapshot: SNAPSHOT,
        writes: [{ kind: 'branch_manager', branchId: 'elsewhere', from: null, to: 'mgr' }],
        audit: AUDIT,
      }),
    ).rejects.toThrow('outside its snapshot')
    expect(fake.batches).toHaveLength(0)
  })

  it.each([
    ['a failed guard', Object.assign(new Error('division by zero'), { code: '22012' })],
    [
      'a wrapped failed guard',
      new Error('Failed query', {
        cause: Object.assign(new Error('division by zero'), { code: '22012' }),
      }),
    ],
    [
      'a role key rejected at commit',
      Object.assign(new Error('violates foreign key constraint'), {
        code: '23503',
        constraint: 'branch_owner_fk',
      }),
    ],
    [
      'a role key named only in the message',
      Object.assign(
        new Error(
          'update or delete on table "user" violates foreign key constraint "staff_profile_role_fk" on table "staff_profile"',
        ),
        { code: '23503' },
      ),
    ],
    [
      'a second Receptionist',
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'staff_profile_one_receptionist_per_branch',
      }),
    ],
    [
      'an Owner who is also the Manager',
      Object.assign(new Error('check'), {
        code: '23514',
        constraint: 'branch_owner_is_not_manager_check',
      }),
    ],
    [
      'a relationship the deferred trigger found missing',
      Object.assign(new Error('Manager u1 manages no branch'), {
        code: '23514',
        constraint: 'role_relationships',
      }),
    ],
    ['a deadlock', Object.assign(new Error('deadlock detected'), { code: '40P01' })],
  ])('reports %s as stale', async (_label, error) => {
    fake.state.batchError = error

    expect(
      await applyBranchRolePlan({ snapshot: SNAPSHOT, writes: HANDOVER, audit: AUDIT }),
    ).toEqual({ ok: false, reason: 'stale' })
  })

  it.each([
    [
      'another unique violation',
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'staff_profile_user_id_unique',
      }),
    ],
    [
      'another foreign key',
      Object.assign(new Error('fk'), {
        code: '23503',
        constraint: 'audit_log_actor_id_user_id_fk',
      }),
    ],
    ['a connection failure', Object.assign(new Error('connection reset'), { code: '08006' })],
  ])('rethrows %s', async (_label, error) => {
    fake.state.batchError = error

    await expect(
      applyBranchRolePlan({ snapshot: SNAPSHOT, writes: HANDOVER, audit: AUDIT }),
    ).rejects.toBe(error)
  })
})
