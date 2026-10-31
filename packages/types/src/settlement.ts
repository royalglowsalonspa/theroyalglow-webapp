/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-10-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settlement (types)
 * Scope        : Shared Types & Validation — cross-branch settlement (R10)
 *
 * Description  : Contracts for what branches owe each other when a customer
 *                uses SPA membership hours or spends gems at a branch other
 *                than the one that took the money or issued the gems:
 *                the Developer's settlement settings, the monthly statement
 *                and entry views, and the mark-paid payload.
 *
 * Responsibilities :
 * - settlementSettingSchema: the share the performing branch receives and the
 *   value of one gem, with their documented defaults
 * - Statement, entry and open-month views for the Settlements screen
 * - settlementPaidSchema: the payment date and reference
 * - settlementReversalSchema: the Developer's reason for a correction
 * - BranchSettlementReport: a branch's settlement figures in its reports
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod, ./closure
 *
 * Notes        : Amounts are integer paise. A statement is one IST calendar
 *                month for one pair of branches; only the net is paid
 *                (settlement.md). Each entry stores the share and gem value
 *                it used, so a later settings change affects later entries only.
 ************************************************************/
import { z } from 'zod'
import { calendarDateSchema } from './closure'

/* ── Settings ───────────────────────────────────────────────────────────── */

/** The Developer's settlement settings, the same for every pair of branches. */
export const settlementSettingSchema = z.object({
  /** Share of an entry's amount the performing branch receives, in basis points (10000 = 100%). */
  shareBps: z.number().int().min(0).max(10_000),
  /** What one gem spent at another branch is worth, in paise (100 = ₹1.00). */
  gemValuePaise: z.number().int().min(1).max(100_000),
})
export type SettlementSetting = z.infer<typeof settlementSettingSchema>

/** User decisions of 28 October 2026: 100% of the amount, ₹1.00 per gem. */
export const DEFAULT_SETTLEMENT: SettlementSetting = { shareBps: 10_000, gemValuePaise: 100 }

/* ── Ledger ─────────────────────────────────────────────────────────────── */

export const SETTLEMENT_ENTRY_KINDS = ['membership_session', 'gems_redemption', 'reversal'] as const
export type SettlementEntryKind = (typeof SETTLEMENT_ENTRY_KINDS)[number]

/** An IST calendar month, "YYYY-MM". */
export const settlementMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be "YYYY-MM"')

export const settlementListQuerySchema = z.object({
  month: settlementMonthSchema.optional(),
})

/**
 * Marking a statement paid: the IST date the money moved, its reference, and
 * whether it was a transfer between two branches of the same Owner.
 */
export const settlementPaidSchema = z.object({
  // A real calendar date: Date.parse would roll 2026-02-31 over to 3 March.
  paidOn: calendarDateSchema,
  reference: z.string().trim().min(1, 'Enter the payment reference').max(120),
  internalTransfer: z.boolean().default(false),
})
export type SettlementPaidInput = z.infer<typeof settlementPaidSchema>

/** A Developer's correction of an entry: a reversing entry with its reason. */
export const settlementReversalSchema = z.object({
  note: z.string().trim().min(3, 'Say why this entry is being reversed').max(500),
})
export type SettlementReversalInput = z.infer<typeof settlementReversalSchema>

/** A branch as a statement names it. */
export type SettlementBranchRef = { id: string; name: string }

/**
 * What one branch owes the other, by kind. For memberships, the sessions'
 * value and its GST share are totalled too, so either settlement basis can be
 * read without recalculating (TX-12).
 */
export type SettlementAmounts = {
  membershipPaise: number
  membershipValuePaise: number
  membershipGstSharePaise: number
  gemsPaise: number
  totalPaise: number
}

/** One closed month for one pair of branches. */
export type SettlementStatementView = {
  id: string
  /** "YYYY-MM" */
  month: string
  branchA: SettlementBranchRef
  branchB: SettlementBranchRef
  aOwesB: SettlementAmounts
  bOwesA: SettlementAmounts
  /** Who pays whom the difference; null branches when it nets to zero. */
  net: SettlementNetView
  entryCount: number
  closedAt: string
  paid: {
    paidOn: string
    reference: string
    internalTransfer: boolean
    recordedByName: string | null
    recordedAt: string
  } | null
  /** The paying branch's Owner or the Developer, while unpaid and owed. */
  canMarkPaid: boolean
  /** One Owner owns both branches, so the payment may be an internal transfer. */
  sameOwner: boolean
}

/** One ledger entry, as the statement and CSV show it. */
export type SettlementEntryView = {
  id: string
  kind: SettlementEntryKind
  /** For a reversal, the kind of entry it reverses. */
  reversedKind: Exclude<SettlementEntryKind, 'reversal'> | null
  /** "YYYY-MM": the month the entry belongs to. */
  month: string
  recordedAt: string
  owingBranch: SettlementBranchRef
  owedBranch: SettlementBranchRef
  /** Membership number, for a membership session. */
  membershipNumber: string | null
  /** The booking the service was delivered on. */
  bookingNumber: string | null
  minutes: number | null
  gems: number | null
  valuePaise: number
  gstSharePaise: number
  amountOwedPaise: number
  shareBps: number
  gemValuePaise: number | null
  /** The entry this one reverses, and why. */
  reversesEntryId: string | null
  note: string | null
  /** The reversal recorded against this entry, when there is one. */
  reversedByEntryId: string | null
}

/** The net of a pair's amounts each way: who pays whom. */
export type SettlementNetView = {
  payingBranch: SettlementBranchRef | null
  receivingBranch: SettlementBranchRef | null
  amountPaise: number
}

/** A month still open for a pair of branches: entries so far, no statement yet. */
export type SettlementOpenMonthView = {
  month: string
  branchA: SettlementBranchRef
  branchB: SettlementBranchRef
  aOwesB: SettlementAmounts
  bOwesA: SettlementAmounts
  net: SettlementNetView
  entryCount: number
}

/** GET /api/settlements: the viewer's statements and open months. */
export type SettlementListView = {
  statements: SettlementStatementView[]
  open: SettlementOpenMonthView[]
  /** The Developer sees every pair; an Owner sees pairs with a branch they own. */
  scope: 'all' | 'owner'
}

/** GET /api/settlements/[id]: one statement and its entries. */
export type SettlementDetailView = {
  statement: SettlementStatementView
  entries: SettlementEntryView[]
  /** The Developer may record a reversing entry against an entry. */
  canReverse: boolean
}

/**
 * A branch's settlement figures for a report period (settlement.md). Money
 * is null for viewers who see hours and gems only (Managers): the value of
 * another branch's membership would reveal its rate.
 */
export type BranchSettlementReport = {
  memberships: {
    /** Session minutes delivered at this branch, to any branch's members. */
    deliveredMinutes: number
    deliveredValuePaise: number | null
    /** Session minutes used, anywhere, by members of memberships sold here. */
    ownMembersMinutes: number
    ownMembersValuePaise: number | null
    /** Owed to this branch for other branches' members it served. */
    toReceivePaise: number | null
    /** Owed by this branch for its members served elsewhere. */
    toPayPaise: number | null
  }
  gems: {
    /** Gems earned on this branch's invoices. */
    issued: number
    /** Gems spent on free services completed at this branch. */
    redeemed: number
    toReceivePaise: number | null
    toPayPaise: number | null
  }
}
