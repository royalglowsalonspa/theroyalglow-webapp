// Notification content builders. Pure functions that map a notification type
// plus a flat string payload to a { title, body } pair, mirroring the catalog
// in design/notifications-realtime.md §2 where a type matches and using concise
// sensible copy for the operational types that are not in the visual catalog.
//
// NOTIFICATION_TYPES mirrors the `notification_type` PG enum
// (packages/db/src/schema/enums.ts). Kept as a local `as const` so this module
// is self-contained (no db import) while staying exhaustive over the enum.
const NOTIFICATION_TYPES = [
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
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export type NotificationContent = { title: string; body: string }

// Build the in-app/push title + body for a notification. Values are interpolated
// from `data` with sensible fallbacks so the function is total: it always returns
// a non-empty title AND body for every NotificationType (and any unexpected
// input via the default branch). See Correctness Property 11.
export function buildNotificationContent(
  type: NotificationType,
  data: Record<string, string> = {},
): NotificationContent {
  const date = data.date ?? 'your selected date'
  const time = data.time ?? 'the scheduled time'
  const serviceName = data.serviceName ?? 'your service'
  const staffName = data.staffName ?? 'our team'
  const reason = data.reason ?? 'not specified'
  const count = data.count ?? 'some'

  switch (type) {
    case 'reminder_24h':
      return {
        title: `Reminder: Tomorrow at ${time}`,
        body: `${serviceName} at Royal Glow. We're looking forward to seeing you!`,
      }
    case 'reminder_1h':
      return {
        title: 'Almost time! 1 hour to go',
        body: `Your ${serviceName} appointment is at ${time}. See you soon at Royal Glow.`,
      }
    case 'booking_confirmed':
      return {
        title: 'Booking Confirmed! ✓',
        body: `Your appointment on ${date} at ${time} is confirmed. See you at Royal Glow!`,
      }
    case 'booking_rescheduled':
      return {
        title: 'Booking Rescheduled',
        body: `Your appointment has been moved to ${date} at ${time}.`,
      }
    case 'booking_cancelled':
      return {
        title: 'Booking Cancelled',
        body: `Your appointment on ${date} has been cancelled. We hope to see you again soon.`,
      }
    case 'booking_rejected':
      return {
        title: 'Booking Rejected',
        body: `Sorry, your ${date} booking couldn't be confirmed. Reason: ${reason}. Book again?`,
      }
    case 'membership_created':
      return {
        title: 'Welcome to Royal Glow Membership',
        body: 'Your SPA membership is now active. Enjoy your sessions!',
      }
    case 'membership_session_recorded':
      return {
        title: 'Session Recorded',
        body: `Your ${serviceName} session has been recorded against your membership.`,
      }
    case 'membership_expiry_30d':
      return {
        title: 'Membership Expiring in 30 Days',
        body: 'Your SPA membership expires in 30 days. Book your remaining sessions soon.',
      }
    case 'membership_expiry_7d':
      return {
        title: 'Membership Expiring in 7 Days',
        body: 'Your SPA membership expires in 7 days. Use your remaining hours before they lapse.',
      }
    case 'membership_expiry_1d':
      return {
        title: 'Membership Expires Tomorrow',
        body: 'Your SPA membership expires tomorrow. This is your last chance to book a session.',
      }
    case 'membership_expired':
      return {
        title: 'Membership Expired',
        body: 'Your SPA membership has expired. Renew to keep enjoying member benefits.',
      }
    case 'membership_hours_low':
      return {
        title: 'Membership Hours Running Low',
        body: 'You have only a few membership hours left. Plan your next session with us.',
      }
    case 'membership_usage_nudge':
      return {
        title: 'Make the Most of Your Membership',
        body: "It's been a while since your last visit. Book a session to use your hours.",
      }
    case 'birthday_offer':
      return {
        title: 'Happy Birthday from Royal Glow! 🎉',
        body: 'Celebrate with a special birthday offer, just for you. Book today!',
      }
    case 'post_service_followup':
      return {
        title: 'How Was Your Visit?',
        body: `We'd love your feedback on your recent ${serviceName} at Royal Glow.`,
      }
    case 'leave_submitted':
      return {
        title: 'Leave Request Submitted',
        body: `Your leave request for ${date} has been submitted and is awaiting review.`,
      }
    case 'leave_approved':
      return {
        title: 'Leave Approved',
        body: `Your leave request for ${date} has been approved.`,
      }
    case 'leave_rejected':
      return {
        title: 'Leave Rejected',
        body: `Your leave request for ${date} was rejected. Reason: ${reason}.`,
      }
    case 'lead_follow_up_due':
      return {
        title: 'Lead Follow-up Due',
        body: `A follow-up with ${staffName} is due. Reach out to keep the lead warm.`,
      }
    case 'stale_pending_booking':
      return {
        title: 'Pending Booking Needs Attention',
        body: `A booking for ${date} has been pending too long. Please review and confirm.`,
      }
    case 'no_show_check':
      return {
        title: 'No-show Check',
        body: `Please confirm whether the ${date} appointment was a no-show.`,
      }
    case 'gems_expiry_7d':
      return {
        title: 'Gems Expiring Soon 💎',
        body: `You have ${count} gems expiring in 7 days. Redeem them before they're gone!`,
      }
    case 'gems_expired':
      return {
        title: 'Gems Expired',
        body: `${count} of your gems have expired. Earn more on your next visit!`,
      }
    default:
      return { title: 'Royal Glow', body: 'You have a new notification.' }
  }
}
