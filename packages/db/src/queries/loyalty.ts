/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : loyalty
 * Scope        : Data Access — Loyalty
 *
 * Description  : Query functions for the Gems loyalty program including account
 *                management, transactions, and redeemable service catalogue.
 *
 * Responsibilities :
 * - Get or create loyalty account for a customer
 * - Record earned gems transactions with balance updates
 * - Fetch loyalty summary (balance + lifetime totals)
 * - Fetch paginated transaction history with invoice links
 * - Fetch redeemable services catalogue for gems redemption
 *
 * Features / Functionality :
 * - Atomic gems earning via db.batch() (insert tx + update balance)
 * - Lazy loyalty account creation on first gems event
 * - Transaction history with invoice number LEFT JOINed
 * - Redeemable catalogue ordered by gems_catalogue_order
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index, ../schema/invoice, ../schema/loyalty,
 *                ../schema/service
 *
 * Notes        : Gems are earned at 1 per ₹100 (floor) on service invoices only.
 *                No gems on membership purchases or sessions.
 ************************************************************/

import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../index'
import { invoice } from '../schema/invoice'
import { loyaltyAccount, loyaltyTransaction } from '../schema/loyalty'
import { service } from '../schema/service'

// Find a customer's loyalty account, creating it on first use.
export async function getOrCreateLoyaltyAccount(customerId: string) {
  const existing = await db
    .select()
    .from(loyaltyAccount)
    .where(eq(loyaltyAccount.customerId, customerId))
    .limit(1)

  if (existing[0]) {
    return existing[0]
  }

  const [created] = await db.insert(loyaltyAccount).values({ customerId }).returning()

  return created as typeof loyaltyAccount.$inferSelect
}

// Record an 'earned' gems transaction and bump the account balance + lifetime
// total atomically via db.batch(). Returns the inserted transaction.
export async function addGemsTransaction(
  accountId: string,
  gems: number,
  invoiceId: string,
  description: string,
  expiresAt: Date,
) {
  const insertTx = db
    .insert(loyaltyTransaction)
    .values({
      loyaltyAccountId: accountId,
      type: 'earned',
      gemsAmount: gems,
      invoiceId,
      description,
      expiresAt,
    })
    .returning()

  const [txResult] = await db.batch([
    insertTx,
    db
      .update(loyaltyAccount)
      .set({
        gemsBalance: sql`${loyaltyAccount.gemsBalance} + ${gems}`,
        totalGemsEarned: sql`${loyaltyAccount.totalGemsEarned} + ${gems}`,
      })
      .where(eq(loyaltyAccount.id, accountId)),
  ])

  return txResult[0] as typeof loyaltyTransaction.$inferSelect
}

// Customer's gems balance + lifetime earned/redeemed totals, or null if the
// customer has no loyalty account yet.
export async function getLoyaltySummary(customerId: string) {
  const rows = await db
    .select({
      balance: loyaltyAccount.gemsBalance,
      totalEarned: loyaltyAccount.totalGemsEarned,
      totalRedeemed: loyaltyAccount.totalGemsRedeemed,
    })
    .from(loyaltyAccount)
    .where(eq(loyaltyAccount.customerId, customerId))
    .limit(1)

  return rows[0] ?? null
}

// A customer's gems transactions, newest first, each LEFT JOINed to its invoice
// for the human-readable invoice number (null for non-invoice transactions).
export async function getLoyaltyTransactions(customerId: string, limit: number, offset: number) {
  return db
    .select({
      id: loyaltyTransaction.id,
      type: loyaltyTransaction.type,
      gemsAmount: loyaltyTransaction.gemsAmount,
      description: loyaltyTransaction.description,
      expiresAt: loyaltyTransaction.expiresAt,
      createdAt: loyaltyTransaction.createdAt,
      invoiceNumber: invoice.invoiceNumber,
    })
    .from(loyaltyTransaction)
    .innerJoin(loyaltyAccount, eq(loyaltyTransaction.loyaltyAccountId, loyaltyAccount.id))
    .leftJoin(invoice, eq(loyaltyTransaction.invoiceId, invoice.id))
    .where(eq(loyaltyAccount.customerId, customerId))
    .orderBy(desc(loyaltyTransaction.createdAt))
    .limit(limit)
    .offset(offset)
}

// Active services flagged as gems-redeemable, ordered by catalogue order
// (nulls last). Powers the customer gems catalogue grid.
export async function getRedeemableServices() {
  return db
    .select({
      id: service.id,
      name: service.name,
      gemsRequired: service.gemsRequired,
      pricePaise: service.pricePaise,
    })
    .from(service)
    .where(and(eq(service.gemsRedeemable, true), eq(service.isActive, true)))
    .orderBy(sql`${service.gemsCatalogueOrder} asc nulls last`)
}
