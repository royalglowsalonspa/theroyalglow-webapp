import { istToday } from '@rgss/business'
import { invoiceReconciliationMonthSchema } from '@rgss/types'
import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { invoiceId, snapshotHash } from './contracts'
import type { PortalEnv } from './env'
import {
  expenseBranches,
  expenseCategories,
  listExpenseBills,
  listSupplierPayments,
  readExpenseBill,
  recordExpenseEvidence,
  recordExpenseExport,
  saveExpenseBill,
  saveSupplierPayment,
  supplierPaymentMethods,
  voidSupplierRecord,
} from './expense-store'
import { expenseBillLink, renderExpenseBill, renderExpenses } from './expense-view'
import { monthlyCloseBranchRole } from './monthly-close-store'
import { csvCell, csvFile } from './register-csv'

const pageSize = 25
const maxPage = 400
const exportLimit = 500
const maxPdfBytes = 1048576
const pageNumber = z
  .string()
  .regex(/^[1-9]\d{0,2}$/)
  .transform(Number)
  .pipe(z.int().max(maxPage))
const requestId = z.uuidv4().transform((id) => id.toLowerCase())
const businessDate = z.iso.date().refine((day) => day >= '1000-01-01')
const rupees = z
  .string()
  .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
  .transform((value) => {
    const [whole, fraction = ''] = value.split('.')
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  })
const recordedText = (limit: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(limit)
    .refine((value) => !/\p{Cc}/u.test(value))
const billForm = z
  .strictObject({
    branch: invoiceId,
    requestId,
    supplier: recordedText(120),
    billNumber: recordedText(80),
    billedOn: businessDate,
    category: z.enum(expenseCategories),
    amount: rupees.pipe(z.int().positive()),
    gst: z.union([z.literal('').transform(() => null), rupees]),
  })
  .refine(({ amount, gst }) => gst === null || gst <= amount)
const paymentForm = z
  .strictObject({
    branch: invoiceId,
    billId: requestId,
    requestId,
    paidOn: businessDate,
    method: z.enum(supplierPaymentMethods),
    reference: z.union([z.literal('').transform(() => null), recordedText(100)]),
    amount: rupees.pipe(z.int().positive()),
  })
  .refine(({ method, reference }) => method === 'cash' || reference !== null)
const correctionForm = z.strictObject({
  branch: invoiceId,
  billId: requestId,
  paymentId: requestId.optional(),
  reason: recordedText(500),
})
const expenseFilters = z.object({
  branch: invoiceId.optional(),
  month: invoiceReconciliationMonthSchema.optional(),
  page: pageNumber.optional(),
})
const billFilters = z.object({ branch: invoiceId, billId: requestId, page: pageNumber.optional() })
const exportFilters = z.object({ branch: invoiceId, month: invoiceReconciliationMonthSchema })

const formSize = bodyLimit({
  maxSize: 4096,
  onError: (c) => c.text('Expense form is too large.', 413),
})
function checkForm(
  c: Context<PortalEnv>,
  type = 'application/x-www-form-urlencoded',
): Response | undefined {
  if (c.req.header('origin') !== new URL(c.req.url).origin)
    return c.text('Same-origin form required.', 403)
  if (c.req.header('content-type')?.split(';')[0] !== type)
    return c.text('Expected an expense form.', 415)
}

function billKey(id: string, sha256: string) {
  return `finance-evidence/expenses/${id}/${sha256}.pdf`
}

export const expenseRoutes = new Hono<PortalEnv>()

expenseRoutes.get('/', async (c) => {
  const filter = expenseFilters.safeParse(c.req.query())
  if (!filter.success) return c.text('Choose a valid branch and business month.', 400)
  const today = istToday()
  const { branch, month = today.slice(0, 7), page = 1 } = filter.data
  if (month > today.slice(0, 7)) return c.text('Choose the current month or an earlier month.', 400)
  const email = c.get('email')
  const [branches, role] = await Promise.all([
    expenseBranches(c.env, email),
    branch ? monthlyCloseBranchRole(c.env, email, branch) : null,
  ])
  if (branch && !role) return c.notFound()
  const bills = branch
    ? await listExpenseBills(c.env, {
        email,
        branch,
        month,
        limit: pageSize + 1,
        offset: (page - 1) * pageSize,
      })
    : []
  return c.html(
    renderExpenses({
      branches,
      branch,
      month,
      today,
      bills: bills.slice(0, pageSize),
      current: page,
      more: bills.length > pageSize && page < maxPage,
      canEnter: role === 'owner' || role === 'manager',
    }),
  )
})

expenseRoutes.get('/bills/:billId', async (c) => {
  const filter = billFilters.safeParse({ ...c.req.query(), billId: c.req.param('billId') })
  if (!filter.success) return c.notFound()
  const { branch, billId, page = 1 } = filter.data
  const email = c.get('email')
  const scope = { email, branch, billId }
  const [role, bill] = await Promise.all([
    monthlyCloseBranchRole(c.env, email, branch),
    readExpenseBill(c.env, scope),
  ])
  if (!role || !bill) return c.notFound()
  const payments = await listSupplierPayments(c.env, {
    ...scope,
    limit: pageSize + 1,
    offset: (page - 1) * pageSize,
  })
  return c.html(
    renderExpenseBill({
      branch,
      bill,
      payments: payments.slice(0, pageSize),
      canEnter: role === 'owner' || role === 'manager',
      isOwner: role === 'owner',
      today: istToday(),
      current: page,
      more: payments.length > pageSize && page < maxPage,
    }),
  )
})

expenseRoutes.post('/bills', formSize, async (c) => {
  const invalid = checkForm(c)
  if (invalid) return invalid
  const form = billForm.safeParse(await c.req.parseBody({ all: true }))
  if (!form.success || form.data.billedOn > istToday())
    return c.text(
      'Check the supplier, bill date and amounts. Recorded GST cannot exceed the bill total.',
      400,
    )
  const email = c.get('email')
  const {
    branch,
    requestId: id,
    supplier,
    billNumber,
    billedOn,
    category,
    amount: totalPaise,
    gst: gstPaise,
  } = form.data
  const role = await monthlyCloseBranchRole(c.env, email, branch)
  if (!role) return c.notFound()
  if (role === 'accountant') return c.text('Supplier bills are read-only for accountants.', 403)
  if (
    !(await saveExpenseBill(c.env, {
      email,
      branch,
      id,
      supplier,
      billNumber,
      billedOn,
      category,
      totalPaise,
      gstPaise,
    }))
  )
    return c.text(
      'This supplier bill or request already exists. Review the purchase register before retrying.',
      409,
    )
  return c.redirect(expenseBillLink(branch, id), 303)
})

expenseRoutes.post('/payments', formSize, async (c) => {
  const invalid = checkForm(c)
  if (invalid) return invalid
  const form = paymentForm.safeParse(await c.req.parseBody({ all: true }))
  if (!form.success || form.data.paidOn > istToday())
    return c.text('Check the payment date, amount and reference.', 400)
  const email = c.get('email')
  const {
    branch,
    billId,
    requestId: id,
    paidOn,
    method,
    reference,
    amount: amountPaise,
  } = form.data
  const role = await monthlyCloseBranchRole(c.env, email, branch)
  if (!role) return c.notFound()
  if (role !== 'owner') return c.text('Only a branch owner can record supplier payments.', 403)
  if (!(await readExpenseBill(c.env, { email, branch, billId }))) return c.notFound()
  if (
    !(await saveSupplierPayment(c.env, {
      email,
      branch,
      billId,
      id,
      paidOn,
      method,
      reference,
      amountPaise,
    }))
  )
    return c.text('Review the remaining balance, payment date and reference before retrying.', 409)
  return c.redirect(expenseBillLink(branch, billId), 303)
})

expenseRoutes.post('/void', formSize, async (c) => {
  const invalid = checkForm(c)
  if (invalid) return invalid
  const form = correctionForm.safeParse(await c.req.parseBody({ all: true }))
  if (!form.success) return c.text('Choose the supplier record and provide a reason.', 400)
  const email = c.get('email')
  const { branch, billId } = form.data
  const role = await monthlyCloseBranchRole(c.env, email, branch)
  if (!role) return c.notFound()
  if (role !== 'owner') return c.text('Only a branch owner can void supplier records.', 403)
  if (!(await readExpenseBill(c.env, { email, branch, billId }))) return c.notFound()
  if (!(await voidSupplierRecord(c.env, { ...form.data, email })))
    return c.text(
      'Refresh the record and review existing payments or corrections before retrying.',
      409,
    )
  return c.redirect(expenseBillLink(branch, billId), 303)
})

expenseRoutes.post(
  '/bills/:billId/evidence',
  bodyLimit({ maxSize: maxPdfBytes + 4096 }),
  async (c) => {
    const invalid = checkForm(c, 'multipart/form-data')
    if (invalid) return invalid
    const filters = billFilters.safeParse({ ...c.req.query(), billId: c.req.param('billId') })
    if (!filters.success) return c.notFound()
    const { branch, billId } = filters.data
    const email = c.get('email')
    const role = await monthlyCloseBranchRole(c.env, email, branch)
    if (!role) return c.notFound()
    if (role === 'accountant') return c.text('Supplier evidence is read-only for accountants.', 403)
    const bill = await readExpenseBill(c.env, { email, branch, billId })
    if (!bill) return c.notFound()
    if (bill.voidedAt !== null) return c.text('This bill is voided.', 409)
    let fields: Awaited<ReturnType<typeof c.req.parseBody>>
    try {
      fields = await c.req.parseBody({ all: true })
    } catch {
      return c.text('Choose a valid supplier PDF.', 400)
    }
    const file = fields.file
    if (
      Object.keys(fields).length !== 1 ||
      !(file instanceof File) ||
      file.type !== 'application/pdf' ||
      file.size < 5 ||
      file.size > maxPdfBytes
    )
      return c.text('Choose one PDF up to 1 MiB.', 400)
    const bytes = await file.arrayBuffer()
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
      return c.text('Choose a valid supplier PDF.', 400)
    const sha256 = await snapshotHash(bytes)
    if (bill.evidenceSha256 && bill.evidenceSha256 !== sha256)
      return c.text('This bill already has different evidence.', 409)
    const key = billKey(billId, sha256)
    // An interrupted upload can be retried without blocking evidence with different bytes.
    const object =
      (await c.env.FILES.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { sha256 },
      })) ?? (await c.env.FILES.head(key))
    if (object?.customMetadata?.sha256 !== sha256 || object.size !== bytes.byteLength)
      return c.text('Supplier evidence is unavailable.', 503)
    if (
      !(await recordExpenseEvidence(c.env, {
        email,
        branch,
        billId,
        sha256,
        bytes: bytes.byteLength,
      }))
    )
      return c.text(
        'This bill changed while attaching evidence. Review the bill before retrying.',
        409,
      )
    return c.redirect(expenseBillLink(branch, billId), 303)
  },
)

