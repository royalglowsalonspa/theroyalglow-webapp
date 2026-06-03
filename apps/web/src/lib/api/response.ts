/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : response
 * Scope        : API Infrastructure
 *
 * Description  : Convenience helpers for building standardised JSON API
 *                responses (200 OK, 201 Created, 204 No Content).
 *
 * Responsibilities :
 * - Provide typed response builders for common HTTP status codes
 * - Ensure consistent { success: true, data } envelope structure
 *
 * Features / Functionality :
 * - ok() — 200 with data and optional pagination meta
 * - created() — 201 with data
 * - noContent() — 204 with no body
 *
 * Tech Stack   : TypeScript
 * Layer        : API
 *
 * Dependencies : None
 *
 * Notes        : None
 ************************************************************/

export function ok<T>(
  data: T,
  meta?: { page?: number; totalPages?: number; totalCount?: number },
): Response {
  return Response.json({ success: true, data, ...(meta && { meta }) }, { status: 200 })
}

export function created<T>(data: T): Response {
  return Response.json({ success: true, data }, { status: 201 })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}
