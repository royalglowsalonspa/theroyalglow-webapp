# Design Document

## Overview

This design defines the implementation of 38 Drizzle ORM table definitions across 15 domain files, plus 14 relation files and a barrel file. The schema lives in `packages/db/src/schema/` using Option B architecture: table definitions in domain files, relations in a `relations/` subfolder, all aggregated through `schema/index.ts`.

**Verification:** `bunx tsc --noEmit` from `packages/db/` — no runtime tests needed for schema definitions.

---

## Architecture

### File Layout (Option B)

```
packages/db/src/
├── index.ts                    ← DB client (neon + drizzle)
└── schema/
    ├── index.ts                ← Barrel: re-exports all tables + relations
    ├── enums.ts                ← All 17 pgEnum definitions
    ├── auth.ts                 ← user, session, account, verification
    ├── profile.ts              ← customer_profile, staff_profile
    ├── branch.ts               ← branch
    ├── service.ts              ← service_category, service, staff_service
    ├── schedule.ts             ← staff_schedule, staff_time_off, business_hour, holiday
    ├── booking.ts              ← booking, booking_service, booking_status_log, waitlist
    ├── invoice.ts              ← invoice, invoice_item
    ├── membership.ts           ← spa_membership_tier, spa_membership
    ├── offer.ts                ← offer, offer_service, offer_redemption
    ├── lead.ts                 ← lead, lead_note
    ├── crm.ts                  ← customer_tag, customer_tag_assignment, customer_note
    ├── loyalty.ts              ← loyalty_account, loyalty_transaction
    ├── notification.ts         ← notification, push_subscription
    ├── system.ts               ← daily_sales_summary, monthly_gst_summary, audit_log, system_setting
    └── relations/
        ├── index.ts            ← Barrel for all relation files
        ├── auth.relations.ts
        ├── profile.relations.ts
        ├── branch.relations.ts
        ├── service.relations.ts
        ├── schedule.relations.ts
        ├── booking.relations.ts
        ├── invoice.relations.ts
        ├── membership.relations.ts
        ├── offer.relations.ts
        ├── lead.relations.ts
        ├── crm.relations.ts
        ├── loyalty.relations.ts
        ├── notification.relations.ts
        └── system.relations.ts
```

---

## Components and Interfaces

### Import Patterns

**Enum imports** — all schema files import enums from the single `enums.ts`:

```typescript
// In booking.ts
import { bookingStatusEnum, serviceTypeEnum, waitlistStatusEnum } from './enums'
```

**Cross-domain table imports in relation files** — relation files import tables from their own domain and from other domains as needed:

```typescript
// In relations/booking.relations.ts
import { booking, bookingService, bookingStatusLog, waitlist } from '../booking'
import { user } from '../auth'
import { branch } from '../branch'
import { service } from '../service'
import { staffProfile } from '../profile'
import { offer } from '../offer'
import { spaMembership } from '../membership'
```

**Barrel file pattern** — `schema/index.ts` uses wildcard re-exports:

```typescript
// schema/index.ts
export * from './enums'
export * from './auth'
export * from './profile'
export * from './branch'
export * from './service'
export * from './schedule'
export * from './booking'
export * from './invoice'
export * from './membership'
export * from './offer'
export * from './lead'
export * from './crm'
export * from './loyalty'
export * from './notification'
export * from './system'
export * from './relations'
```

**Relations barrel** — `schema/relations/index.ts`:

```typescript
export * from './auth.relations'
export * from './profile.relations'
// ... all 14 relation files
```

### Consumer import:

```typescript
// From any app or package
import { booking, bookingService, user, bookingStatusEnum } from '@rgss/db/schema'
```

---

## Drizzle ORM Patterns

### pgEnum Definition

```typescript
// enums.ts
import { pgEnum } from 'drizzle-orm/pg-core'

export const bookingStatusEnum = pgEnum('booking_status', [
  'pending',
  'confirmed',
  'rejected',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
])
```

