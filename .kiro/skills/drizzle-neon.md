# Drizzle ORM + Neon PostgreSQL Skill

## Description
Guides correct Drizzle ORM schema definitions, query patterns, and Neon PostgreSQL conventions for the Royal Glow project.

## Activation
- When working on files in `packages/db/`
- When generating database schemas, queries, or migrations
- When any code interacts with the database

---

## Schema Definition Pattern

```typescript
// packages/db/schema/{domain}.ts
import { pgTable, text, integer, timestamp, boolean, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// Enum definition (PostgreSQL native)
export const bookingStatusEnum = pgEnum('booking_status', [
  'pending', 'confirmed', 'rejected', 'in_progress',
  'completed', 'cancelled', 'no_show', 'rescheduled',
])

// Table definition
export const booking = pgTable('booking', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  bookingNumber: text('booking_number').notNull().unique(),
  customerId: text('customer_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  branchId: text('branch_id').notNull().references(() => branch.id, { onDelete: 'restrict' }),
  serviceType: serviceTypeEnum('service_type').notNull(),
  status: bookingStatusEnum('status').notNull().default('pending'),
  date: date('date').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  totalDurationMinutes: integer('total_duration_minutes').notNull(),
  notes: text('notes'),
  cancellationReason: text('cancellation_reason'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_booking_customer_date').on(table.customerId, table.date),
  index('idx_booking_branch_date').on(table.branchId, table.date, table.startTime),
  index('idx_booking_status').on(table.status),
])

// Relations (for relational queries)
export const bookingRelations = relations(booking, ({ one, many }) => ({
  customer: one(user, { fields: [booking.customerId], references: [user.id] }),
  branch: one(branch, { fields: [booking.branchId], references: [branch.id] }),
  services: many(bookingService),
  notes: many(bookingNote),
  invoice: one(invoice),
}))
```

---

## Query Pattern

```typescript
// packages/db/queries/booking.ts
import { db } from '../client'
import { booking, bookingService } from '../schema/booking'
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm'

export async function getCustomerBookings(customerId: string, limit = 20) {
  return db.query.booking.findMany({
    where: eq(booking.customerId, customerId),
    orderBy: desc(booking.date),
    limit,
    with: {
      services: { with: { service: true } },
      branch: true,
    },
  })
}

export async function getBookingById(id: string) {
  return db.query.booking.findFirst({
    where: eq(booking.id, id),
    with: {
      services: { with: { service: true, staff: true } },
      branch: true,
      customer: true,
      invoice: true,
    },
  })
}

export async function createBooking(data: NewBooking) {
  return db.insert(booking).values(data).returning()
}

export async function updateBookingStatus(id: string, status: string, extra?: Partial<typeof booking.$inferInsert>) {
  return db.update(booking)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(booking.id, id))
    .returning()
}
```

---

## Client Setup

```typescript
// packages/db/client.ts
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })

// For edge environments (Cloudflare Workers):
// import { drizzle } from 'drizzle-orm/neon-http'
// Uses HTTP, not WebSocket — compatible with V8 isolates
```

---

## Migration Workflow

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migration to database
npx drizzle-kit migrate

# Push directly (dev only — no migration file)
npx drizzle-kit push

# Open visual studio
npx drizzle-kit studio
```

---

## Key Rules

1. **NEVER use `serial` or `bigserial`** — always `text` with `nanoid()` for IDs
2. **NEVER use `real` or `numeric` for money** — always `integer` in paise
3. **ALWAYS add `withTimezone: true`** to timestamp columns
4. **ALWAYS define indexes** for FK columns and common query patterns
5. **ALWAYS use `.references()`** with appropriate `onDelete` behavior
6. **ALWAYS define relations** for relational query support
7. **Use partial indexes** where possible: `WHERE status IN ('pending', 'confirmed')`
8. **Composite primary keys** for junction tables: `primaryKey({ columns: [table.userId, table.serviceId] })`