expenseRoutes.get('/bills/:billId/evidence', async (c) => {
  const filters = billFilters.safeParse({ ...c.req.query(), billId: c.req.param('billId') })
  if (!filters.success) return c.notFound()
  const { branch, billId } = filters.data
  const email = c.get('email')
  const bill = await readExpenseBill(c.env, { email, branch, billId })
  if (!bill?.evidenceSha256) return c.notFound()
  const object = await c.env.FILES.get(billKey(billId, bill.evidenceSha256))
  if (!object || object.size !== bill.evidenceBytes)
    return c.text('Supplier evidence is unavailable.', 503)
  const bytes = await object.arrayBuffer()
  if ((await snapshotHash(bytes)) !== bill.evidenceSha256)
    return c.text('Supplier evidence is unavailable.', 503)
  if (!(await monthlyCloseBranchRole(c.env, email, branch))) return c.notFound()
  return c.body(bytes, 200, {
    'content-disposition': `attachment; filename="supplier-bill-${billId}.pdf"`,
    'content-type': 'application/pdf',
  })
})

expenseRoutes.get('/register.csv', async (c) => {
  const filters = exportFilters.safeParse(c.req.query())
  if (!filters.success || filters.data.month > istToday().slice(0, 7))
    return c.text('Choose a valid branch and business month.', 400)
  const { branch, month } = filters.data
  const email = c.get('email')
  if (!(await monthlyCloseBranchRole(c.env, email, branch))) return c.notFound()
  const bills = await listExpenseBills(c.env, {
    email,
    branch,
    month,
    limit: exportLimit + 1,
    offset: 0,
  })
  if (bills.length > exportLimit)
    return c.text('This month exceeds the 500-bill export limit.', 422)
  const rows = [
    'schema_version,branch_id,bill_id,billed_on_ist,supplier,bill_number,category,total_paise,recorded_gst_paise,paid_paise,outstanding_paise,status,pdf_evidence',
  ]
  for (const bill of bills) {
    const voided = bill.voidedAt !== null
    const balance = bill.totalPaise - bill.paidPaise
    rows.push(
      [
        1,
        branch,
        bill.id,
        bill.billedOn,
        bill.supplier,
        bill.billNumber,
        bill.category,
        bill.totalPaise,
        bill.gstPaise,
        bill.paidPaise,
        voided ? null : balance,
        voided ? 'voided' : balance === 0 ? 'paid' : bill.paidPaise > 0 ? 'part_paid' : 'unpaid',
        bill.evidenceSha256 ? 'attached' : 'missing',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  const file = csvFile(rows)
  const id = crypto.randomUUID()
  const sha256 = await snapshotHash(new TextEncoder().encode(file))
  if (
    !(await recordExpenseExport(c.env, {
      email,
      branch,
      id,
      month,
      rowCount: bills.length,
      sha256,
    }))
  )
    return c.notFound()
  return c.body(file, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="supplier-register-${month}.csv"`,
    'x-invoice-report-id': id,
  })
})
