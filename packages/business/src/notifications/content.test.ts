/************************************************************
 * Module Name  : notifications/content.test
 * Scope        : Business Logic — Notifications
 *
 * Description  : buildNotificationContent is total: every type gives a
 *                non-empty title and body, with or without data (Correctness
 *                Property 11). A held-up booking's front-desk alert
 *                (staff_overrun, MS-08) names the person, the booking's time,
 *                branch and date, what reception can do, and who is free.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import { buildNotificationContent, type NotificationType } from './content'

// Mirrors the notification_type enum (packages/db/src/schema/enums.ts).
const TYPES: NotificationType[] = [
  'reminder_24h',
  'reminder_1h',
  'booking_confirmed',
  'booking_rescheduled',
  'booking_cancelled',
  'booking_rejected',
  'membership_created',
  'membership_session_recorded',
  'membership_expiry_30d',
  'membership_expiry_7d',
  'membership_expiry_1d',
  'membership_expired',
  'membership_hours_low',
  'membership_usage_nudge',
  'birthday_offer',
  'post_service_followup',
  'leave_submitted',
  'leave_approved',
  'leave_rejected',
  'lead_follow_up_due',
  'stale_pending_booking',
  'no_show_check',
  'gems_expiry_7d',
  'gems_expired',
  'branch_manager_missing',
  'staff_overrun',
]

describe('buildNotificationContent', () => {
  it.each(TYPES)('gives %s a title and a body, even without data', (type) => {
    const content = buildNotificationContent(type)
    expect(content.title.trim()).not.toBe('')
    expect(content.body.trim()).not.toBe('')
  })

  it('tells the front desk who holds a booking up, what to do and who is free', () => {
    expect(
      buildNotificationContent('staff_overrun', {
        staffName: 'Asha',
        time: '11:00',
        date: '31/10/2026',
        branchName: 'Rayasandra',
        suggestions: 'Lata, Manish',
      }),
    ).toEqual({
      title: 'Booking Held Up',
      body: 'Asha is still with another customer, so the 11:00 booking at Rayasandra on 31/10/2026 can’t start yet. Wait for them or assign someone else. Free then: Lata, Manish.',
    })
  })

  it('reads naturally with nothing but the type', () => {
    expect(buildNotificationContent('staff_overrun').body).toBe(
      'The person assigned is still with another customer, so the booking on your selected date can’t start yet. Wait for them or assign someone else.',
    )
  })

  describe("the salon's changes to a booking name its branch (R7.2)", () => {
    const at = { date: '05/11/2026', time: '11:00', branchName: 'Rayasandra' }

    it('confirms it', () => {
      expect(buildNotificationContent('booking_confirmed', at).body).toBe(
        'Your appointment at Royal Glow Rayasandra on 05/11/2026 at 11:00 is confirmed. See you soon!',
      )
    })

    it('moves it', () => {
      expect(buildNotificationContent('booking_rescheduled', at).body).toBe(
        'Your appointment at Royal Glow Rayasandra has been moved to 05/11/2026 at 11:00.',
      )
    })

    it('cancels it, with the reason as one sentence', () => {
      expect(
        buildNotificationContent('booking_cancelled', { ...at, reason: 'The branch is closed' })
          .body,
      ).toBe(
        'Your appointment at Royal Glow Rayasandra on 05/11/2026 has been cancelled. Reason: The branch is closed. We hope to see you again soon.',
      )
      expect(buildNotificationContent('booking_cancelled', at).body).toBe(
        'Your appointment at Royal Glow Rayasandra on 05/11/2026 has been cancelled. We hope to see you again soon.',
      )
    })

    it('rejects it, keeping a reason that already ends a sentence', () => {
      expect(
        buildNotificationContent('booking_rejected', { ...at, reason: 'Nobody is free then!' })
          .body,
      ).toBe(
        "Sorry, your 05/11/2026 booking at Royal Glow Rayasandra couldn't be confirmed. Reason: Nobody is free then! Book again?",
      )
    })
  })
})
