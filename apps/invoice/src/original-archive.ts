import { hasCompleteInvoicePdf } from '@rgss/business'
import {
  INVOICE_ORIGINAL_ARCHIVE_MAX_BYTES,
  INVOICE_ORIGINAL_PDF_MAX_BYTES,
  invoiceOriginalArchiveSchema,
} from '@rgss/types'
import { invoiceId, snapshotHash } from './contracts'
import type { InvoiceEnv } from './env'
import { signedBody } from './signed-body'

interface ArchiveObject {
  branch_id: string
  sha256: string
  bytes: number
}

function objectKey(id: string, sha256: string) {
  return `original-archive/${id}/${sha256}.pdf`
}

function pdfBytes(base64: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bytes = Uint8Array.fromBase64(base64, { lastChunkHandling: 'strict' })
    return bytes.length <= INVOICE_ORIGINAL_PDF_MAX_BYTES && hasCompleteInvoicePdf(bytes)
      ? bytes
      : null
  } catch {
    return null
  }
}

async function verifiedPdf(files: R2Bucket, id: string, sha256: string, size: number) {
  const object = await files.get(objectKey(id, sha256))
  if (!object || object.size !== size || size > INVOICE_ORIGINAL_PDF_MAX_BYTES) return null
  const bytes = await object.arrayBuffer()
  return hasCompleteInvoicePdf(new Uint8Array(bytes)) && (await snapshotHash(bytes)) === sha256
    ? bytes
    : null
}

export async function archiveOriginal(request: Request, env: InvoiceEnv): Promise<Response> {
  const body = await signedBody(
    request,
    env.BILLING_EVENT_SECRET,
    INVOICE_ORIGINAL_ARCHIVE_MAX_BYTES,
  )
  if (typeof body !== 'string') return body

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response(null, { status: 400 })
  }
  const parsed = invoiceOriginalArchiveSchema.safeParse(payload)
  if (!parsed.success || parsed.data.source !== env.BILLING_SOURCE)
    return new Response(null, { status: 400 })

  const {
    invoiceId: id,
    branchId,
    bookingId,
    bookingNumber,
    invoiceNumber,
    recordedAt,
    dateBasis,
    totalPaise,
    pdfBase64,
  } = parsed.data
  const pdf = pdfBytes(pdfBase64)
  if (!pdf) return new Response(null, { status: 422 })
  const sha256 = await snapshotHash(pdf)
  const existing = env.DB.prepare(`
    SELECT id = ?1 AND branch_id = ?2 AND booking_id IS ?3 AND booking_number IS ?4
      AND invoice_number = ?5 AND recorded_at = ?6 AND date_basis = ?7
      AND total_paise = ?8 AND sha256 = ?9 AND bytes = ?10 AS identical
    FROM original_invoice_archive WHERE id = ?1 OR invoice_number = ?5 LIMIT 2
  `).bind(
    id,
    branchId,
    bookingId,
    bookingNumber,
    invoiceNumber,
    recordedAt,
    dateBasis,
    totalPaise,
    sha256,
    pdf.byteLength,
  )
  const { results: before } = await existing.all<{ identical: number }>()
  if (before.length && (before.length !== 1 || before[0]?.identical !== 1)) {
    return new Response(null, { status: 409 })
  }
  const branch = await env.DB.prepare(`
    SELECT 1 FROM invoice_access_branch WHERE branch_id = ?1 AND (
      ?2 = 1 OR NOT EXISTS (SELECT 1 FROM issued_invoice WHERE id = ?3 OR invoice_number = ?4)
    )
  `)
    .bind(branchId, before.length, id, invoiceNumber)
    .first()
  if (!branch) return new Response(null, { status: 409 })

  const object = await env.FILES.put(objectKey(id, sha256), pdf, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/pdf' },
  })
  if (!object && !(await verifiedPdf(env.FILES, id, sha256, pdf.byteLength))) {
    return new Response(null, { status: 409 })
  }

  const write = await env.DB.prepare(`
    INSERT INTO original_invoice_archive
      (id, branch_id, booking_id, booking_number, invoice_number, recorded_at, date_basis,
       total_paise, sha256, bytes, archived_at)
    SELECT ?1, branch_id, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
    FROM invoice_access_branch WHERE branch_id = ?11
      AND NOT EXISTS (SELECT 1 FROM issued_invoice WHERE id = ?1 OR invoice_number = ?4)
    ON CONFLICT DO NOTHING
  `)
    .bind(
      id,
      bookingId,
      bookingNumber,
      invoiceNumber,
      recordedAt,
      dateBasis,
      totalPaise,
      sha256,
      pdf.byteLength,
      Date.now(),
      branchId,
    )
    .run()
  if (write.meta.changes === 1) return new Response(null, { status: 201 })

  const { results: after } = await existing.all<{ identical: number }>()
  return new Response(null, { status: after.length === 1 && after[0]?.identical === 1 ? 204 : 409 })
}

export async function downloadArchivedOriginal(
  env: InvoiceEnv,
  email: string,
  id: string,
): Promise<Response> {
  if (!invoiceId.safeParse(id).success) return new Response(null, { status: 404 })
  const allowed = env.DB.prepare(`
    SELECT a.branch_id, a.sha256, a.bytes FROM original_invoice_archive a
    JOIN invoice_effective_grant g ON g.branch_id = a.branch_id AND g.email = ?
    WHERE a.id = ?
  `).bind(email, id)
  const row = await allowed.first<ArchiveObject>()
  if (!row) return new Response(null, { status: 404 })

  const bytes = await verifiedPdf(env.FILES, id, row.sha256, row.bytes)
  const current = await allowed.first<ArchiveObject>()
  if (
    !current ||
    current.branch_id !== row.branch_id ||
    current.sha256 !== row.sha256 ||
    current.bytes !== row.bytes
  ) {
    return new Response(null, { status: 404 })
  }
  if (!bytes) return new Response(null, { status: 503 })

  return new Response(bytes, {
    headers: {
      'cache-control': 'private, no-store',
      'content-disposition': `attachment; filename="original-invoice-${id}.pdf"`,
      'content-type': 'application/pdf',
      'x-content-type-options': 'nosniff',
    },
  })
}
