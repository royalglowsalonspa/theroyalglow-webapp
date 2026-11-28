import { type InvoiceCoverageIdentity, MAX_INVOICE_SOURCE_COVERAGE_ROWS } from '@rgss/types'
import { invoiceId as invoiceIdSchema } from './contracts'

export type CloseRegisters = { invoices: string; lineTax: string }

export type CloseChange = {
  invoiceId: string
  invoiceNumber: string
  kind: 'added' | 'changed' | 'missing'
  headerChanged: boolean
  lineTaxChanged: boolean
}

type CloseInvoice = { number: string; header: string; lines: string[] }
export type CloseRegisterInvoice = InvoiceCoverageIdentity & {
  invoiceNumber: string
  financialYear: string
}

function unquote(field: string): string {
  return field.startsWith('"') ? field.slice(1, -1).replaceAll('""', '"') : field
}

// Decode only the invoice fields needed by the comparison and review.
function readCsv(
  csv: string,
  visit: (
    id: string,
    number: string,
    row: string,
    totalPaise: string,
    financialYear: string,
  ) => boolean,
  includeIssueFacts = false,
): string | null {
  const first = csv.startsWith('\uFEFF') ? 1 : 0
  const newline = csv.indexOf('\n', first)
  const headerEnd = newline === -1 ? csv.length : newline
  const header = csv.slice(
    first,
    newline !== -1 && csv[headerEnd - 1] === '\r' ? headerEnd - 1 : headerEnd,
  )
  if (!/^invoice_id,invoice_number(?:,[a-z_][a-z0-9_]*)*$/.test(header)) return null
  const columns = header.split(',')
  if (new Set(columns).size !== columns.length) return null
  const amountColumn = includeIssueFacts ? columns.indexOf('total_paise') : -1
  const yearColumn = includeIssueFacts ? columns.indexOf('financial_year') : -1
  if (includeIssueFacts && (amountColumn === -1 || yearColumn === -1)) return null
  let rowStart = headerEnd + 1
  let fieldStart = rowStart
  let field = 0
  let id = ''
  let number = ''
  let totalPaise = ''
  let financialYear = ''

  for (let i = rowStart; i <= csv.length && rowStart < csv.length; i++) {
    if (csv[i] === '"') {
      if (i !== fieldStart) return null
      for (;;) {
        const quote = csv.indexOf('"', i + 1)
        if (quote === -1) return null
        i = quote + 1
        if (csv[i] !== '"') break
      }
      if (i < csv.length && csv[i] !== ',' && csv[i] !== '\r' && csv[i] !== '\n') return null
    }

    const separator = csv[i]
    if (separator !== ',' && separator !== '\r' && separator !== '\n' && i < csv.length) {
      continue
    }
    if (field === 0) id = unquote(csv.slice(fieldStart, i))
    if (field === 1) number = unquote(csv.slice(fieldStart, i))
    if (field === amountColumn) totalPaise = unquote(csv.slice(fieldStart, i))
    if (field === yearColumn) financialYear = unquote(csv.slice(fieldStart, i))
    field++
    if (separator === ',') {
      fieldStart = i + 1
      continue
    }

    // The exporter protects a leading dash. The canonical ID cannot contain an apostrophe.
    const parsed = invoiceIdSchema.safeParse(id.startsWith("'-") ? id.slice(1) : id)
    if (
      field !== columns.length ||
      !parsed.success ||
      !number ||
      !visit(parsed.data, number, csv.slice(rowStart, i), totalPaise, financialYear)
    ) {
      return null
    }
    if (separator === '\r') {
      if (csv[i + 1] !== '\n') return null
      i++
    }
    rowStart = i + 1
    fieldStart = rowStart
    field = 0
  }
  return header
}

export function readCloseRegisterInvoices(csv: string): CloseRegisterInvoice[] | null {
  const invoices = new Map<string, CloseRegisterInvoice>()
  const header = readCsv(
    csv,
    (invoiceId, invoiceNumber, _row, value, financialYear) => {
      const totalPaise = Number(value)
      if (
        invoices.size >= MAX_INVOICE_SOURCE_COVERAGE_ROWS ||
        invoices.has(invoiceId) ||
        !/^\d+$/.test(value) ||
        !Number.isSafeInteger(totalPaise)
      )
        return false
      invoices.set(invoiceId, { invoiceId, invoiceNumber, totalPaise, financialYear })
      return true
    },
    true,
  )
  return header === null ? null : [...invoices.values()]
}

function readRegisters(registers: CloseRegisters) {
  const invoices = new Map<string, CloseInvoice>()
  const header = readCsv(registers.invoices, (id, number, row) => {
    if (invoices.has(id)) return false
    invoices.set(id, { number, header: row, lines: [] })
    return true
  })
  if (header === null) return null

  const lineHeader = readCsv(registers.lineTax, (id, number, row) => {
    const invoice = invoices.get(id)
    if (invoice?.number !== number || invoice.lines.includes(row)) return false
    invoice.lines.push(row)
    return true
  })
  if (lineHeader === null || [...invoices.values()].some((invoice) => !invoice.lines.length)) {
    return null
  }
  return { header, lineHeader, invoices }
}

export function compareCloseRegisters(
  saved: CloseRegisters,
  current: CloseRegisters,
): CloseChange[] | null {
  const before = readRegisters(saved)
  const after = readRegisters(current)
  if (
    !before ||
    !after ||
    before.header !== after.header ||
    before.lineHeader !== after.lineHeader
  ) {
    return null
  }

  const ids = [...new Set([...before.invoices.keys(), ...after.invoices.keys()])].sort()
  const changes: CloseChange[] = []
  for (const invoiceId of ids) {
    const previous = before.invoices.get(invoiceId)
    const next = after.invoices.get(invoiceId)
    const invoice = next ?? previous
    if (!invoice) continue
    const headerChanged = previous?.header !== next?.header
    const lineTaxChanged =
      !previous ||
      !next ||
      previous.lines.length !== next.lines.length ||
      previous.lines.some((row, i) => row !== next.lines[i])
    if (headerChanged || lineTaxChanged) {
      changes.push({
        invoiceId,
        invoiceNumber: invoice.number,
        kind: !previous ? 'added' : !next ? 'missing' : 'changed',
        headerChanged,
        lineTaxChanged,
      })
    }
  }
  return changes
}
