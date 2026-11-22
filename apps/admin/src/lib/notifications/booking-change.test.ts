// @vitest-environment node
/************************************************************
 * Module Name  : notifications/booking-change.test
 * Scope        : Notifications — the salon's changes to a booking
 *                (multi-branch R7.2, customer-flows.md)
 *
 * Description  : notifyBookingChange tells the customer by push and email,
 *                naming the branch from its row with its address, phone and
 *                directions; sends a confirmation, rejection or cancellation
 *                once per booking but every move; escapes what staff typed;
 *                and never throws.
 *
 * Approach     : @rgss/db/queries, the dispatcher and the email provider are
 *                mocked; @rgss/business stays REAL.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SendEmailParams } from './providers/email'

const dbMocks = vi.hoisted(() => ({
  hasNotification: vi.fn(async () => false),
  getBranchById: vi.fn(),
  createNotification: vi.fn(),
  getUserContact: vi.fn(),
}))
const dispatchMock = vi.hoisted(() => vi.fn(async () => undefined))
const sendEmailMock = vi.hoisted(() => vi.fn(async (_params: SendEmailParams) => true))

vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('./dispatch', () => ({ dispatchNotification: dispatchMock }))
vi.mock('./providers/email', () => ({ sendEmail: sendEmailMock }))

import { notifyBookingChange } from './booking-change'
import { bookingEmailHtml } from './booking-email'

const BRANCH = {
  id: 'branch_rs',
  name: 'Rayasandra',
  addressLine1: '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd',
  addressLine2: 'Above SBI Bank',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560100',
  phone: '+91 63601 35720',
  googleMapsUrl: 'https://maps.app.goo.gl/royalglow',
}

const BOOKING = {
  id: 'bk_1',
  customerId: 'cust_1',
  branchId: 'branch_rs',
  bookingDate: new Date('2026-11-05T00:00:00.000Z'),
  startTime: '11:00:00',
}

beforeEach(() => {
  vi.clearAllMocks()
  dbMocks.hasNotification.mockResolvedValue(false)
  dbMocks.getBranchById.mockResolvedValue(BRANCH)
  dbMocks.createNotification.mockImplementation(async (row: Record<string, unknown>) => ({
    id: 'ntf_1',
    channel: 'push',
    ...row,
  }))
  dbMocks.getUserContact.mockResolvedValue({ email: 'asha@example.com', name: 'Asha' })
})

describe('notifyBookingChange', () => {
  it('tells the customer by push and email, naming the branch with its details', async () => {
    expect(await notifyBookingChange({ type: 'booking_confirmed', booking: BOOKING })).toBe(true)

    const body =
      'Your appointment at Royal Glow Rayasandra on 05/11/2026 at 11:00 is confirmed. See you soon!'
    expect(dbMocks.createNotification).toHaveBeenCalledWith({
      userId: 'cust_1',
      type: 'booking_confirmed',
      title: 'Booking Confirmed! ✓',
      body,
      channel: 'push',
      bookingId: 'bk_1',
    })
    expect(dispatchMock).toHaveBeenCalledWith({
      id: 'ntf_1',
      userId: 'cust_1',
      type: 'booking_confirmed',
      channel: 'push',
      title: 'Booking Confirmed! ✓',
      body,
    })

    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const email = sendEmailMock.mock.calls[0]?.[0]
    expect(email).toBeDefined()
    expect(email?.to).toBe('asha@example.com')
    expect(email?.subject).toBe('Booking Confirmed! ✓')
    expect(email?.html).toContain(body)
    expect(email?.html).toContain('<strong>Royal Glow Rayasandra</strong>')
    expect(email?.html).toContain('<br>Bengaluru, Karnataka 560100')
    expect(email?.html).toContain('href="tel:+916360135720"')
    expect(email?.html).toContain('href="https://maps.app.goo.gl/royalglow"')
    expect(email?.html).toContain('href="https://theroyalglow.in/bookings/bk_1"')
  })

  it('sends a confirmation, rejection or cancellation once per booking', async () => {
    dbMocks.hasNotification.mockResolvedValue(true)

    for (const type of ['booking_confirmed', 'booking_rejected', 'booking_cancelled'] as const) {
      expect(await notifyBookingChange({ type, booking: BOOKING })).toBe(false)
    }
    expect(dbMocks.hasNotification).toHaveBeenCalledWith('cust_1', 'booking_cancelled', 'bk_1')
    expect(dbMocks.createNotification).not.toHaveBeenCalled()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('sends every move', async () => {
    dbMocks.hasNotification.mockResolvedValue(true)

    expect(await notifyBookingChange({ type: 'booking_rescheduled', booking: BOOKING })).toBe(true)
    expect(dbMocks.hasNotification).not.toHaveBeenCalled()
    expect(dbMocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'booking_rescheduled',
        body: 'Your appointment at Royal Glow Rayasandra has been moved to 05/11/2026 at 11:00.',
      }),
    )
  })

  it('gives the reason staff typed', async () => {
    await notifyBookingChange({
      type: 'booking_cancelled',
      booking: BOOKING,
      reason: ' Branch closed <today> ',
    })

    expect(dbMocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Your appointment at Royal Glow Rayasandra on 05/11/2026 has been cancelled. Reason: Branch closed <today>. We hope to see you again soon.',
      }),
    )
    const email = sendEmailMock.mock.calls[0]?.[0]
    expect(email?.html).toContain('Branch closed &lt;today&gt;.')
    expect(email?.html).not.toContain('<today>')
  })

  it('still sends the push without an email address', async () => {
    dbMocks.getUserContact.mockResolvedValue({ email: null, name: 'Asha' })

    expect(await notifyBookingChange({ type: 'booking_confirmed', booking: BOOKING })).toBe(true)
    expect(dispatchMock).toHaveBeenCalledTimes(1)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('never throws: a failure is logged and nothing is said to have been sent', async () => {
    dbMocks.createNotification.mockRejectedValue(new Error('connection reset'))

    await expect(
      notifyBookingChange({ type: 'booking_confirmed', booking: BOOKING }),
    ).resolves.toBe(false)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})

describe('bookingEmailHtml', () => {
  it('escapes the branch details and leaves out a link that isn’t https', () => {
    const html = bookingEmailHtml({
      title: 'Booking Confirmed! ✓',
      body: 'See you soon!',
      branch: {
        ...BRANCH,
        name: 'Koramangala & Co "HSR"',
        phone: '0000000000',
        googleMapsUrl: 'javascript:alert(1)',
      },
      bookingUrl: 'https://theroyalglow.in/bookings/bk_1',
    })

    expect(html).toContain('<strong>Royal Glow Koramangala &amp; Co &quot;HSR&quot;</strong>')
    expect(html).not.toContain('tel:')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('Get directions')
  })
})
