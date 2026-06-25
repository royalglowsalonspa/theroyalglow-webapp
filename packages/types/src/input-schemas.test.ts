/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : input-schemas (types tests)
 * Scope        : Shared Types & Validation — unit tests
 *
 * Description  : Example-based unit tests for the customer/admin input
 *                Zod schemas, exercising validation edge cases.
 *
 * Covers (Backend API · Task 2.3, Requirement 5.3):
 * - createBookingSchema: empty serviceIds rejected, mixed shapes
 * - cancelBookingSchema / rescheduleBookingSchema payload shapes
 * - adminBookingActionSchema discriminated union (approve/reject/assign)
 * - createLeadSchema Indian phone accept/reject
 *
 * Tech Stack   : TypeScript, Zod, Vitest
 * Layer        : Shared Package
 ************************************************************/
import { describe, expect, it } from 'vitest'
import { adminBookingActionSchema, completeBookingSchema } from './admin-booking'
import { cancelBookingSchema, createBookingSchema, rescheduleBookingSchema } from './booking'
import { createLeadSchema } from './lead'

describe('createBookingSchema', () => {
  const base = {
    branchId: 'br_1',
    serviceType: 'salon' as const,
    bookingDate: '2026-06-10',
    startTime: '10:30',
    serviceIds: ['svc_1'],
  }

  it('accepts a valid minimal booking', () => {
    expect(createBookingSchema.safeParse(base).success).toBe(true)
  })

  it('rejects an empty serviceIds array (Requirement 5.3)', () => {
    const result = createBookingSchema.safeParse({ ...base, serviceIds: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.serviceIds).toBeDefined()
    }
  })

  it('rejects serviceIds containing empty strings', () => {
    expect(createBookingSchema.safeParse({ ...base, serviceIds: [''] }).success).toBe(false)
  })

  it('rejects an invalid serviceType', () => {
    expect(createBookingSchema.safeParse({ ...base, serviceType: 'massage' }).success).toBe(false)
  })

  it('rejects a malformed bookingDate', () => {
    expect(createBookingSchema.safeParse({ ...base, bookingDate: '10/06/2026' }).success).toBe(
      false,
    )
  })

  it('rejects a malformed startTime', () => {
    expect(createBookingSchema.safeParse({ ...base, startTime: '9:5' }).success).toBe(false)
  })

  it('accepts the optional walk-in flag and notes', () => {
    const result = createBookingSchema.safeParse({ ...base, isWalkin: true, notes: 'VIP' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isWalkin).toBe(true)
    }
  })
})

describe('cancelBookingSchema', () => {
  it('accepts an empty payload (reason is optional)', () => {
    expect(cancelBookingSchema.safeParse({}).success).toBe(true)
  })

  it('accepts a cancellation reason', () => {
    expect(cancelBookingSchema.safeParse({ reason: 'Plans changed' }).success).toBe(true)
  })

  it('rejects a reason over 500 characters', () => {
    expect(cancelBookingSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false)
  })
})

describe('rescheduleBookingSchema', () => {
  it('accepts a valid new date and start time', () => {
    expect(
      rescheduleBookingSchema.safeParse({ bookingDate: '2026-06-12', startTime: '14:00' }).success,
    ).toBe(true)
  })

  it('rejects a missing startTime', () => {
    expect(rescheduleBookingSchema.safeParse({ bookingDate: '2026-06-12' }).success).toBe(false)
  })

  it('rejects a malformed date', () => {
    expect(
      rescheduleBookingSchema.safeParse({ bookingDate: '2026-6-1', startTime: '14:00' }).success,
    ).toBe(false)
  })
})

describe('adminBookingActionSchema (discriminated union)', () => {
  it('accepts an approve action with staffId', () => {
    const result = adminBookingActionSchema.safeParse({ action: 'approve', staffId: 'stf_1' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.action).toBe('approve')
    }
  })

  it('rejects an approve action missing staffId', () => {
    expect(adminBookingActionSchema.safeParse({ action: 'approve' }).success).toBe(false)
  })

  it('accepts a reject action with a rejectionReason', () => {
    expect(
      adminBookingActionSchema.safeParse({ action: 'reject', rejectionReason: 'Fully booked' })
        .success,
    ).toBe(true)
  })

  it('rejects a reject action with an empty rejectionReason', () => {
    expect(
      adminBookingActionSchema.safeParse({ action: 'reject', rejectionReason: '' }).success,
    ).toBe(false)
  })

  it('accepts an assign action with staffId', () => {
    expect(adminBookingActionSchema.safeParse({ action: 'assign', staffId: 'stf_2' }).success).toBe(
      true,
    )
  })

  it('rejects an unknown action discriminant', () => {
    expect(adminBookingActionSchema.safeParse({ action: 'cancel', staffId: 'stf_1' }).success).toBe(
      false,
    )
  })

  it('rejects a reject payload submitted under the approve discriminant', () => {
    // approve requires staffId, not rejectionReason — wrong shape for the tag
    expect(
      adminBookingActionSchema.safeParse({ action: 'approve', rejectionReason: 'x' }).success,
    ).toBe(false)
  })
})

describe('completeBookingSchema', () => {
  it('accepts a supported payment method', () => {
    expect(completeBookingSchema.safeParse({ paymentMethod: 'upi' }).success).toBe(true)
  })

  it('rejects an unsupported payment method', () => {
    expect(completeBookingSchema.safeParse({ paymentMethod: 'online' }).success).toBe(false)
  })
})

describe('createLeadSchema — Indian phone validation', () => {
  const base = { name: 'Asha', phone: '9876543210' }

  it.each([
    ['plain 10-digit', '9876543210'],
    ['+91 prefix', '+919876543210'],
    ['91 prefix', '919876543210'],
    ['0 prefix', '09876543210'],
    ['leading/trailing spaces trimmed', '  9876543210  '],
  ])('accepts a valid number (%s)', (_label, phone) => {
    expect(createLeadSchema.safeParse({ ...base, phone }).success).toBe(true)
  })

  it.each([
    ['too short', '98765'],
    ['starts below 6', '5876543210'],
    ['contains letters', '98765abcde'],
    ['too long', '98765432109'],
    ['empty', ''],
  ])('rejects an invalid number (%s)', (_label, phone) => {
    expect(createLeadSchema.safeParse({ ...base, phone }).success).toBe(false)
  })

  it('requires a name', () => {
    expect(createLeadSchema.safeParse({ phone: '9876543210' }).success).toBe(false)
  })

  it('stores optional UTM attribution fields', () => {
    const result = createLeadSchema.safeParse({
      ...base,
      utmSource: 'gmb',
      utmMedium: 'cpc',
      utmCampaign: 'summer',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.utmSource).toBe('gmb')
    }
  })
})
