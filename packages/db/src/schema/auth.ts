/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : auth
 * Scope        : Database Schema — Authentication
 *
 * Description  : Defines the core authentication tables managed by Better Auth
 *                including users, sessions, accounts, and verification tokens.
 *
 * Responsibilities :
 * - Define user table with RBAC role, ban status, and timestamps
 * - Define session table with token-based session management
 * - Define account table for OAuth provider linkage (Google)
 * - Define verification table for email/token verification flows
 *
 * Features / Functionality :
 * - Nanoid-based primary keys for all auth entities
 * - Timestamptz columns stored in UTC for global consistency
 * - Indexed foreign keys for efficient session/account lookups
 * - Unique constraints on email and session token
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm/pg-core, nanoid
 *
 * Notes        : These tables are managed by Better Auth library.
 *                Schema matches Better Auth's expected structure.
 ************************************************************/

import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'

export const user = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role').default('customer'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const session = pgTable(
  'session',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    // Better Auth 1.7+ scopes account identity by ISSUER: the lookup on every
    // OAuth callback is `WHERE issuer = ? AND account_id = ?`. For Google —
    // both the redirect flow and One Tap — the value is the literal
    // 'https://accounts.google.com'; email/password rows would use
    // 'local:credential'.
    //
    // Deliberately NULLABLE at this step. This is the "expand" half of an
    // expand/migrate/contract rollout: a nullable column is invisible to the
    // running 1.6.26 code, so it can be added and backfilled with zero
    // downtime. The CONTRACT step (migration 0002) then sets NOT NULL and adds
    // the unique (issuer, account_id) index, which is safe only once 1.7.x is
    // deployed and therefore always writes the column.
    // See knowledge-base/better-auth-upgrade.md §5.
    issuer: text('issuer').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    // Better Auth 1.7+ declares this as a REQUIRED unique compound index — it is
    // the uniqueness guarantee behind `WHERE issuer = ? AND account_id = ?`, so
    // one provider identity can never map to two account rows.
    //
    // Named snake_case per this project's convention. Upstream's own generator
    // would call it `account_issuer_accountId_uidx`; the runtime depends only on
    // the columns and the uniqueness, not on the index name.
    uniqueIndex('account_issuer_account_id_uidx').on(table.issuer, table.accountId),
  ],
)

export const verification = pgTable('verification', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
})
