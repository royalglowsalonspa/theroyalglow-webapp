import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Lightweight middleware that checks for session cookie presence.
 * 
 * We do NOT import auth-server here because Better Auth's internals
 * pull in kysely which is incompatible with the Edge runtime.
 * 
 * Instead, we check for the session cookie and validate roles
 * via a lightweight API call to our own auth endpoint.
 */

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
    '/onboarding',
    '/profile',
    '/bookings/:path*',
    '/membership',
    '/gems',
  ],
}
