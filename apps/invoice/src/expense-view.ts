import { formatINR, IST_TIME_ZONE } from '@rgss/business'
import { html } from 'hono/html'
import {
  type ExpenseBill,
  expenseCategories,
  type SupplierPayment,
  supplierPaymentMethods,
} from './expense-store'

const base = '/portal/expenses'
const timestamp = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})
const categoryLabels = {
  consumables: 'Consumables',
  rent: 'Rent',
  utilities: 'Utilities',
  other: 'Other',
}
const methodLabels = { cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer' }
const amountPattern = '\\d{1,8}(\\.\\d{1,2})?'

export function expenseBillLink(branch: string, billId: string, subpath = ''): string {
  return `${base}/bills/${encodeURIComponent(billId)}${subpath}?${new URLSearchParams({ branch })}`
}

export function expenseMonthLink(branch: string, month: string, page = 1): string {
  return `${base}?${new URLSearchParams({ branch, month, page: String(page) })}`
}

function page(title: string, content: ReturnType<typeof html>) {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>${title} · Royal Glow invoices</title></head>
    <body><main class="dashboard"><nav aria-label="Invoice portal"><a href="/portal/home">Dashboard</a>
    <a href="${base}">Supplier expenses</a></nav><h1>${title}</h1>${content}</main></body></html>`
}

function pages(current: number, more: boolean, link: (page: number) => string) {
  if (current === 1 && !more) return ''
  return html`<nav class="close-pages" aria-label="Pagination">
    ${current > 1 ? html`<a href="${link(current - 1)}">Previous page</a>` : ''}
    <span>Page ${current}</span>${more ? html`<a href="${link(current + 1)}">Next page</a>` : ''}
  </nav>`
}

function billStatus(bill: ExpenseBill) {
  if (bill.voidedAt !== null) return 'Voided'
  if (bill.paidPaise === bill.totalPaise) return 'Paid'
  return bill.paidPaise > 0 ? 'Part-paid' : 'Unpaid'
}

function billFields(branch: string, date: string, today: string) {
  return html`<h2>Record a supplier bill</h2><form method="post" action="${base}/bills">
    <input type="hidden" name="branch" value="${branch}">
    <input type="hidden" name="requestId" value="${crypto.randomUUID()}">
    <label>Supplier <input name="supplier" required maxlength="120"></label>
    <label>Bill number <input name="billNumber" required maxlength="80"></label>
    <label>Bill date (IST) <input type="date" name="billedOn" value="${date}" max="${today}" required></label>
    <label>Category <select name="category" required>
      ${expenseCategories.map((value) => html`<option value="${value}">${categoryLabels[value]}</option>`)}
    </select></label>
    <label>Bill total (₹) <input name="amount" inputmode="decimal" pattern="${amountPattern}" required></label>
    <label>Recorded GST (₹, if known) <input name="gst" inputmode="decimal" pattern="${amountPattern}"></label>
    <button type="submit">Record bill</button>
  </form>`
}

export function renderExpenses({
  branches,
  branch,
  month,
  today,
  bills,
  current,
  more,
  canEnter,
}: {
  branches: string[]
  branch?: string | undefined
  month: string
  today: string
  bills: ExpenseBill[]
  current: number
  more: boolean
  canEnter: boolean
}) {
  return page(
    'Supplier expenses',
    html`<form method="get" action="${base}" class="dashboard-filters">
    <label>Branch <select name="branch" required><option value="">Choose a branch</option>
      ${branches.map((item) => html`<option value="${item}" ${item === branch ? 'selected' : ''}>${item}</option>`)}
    </select></label>
    <label>Bill month (IST) <input type="month" name="month" value="${month}" max="${today.slice(0, 7)}" required></label>
    <button type="submit">Show bills</button>
  </form>${
    branch
      ? html`
    <h2>Purchase register</h2>
    <p><a href="${base}/register.csv?${new URLSearchParams({ branch, month })}">Download purchase register CSV</a></p>
    ${
      bills.length
        ? html`<ul aria-label="Supplier bills">${bills.map(
            (bill) => html`<li>
      <a href="${expenseBillLink(branch, bill.id)}">${bill.supplier} · ${bill.billNumber}</a><br>
      <time datetime="${bill.billedOn}">${bill.billedOn}</time> · ${categoryLabels[bill.category]} ·
      ${formatINR(bill.totalPaise)} · ${billStatus(bill)}${bill.evidenceSha256 ? '' : ' · PDF missing'}
    </li>`,
          )}</ul>`
        : html`<p>No supplier bills on this page.</p>`
    }
    ${pages(current, more, (next) => expenseMonthLink(branch, month, next))}
    ${canEnter ? billFields(branch, month === today.slice(0, 7) ? today : `${month}-01`, today) : ''}
  `
      : ''
  }`,
  )
}

function correctionForm(branch: string, billId: string, paymentId?: string) {
  const label = paymentId ? 'payment' : 'bill'
  return html`<form method="post" action="${base}/void">
    <input type="hidden" name="branch" value="${branch}">
    <input type="hidden" name="billId" value="${billId}">
    ${paymentId ? html`<input type="hidden" name="paymentId" value="${paymentId}">` : ''}
    <label>Reason to void ${label} <input name="reason" maxlength="500" required></label>
    <button type="submit">Void ${label} record</button>
  </form>`
}

function audit(record: ExpenseBill | SupplierPayment) {
  return html`<small>Recorded by ${record.recordedBy} · ${timestamp.format(record.recordedAt)} IST</small>
    ${
      record.voidedAt === null
        ? ''
        : html`<br><small>Voided by ${record.voidedBy} ·
      ${timestamp.format(record.voidedAt)} IST · ${record.voidReason}</small>`
    }`
}

export function renderExpenseBill({
  branch,
  bill,
  payments,
  canEnter,
  isOwner,
  today,
  current,
  more,
}: {
  branch: string
  bill: ExpenseBill
  payments: SupplierPayment[]
  canEnter: boolean
  isOwner: boolean
  today: string
  current: number
  more: boolean
}) {
  const active = bill.voidedAt === null
  const remaining = bill.totalPaise - bill.paidPaise
  return page(
    `${bill.supplier} · ${bill.billNumber}`,
    html`
    <p><a href="${expenseMonthLink(branch, bill.billedOn.slice(0, 7))}">Back to branch purchase register</a></p>
    <p>${branch} · <time datetime="${bill.billedOn}">${bill.billedOn}</time> IST · ${categoryLabels[bill.category]} · ${billStatus(bill)}<br>
      ${audit(bill)}</p>
    <dl class="dashboard-totals"><div><dt>Bill total</dt><dd>${formatINR(bill.totalPaise)}</dd></div>
      <div><dt>Recorded GST</dt><dd>${bill.gstPaise === null ? 'Unknown' : formatINR(bill.gstPaise)}</dd></div>
      <div><dt>Paid</dt><dd>${formatINR(bill.paidPaise)}</dd></div>
      <div><dt>Outstanding</dt><dd>${active ? formatINR(remaining) : 'Voided'}</dd></div></dl>
    <h2>Bill evidence</h2>${bill.evidenceSha256 ? html`<p><a href="${expenseBillLink(branch, bill.id, '/evidence')}" download>Download supplier PDF</a></p>` : html`<p>Supplier PDF missing.</p>`}
    ${
      active && canEnter && !bill.evidenceSha256
        ? html`<form method="post" enctype="multipart/form-data" action="${expenseBillLink(branch, bill.id, '/evidence')}">
      <label>Supplier PDF (up to 1 MiB) <input type="file" name="file" accept="application/pdf,.pdf" required></label>
      <button type="submit">Attach PDF</button>
    </form>`
        : ''
    }
    <h2>Payments</h2>${
      payments.length
        ? html`<ul aria-label="Supplier payments">${payments.map(
            (payment) => html`<li>
      <time datetime="${payment.paidOn}">${payment.paidOn}</time> IST · ${formatINR(payment.amountPaise)} ·
      ${methodLabels[payment.method]}${payment.reference ? ` · ${payment.reference}` : ''}<br>${audit(payment)}
      ${isOwner && payment.voidedAt === null ? correctionForm(branch, bill.id, payment.id) : ''}
    </li>`,
          )}</ul>`
        : html`<p>No payments on this page.</p>`
    }
    ${pages(current, more, (next) => `${expenseBillLink(branch, bill.id)}&page=${next}`)}
    ${
      isOwner && active && remaining > 0
        ? html`<h2>Record a completed payment</h2>
      <form method="post" action="${base}/payments">
        <input type="hidden" name="branch" value="${branch}">
        <input type="hidden" name="billId" value="${bill.id}">
        <input type="hidden" name="requestId" value="${crypto.randomUUID()}">
        <label>Payment date (IST) <input type="date" name="paidOn" value="${today}" min="${bill.billedOn}" max="${today}" required></label>
        <label>Paid amount (₹) <input name="amount" inputmode="decimal" pattern="${amountPattern}" required></label>
        <label>Method <select name="method" required>
          ${supplierPaymentMethods.map((value) => html`<option value="${value}">${methodLabels[value]}</option>`)}
        </select></label>
        <label>Reference (required for non-cash) <input name="reference" maxlength="100"></label>
        <button type="submit">Record payment</button>
      </form>`
        : ''
    }
    ${isOwner && active && bill.paidPaise === 0 ? html`<h2>Correct a bill</h2>${correctionForm(branch, bill.id)}` : ''}`,
  )
}
