import { formatDateIN, formatINR, IST_TIME_ZONE, istToday } from '@rgss/business'
import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { html } from 'hono/html'
import { z } from 'zod'
import { invoiceId } from './contracts'
import type { PortalEnv } from './env'
import { monthlyCloseBranchRole } from './monthly-close-store'
import {
  parseStatementCsv,
  STATEMENT_CSV_HEADER,
  STATEMENT_MAX_BYTES,
  STATEMENT_MAX_ROWS,
  type StatementEntry,
} from './statement-csv'
import {
  readStatementHistory,
  readStatementImport,
  saveStatementImport,
  statementDigest,
} from './statement-store'

const importPath = '/portal/statements'
const timestamp = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})
const filters = z.object({
  branch: invoiceId.optional(),
  id: z.uuidv4().optional(),
  before: z.uuidv4().optional(),
})
const upload = z.strictObject({
  branch: invoiceId,
  account: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/)
    .toUpperCase(),
  statement: z.string().min(1).max(STATEMENT_MAX_BYTES),
})
const confirm = upload.extend({ digest: z.hash('sha256', { enc: 'hex' }) })

function statementUrl(branch: string, extra: Record<string, string> = {}) {
  return `${importPath}?${new URLSearchParams({ branch, ...extra })}`
}

