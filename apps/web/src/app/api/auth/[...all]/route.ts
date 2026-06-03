/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/auth/[...all]
 * Scope        : API — Public
 *
 * Description  : Better Auth catch-all route handler that delegates all
 *                authentication operations (sign-in, sign-out, session, OAuth callbacks).
 *
 * Responsibilities :
 * - Delegate all auth-related HTTP requests to Better Auth
 * - Handle Google OAuth callback flow
 * - Manage session creation and destruction
 *
 * Features / Functionality :
 * - Google OAuth sign-in/sign-out
 * - Session management (cookie-based, HttpOnly)
 * - Automatic route matching via Better Auth's internal router
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/auth-server, better-auth/next-js
 *
 * Notes        :
 * - This is a passthrough handler; all logic lives in Better Auth internals.
 ************************************************************/

import { auth } from '@/lib/auth-server'
import { toNextJsHandler } from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
