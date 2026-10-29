/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : content (notifications)
 * Scope        : Business Logic — Notifications
 *
 * Description  : Notification content builders — maps notification
 *                types to { title, body } pairs for in-app/push display.
 *
 * Responsibilities :
 * - Build notification title and body from type + dynamic data
 * - Cover all 25 notification types exhaustively
 * - Name the branch when `branchName` is given (multi-branch R7.2, R7.4)
 *
 * Features / Functionality :
 * - buildNotificationContent(type, data) → { title, body }
 * - Handles: reminders, booking status, membership lifecycle,
 *   birthday, follow-ups, leave, leads, gems, no-show checks
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None
 *
 * Notes        :
 * - Total function: always returns non-empty title AND body
 * - Self-contained (no db import) — mirrors notification_type PG enum
 ************************************************************/

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
  'branch_manager_missing',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

// "Royal Glow Rayasandra" when the branch is known, else "Royal Glow".
function placeName(branchName: string | undefined): string {
  return branchName ? `Royal Glow ${branchName}` : 'Royal Glow'
}

// " at Rayasandra" when the branch is known, else nothing.
function atBranch(branchName: string | undefined): string {
  return branchName ? ` at ${branchName}` : ''
}

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
  const reason = data.reason ?? 'not specified'
  const count = data.count ?? 'some'
  const place = placeName(data.branchName)
  const at = atBranch(data.branchName)

  switch (type) {
    case 'reminder_24h':
      return {
        title: `Reminder: Tomorrow at ${time}`,
        body: `${serviceName} at ${place}. We're looking forward to seeing you!`,
      }
    case 'reminder_1h':
      return {
        title: 'Almost time! 1 hour to go',
        body: `Your ${serviceName} appointment is at ${time}. See you soon at ${place}.`,
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
        body: `We'd love your feedback on your recent ${serviceName} at ${place}.`,
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
    case 'lead_follow_up_due': {
      // One reminder per person per day (lead-followups job): one lead, several
      // at one branch, or several across branches.
      const leads = Number(data.count ?? '1')
      if (leads > 1 && data.branchBreakdown) {
        return {
          title: 'Lead Follow-ups Due',
          body: `${leads} leads need a follow-up: ${data.branchBreakdown}. Reach out to keep them warm.`,
        }
      }
      if (leads > 1) {
        return {
          title: 'Lead Follow-ups Due',
          body: `${leads} leads${at} need a follow-up. Reach out to keep them warm.`,
        }
      }
      // `staffName` carried the lead's name before `leadName` existed.
      const leadName = data.leadName ?? data.staffName ?? 'a lead'
      return {
        title: 'Lead Follow-up Due',
        body: `A follow-up with ${leadName}${at} is due. Reach out to keep the lead warm.`,
      }
    }
    case 'stale_pending_booking':
      return {
        title: 'Pending Booking Needs Attention',
        body: `A booking${at} for ${date} has been pending too long. Please review and confirm.`,
      }
    case 'no_show_check':
      return {
        title: 'No-show Check',
        body: `Please confirm whether the ${date} appointment${at} was a no-show.`,
      }
    case 'branch_manager_missing': {
      const branches = Number(data.count ?? '1')
      if (branches > 1 && data.branchList) {
        return {
          title: `${branches} branches have no Manager`,
          body: `${data.branchList} have no Manager. Assign one in Users & Roles; until then you cover their administration.`,
        }
      }
      const branchName = data.branchName ?? 'A branch'
      return {
        title: `${branchName} has no Manager`,
        body: 'Assign a Manager in Users & Roles. Until then you cover the branch’s administration.',
      }
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
