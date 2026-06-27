/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : contact (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schema for the customer contact-form enquiry submitted
 *                from the public /contact page and posted to POST /api/contact.
 *
 * Responsibilities :
 * - Validate the public, unauthenticated contact enquiry payload
 * - Enforce sensible name/message length bounds (anti-abuse, DB-friendly)
 * - Require a valid email so the salon can reply to the sender
 * - Accept an optional Indian mobile number (enquiries may be phone-only opt-out)
 *
 * Features / Functionality :
 * - contactFormSchema — name, email, optional phone, message
 * - Indian phone validation (+91 / 91 / 0 prefix, 10 digits, leading 6-9)
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        :
 * - Mirrors the lead schema's Indian phone rule. Phone is OPTIONAL here
 *   (unlike createLeadSchema) because a contact enquiry only needs a reply
 *   address (email); a number is a nice-to-have for a faster call-back.
 * - This is consumed by an unauthenticated endpoint, so it is the trust
 *   boundary: never accept client input past this point unvalidated.
 ************************************************************/
import { z } from 'zod'

// Optional Indian mobile. Reuses the same accept-rule as createLeadSchema
// (leading 6-9, optional +91/91/0 prefix). Kept optional via the surrounding
// `.optional()` so an empty/absent value is allowed; when present it must be a
// valid number. The business layer normalises a valid value to +91XXXXXXXXXX.
const indianPhone = z
  .string()
  .trim()
  .regex(/^(?:\+?91|0)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')

export const contactFormSchema = z.object({
  // Full name — required, bounded to keep email subjects/records sane.
  name: z.string().trim().min(1, 'Name is required').max(120),
  // Reply-to address — required so an enquiry is actionable by the salon.
  email: z.string().trim().email('Enter a valid email address').max(254),
  // Optional call-back number. `.optional()` permits omission; the regex only
  // runs when a value is supplied.
  phone: indianPhone.optional(),
  // The enquiry body — required, bounded to deter spam / oversized payloads.
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(2000),
})
export type ContactFormInput = z.infer<typeof contactFormSchema>
