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
 * - Permanently (301) redirect legacy /admin/* paths to the admin subdomain
 * - Check session cookie presence on customer-protected routes
 * - Redirect unauthenticated users to the homepage (One Tap + Google sign-in)
 *
 * Features / Functionality :
 * - Lightweight edge-safe session check (no kysely/DB imports)
 * - Route matcher for protected customer paths (/staff, /profile, etc.)
 * - Route matcher for legacy /admin/* paths (cutover 301 to admin.theroyalglow.in)
 *
 * Tech Stack   : Next.js 16 Middleware, Edge Runtime
 * Layer        : Infrastructure (Edge)
 *
 * Dependencies : next/server, ./lib/admin-redirect
 *
 * Notes        :
 * - Better Auth's auth-server cannot be imported here (kysely incompatible with Edge)
 * - Admin routes/RBAC moved to apps/admin (admin.theroyalglow.in) during the
 *   admin-subdomain migration; this app no longer serves /admin. The /admin
 *   matcher below exists ONLY to 301-redirect old links (no role checks).
 ************************************************************/
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { mapAdminRedirect } from './lib/admin-redirect'
import { mapStaffRedirect } from './lib/staff-redirect'

// Better Auth session cookie name
const SESSION_COOKIE = 'better-auth.session_token'

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // Legacy admin paths permanently moved to admin.theroyalglow.in. Redirect
  // FIRST (before any session logic) so it applies to unauthenticated users
  // too, and emit a strict 301 (permanent) preserving the sub-path + query.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return NextResponse.redirect(mapAdminRedirect(pathname, search), 301)
  }

  // Legacy staff self-service paths moved to the admin subdomain's `/me/*`
  // namespace (admin.theroyalglow.in/me/schedule, /me/leave) during the
  // admin-web-separation feature. Redirect FIRST (before any session logic) so
  // it applies to unauthenticated users too; 301 (permanent), preserving the
  // sub-path + query. Canonical surfaces live in apps/admin, NOT here.
  if (pathname === '/staff' || pathname.startsWith('/staff/')) {
    return NextResponse.redirect(mapStaffRedirect(pathname, search), 301)
  }

  // Check for session cookie
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value

  // Unauthenticated → redirect to the homepage, where Google One Tap and the
  // explicit "Sign in" button live (there is no dedicated /sign-in page).
  if (!sessionToken) {
    const homeUrl = new URL('/', request.url)
    return NextResponse.redirect(homeUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/staff',
    '/staff/:path*',
    '/onboarding',
    '/profile',
    '/bookings/:path*',
    '/membership',
    '/gems',
  ],
}
