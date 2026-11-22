import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { isLiveDbAvailable, queryRows } from '../test/live-db'

// The Drizzle snapshot omits deferrability, exclusion constraints and triggers
// written by hand. Verify the actual PostgreSQL objects as well as the separate
// integration suites that exercise their behavior.
describe.skipIf(!isLiveDbAvailable())('multi-branch database schema invariants', () => {
  it('preserves the role-qualified deferred foreign keys', async () => {
    const keys = await queryRows(sql`
      select c.conname as name, t.relname as "table", ref.relname as "references",
             c.condeferrable as deferrable, c.condeferred as "initiallyDeferred",
             c.convalidated as validated, c.confdeltype as "onDelete", c.confupdtype as "onUpdate",
             array(
               select a.attname::text
               from unnest(c.conkey) with ordinality as k(attnum, position)
               join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
               order by k.position
             ) as columns,
             array(
               select a.attname::text
               from unnest(c.confkey) with ordinality as k(attnum, position)
               join pg_attribute a on a.attrelid = ref.oid and a.attnum = k.attnum
               order by k.position
             ) as "referencedColumns"
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_class ref on ref.oid = c.confrelid
      where t.relnamespace = 'public'::regnamespace
        and ref.relnamespace = 'public'::regnamespace
        and c.contype = 'f'
        and c.conname in ('branch_owner_fk', 'branch_manager_fk', 'staff_profile_role_fk')
      order by c.conname
    `)
    const policy = {
      references: 'user',
      referencedColumns: ['id', 'role'],
      deferrable: true,
      initiallyDeferred: false,
      validated: true,
      onDelete: 'a',
      onUpdate: 'a',
    }
    expect(keys).toEqual([
      {
        ...policy,
        name: 'branch_manager_fk',
        table: 'branch',
        columns: ['manager_user_id', 'manager_role'],
      },
      {
        ...policy,
        name: 'branch_owner_fk',
        table: 'branch',
        columns: ['owner_user_id', 'owner_role'],
      },
      {
        ...policy,
        name: 'staff_profile_role_fk',
        table: 'staff_profile',
        columns: ['user_id', 'role_witness'],
      },
    ])
  })

  it('enforces the SPA and mixed-service exclusions on both staff projections', async () => {
    const constraints = await queryRows<{ name: string; table: string; definition: string }>(sql`
      select c.conname as name, t.relname as "table", pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relnamespace = 'public'::regnamespace
        and t.relname in ('staff_occupancy', 'staff_work')
        and c.contype = 'x'
      order by c.conname
    `)
    const spa =
      /^EXCLUDE USING gist \(staff_id WITH =, during WITH &&\) WHERE \(\(kind = 'spa'::\w+\)\)$/
    const mixed = 'EXCLUDE USING gist (staff_id WITH =, during WITH &&, kind WITH <>)'
    expect(constraints).toEqual([
      { name: 'staff_occupancy_mixed_overlap', table: 'staff_occupancy', definition: mixed },
      {
        name: 'staff_occupancy_spa_overlap',
        table: 'staff_occupancy',
        definition: expect.stringMatching(spa),
      },
      { name: 'staff_work_mixed_overlap', table: 'staff_work', definition: mixed },
      {
        name: 'staff_work_spa_overlap',
        table: 'staff_work',
        definition: expect.stringMatching(spa),
      },
    ])
  })

  const guards = [
    ['user', 'user_role_relationships', 'user_role_relationships_check', true],
    ['branch', 'branch_role_relationships', 'branch_role_relationships_check', true],
    [
      'staff_profile',
      'staff_profile_role_relationships',
      'staff_profile_role_relationships_check',
      true,
    ],
    ['booking', 'booking_membership_hold_sync', 'booking_membership_hold_sync', false],
    ['membership_hold', 'membership_hold_guard', 'membership_hold_guard', false],
    ['membership_hold', 'membership_hold_totals', 'membership_hold_totals', false],
    [
      'membership_hold',
      'membership_minutes_balanced_hold',
      'membership_minutes_balanced_check',
      true,
    ],
    [
      'spa_membership',
      'membership_minutes_balanced_membership',
      'membership_minutes_balanced_check',
      true,
    ],
    ['spa_membership', 'spa_membership_cancel_guard', 'spa_membership_cancel_guard', false],
    ['booking', 'booking_staff_occupancy_sync', 'booking_staff_occupancy_sync', false],
    [
      'booking_service',
      'booking_service_staff_occupancy_sync',
      'booking_service_staff_occupancy_sync',
      false,
    ],
    ['staff_occupancy', 'staff_occupancy_guard', 'staff_projection_guard', false],
    ['staff_work', 'staff_work_guard', 'staff_projection_guard', false],
    ['booking', 'booking_one_assignee', 'booking_one_assignee_check', true],
    ['booking_service', 'booking_service_one_assignee', 'booking_one_assignee_check', true],
    ['booking', 'booking_assignee_recheck', 'booking_assignee_recheck', true],
    ['booking_service', 'booking_line_designation_guard', 'assert_booking_line_designation', false],
    ['booking', 'booking_start_designation_guard', 'assert_booking_designation_at_start', false],
    [
      'staff_profile',
      'staff_designation_release_future',
      'release_ineligible_staff_designation',
      false,
    ],
    ['membership_correction', 'membership_correction_guard', 'assert_membership_correction', false],
    ['membership_correction', 'membership_correction_apply', 'apply_membership_correction', false],
    [
      'membership_correction',
      'membership_minutes_balanced_correction',
      'membership_minutes_balanced_check',
      true,
    ],
    [
      'settlement_entry',
      'settlement_entry_membership_correction_guard',
      'assert_membership_correction_settlement',
      false,
    ],
  ] as const

  it('keeps role, membership and staffing triggers enabled with their expected deferral', async () => {
    const names = guards.map(([, name]) => name)
    const triggers = await queryRows(sql`
      select t.relname as "table", g.tgname as name, p.proname as "function",
             g.tgenabled in ('O', 'A') as enabled, g.tgdeferrable as deferrable,
             g.tginitdeferred as "initiallyDeferred"
      from pg_trigger g
      join pg_class t on t.oid = g.tgrelid
      join pg_proc p on p.oid = g.tgfoid
      where t.relnamespace = 'public'::regnamespace
        and p.pronamespace = 'public'::regnamespace
        and not g.tgisinternal
        and g.tgname = any(${sql.param(names)}::text[])
    `)
    expect(triggers).toHaveLength(guards.length)
    expect(triggers).toEqual(
      expect.arrayContaining(
        guards.map(([table, name, fn, deferred]) => ({
          table,
          name,
          function: fn,
          enabled: true,
          deferrable: deferred,
          initiallyDeferred: deferred,
        })),
      ),
    )
  })
})
