/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/auth/[...all] (admin)
 * Scope        : API — Public
 *
 * Description  : Better Auth catch-all route handler for the admin app that
 *                delegates all authentication operations (session, sign-out,
 *                OAuth callbacks) to Better Auth, configured against the same
 *                Neon DB and BETTER_AUTH_SECRET as web so shared sessions
 *                validate on this host.
 *
 * Responsibilities :
 * - Delegate all auth-related HTTP requests to Better Auth
 * - Handle Google OAuth callback flow
 * - Manage session validation against the shared cross-subdomain cookie
 *
 * Features / Functionality :
 * - Session management (cookie-based, HttpOnly, `.theroyalglow.in` scope)
 * - Automatic route matching via Better Auth's internal router
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/auth-server, better-auth/next-js
 *
 * Notes        :
 * - This is a passthrough handler; all logic lives in Better Auth internals.
 * - The admin app exposes this route locally so the browser never makes a
 *   cross-origin auth call between subdomains.
 ************************************************************/

import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth-server'

export const { GET, POST } = toNextJsHandler(auth)