### pgTable Definition (Example: `booking`)

```typescript
// booking.ts
import { index, pgTable, text, integer, boolean, date, time, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { bookingStatusEnum, serviceTypeEnum } from './enums'
import { user } from './auth'
import { branch } from './branch'
import { offer } from './offer'
import { spaMembership } from './membership'

export const booking = pgTable('booking', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  bookingNumber: text('booking_number').notNull().unique(),
  branchId: text('branch_id').notNull().references(() => branch.id, { onDelete: 'restrict' }),
  customerId: text('customer_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  status: bookingStatusEnum('status').notNull().default('pending'),
  serviceType: serviceTypeEnum('service_type').notNull(),
  bookingDate: date('booking_date', { mode: 'date' }).notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  totalAmountPaise: integer('total_amount_paise').notNull().default(0),
  totalDurationMinutes: integer('total_duration_minutes').notNull().default(0),
  notes: text('notes'),
  isWalkin: boolean('is_walkin').notNull().default(false),
  isMembershipSession: boolean('is_membership_session').notNull().default(false),
  offerId: text('offer_id').references(() => offer.id, { onDelete: 'set null' }),
  spaMembershipId: text('spa_membership_id').references(() => spaMembership.id, { onDelete: 'restrict' }),
  cancellationReason: text('cancellation_reason'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
  rejectionReason: text('rejection_reason'),
  rejectedAt: timestamp('rejected_at', { withTimezone: true, mode: 'date' }),
  rescheduleCount: integer('reschedule_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('booking_booking_date_idx').on(table.bookingDate),
  index('booking_customer_id_idx').on(table.customerId),
  index('booking_branch_id_booking_date_idx').on(table.branchId, table.bookingDate),
  index('booking_service_type_booking_date_idx').on(table.serviceType, table.bookingDate),
  index('booking_status_idx').on(table.status).where(sql`status NOT IN ('completed', 'cancelled', 'no_show')`),
  index('booking_offer_id_idx').on(table.offerId).where(sql`offer_id IS NOT NULL`),
  index('booking_spa_membership_id_idx').on(table.spaMembershipId).where(sql`spa_membership_id IS NOT NULL`),
])
```

### Relation Definition (Example: `booking.relations.ts`)

```typescript
// relations/booking.relations.ts
import { relations } from 'drizzle-orm'
import { booking, bookingService, bookingStatusLog, waitlist } from '../booking'
import { user } from '../auth'
import { branch } from '../branch'
import { service } from '../service'
import { staffProfile } from '../profile'
import { offer } from '../offer'
import { spaMembership } from '../membership'
import { invoice } from '../invoice'
import { notification } from '../notification'
import { offerRedemption } from '../offer'

export const bookingRelations = relations(booking, ({ one, many }) => ({
  customer: one(user, { fields: [booking.customerId], references: [user.id] }),
  branch: one(branch, { fields: [booking.branchId], references: [branch.id] }),
  offer: one(offer, { fields: [booking.offerId], references: [offer.id] }),
  spaMembership: one(spaMembership, { fields: [booking.spaMembershipId], references: [spaMembership.id] }),
  services: many(bookingService),
  statusLogs: many(bookingStatusLog),
  invoice: one(invoice),
  notifications: many(notification),
  offerRedemption: one(offerRedemption),
}))

export const bookingServiceRelations = relations(bookingService, ({ one }) => ({
  booking: one(booking, { fields: [bookingService.bookingId], references: [booking.id] }),
  service: one(service, { fields: [bookingService.serviceId], references: [service.id] }),
  staff: one(staffProfile, { fields: [bookingService.staffId], references: [staffProfile.id] }),
}))

export const bookingStatusLogRelations = relations(bookingStatusLog, ({ one }) => ({
  booking: one(booking, { fields: [bookingStatusLog.bookingId], references: [booking.id] }),
  changedBy: one(user, { fields: [bookingStatusLog.changedById], references: [user.id] }),
}))

export const waitlistRelations = relations(waitlist, ({ one }) => ({
  customer: one(user, { fields: [waitlist.customerId], references: [user.id] }),
  service: one(service, { fields: [waitlist.serviceId], references: [service.id] }),
  preferredStaff: one(staffProfile, { fields: [waitlist.preferredStaffId], references: [staffProfile.id] }),
}))
```

