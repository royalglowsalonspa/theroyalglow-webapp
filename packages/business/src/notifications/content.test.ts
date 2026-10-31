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
})
