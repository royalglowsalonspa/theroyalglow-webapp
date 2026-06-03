/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : middleware
 * Scope        : Authentication & Authorization
 *
 * Description  : Edge-compatible middleware for session validation
 *                and role-based access control across protected routes.
 *
 * Responsibilities :
 * - Check session cookie presence on protected routes
 * - Redirect unauthenticated users to /sign-in
 * - Validate RBAC roles for admin routes via internal API
 * - Return 403 for insufficient permissions
 *
 * Features / Functionality :
 * - Lightweight edge-safe session check (no kysely/DB imports)
 * - Role hierarchy enforcement (receptionist+ for /admin)
 * - Route matcher for protected paths (/admin, /staff, /profile, etc.)
 *
 * Tech Stack   : Next.js 16 Middleware, Edge Runtime
 * Layer        : Infrastructure (Edge)
 *
 * Dependencies : next/server
 *
 * Notes        :
 * - Better Auth's auth-server cannot be imported here (kysely incompatible with Edge)
 * - Role validation done via fetch to /api/auth/get-session
 ************************************************************/
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ROLE_LEVELS: Record<string, number> = {
  customer: 0,
  staff: 1,
  receptionist: 2,
  manager: 3,
  owner: 4,
  developer: 5,
}

const ADMIN_MIN_LEVEL = 2 // receptionist

// Better Auth session cookie name
const SESSION_COOKIE = 'better-auth.session_token'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check for session cookie
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value

  // Unauthenticated → redirect to /sign-in
  if (!sessionToken) {
    const signInUrl = new URL('/sign-in', request.url)
    return NextResponse.redirect(signInUrl)
  }

  // For admin routes, validate role via internal API call
  if (pathname.startsWith('/admin')) {
    try {
      const baseUrl = request.nextUrl.origin
      const sessionRes = await fetch(`${baseUrl}/api/auth/get-session`, {
        headers: {
          cookie: `${SESSION_COOKIE}=${sessionToken}`,
        },
      })

      if (!sessionRes.ok) {
        const signInUrl = new URL('/sign-in', request.url)
        return NextResponse.redirect(signInUrl)
      }

      const session = await sessionRes.json()
      const role = session?.user?.role ?? 'customer'
      const userLevel = ROLE_LEVELS[role] ?? 0

      if (userLevel < ADMIN_MIN_LEVEL) {
        return new NextResponse('Forbidden', { status: 403 })
      }
    } catch {
      // If session validation fails, redirect to sign-in
      const signInUrl = new URL('/sign-in', request.url)
      return NextResponse.redirect(signInUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/staff/:path*',
    '/onboarding',
    '/profile',
    '/bookings/:path*',
    '/membership',
    '/gems',
  ],
}
