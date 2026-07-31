/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 28-06-2026 & Updated - 28-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : request-signing
 * Scope        : Business Logic — Security
 *
 * Description  : HMAC-SHA256 request signing + verification shared by the
 *                caller (apps/web, apps/admin) and the standalone invoicing PDF
 *                service. The caller signs the request body with a shared
 *                secret; the service verifies the signature and a fresh
 *                timestamp before rendering anything.
 *
 * Responsibilities :
 * - Produce a deterministic HMAC-SHA256 signature over `${timestamp}.${body}`
 * - Verify a signature in constant time and reject stale timestamps (replay)
 *
 * Features / Functionality :
 * - signRequest({ secret, body, timestamp }) → hex signature
 * - verifyRequest({ secret, body, timestamp, signature, toleranceMs }) → bool
 *
 * Tech Stack   : TypeScript, Web Crypto (crypto.subtle)
 * Layer        : Business Logic (pure crypto utility — no I/O, no framework)
 *
 * Dependencies : None (Web Crypto is a global on both Workers and Node 20+)
 *
 * Notes        :
 * - Uses the Web Crypto API (`crypto.subtle`) rather than node:crypto, so it
 *   runs identically on Node.js, Bun and any edge runtime. Keep it that way:
 *   this is a portability seam, not an accident.
 * - The timestamp is bound into the signed payload AND checked for freshness,
 *   so a captured request cannot be replayed outside the tolerance window.
 ************************************************************/

const encoder = new TextEncoder()

// Default replay-protection window: a signed request older than this (clock
// skew aside) is rejected. 5 minutes is the usual service-to-service tolerance.
export const DEFAULT_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000

// Lowercase hex encoding of raw bytes.
function toHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let out = ''
  for (const byte of view) {
    out += byte.toString(16).padStart(2, '0')
  }
  return out
}

// Import the shared secret as an HMAC-SHA256 signing key.
async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

// Constant-time string comparison. Both inputs are hex of equal length when the
// signature is well-formed; a length mismatch returns false immediately (the
// length itself is not secret), otherwise every char is compared so the timing
// does not leak how many leading characters matched.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

// The exact byte string that gets signed. Binding the timestamp into the signed
// payload means it cannot be altered without invalidating the signature.
function signingString(timestamp: number, body: string): string {
  return `${timestamp}.${body}`
}

// Produce the hex HMAC-SHA256 signature of `${timestamp}.${body}`.
export async function signRequest(input: {
  secret: string
  body: string
  timestamp: number
}): Promise<string> {
  const key = await importKey(input.secret)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signingString(input.timestamp, input.body)),
  )
  return toHex(signature)
}

// Verify a request signature AND its freshness. Returns true only when:
//   1. the timestamp is within `toleranceMs` of now (replay protection), and
//   2. the recomputed HMAC matches `signature` (constant-time compare).
// Never throws — a malformed input simply returns false (fail closed).
export async function verifyRequest(input: {
  secret: string
  body: string
  timestamp: number
  signature: string
  toleranceMs?: number
  now?: number
}): Promise<boolean> {
  const tolerance = input.toleranceMs ?? DEFAULT_SIGNATURE_TOLERANCE_MS
  const now = input.now ?? Date.now()

  if (!Number.isFinite(input.timestamp)) {
    return false
  }
  // Reject stale (or absurdly future) timestamps before doing any crypto.
  if (Math.abs(now - input.timestamp) > tolerance) {
    return false
  }

  try {
    const expected = await signRequest({
      secret: input.secret,
      body: input.body,
      timestamp: input.timestamp,
    })
    return timingSafeEqual(expected, input.signature)
  } catch {
    return false
  }
}
