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
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3'
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

// Public URL for a stored object, built from the configured base URL.
export function buildPdfUrl(key: string): string {
  if (!env.R2_PUBLIC_BASE_URL) throw new Error('Public invoice base URL is unavailable')
  return `${env.R2_PUBLIC_BASE_URL}/${key}`
}

function isObjectNotFound(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
  const name = (error as { name?: string })?.name
  return status === 404 || name === 'NotFound' || name === 'NoSuchKey'
}

// Returns true when an object already exists at `key` (idempotency check).
// A 404/NotFound is a normal "does not exist" — any other error is rethrown.
export async function objectExists(key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }))
    return true
  } catch (error) {
    if (isObjectNotFound(error)) {
      return false
    }
    throw error
  }
}

// R2 checks the condition when committing the write, including concurrent PUTs.
export async function putPdfIfAbsent(key: string, bytes: Uint8Array): Promise<boolean> {
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: bytes,
        ContentType: 'application/pdf',
        IfNoneMatch: '*',
      }),
    )
    return true
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412) return false
    throw error
  }
}

// Read a stored PDF back as a Uint8Array.
export async function getPdfBytes(key: string): Promise<Uint8Array> {
  const response = await client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }))
  if (!response.Body) {
    throw new Error(`R2 object has no body: ${key}`)
  }
  return response.Body.transformToByteArray()
}

export async function findPdfBytes(key: string): Promise<Uint8Array | null> {
  try {
    return await getPdfBytes(key)
  } catch (error) {
    if (isObjectNotFound(error)) return null
    throw error
  }
}
