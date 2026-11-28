import type { InvoiceRegister } from './invoice-register'
import type { InvoicePdf } from './pdf'
import type { InvoiceAccessSync } from './policy-sync'

export interface InvoiceEnv {
  DB: D1Database
  FILES: R2Bucket
  PDF: DurableObjectNamespace<InvoicePdf>
  REGISTER: DurableObjectNamespace<InvoiceRegister>
  BILLING_SOURCE: string
  BILLING_EVENT_SECRET?: string
  INVOICE_ROSTER_SECRET?: string
  ACCESS_TEAM?: string
  ACCESS_AUDIENCE?: string
  ACCESS_DEVELOPER_EMAIL?: string
  ACCESS_SYNC: DurableObjectNamespace<InvoiceAccessSync>
  ACCESS_POLICY_SYNC_ENABLED?: string
  ACCESS_ACCOUNT_ID?: string
  ACCESS_POLICY_ID?: string
  ACCESS_GOOGLE_IDP_ID?: string
  ACCESS_POLICY_TOKEN?: string
  INVOICE_EMAIL_ENABLED?: string
  INVOICE_LEGACY_RESEND_ENABLED?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  RESEND_WEBHOOK_SECRET?: string
}

export type PortalEnv = { Bindings: InvoiceEnv; Variables: { email: string; isOwner: boolean } }
