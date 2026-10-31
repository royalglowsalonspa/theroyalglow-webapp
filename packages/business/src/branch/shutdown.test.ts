import { describe, expect, it } from 'vitest'
import {
  type ShutdownBlockerSummary,
  shutdownBlockedMessage,
  shutdownBlockerLines,
} from './shutdown'

const CLEAR: ShutdownBlockerSummary = {
  manager: null,
  people: [],
  bookings: { count: 0 },
  unpaidInvoices: { count: 0 },
  waitlist: { count: 0 },
}

describe('shutdownBlockerLines', () => {
  it('is empty when nothing is open', () => {
    expect(shutdownBlockerLines(CLEAR)).toEqual([])
  })

  it('says what to do about each open item', () => {
    expect(
      shutdownBlockerLines({
        manager: { name: 'Manish' },
        people: [
          { name: 'Kavya', role: 'receptionist' },
          { name: 'Asha', role: 'staff' },
        ],
        bookings: { count: 3 },
        unpaidInvoices: { count: 1 },
        waitlist: { count: 2 },
      }),
    ).toEqual([
      'Move the Manager, Manish, in Users & Roles.',
      'Remove or move 2 people who work here: Kavya (Receptionist), Asha (Stylist or Therapist).',
      'Complete, cancel or move 3 bookings still to happen.',
      'Settle 1 unpaid invoice.',
      'Resolve 2 waitlist entries.',
    ])
  })

  it('uses the singular for one of each', () => {
    expect(
      shutdownBlockerLines({
        ...CLEAR,
        people: [{ name: 'Kavya', role: 'receptionist' }],
        bookings: { count: 1 },
        waitlist: { count: 1 },
      }),
    ).toEqual([
      'Remove or move 1 person who works here: Kavya (Receptionist).',
      'Complete, cancel or move 1 booking still to happen.',
      'Resolve 1 waitlist entry.',
    ])
  })
})

describe('shutdownBlockedMessage', () => {
  it('names the branch and lists the steps', () => {
    expect(shutdownBlockedMessage('Marathahalli', ['Settle 1 unpaid invoice.'])).toBe(
      "Marathahalli can't shut down yet. Settle 1 unpaid invoice.",
    )
  })
})
