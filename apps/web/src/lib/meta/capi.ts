/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : meta/capi
 * Scope        : Server-side Meta Conversions API client
 *
 * Description  : Minimal best-effort server-side client for Meta's Conversions
 *                API (CAPI). POSTs a 'Lead' event to the Graph API events
 *                endpoint, hashing PII (email / phone / name) with SHA-256 per
 *                Meta's spec via Web Crypto in the AWS Lambda runtime.
 *
 * Responsibilities :
 * - Hash PII with Web Crypto SHA-256 and normalise per Meta's matching rules
 *   (lowercase/trim email & name, digits-only phone)
 * - POST a single 'Lead' event with a caller-supplied event_id for browser-
 *   Pixel deduplication
 * - Degrade to a no-op when the access token / pixel id are absent, and NEVER
 *   throw — so it can never block or break the lead-creation response
 *
 * Features / Functionality :
 * - sendLeadCapiEvent(input) — fire a server-side 'Lead' event (best-effort)
 *
 * Tech Stack   : TypeScript, Web Crypto (crypto.subtle), fetch
 * Layer        : API Infrastructure (server-side integration)
 *
 * Dependencies : @rgss/logger
 *
 * Notes        :
 * - Reads META_PIXEL_ACCESS_TOKEN / NEXT_PUBLIC_META_PIXEL_ID straight from
 *   process.env for graceful degradation (no-op when unset) — never echoes the
 *   token. The token is sent in the POST body (NOT the URL) so it is not
 *   captured in request-URL logs.
 * - A short request timeout (AbortSignal.timeout) caps the added latency so a
 *   slow Graph API can never hang the lead response.
 ************************************************************/

import { createLogger } from '@rgss/logger'

const logger = createLogger({
  service: 'web:meta:capi',
  environment: process.env.NODE_ENV ?? 'development',
})

// Graph API version for the CAPI events endpoint.
const GRAPH_API_VERSION = 'v21.0'

// Cap how long we wait on Meta so the lead response is never blocked.
const REQUEST_TIMEOUT_MS = 2500

/** Input for a server-side 'Lead' Conversions API event. */
export type LeadCapiEventInput = {
  /** Dedup key shared with the browser Pixel — use the lead id. */
  eventId: string
  /** Full name; split into first/last and hashed (optional). */
  name?: string | null | undefined
  /** Email; lowercased + trimmed before hashing (optional). */
  email?: string | null | undefined
  /** Phone in any form; reduced to digits (incl. country code) before hashing. */
  phone?: string | null | undefined
  /** Caller IP — sent in the clear (Meta does NOT hash it). */
  clientIpAddress?: string | null | undefined
  /** Caller User-Agent — sent in the clear (Meta does NOT hash it). */
  clientUserAgent?: string | null | undefined
  /** URL where the event happened (the /book landing page), optional. */
  eventSourceUrl?: string | null | undefined
}

/** Lowercase hex SHA-256 of `value` using Web Crypto. */
async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// Meta normalisation rules: email/name → trimmed + lowercased; phone → digits
// only (keep the country code, drop the leading '+' and any separators).
const normaliseEmail = (value: string): string => value.trim().toLowerCase()
const normaliseName = (value: string): string => value.trim().toLowerCase()
const normalisePhone = (value: string): string => value.replace(/\D/g, '')

/**
 * Build the SHA-256-hashed `user_data` object from the available PII. Each
 * advanced-matching field is an array of hashed values per Meta's spec; the IP
 * and User-Agent are attached unhashed.
 */
async function buildUserData(
  input: LeadCapiEventInput,
): Promise<Record<string, string[] | string>> {
  const userData: Record<string, string[] | string> = {}

  if (input.email) {
    userData.em = [await sha256Hex(normaliseEmail(input.email))]
  }

  if (input.phone) {
    const digits = normalisePhone(input.phone)
    if (digits) {
      userData.ph = [await sha256Hex(digits)]
    }
  }

  if (input.name) {
    const [first, ...rest] = input.name.trim().split(/\s+/)
    if (first) {
      userData.fn = [await sha256Hex(normaliseName(first))]
    }
    if (rest.length > 0) {
      userData.ln = [await sha256Hex(normaliseName(rest.join(' ')))]
    }
  }

  if (input.clientIpAddress && input.clientIpAddress !== 'unknown') {
    userData.client_ip_address = input.clientIpAddress
  }

  if (input.clientUserAgent) {
    userData.client_user_agent = input.clientUserAgent
  }

  return userData
}

/**
 * Fire a server-side Meta CAPI 'Lead' event (best-effort).
 *
 * No-ops when META_PIXEL_ACCESS_TOKEN or NEXT_PUBLIC_META_PIXEL_ID is absent,
 * and NEVER throws — any failure (network, timeout, non-2xx, hashing) is logged
 * and swallowed so it can never block or break the caller's response. Pass the
 * lead id as `eventId` so this server event deduplicates against the browser
 * Pixel's matching event.
 */
export async function sendLeadCapiEvent(input: LeadCapiEventInput): Promise<void> {
  try {
    const accessToken = process.env.META_PIXEL_ACCESS_TOKEN
    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID

    // Not configured → no-op (best-effort integration).
    if (!accessToken || !pixelId) {
      return
    }

    const body = {
      data: [
        {
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          event_id: input.eventId,
          action_source: 'website',
          ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
          user_data: await buildUserData(input),
        },
      ],
      // Token in the body (NOT the URL) so it is never captured in URL logs.
      access_token: accessToken,
    }

    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) {
      // Best-effort: log and move on. Do not surface Meta's error to the caller.
      logger.warn('Meta CAPI Lead event returned non-2xx', { status: res.status })
    }
  } catch (error) {
    logger.error('Meta CAPI Lead event failed (best-effort, swallowed)', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
