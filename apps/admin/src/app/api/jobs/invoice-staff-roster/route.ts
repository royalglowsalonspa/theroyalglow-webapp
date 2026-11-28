import { signRequest } from '@rgss/business'
import { readInvoiceStaffRoster } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import {
  INVOICE_STAFF_ROSTER_MAX_BYTES,
  type InvoiceStaffRoster,
  invoiceStaffRosterEmail,
  invoiceStaffRosterSchema,
} from '@rgss/types'
import { z } from 'zod'
import { verifyQStashSignature } from '@/lib/jobs/verify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:invoice-staff-roster',
  environment: process.env.NODE_ENV ?? 'development',
})
const credentials = z.object({
  source: z.string().trim().min(1).max(32),
  secret: z.string().min(32),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
})

export async function POST(req: Request): Promise<Response> {
  const jobBody = await req.text()
  if (!(await verifyQStashSignature(req, jobBody))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const target = process.env.INVOICE_ROSTER_URL?.trim()
  if (!target) return Response.json({ success: true, skipped: true })
  const endpoint = URL.parse(target)
  const parsed = credentials.safeParse({
    source: process.env.INVOICE_ROSTER_SOURCE,
    secret: process.env.INVOICE_ROSTER_SECRET,
    clientId: process.env.INVOICE_ROSTER_ACCESS_CLIENT_ID,
    clientSecret: process.env.INVOICE_ROSTER_ACCESS_CLIENT_SECRET,
  })
  if (
    !parsed.success ||
    endpoint?.protocol !== 'https:' ||
    endpoint.pathname !== '/internal/v1/staff-roster' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    logger.warn('Invoice roster publisher configuration is incomplete or invalid')
    return new Response('Invoice roster publisher unavailable', { status: 503 })
  }

  const { source, secret, clientId, clientSecret } = parsed.data
  try {
    const { revision, rows } = await readInvoiceStaffRoster()
    rows.sort((a, b) => (a.branchId < b.branchId ? -1 : Number(a.branchId > b.branchId)))
    const branches: string[] = []
    const assignments: InvoiceStaffRoster['assignments'] = []
    for (const { branchId, ownerEmail, managerEmail } of rows) {
      branches.push(branchId)
      for (const [role, address] of [
        ['manager', managerEmail],
        ['owner', ownerEmail],
      ] as const) {
        const email = invoiceStaffRosterEmail.safeParse(address?.trim().toLowerCase())
        if (email.success) assignments.push({ branchId, email: email.data, role })
      }
    }
    const roster = invoiceStaffRosterSchema.safeParse({
      version: 1,
      type: 'staff.roster',
      source,
      revision,
      branches,
      assignments,
    })
    if (!roster.success) {
      logger.error('Invoice roster data did not match the snapshot contract')
      return new Response('Job failed', { status: 500 })
    }
    const body = JSON.stringify(roster.data)
    if (Buffer.byteLength(body) > INVOICE_STAFF_ROSTER_MAX_BYTES) {
      logger.error('Invoice roster exceeds the signed endpoint body limit')
      return new Response('Job failed', { status: 500 })
    }

    const timestamp = Date.now()
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'content-type': 'application/json',
        'cf-access-client-id': clientId,
        'cf-access-client-secret': clientSecret,
        'x-rgss-timestamp': String(timestamp),
        'x-rgss-signature': await signRequest({ secret, timestamp, body }),
      },
      body,
    })
    await response.body?.cancel()
    if (response.status !== 201 && response.status !== 204) {
      logger.warn('Invoice roster publisher received an unexpected response', {
        status: response.status,
      })
      return new Response('Invoice roster delivery failed', { status: 502 })
    }
    return Response.json({
      success: true,
      branches: branches.length,
      assignments: assignments.length,
    })
  } catch {
    // Provider errors can contain request details. Keep identities and secrets out of job logs.
    logger.error('Invoice roster publisher failed')
    return new Response('Job failed', { status: 500 })
  }
}
