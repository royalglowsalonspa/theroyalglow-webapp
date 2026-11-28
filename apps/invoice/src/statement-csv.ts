import { z } from 'zod'
import { invoiceId } from './contracts'

export const STATEMENT_CSV_HEADER = 'branch_id,posted_on,reference,direction,amount_paise'
export const STATEMENT_MAX_BYTES = 32 * 1024
export const STATEMENT_MAX_ROWS = 100

const statementRow = z.tuple([
  invoiceId,
  z.iso.date().refine((day) => day >= '0001-01-01'),
  z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9./_-]{3,79}$/)
    .toUpperCase(),
  z.enum(['credit', 'debit']),
  z
    .string()
    .regex(/^[1-9][0-9]{0,9}$/)
    .transform(Number),
])

export interface StatementEntry {
  postedOn: string
  reference: string
  direction: 'credit' | 'debit'
  amountPaise: number
}

type StatementParseResult =
  | { rows: StatementEntry[] }
  | { error: 'size' | 'header' | 'row-count' }
  | { error: 'invalid-row' | 'duplicate-reference'; line: number }

function unquote(value: string) {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
}

export function parseStatementCsv(
  input: string,
  branch: string,
  today: string,
): StatementParseResult {
  if (new TextEncoder().encode(input).length > STATEMENT_MAX_BYTES) return { error: 'size' }
  const [header, ...lines] = input
    .replace(/^\uFEFF/, '')
    .replace(/\r?\n$/, '')
    .split(/\r?\n/)
  if (header?.split(',').map(unquote).join(',') !== STATEMENT_CSV_HEADER) return { error: 'header' }
  if (!lines.length || lines.length > STATEMENT_MAX_ROWS) return { error: 'row-count' }

  const seen = new Set<string>()
  const rows: StatementEntry[] = []
  // The normalized fields exclude embedded commas, quotes, and newlines by schema.
  for (const [i, line] of lines.entries()) {
    const parsed = statementRow.safeParse(line.split(',').map(unquote))
    if (!parsed.success) return { error: 'invalid-row', line: i + 2 }
    const [rowBranch, postedOn, reference, direction, amountPaise] = parsed.data
    if (rowBranch !== branch || postedOn > today) return { error: 'invalid-row', line: i + 2 }
    if (seen.has(reference)) return { error: 'duplicate-reference', line: i + 2 }
    seen.add(reference)
    rows.push({ postedOn, reference, direction, amountPaise })
  }
  return { rows }
}
