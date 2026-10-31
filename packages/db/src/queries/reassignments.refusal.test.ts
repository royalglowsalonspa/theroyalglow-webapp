/************************************************************
 * Module Name  : reassignments.refusal.test
 * Scope        : Unit test — why the database refused an assignee
 *
 * Description  : assigneeRefusal maps a driver error to the refusal reception
 *                reads: the 0014/0032 trigger's check violations (no longer
 *                at the branch, on leave, not scheduled then), the 0028
 *                exclusion violations on
 *                staff_occupancy (booked then) and staff_work (still with
 *                another customer), and the 0028 one-assignee check. Drizzle
 *                may wrap the Postgres error on `.cause`. Another constraint,
 *                or the right name under another SQLSTATE, is not a refusal.
 *
 * Approach     : Pure; the db client is mocked away so the module loads
 *                without a database.
 ************************************************************/

import { describe, expect, it, vi } from 'vitest'

vi.mock('../index', () => ({ db: {} }))

import { type AssigneeRefusal, assigneeRefusal, assigneeRefusalMessage } from './reassignments'

function pgError(code: string, constraint?: string, message = 'refused') {
  return Object.assign(new Error(message), { code, ...(constraint ? { constraint } : {}) })
}

function wrapped(cause: unknown) {
  return Object.assign(new Error('Failed query'), { cause })
}

describe('assigneeRefusal', () => {
  it.each<[string, string, AssigneeRefusal]>([
    ['23514', 'booking_assignee_works_at_branch', 'not_at_branch'],
    ['23514', 'booking_assignee_on_leave', 'on_leave'],
    ['23514', 'booking_assignee_off_schedule', 'off_schedule'],
    ['23P01', 'staff_occupancy_spa_overlap', 'booked'],
    ['23P01', 'staff_occupancy_mixed_overlap', 'booked'],
    ['23P01', 'staff_work_spa_overlap', 'working'],
    ['23P01', 'staff_work_mixed_overlap', 'working'],
    ['23514', 'booking_one_assignee', 'one_assignee'],
  ])('reads %s on %s as %s, wrapped or not', (code, constraint, refusal) => {
    expect(assigneeRefusal(pgError(code, constraint))).toBe(refusal)
    expect(assigneeRefusal(wrapped(pgError(code, constraint)))).toBe(refusal)
  })

  it('falls back to the constraint the message names', () => {
    expect(
      assigneeRefusal(
        pgError(
          '23P01',
          undefined,
          'conflicting key value violates exclusion constraint "staff_work_spa_overlap"',
        ),
      ),
    ).toBe('working')
  })

  it.each([
    { name: 'another constraint', error: pgError('23514', 'staff_projection_derived') },
    {
      name: 'the name under another SQLSTATE',
      error: pgError('23505', 'staff_occupancy_spa_overlap'),
    },
    { name: 'an error without a SQLSTATE', error: new Error('boom') },
    { name: 'nothing', error: null },
  ])('is null for $name', ({ error }) => {
    expect(assigneeRefusal(error)).toBeNull()
  })
})

describe('assigneeRefusalMessage', () => {
  it('tells reception, in its own words, why and what to do', () => {
    const refusals: AssigneeRefusal[] = [
      'not_at_branch',
      'on_leave',
      'off_schedule',
      'booked',
      'working',
      'one_assignee',
    ]
    const messages = refusals.map(assigneeRefusalMessage)

    expect(new Set(messages).size).toBe(refusals.length)
    for (const message of messages) {
      expect(message).toMatch(/\. Choose [^.]+\.$/)
    }
    expect(assigneeRefusalMessage('off_schedule')).toBe(
      'That staff member isn’t scheduled to work then. Choose someone else.',
    )
    expect(assigneeRefusalMessage('booked')).toBe(
      'That staff member has another booking at that time. Choose someone else.',
    )
    expect(assigneeRefusalMessage('working')).toBe(
      'That staff member is still with another customer. Choose someone else.',
    )
  })
})
