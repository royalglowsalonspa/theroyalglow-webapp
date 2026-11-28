import { z } from 'zod'
import { invoicePaymentCheck, invoicePaymentMatches, invoicePdfFieldsSchema } from './invoice-pdf'

export const INVOICE_ISSUE_EVENT_PATH = '/internal/v1/invoice-events'
export const INVOICE_ISSUE_EVENT_MAX_BYTES = 64 * 1024
export const INVOICE_RECOVERY_PATH = `${INVOICE_ISSUE_EVENT_PATH}/recover`
export const INVOICE_RECOVERY_MAX_BYTES = INVOICE_ISSUE_EVENT_MAX_BYTES * 2 + 256
export const INVOICE_ORIGINAL_ARCHIVE_PATH = `${INVOICE_ISSUE_EVENT_PATH}/archive-original`
export const INVOICE_ORIGINAL_PDF_MAX_BYTES = 1024 * 1024
const archiveBase64Max = 4 * Math.ceil(INVOICE_ORIGINAL_PDF_MAX_BYTES / 3)
export const INVOICE_ORIGINAL_ARCHIVE_MAX_BYTES = archiveBase64Max + 2048
export const invoiceEventIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)
const lookupValue = z.string().trim().min(1).max(100)
const displayText = z.string().min(1).max(200)
const paise = z.int().nonnegative()

export const invoiceOriginalArchiveSchema = z.strictObject({
  version: z.literal(1),
  type: z.literal('invoice.original-archive'),
  source: z.string().min(1).max(32),
  invoiceId: invoiceEventIdSchema,
  branchId: invoiceEventIdSchema,
  bookingId: invoiceEventIdSchema.nullable(),
  bookingNumber: lookupValue.nullable(),
  invoiceNumber: lookupValue,
  recordedAt: z.iso.datetime(),
  dateBasis: z.enum(['tax_point', 'created_at']),
  totalPaise: paise,
  pdfBase64: z.base64().min(8).max(archiveBase64Max),
})

export const invoiceIssueSnapshotSchema = z.object({
  version: z.literal(1),
  invoiceId: invoiceEventIdSchema,
  branchId: invoiceEventIdSchema,
  bookingId: invoiceEventIdSchema.nullable(),
  invoice: invoicePdfFieldsSchema
    .extend({
      templateVersion: z.literal(['takumi-v1', 'takumi-v2']),
      invoiceNumber: lookupValue,
      bookingNumber: lookupValue.nullish(),
      financialYear: z
        .string()
        .regex(/^\d{4}$/)
        .optional(),
      sequenceNumber: z.int().positive().optional(),
      paymentStatus: z.literal('paid').optional(),
      seller: invoicePdfFieldsSchema.shape.seller.extend({
        name: displayText,
        legalName: displayText.nullish(),
        addressLines: z.array(displayText).min(1).max(5),
        gstin: z
          .string()
          .min(1)
          .max(32)
          .nullish()
          .transform((value) => value ?? undefined),
        phone: z
          .string()
          .min(1)
          .nullish()
          .transform((value) => value ?? undefined),
        email: z
          .email()
          .nullish()
          .transform((value) => value ?? undefined),
        state: displayText.optional(),
      }),
      customer: invoicePdfFieldsSchema.shape.customer.extend({ name: displayText }),
      items: z
        .array(
          invoicePdfFieldsSchema.shape.items.element.extend({
            name: displayText,
            serviceId: invoiceEventIdSchema.nullish(),
            taxVersionId: invoiceEventIdSchema.optional(),
            cgstPaise: paise.optional(),
            sgstPaise: paise.optional(),
          }),
        )
        .min(1)
        .max(60),
      offer: z
        .object({
          id: invoiceEventIdSchema,
          name: displayText,
          type: z.string().min(1),
          value: z.int().positive(),
        })
        .nullish(),
    })
    .refine(invoicePaymentMatches, invoicePaymentCheck),
})

export const invoiceIssueEventSchema = invoiceIssueSnapshotSchema
  .extend({
    type: z.literal('invoice.issued'),
    source: z.string().min(1).max(32),
    eventId: invoiceEventIdSchema,
    delivery: z
      .strictObject({
        mode: z.literal('automatic'),
        completed: z.literal(true),
        paid: z.literal(true),
      })
      .optional(),
  })
  .strict()

// The signed recovery envelope cannot be replayed as a live issuance event.
export const invoiceRecoveryEventSchema = z.strictObject({
  version: z.literal(1),
  type: z.literal('invoice.recovery'),
  eventBody: z.string().min(1).max(INVOICE_ISSUE_EVENT_MAX_BYTES),
})