function page(body: ReturnType<typeof html>, branch?: string) {
  const scope = branch ? `?${new URLSearchParams({ branch })}` : ''
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>Bank and provider statements · Royal Glow</title>
    </head><body><main class="dashboard"><nav aria-label="Invoice portal">
      <a href="/portal/home${scope}">Invoice dashboard</a>
      <a href="/portal/cash-close${scope}">Daily cash close</a>
    </nav><h1>Bank and provider statements</h1>${body}</main></body></html>`
}

function statementRows(
  rows: (StatementEntry & { cashCloseDay?: string | null })[],
  branch: string,
  saved: boolean,
) {
  return html`<div class="gst-review-table"><table><thead><tr>
    <th scope="col">Posted on</th><th scope="col">Reference</th><th scope="col">Direction</th>
    ${saved ? html`<th scope="col">Cash close</th>` : ''}<th scope="col">Amount</th>
    </tr></thead><tbody>${rows.map(
      (row) => html`<tr>
        <td><time datetime="${row.postedOn}">${formatDateIN(new Date(`${row.postedOn}T00:00:00Z`))}</time></td>
        <td>${row.reference}</td><td>${row.direction === 'credit' ? 'Credit' : 'Debit'}</td>
        ${
          saved
            ? html`<td>${
                row.cashCloseDay
                  ? html`<a href="/portal/cash-close?${new URLSearchParams({ branch, day: row.cashCloseDay })}">Possible cash-close match</a>`
                  : '—'
              }</td>`
            : ''
        }
        <td>${formatINR(row.amountPaise)}</td>
      </tr>`,
    )}</tbody></table></div>`
}

export const statementRoutes = new Hono<PortalEnv>()

statementRoutes.get('/', async (c) => {
  const selection = filters.safeParse({
    branch: c.req.query('branch') || undefined,
    id: c.req.query('import'),
    before: c.req.query('before'),
  })
  if (!selection.success) return c.text('Choose a valid branch and statement.', 400)
  const { branch, id, before } = selection.data
  const email = c.get('email')
  const { results: grants } = await c.env.DB.prepare(`
    SELECT branch_id AS branch, role FROM invoice_effective_grant
    WHERE email = ? AND role IN ('owner', 'manager', 'accountant') ORDER BY branch_id
  `)
    .bind(email)
    .all<{ branch: string; role: 'owner' | 'manager' | 'accountant' }>()
  const grant = grants.find((row) => row.branch === branch)
  if (branch && !grant) return c.notFound()
  const history = branch ? await readStatementHistory(c.env, email, branch, before) : null
  const result = branch && id ? await readStatementImport(c.env, email, branch, id) : null
  if (id && !result) return c.notFound()

  return c.html(
    page(
      html`
    <form action="${importPath}" method="get" class="dashboard-filters">
      <label>Branch<select name="branch" required><option value="">Select a branch</option>
        ${grants.map((row) => html`<option value="${row.branch}" ${row.branch === branch ? 'selected' : ''}>${row.branch}</option>`)}
      </select></label><button type="submit">View statements</button>
    </form>
    ${
      grant && grant.role !== 'accountant'
        ? html`<h2>Import transactions</h2>
          <form action="${importPath}/preview" method="post" enctype="multipart/form-data" class="close-review-form">
            <input type="hidden" name="branch" value="${branch}">
            <label>Account or provider label
              <input name="account" required maxlength="40" aria-describedby="account-help">
            </label><p id="account-help" class="dashboard-note">Use a consistent label without an account number. Use letters, digits, hyphens, or underscores and start with a letter.</p>
            <label>Transactions CSV
              <input name="statement" type="file" accept=".csv,text/csv" required aria-describedby="statement-format">
            </label><p id="statement-format" class="dashboard-note">Choose a UTF-8 CSV with up to ${STATEMENT_MAX_ROWS} INR transactions for this branch, up to 32 KiB. Use this header.<br>
              <code class="email-address">${STATEMENT_CSV_HEADER}</code><br>
              Use YYYY-MM-DD statement dates, unique references of 4 to 80 characters, <code>credit</code> or <code>debit</code>, and positive whole paise.</p>
            <button type="submit">Preview import</button>
          </form>`
        : ''
    }
    ${
      branch && result
        ? html`<h2>Imported transactions for ${result.receipt.account}</h2>
          <p class="dashboard-note">${result.receipt.rowCount} transactions · Imported by <span class="email-address">${result.receipt.importedBy}</span> · <time datetime="${new Date(result.receipt.importedAt).toISOString()}">${timestamp.format(result.receipt.importedAt)} IST</time></p>
          ${statementRows(result.entries, branch, true)}`
        : ''
    }
    ${
      branch && history
        ? html`<h2>Statement history</h2>
          ${history.imports.length ? html`<ul>${history.imports.map((receipt) => html`<li><a href="${statementUrl(branch, { import: receipt.id })}">${receipt.account} · ${receipt.rowCount} transactions · ${timestamp.format(receipt.importedAt)} IST</a></li>`)}</ul>` : html`<p>No statements on this page.</p>`}
          ${history.next ? html`<p><a href="${statementUrl(branch, { before: history.next })}">Older statements</a></p>` : ''}
          ${before ? html`<p><a href="${statementUrl(branch)}">Latest statements</a></p>` : ''}`
        : ''
    }
  `,
      branch,
    ),
  )
})

statementRoutes.use(
  '*',
  bodyLimit({
    maxSize: 128 * 1024,
    onError: (c) => c.text('Statement form is too large.', 413),
  }),
)

statementRoutes.post('/preview', (c) => handleUpload(c, false))
statementRoutes.post('/import', (c) => handleUpload(c, true))

async function handleUpload(c: Context<PortalEnv>, shouldSave: boolean) {
  if (c.req.header('origin') !== new URL(c.req.url).origin)
    return c.text('Same-origin form required.', 403)
  const contentType = c.req.header('content-type')?.split(';')[0]
  const fileUpload = !shouldSave && contentType === 'multipart/form-data'
  if (!fileUpload && contentType !== 'application/x-www-form-urlencoded')
    return c.text('Expected a statement form.', 415)

  let payload: Awaited<ReturnType<typeof c.req.parseBody>>
  try {
    payload = await c.req.parseBody({ all: true })
    if (fileUpload) {
      const file = payload.statement
      if (!(file instanceof File)) return c.text('Choose a CSV file.', 400)
      if (file.size > STATEMENT_MAX_BYTES) return c.text('Choose a CSV within 32 KiB.', 413)
      payload.statement = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
        await file.arrayBuffer(),
      )
    }
  } catch {
    return c.text('Choose a valid UTF-8 CSV file.', 400)
  }
  const form = shouldSave ? confirm.safeParse(payload) : upload.safeParse(payload)
  if (!form.success) return c.text('Check the statement, branch, and account label.', 400)
  const { branch, account, statement } = form.data
  const email = c.get('email')
  const role = await monthlyCloseBranchRole(c.env, email, branch)
  if (!role) return c.notFound()
  if (role === 'accountant') return c.text('Statement imports are read-only for accountants.', 403)

  const parsed = parseStatementCsv(statement, branch, istToday())
  if ('error' in parsed) {
    const error =
      'line' in parsed
        ? `Line ${parsed.line} ${parsed.error === 'duplicate-reference' ? 'repeats a reference.' : 'has an invalid field. Check the branch, date, reference, direction and amount.'}`
        : `Check the CSV header and include 1 to ${STATEMENT_MAX_ROWS} transactions within 32 KiB.`
    return c.html(
      page(
        html`<p role="alert">${error}</p><p><a href="${statementUrl(branch)}">Return to statements</a></p>`,
        branch,
      ),
      422,
    )
  }

  const digest = await statementDigest(branch, account, parsed.rows)
  if (!shouldSave) {
    return c.html(
      page(
        html`<h2>Preview ${parsed.rows.length} transactions for ${account}</h2>
      <p class="dashboard-note">Review the dates, directions and amounts before saving to ${branch}.</p>
      ${statementRows(parsed.rows, branch, false)}
      <form action="${importPath}/import" method="post">
        <input type="hidden" name="branch" value="${branch}">
        <input type="hidden" name="account" value="${account}">
        <input type="hidden" name="statement" value="${statement}">
        <input type="hidden" name="digest" value="${digest}">
        <button type="submit">Confirm import</button><a href="${statementUrl(branch)}">Cancel</a>
      </form>`,
        branch,
      ),
    )
  }
  if (!('digest' in form.data) || form.data.digest !== digest)
    return c.text('The statement changed. Preview it again.', 409)

  const result = await saveStatementImport(c.env, {
    email,
    branch,
    account,
    digest,
    entries: parsed.rows,
  })
  if ('id' in result) return c.redirect(statementUrl(branch, { import: result.id }), 303)
  if (result.error === 'forbidden')
    return c.text('You no longer have permission to import for this branch.', 403)
  return c.html(
    page(
      html`<p role="alert">A reference already exists for this branch and account. Submit a statement containing only new transactions.</p><p><a href="${statementUrl(branch)}">Return to statements</a></p>`,
      branch,
    ),
    409,
  )
}
