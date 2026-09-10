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
    // Legacy data from Better Auth 1.7.0–1.7.2. Since 1.7.3, identity uses
    // providerId + accountId and new rows do not write issuer. Nullable storage
    // preserves existing values and allows migration before the rolling deploy.
    // This column is not part of the active Better Auth identity contract.
    issuer: text('issuer'),
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
    // Preserve account uniqueness using Better Auth 1.7.3's lookup key.
    // The same subject at different providers remains a distinct identity.
    uniqueIndex('account_provider_account_id_uidx').on(table.providerId, table.accountId),
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
