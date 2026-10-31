/************************************************************
 * Author       : KATABATHUNI BOSE
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/storage/r2
 * Scope        : Storage (Cloudflare R2, S3-compatible)
 *
 * Description  : Thin S3 client wrapper over Cloudflare R2 for the invoicing
 *                service. Handles existence checks (idempotency), uploads of
 *                rendered PDFs, and reads of previously stored PDFs.
 *
 * Object key scheme : invoices/{YYYY}/{invoiceFileStem(invoiceNumber)}.pdf
 *                     where YYYY is the issuedAt year (UTC) and "/" in a
 *                     per-branch number becomes "-".
 *
 * Notes        :
 * - region 'auto' + forcePathStyle true are the R2 requirements.
 * - getPdfBytes returns a Uint8Array decoded from the streaming body.
 ************************************************************/
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { invoiceFileStem } from '@rgss/business'
import { env } from '../env'

const client = new S3Client({
  region: 'auto',
  endpoint: env.R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

// invoices/{YYYY}/{invoice number as a file name}.pdf — YYYY is the issuedAt
// year (UTC). Per-branch numbers contain slashes (RS/2627/000123), which the
// file name turns into hyphens (RS-2627-000123); older numbers
// (INV-1-2627-92921) have none, so their keys are unchanged.
export function buildObjectKey(invoiceNumber: string, issuedAt: string): string {
  const year = new Date(issuedAt).getUTCFullYear()
  return `invoices/${year}/${invoiceFileStem(invoiceNumber)}.pdf`
}

// Public URL for a stored object, built from the configured base URL.
export function buildPdfUrl(key: string): string {
  return `${env.R2_PUBLIC_BASE_URL}/${key}`
}

// Returns true when an object already exists at `key` (idempotency check).
// A 404/NotFound is a normal "does not exist" — any other error is rethrown.
export async function objectExists(key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }))
    return true
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    const name = (error as { name?: string }).name
    if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') {
      return false
    }
    throw error
  }
}

// Upload PDF bytes at `key` with the correct content type.
export async function putPdf(key: string, bytes: Uint8Array): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: bytes,
      ContentType: 'application/pdf',
    }),
  )
}

// Read a stored PDF back as a Uint8Array.
export async function getPdfBytes(key: string): Promise<Uint8Array> {
  const response = await client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }))
  if (!response.Body) {
    throw new Error(`R2 object has no body: ${key}`)
  }
  return response.Body.transformToByteArray()
}
