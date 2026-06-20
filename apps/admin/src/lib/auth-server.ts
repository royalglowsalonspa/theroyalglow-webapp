/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : auth-server (admin)
 * Scope        : Authentication
 *
 * Description  : Server-side Better Auth configuration for the admin app
 *                (admin.theroyalglow.in). Mirrors the web auth-server base
 *                config (Google OAuth, Drizzle adapter, RBAC dash plugin,
 *                session caching) and ADDS cross-subdomain cookies so a
 *                session created on theroyalglow.in is recognised on
 *                admin.theroyalglow.in without re-authenticating.
 *
 * Responsibilities :
 * - Configure Better Auth with Drizzle ORM + the SAME Neon DB as web
 * - Use the SAME BETTER_AUTH_SECRET as web so both apps validate one token
 * - Set up Google OAuth social provider
 * - Enable admin dashboard plugin + Google One Tap
 * - Share the session cookie across *.theroyalglow.in subdomains (Req 4.1, 4.8)
 *
 * Features / Functionality :
 * - Google OAuth authentication
 * - Google One Tap sign-in (verifies the GSI ID token server-side)
 * - Cookie-based session caching (5-min TTL)
 * - Cross-subdomain cookie scope `.theroyalglow.in` (prod), omitted in local dev
 * - Admin dashboard via @better-auth/infra dash plugin
 *
 * Tech Stack   : TypeScript, Better Auth, Drizzle ORM, Neon PostgreSQL
 * Layer        : API Infrastructure
 *
 * Dependencies : @better-auth/infra, @rgss/db, better-auth, better-auth/adapters/drizzle
 *
 * Notes        :
 * - The cross-subdomain cookie domain is derived from env: it is set to
 *   `.theroyalglow.in` in production (or an explicit COOKIE_DOMAIN override)
 *   and OMITTED in local dev so cookies still bind to `localhost`.
 ************************************************************/

import { env } from '@/env'
import { dash } from '@better-auth/infra'
import { buildCrossSubdomainAdvanced } from '@rgss/business'
import { db } from '@rgss/db'
import * as schema from '@rgss/db/schema'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { oneTap } from 'better-auth/plugins'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  socialProviders: {
    google: {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    },
  },
  plugins: [dash(), oneTap()],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  advanced: buildCrossSubdomainAdvanced(process.env.COOKIE_DOMAIN, process.env.NODE_ENV),
})

export type Session = typeof auth.$Infer.Session
