/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : auth-server
 * Scope        : Authentication
 *
 * Description  : Server-side Better Auth configuration with Google OAuth,
 *                Drizzle adapter, RBAC dash plugin, and session management.
 *
 * Responsibilities :
 * - Configure Better Auth with Drizzle ORM + Neon PostgreSQL
 * - Set up Google OAuth social provider
 * - Enable admin dashboard plugin
 * - Export typed Session type for server-side usage
 *
 * Features / Functionality :
 * - Google OAuth authentication
 * - Google One Tap sign-in (verifies the GSI ID token server-side)
 * - Cookie-based session caching (5-min TTL)
 * - Admin dashboard via @better-auth/infra dash plugin
 *
 * Tech Stack   : TypeScript, Better Auth, Drizzle ORM, Neon PostgreSQL
 * Layer        : API Infrastructure
 *
 * Dependencies : @better-auth/infra, @rgss/db, better-auth, better-auth/adapters/drizzle
 *
 * Notes        : None
 ************************************************************/

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
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    },
  },
  plugins: [dash(), oneTap()],
  advanced: buildCrossSubdomainAdvanced(process.env.COOKIE_DOMAIN, process.env.NODE_ENV),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
})

export type Session = typeof auth.$Infer.Session
