/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : enums
 * Scope        : Database Schema — Enums
 *
 * Description  : Defines all PostgreSQL native enums used across the database
 *                schema for type-safe status fields and categorizations.
 *
 * Responsibilities :
 * - Define booking lifecycle status enum
 * - Define lead pipeline status enum
 * - Define payment, notification, loyalty, and staff enums
 * - Define service type, discount type, and membership status enums
 *
 * Features / Functionality :
 * - PostgreSQL native CREATE TYPE enums via Drizzle pgEnum
 * - Type-safe enum values for all domain status fields
 * - Centralized enum definitions shared across all schema files
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm/pg-core
 *
 * Notes        : All enums are exported and imported by other schema files
 *                that reference these status/type columns.
 ************************************************************/

import { pgEnum } from 'drizzle-orm/pg-core'

export const bookingStatusEnum = pgEnum('booking_status', [
  'pending',
  'confirmed',
  'rejected',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
])

export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'follow_up',
  'booked',
  'won',
  'lost',
])

export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'paid', 'refunded'])

export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'upi', 'card', 'online'])

export const waitlistStatusEnum = pgEnum('waitlist_status', [
  'waiting',
  'notified',
  'booked',
  'expired',
  'cancelled',
])

export const notificationTypeEnum = pgEnum('notification_type', [
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
])

export const notificationChannelEnum = pgEnum('notification_channel', ['push', 'email'])

export const notificationStatusEnum = pgEnum('notification_status', ['pending', 'sent', 'failed'])

export const loyaltyTxTypeEnum = pgEnum('loyalty_tx_type', [
  'earned',
  'redeemed',
  'expired',
  'adjusted',
])

export const staffDesignationEnum = pgEnum('staff_designation', [
  'receptionist',
  'stylist',
  'therapist',
  'manager',
])

export const genderEnum = pgEnum('gender', ['male', 'female', 'other', 'prefer_not_to_say'])

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'status_change',
])

export const serviceTypeEnum = pgEnum('service_type', ['salon', 'spa'])

export const discountTypeEnum = pgEnum('discount_type', ['percentage', 'flat', 'combo_price'])

export const spaMembershipStatusEnum = pgEnum('spa_membership_status', [
  'active',
  'expired',
  'cancelled',
])

export const invoiceTypeEnum = pgEnum('invoice_type', [
  'service',
  'membership_purchase',
  'membership_session',
])

export const leaveApprovalStatusEnum = pgEnum('leave_approval_status', [
  'pending',
  'approved',
  'rejected',
])

export const leaveTypeEnum = pgEnum('leave_type', ['sick', 'casual', 'personal', 'other'])

export const branchStatusEnum = pgEnum('branch_status', [
  'operational',
  'temporarily_closed',
  'opens_soon',
  'shutdown',
])
