/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : upstream (admin)
 * Scope        : API Infrastructure
 *
 * Description  : Server-side helper for the rare case where the admin app must
 *                call a web-only endpoint that has no local equivalent. The call
 *                is performed server-side (never a browser cross-origin request)
 *                and any failure is mapped to a 502 UPSTREAM_ERROR via AppError
 *                WITHOUT leaking upstream response bodies, headers, or status to
 *                the client. Upstream detail is logged server-side only.
 *
 * Responsibilities :
 * - Build the target URL from the web origin (env/const, fail-safe default)
 * - Perform a server-side fetch to the web app endpoint
 * - Fail closed: map non-2xx AND network/throw errors to 502 UPSTREAM_ERROR
 * - Never include upstream internals in the thrown AppError (no leak)
 * - Log upstream detail server-side via @rgss/logger for diagnosis
 *
 * Features / Functionality :
 * - callWebUpstream<T>(path, init?) — typed server-side upstream call
 *
 * Tech Stack   : TypeScript, fetch, @rgss/errors, @rgss/logger
 * Layer        : API
 *
 * Dependencies : @rgss/errors, @rgss/logger
 *
 * Notes        :
 * - Web-only calls are RARE by design (see design §3, "Web-only endpoint
 *   needed by admin"). Most admin needs are served by local same-origin routes.
 * - WEB_ORIGIN reads NEXT_PUBLIC_WEB_ORIGIN with a production-safe default so a
 *   missing var never breaks the build; it is not a required admin env var.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { createLogger } from '@rgss/logger'

const logger = createLogger({
  service: 'admin:api:upstream',
  environment: process.env.NODE_ENV ?? 'development',
})

// Origin of the customer web app (apps/web). Server-side only; falls back to
// the production origin so a missing env var never breaks builds or requests.
const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'https://theroyalglow.in'

/**
 * Call a web-only endpoint from the admin app, server-side.
 *
 * Performs a server-side fetch against the web origin (never a browser
 * cross-origin call) and returns the parsed JSON body typed as `T`. Any
 * failure — a non-2xx response, a network error, or a JSON parse error — is
 * mapped to a `502 UPSTREAM_ERROR` `AppError`. The thrown error never carries
 * the upstream body, headers, or status, so no upstream detail leaks to the
 * client; the detail is logged server-side only.
 *
 * @param path  Path on the web origin, e.g. `/api/something`. A leading slash
 *              is added if missing.
 * @param init  Optional `fetch` init (method, headers, body, etc.).
 * @returns     The parsed JSON response body, typed as `T`.
 * @throws      {AppError} `UPSTREAM_ERROR` (502) on any non-2xx, network, or
 *              parse failure. Fail closed — never resolves on failure.
 */
export async function callWebUpstream<T>(path: string, init?: RequestInit): Promise<T> {
  const normalisedPath = path.startsWith('/') ? path : `/${path}`
  const url = `${WEB_ORIGIN}${normalisedPath}`

  let response: Response
  try {
    response = await fetch(url, init)
  } catch (cause) {
    // Network-level failure (DNS, connection refused, timeout, etc.).
    // Log server-side only; surface a generic 502 with no upstream detail.
    logger.error('Upstream request failed (network error)', {
      path: normalisedPath,
      error: cause instanceof Error ? cause.message : String(cause),
    })
    throw new AppError({
      code: ERROR_CODES.UPSTREAM_ERROR,
      message: 'Upstream request failed',
      statusCode: 502,
      retryable: true,
      ...(cause instanceof Error ? { cause } : {}),
    })
  }

  if (!response.ok) {
    // Non-2xx upstream. Read the body for the server-side log only; it is
    // deliberately NOT included in the thrown AppError (no leak to client).
    const upstreamDetail = await response.text().catch(() => '<unreadable body>')
    logger.error('Upstream request failed (non-2xx response)', {
      path: normalisedPath,
      status: response.status,
      detail: upstreamDetail,
    })
    throw new AppError({
      code: ERROR_CODES.UPSTREAM_ERROR,
      message: 'Upstream request failed',
      statusCode: 502,
      retryable: true,
    })
  }

  try {
    return (await response.json()) as T
  } catch (cause) {
    // 2xx but unparseable JSON — treat as an upstream contract failure.
    logger.error('Upstream request failed (invalid JSON)', {
      path: normalisedPath,
      status: response.status,
      error: cause instanceof Error ? cause.message : String(cause),
    })
    throw new AppError({
      code: ERROR_CODES.UPSTREAM_ERROR,
      message: 'Upstream request failed',
      statusCode: 502,
      retryable: true,
      ...(cause instanceof Error ? { cause } : {}),
    })
  }
}
