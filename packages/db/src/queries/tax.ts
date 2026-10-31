/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : tax (queries)
 * Scope        : Data Access — branch tax versions (multi-branch R6.4)
 *
 * Description  : Reads and writes the effective-dated tax rates per branch and
 *                SAC code, and the tax classification of catalogue services.
 *
 * Responsibilities :
 * - getBranchTaxVersions(branchId): every version, for resolving at a tax point
 * - getTaxVersionsForAdmin(branchId): the Tax screen's list with names and use
 * - createTaxVersion / markTaxVersionReviewed: Developer-only changes
 * - getServiceSacCodes(serviceIds): a service's code, else its category's
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/errors, ../index, ../schema/*
 *
 * Notes        : Versions never change once created (0018 trigger); only the
 *                launch review is recorded. Resolution happens in
 *                @rgss/business (prepareInvoiceTax); this module only reads.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../index'
import { user } from '../schema/auth'
import { invoiceItem } from '../schema/invoice'
import { service, serviceCategory } from '../schema/service'
import { branchTaxVersion, invoiceSequence } from '../schema/tax'
import { isConstraintViolation, SQLSTATE } from './driver-errors'

export type BranchTaxVersionRow = typeof branchTaxVersion.$inferSelect

/** Every tax version of the branch, oldest first. */
export async function getBranchTaxVersions(branchId: string): Promise<BranchTaxVersionRow[]> {
  return db
    .select()
    .from(branchTaxVersion)
    .where(eq(branchTaxVersion.branchId, branchId))
    .orderBy(asc(branchTaxVersion.sacCode), asc(branchTaxVersion.effectiveFrom))
}

const creator = alias(user, 'tax_version_creator')
const reviewer = alias(user, 'tax_version_reviewer')

/** The branch's versions for the Tax screen: who made and reviewed them, and whether invoices used them. */
export async function getTaxVersionsForAdmin(branchId: string) {
  return db
    .select({
      version: branchTaxVersion,
      createdByName: creator.name,
      reviewedByName: reviewer.name,
      usedByInvoices: sql<boolean>`exists (select 1 from ${invoiceItem} where ${invoiceItem.taxVersionId} = ${branchTaxVersion.id})`,
    })
    .from(branchTaxVersion)
    .leftJoin(creator, eq(creator.id, branchTaxVersion.createdBy))
    .leftJoin(reviewer, eq(reviewer.id, branchTaxVersion.reviewedBy))
    .where(eq(branchTaxVersion.branchId, branchId))
    .orderBy(asc(branchTaxVersion.sacCode), desc(branchTaxVersion.effectiveFrom))
}

const VERSION_START_UNIQUE = 'branch_tax_version_start_uidx'

/** Add a rate for one SAC code at a branch. A second rate on the same start is a 409. */
export async function createTaxVersion(values: {
  branchId: string
  sacCode: string
  rateBps: number
  effectiveFrom: Date
  reason: string
  createdBy: string
}): Promise<BranchTaxVersionRow> {
  try {
    const [created] = await db
      .insert(branchTaxVersion)
      .values({ ...values, pricesIncludeTax: true, reviewStatus: 'provisional' })
      .returning()
    return created as BranchTaxVersionRow
  } catch (error) {
    if (isConstraintViolation(error, SQLSTATE.uniqueViolation, [VERSION_START_UNIQUE])) {
      throw conflict(ERROR_CODES.CONFLICT, 'A rate for this SAC code already starts on that date.')
    }
    throw error
  }
}

/**
 * Record the launch review of a provisional version at the branch. Null when
 * there is no such version there or it was already reviewed.
 */
export async function markTaxVersionReviewed(
  id: string,
  branchId: string,
  reviewerId: string,
): Promise<BranchTaxVersionRow | null> {
  const [reviewed] = await db
    .update(branchTaxVersion)
    .set({ reviewStatus: 'reviewed', reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(
      and(
        eq(branchTaxVersion.id, id),
        eq(branchTaxVersion.branchId, branchId),
        eq(branchTaxVersion.reviewStatus, 'provisional'),
      ),
    )
    .returning()
  return reviewed ?? null
}

/** True once the branch has numbered an invoice; its prefix is then fixed. */
export async function branchHasIssuedInvoices(branchId: string): Promise<boolean> {
  const rows = await db
    .select({ branchId: invoiceSequence.branchId })
    .from(invoiceSequence)
    .where(eq(invoiceSequence.branchId, branchId))
    .limit(1)
  return rows.length > 0
}

/**
 * Each service's tax classification: its own SAC code, else its category's.
 * Null when neither has one (the invoice then can't be issued). Every
 * requested id is in the map.
 */
export async function getServiceSacCodes(serviceIds: readonly string[]) {
  const unique = [...new Set(serviceIds)]
  const codes = new Map<string, string | null>(unique.map((id) => [id, null]))
  if (unique.length === 0) {
    return codes
  }
  const rows = await db
    .select({
      id: service.id,
      sacCode: sql<string | null>`coalesce(${service.sacCode}, ${serviceCategory.sacCode})`,
    })
    .from(service)
    .innerJoin(serviceCategory, eq(serviceCategory.id, service.categoryId))
    .where(inArray(service.id, unique))
  for (const row of rows) {
    codes.set(row.id, row.sacCode)
  }
  return codes
}
