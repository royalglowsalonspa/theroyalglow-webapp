/************************************************************
 * Module Name  : lib/admin/bookings.test
 * Scope        : Admin — booking presentation helpers (slices 2b and 3)
 *
 * Description  : A staff picker says why someone can't take a slot, in IST
 *                12-hour times, and refuses only who the database would:
 *                on leave or booked then always, still with a customer only
 *                when the work starts now, not scheduled then only for work
 *                planned ahead. A held-up booking's reason says it can't
 *                start yet; an overrun flag without an assignee says they
 *                were booked then; a schedule change says they aren't
 *                scheduled then.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import {
  reassignmentReasonText,
  reassignmentsNotice,
  type StaffBusy,
  staffBusyBlocks,
  staffBusyNote,
  staffOptionLabel,
} from './bookings'

const BOOKED: StaffBusy = { reason: 'booked', from: '14:30', to: '15:30' }
const WORKING: StaffBusy = { reason: 'working', since: '09:05' }
const ON_LEAVE: StaffBusy = { reason: 'on_leave' }
const OFF_SCHEDULE: StaffBusy = { reason: 'off_schedule' }

describe('staff picker notes', () => {
  it('says why, in 12-hour IST times', () => {
    expect(staffBusyNote(BOOKED)).toBe('Booked 02:30 PM–03:30 PM')
    expect(staffBusyNote(WORKING)).toBe('With a customer since 09:05 AM')
    expect(staffBusyNote(ON_LEAVE)).toBe('On leave')
    expect(staffBusyNote(OFF_SCHEDULE)).toBe('Not scheduled then')
    expect(staffBusyNote(null)).toBeNull()
    expect(staffBusyNote(undefined)).toBeNull()
  })

  it('labels an option with its name, title and note', () => {
    expect(staffOptionLabel({ id: 's1', name: 'Asha', designation: 'therapist' })).toBe(
      'Asha (therapist)',
    )
    expect(
      staffOptionLabel({ id: 's1', name: 'Asha', designation: 'therapist', busy: BOOKED }),
    ).toBe('Asha (therapist) · Booked 02:30 PM–03:30 PM')
  })

  it.each<[string, StaffBusy | null, boolean, boolean]>([
    ['free', null, false, false],
    ['on leave', ON_LEAVE, true, true],
    ['booked then', BOOKED, true, true],
    ['still with a customer', WORKING, false, true],
    // The schedule plans: work starting now isn't refused for it (MS-09).
    ['not scheduled then', OFF_SCHEDULE, true, false],
  ])('refuses someone %s: later %s, starting now %s', (_case, busy, later, now) => {
    expect(staffBusyBlocks(busy, { startsNow: false })).toBe(later)
    expect(staffBusyBlocks(busy, { startsNow: true })).toBe(now)
  })
})

describe('reassignmentReasonText', () => {
  it('says a held-up booking can’t start yet, and that they were booked otherwise', () => {
    expect(
      reassignmentReasonText({ reason: 'overrun', previousStaffName: 'Asha', heldUp: true }),
    ).toBe('Asha is still with another customer, so this booking can’t start yet.')
    expect(reassignmentReasonText({ reason: 'overrun', previousStaffName: 'Asha' })).toBe(
      'Asha is busy with another customer at that time.',
    )
    expect(reassignmentReasonText({ reason: 'left_branch', previousStaffName: null })).toBe(
      'The person assigned no longer works at this branch.',
    )
  })

  it('says a schedule change or leave took them off it', () => {
    expect(reassignmentReasonText({ reason: 'off_schedule', previousStaffName: 'Ravi' })).toBe(
      'Ravi isn’t scheduled to work then.',
    )
    expect(reassignmentReasonText({ reason: 'unavailable', previousStaffName: 'Ravi' })).toBe(
      'Ravi is on approved leave that day.',
    )
  })
})

describe('reassignmentsNotice', () => {
  it('points to the dashboard when a change took people off bookings', () => {
    expect(reassignmentsNotice(1)).toBe(
      '1 booking needs someone else. It’s listed on the dashboard.',
    )
    expect(reassignmentsNotice(3)).toBe(
      '3 bookings need someone else. They’re listed on the dashboard.',
    )
  })

  it('says nothing otherwise', () => {
    expect(reassignmentsNotice(0)).toBeNull()
    expect(reassignmentsNotice(undefined)).toBeNull()
    expect(reassignmentsNotice('2')).toBeNull()
  })
})
