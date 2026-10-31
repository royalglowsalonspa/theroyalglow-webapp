/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settlement/csv
 * Scope        : Business Logic — statement export for the accountant (R10)
 *
 * Description  : A closed statement and its entries as CSV (RFC 4180):
 *                every entry with its value, GST share, share and amount
 *                owed, then what each branch owes the other and the net, so
 *                the file matches the statement's totals (MS-25).
 *
 * Responsibilities :
 * - settlementStatementCsv(statement, entries) → CSV text
 * - rupeesPlain(paise) → "952.39": exact, unformatted, spreadsheet-ready
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/types, ../utils/date
 *
 * Notes        : Amounts are plain rupees with two decimals from integer
 *                paise, never floating point. Text fields that a spreadsheet
 *                would run as a formula are prefixed with an apostrophe.
 *                Dates are IST, DD/MM/YYYY.
 ************************************************************/

import type {
  SettlementAmounts,
  SettlementEntryKind,
  SettlementEntryView,
  SettlementStatementView,
} from '@rgss/types'
import { formatDateIN } from '../utils/date'

/** Integer paise as plain rupees, "1234.05" or "-952.39". */
export function rupeesPlain(paise: number): string {
  if (!Number.isSafeInteger(paise)) {
    throw new RangeError('paise must be a whole number')
  }
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

const KIND_LABEL: Record<SettlementEntryKind, string> = {
  membership_session: 'Membership session',
  gems_redemption: 'Gems',
  reversal: 'Reversal',
}

// A text field: quoted when it holds a separator, and never read as a formula.
function text(value: string | null | undefined): string {
  const raw = value ?? ''
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

function number(value: number | null): string {
  return value === null ? '' : String(value)
}

function row(fields: string[]): string {
  return fields.join(',')
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-')
  return `${m}/${year}`
}

function amountRows(owes: string, amounts: SettlementAmounts): string[] {
  return [
    row([text(`${owes}: memberships, amount owed`), rupeesPlain(amounts.membershipPaise)]),
    row([text(`${owes}: memberships, value`), rupeesPlain(amounts.membershipValuePaise)]),
    row([text(`${owes}: memberships, GST share`), rupeesPlain(amounts.membershipGstSharePaise)]),
    row([text(`${owes}: gems, amount owed`), rupeesPlain(amounts.gemsPaise)]),
    row([text(`${owes}: total owed`), rupeesPlain(amounts.totalPaise)]),
  ]
}

/** A statement and its entries as CSV, ending with its totals and net. */
export function settlementStatementCsv(
  statement: SettlementStatementView,
  entries: readonly SettlementEntryView[],
): string {
  const a = statement.branchA.name
  const b = statement.branchB.name
  const lines = [
    row([text('Settlement statement'), text(`${a} and ${b}`), text(monthLabel(statement.month))]),
    '',
    row(
      [
        'Recorded on (IST)',
        'Kind',
        'Owed by',
        'Owed to',
        'Membership',
        'Booking',
        'Minutes',
        'Gems',
        'Value (Rs)',
        'GST share (Rs)',
        'Share (%)',
        'Value per gem (Rs)',
        'Amount owed (Rs)',
        'Note',
      ].map(text),
    ),
    ...entries.map((entry) =>
      row([
        text(formatDateIN(new Date(entry.recordedAt))),
        text(
          entry.kind === 'reversal' && entry.reversedKind
            ? `${KIND_LABEL.reversal} (${KIND_LABEL[entry.reversedKind].toLowerCase()})`
            : KIND_LABEL[entry.kind],
        ),
        text(entry.owingBranch.name),
        text(entry.owedBranch.name),
        text(entry.membershipNumber),
        text(entry.bookingNumber),
        number(entry.minutes),
        number(entry.gems),
        rupeesPlain(entry.valuePaise),
        rupeesPlain(entry.gstSharePaise),
        (entry.shareBps / 100).toFixed(2),
        entry.gemValuePaise === null ? '' : rupeesPlain(entry.gemValuePaise),
        rupeesPlain(entry.amountOwedPaise),
        text(entry.note),
      ]),
    ),
    '',
    ...amountRows(`${a} owes ${b}`, statement.aOwesB),
    ...amountRows(`${b} owes ${a}`, statement.bOwesA),
    row([
      text(
        statement.net.payingBranch && statement.net.receivingBranch
          ? `Net: ${statement.net.payingBranch.name} pays ${statement.net.receivingBranch.name}`
          : 'Net: nothing to pay',
      ),
      rupeesPlain(statement.net.amountPaise),
    ]),
  ]
  if (statement.paid) {
    lines.push(
      row([
        text('Paid on'),
        text(statement.paid.paidOn.split('-').reverse().join('/')),
        text(statement.paid.reference),
        text(statement.paid.internalTransfer ? 'Internal transfer' : ''),
      ]),
    )
  }
  return `${lines.join('\r\n')}\r\n`
}