### Junction Table Pattern (composite PK)

```typescript
// In service.ts
export const staffService = pgTable('staff_service', {
  staffId: text('staff_id').notNull().references(() => staffProfile.id, { onDelete: 'cascade' }),
  serviceId: text('service_id').notNull().references(() => service.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.staffId, table.serviceId] }),
])
```

### Partial Index Pattern

```typescript
// In membership.ts — one active membership per customer
uniqueIndex('spa_membership_active_customer_idx')
  .on(table.customerId)
  .where(sql`status = 'active'`)
```

---

## Data Models

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Table name (SQL) | `snake_case`, singular | `booking_service` |
| Table variable (TS) | `camelCase` | `bookingService` |
| Column name (SQL) | `snake_case` | `total_amount_paise` |
| Column variable (TS) | `camelCase` | `totalAmountPaise` |
| Enum name (SQL) | `snake_case` | `booking_status` |
| Enum variable (TS) | `camelCaseEnum` | `bookingStatusEnum` |
| Index name | `{table}_{columns}_idx` | `booking_customer_id_idx` |
| Unique index name | `{table}_{columns}_unique` or `_idx` | `spa_membership_active_customer_idx` |
| Relation variable | `{table}Relations` | `bookingRelations` |

### Column Type Mapping

| Data Type | Drizzle Column | Notes |
|-----------|---------------|-------|
| Primary key | `text('id').primaryKey().$defaultFn(() => nanoid())` | All tables |
| Money | `integer('column_paise')` | Stored in paise |
| Timestamp | `timestamp('col', { withTimezone: true, mode: 'date' })` | UTC storage |
| Date (no time) | `date('col', { mode: 'date' })` | For booking_date, DOB |
| Time (no date) | `time('col')` | For start_time, end_time |
| Boolean | `boolean('col').notNull().default(false)` | Always explicit default |
| Enum | `someEnum('col').notNull()` | From enums.ts |
| JSON | `jsonb('col')` | For audit_log values, system_setting |
| Numeric | `numeric('col', { precision: 10, scale: 7 })` | For lat/lng only |

### Required Imports per Schema File

Every schema file needs:

```typescript
import { pgTable, text, integer, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
```

Plus domain-specific: `date`, `time`, `numeric`, `jsonb`, `primaryKey` as needed.

---

## Error Handling

Not applicable — schema definitions are compile-time only. Errors surface as:
- TypeScript compilation errors (`bunx tsc --noEmit`)
- Drizzle-kit migration generation errors (`bun run generate`)
- PostgreSQL constraint violations at runtime (handled by the data access layer, not the schema)

---

## Testing Strategy

**Property-based testing does not apply** to this spec. Schema definitions are declarative configuration — there are no functions with inputs/outputs to test universally.

### Verification Approach

1. **TypeScript strict-mode compilation** — `bunx tsc --noEmit` from `packages/db/`
   - Catches type mismatches, missing imports, invalid Drizzle API usage
   - Run as part of `turbo typecheck` pipeline

2. **Drizzle-kit generation** — `bun run generate` from `packages/db/`
   - Validates schema is well-formed and can produce SQL migrations
   - Catches FK reference errors, duplicate table/column names

3. **Manual review** — verify column counts, enum values, and index definitions match `database-schema.md`

### Why Not PBT

- Schema files are declarative TypeScript (no runtime logic)
- No functions to test — only type definitions and configuration objects
- Correctness is verified by the TypeScript compiler and Drizzle-kit
- Equivalent to IaC — snapshot/compilation testing is the appropriate strategy
