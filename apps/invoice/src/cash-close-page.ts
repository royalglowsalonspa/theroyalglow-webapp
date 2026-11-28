import { istDateInDays, istToday } from '@rgss/business'
import { invoiceReconciliationMonthSchema } from '@rgss/types'
import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { downloadCashCloseMonth } from './cash-close-month-csv'
import { readCashCloseMonth } from './cash-close-month-data'
import { renderCashCloseMonth } from './cash-close-month-view'
import { approveCashCloseDraft, listCashCloseDrafts, saveCashCloseDraft } from './cash-close-store'
import { renderCashClose } from './cash-close-view'
import {
  readCashDepositEvidence,
  recordCashDepositEvidence,
  voidCashDepositEvidence,
} from './cash-deposit-store'
import { readCollectionsSnapshot } from './collections-snapshot'
import { invoiceId } from './contracts'
import type { PortalEnv } from './env'
import { monthlyCloseBranchRole } from './monthly-close-store'

const businessDate = z.iso.date().refine((day) => day >= '0001-01-01')
const draftId = z.uuidv4().transform((id) => id.toLowerCase())
const selection = z.object({ branch: invoiceId.optional(), day: businessDate.optional() })
const monthSelection = z.object({
  branch: invoiceId.optional(),
  month: invoiceReconciliationMonthSchema.optional(),
})
const monthDownloadSelection = z.object({
  branch: invoiceId,
  month: invoiceReconciliationMonthSchema,
})
const approvalForm = z.strictObject({
  branch: invoiceId,
  day: businessDate,
  draftId,
  approvalNote: z.string().trim().max(500),
})
const rupees = z
  .string()
  .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
  .transform((value) => {
    const [whole, fraction = ''] = value.split('.')
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  })
const depositForm = z.strictObject({
  branch: invoiceId,
  day: businessDate,
  draftId,
  requestId: draftId,
  creditDate: businessDate,
  bankReference: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9./_-]{3,79}$/),
  bankAmount: rupees.pipe(z.int().positive()),
})
const voidDepositForm = z.strictObject({
  branch: invoiceId,
  day: businessDate,
  evidenceId: z
    .string()
    .regex(/^[1-9]\d{0,15}$/)
    .transform(Number)
    .pipe(z.int().positive()),
  voidReason: z.string().trim().min(1).max(500),
})
const depositMessage = z.enum(['recorded', 'voided', 'already-voided'])
const saveForm = z.strictObject({
  branch: invoiceId,
  day: businessDate,
  draftId,
  observedAt: z.iso.datetime(),
  serviceCashPaise: z
    .string()
    .regex(/^\d{1,16}$/)
    .transform(Number)
    .pipe(z.int().nonnegative()),
  opening: rupees,
  otherReceipts: rupees,
  refunds: rupees,
  payouts: rupees,
  deposits: rupees,
  counted: rupees,
  note: z.string().trim().max(500),
})

function latestClosedDay() {
  return istDateInDays(new Date(), -1)
}

async function assignedCashBranches(env: PortalEnv['Bindings'], email: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`
    SELECT branch_id FROM invoice_effective_grant
    WHERE email = ? AND role IN ('owner', 'manager', 'accountant') ORDER BY branch_id
  `)
    .bind(email)
    .all<{ branch_id: string }>()
  return results.map(({ branch_id }) => branch_id)
}

async function page(
  c: Context<PortalEnv>,
  { branch, day }: { branch?: string | undefined; day: string },
  latestDay: string,
  state: {
    saved?: string
    approved?: string
    approvalNote?: string
    depositMessage?: z.infer<typeof depositMessage>
    depositValues?: { creditDate: string; bankReference: string; bankAmount: string }
    error?: string
    status?: 409 | 422
    values?: Record<string, string>
  } = {},
): Promise<Response> {
  const email = c.get('email')
  const branches = await assignedCashBranches(c.env, email)
  if (branch && !branches.includes(branch)) return c.notFound()

  const [snapshot, drafts, deposit] = await Promise.all([
    branch ? readCollectionsSnapshot(c.env, branch, day.slice(0, 7)) : null,
    branch ? listCashCloseDrafts(c.env, email, branch, day) : [],
    branch ? readCashDepositEvidence(c.env, email, branch, day) : null,
  ])
  const role = branch ? await monthlyCloseBranchRole(c.env, email, branch) : null
  if (branch && !role) return c.notFound()
  const depositStatus =
    state.depositMessage === 'recorded'
      ? deposit?.active
        ? state.depositMessage
        : undefined
      : deposit?.voided.length
        ? state.depositMessage
        : undefined
  const source =
    snapshot && istToday(new Date(snapshot.observedAt)) > day
      ? {
          observedAt: snapshot.observedAt,
          serviceCashPaise:
            snapshot.rows.find((row) => row.day === day && row.method === 'cash')?.totalPaise ?? 0,
        }
      : null

  return c.html(
    renderCashClose({
      branches,
      ...(branch ? { branch } : {}),
      day,
      latestDay,
      today: istToday(),
      canEdit: role === 'owner' || role === 'manager',
      canApprove: role === 'owner',
      draftId: crypto.randomUUID(),
      source,
      drafts,
      saved: drafts.some((draft) => draft.id === state.saved),
      approved: drafts.some((draft) => draft.id === state.approved && draft.approval),
      deposit: deposit?.active ?? null,
      voidedDeposits: deposit?.voided ?? [],
      depositRequestId: crypto.randomUUID(),
      ...(depositStatus ? { depositMessage: depositStatus } : {}),
      ...(state.depositValues ? { depositValues: state.depositValues } : {}),
      ...(state.approvalNote ? { approvalNote: state.approvalNote } : {}),
      ...(state.error ? { error: state.error } : {}),
      ...(state.values ? { values: state.values } : {}),
    }),
    state.status ?? 200,
  )
}

export const cashCloseRoutes = new Hono<PortalEnv>()

cashCloseRoutes.get('/month', async (c) => {
  const filters = monthSelection.safeParse({
    branch: c.req.query('branch') || undefined,
    month: c.req.query('month'),
  })
  if (!filters.success) return c.text('Choose a valid cash close month and branch.', 400)

  const now = new Date()
  const currentMonth = istToday(now).slice(0, 7)
  const lastClosedDay = istDateInDays(now, -1)
  const { branch, month = lastClosedDay.slice(0, 7) } = filters.data
  if (month > currentMonth) return c.text('Choose the current month or an earlier month.', 422)

  const email = c.get('email')
  const branches = await assignedCashBranches(c.env, email)
  if (branch && !branches.includes(branch)) return c.notFound()
  const review = branch
    ? await readCashCloseMonth(c.env, email, branch, month, lastClosedDay)
    : null
  if (branch && !review) return c.notFound()

  return c.html(
    renderCashCloseMonth({ branches, ...(branch ? { branch } : {}), month, currentMonth, review }),
  )
})

cashCloseRoutes.get('/month.csv', async (c): Promise<Response> => {
  const filters = monthDownloadSelection.safeParse({
    branch: c.req.query('branch'),
    month: c.req.query('month'),
  })
  if (!filters.success) return c.text('Choose a branch and business month before downloading.', 400)

  const now = new Date()
  const { branch, month } = filters.data
  if (month > istToday(now).slice(0, 7))
    return c.text('Choose the current month or an earlier month.', 422)
  return downloadCashCloseMonth(c.env, c.get('email'), branch, month, istDateInDays(now, -1))
})

cashCloseRoutes.get('/', async (c) => {
  const filters = selection.safeParse({
    branch: c.req.query('branch') || undefined,
    day: c.req.query('day'),
  })
  const latestDay = latestClosedDay()
  if (!filters.success || (filters.data.day && filters.data.day > latestDay)) {
    return c.text('Choose a branch and a completed IST business date.', 400)
  }
  const saved = draftId.safeParse(c.req.query('saved'))
  const approved = draftId.safeParse(c.req.query('approved'))
  const depositStatus = depositMessage.safeParse(c.req.query('deposit'))
  return page(c, { branch: filters.data.branch, day: filters.data.day ?? latestDay }, latestDay, {
    ...(saved.success ? { saved: saved.data } : {}),
    ...(approved.success ? { approved: approved.data } : {}),
    ...(depositStatus.success ? { depositMessage: depositStatus.data } : {}),
  })
})

cashCloseRoutes.post(
  '/',
  bodyLimit({ maxSize: 8192, onError: (c) => c.text('Cash close form is too large.', 413) }),
  async (c) => {
    if (c.req.header('origin') !== new URL(c.req.url).origin)
      return c.text('Same-origin form required.', 403)
    if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
      return c.text('Expected a cash close form.', 415)

    const body = await c.req.parseBody({ all: true })
    const form = saveForm.safeParse(body)
    const latestDay = latestClosedDay()
    if (!form.success || form.data.day > latestDay)
      return c.text('Check the branch, completed IST date, and rupee amounts.', 400)

    const input = form.data
    const email = c.get('email')
    const role = await monthlyCloseBranchRole(c.env, email, input.branch)
    if (!role) return c.notFound()
    if (role === 'accountant')
      return c.text('Cash close drafts are read-only for accountants.', 403)

    const { branch, day, observedAt, serviceCashPaise, note } = input
    const result = await saveCashCloseDraft(c.env, {
      id: input.draftId,
      email,
      branch,
      day,
      observedAt,
      serviceCashPaise,
      note,
      amounts: {
        openingPaise: input.opening,
        otherReceiptsPaise: input.otherReceipts,
        refundsPaise: input.refunds,
        payoutsPaise: input.payouts,
        depositsPaise: input.deposits,
        countedPaise: input.counted,
      },
    })
    if (result === 'saved' || result === 'replay') {
      return c.redirect(
        `/portal/cash-close?${new URLSearchParams({ branch, day, saved: input.draftId })}`,
        303,
      )
    }
    if (result === 'forbidden')
      return c.text('This branch no longer allows you to save drafts.', 403)
    if (result === 'conflict')
      return c.text('This draft was already saved. Reopen the page to begin a revision.', 409)

    const values = Object.fromEntries(
      Object.entries(body).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
    if (result === 'stale') {
      return page(c, { branch, day }, latestDay, {
        status: 409,
        values,
        error:
          'The collections source changed or is missing. Review the latest source before saving.',
      })
    }
    return page(c, { branch, day }, latestDay, {
      status: 422,
      values,
      error:
        result === 'note-required'
          ? 'Enter a reason for the variance or revision.'
          : 'Check the amounts. Expected cash must be zero or more.',
    })
  },
)

cashCloseRoutes.post(
  '/deposit',
  bodyLimit({ maxSize: 1024, onError: (c) => c.text('Bank credit form is too large.', 413) }),
  async (c) => {
    if (c.req.header('origin') !== new URL(c.req.url).origin)
      return c.text('Same-origin form required.', 403)
    if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
      return c.text('Expected a bank credit form.', 415)

    const form = depositForm.safeParse(await c.req.parseBody({ all: true }))
    const latestDay = latestClosedDay()
    if (
      !form.success ||
      form.data.day > latestDay ||
      form.data.creditDate < form.data.day ||
      form.data.creditDate > istToday()
    ) {
      return c.text(
        'Enter a valid bank reference, positive rupee amount, and credit date between the close date and today.',
        400,
      )
    }

    const { branch, day, draftId: id, requestId, creditDate, bankReference, bankAmount } = form.data
    const email = c.get('email')
    const role = await monthlyCloseBranchRole(c.env, email, branch)
    if (!role) return c.notFound()
    if (role !== 'owner') return c.text('Only a branch owner can record a bank credit.', 403)

    const result = await recordCashDepositEvidence(c.env, {
      email,
      branch,
      day,
      draftId: id,
      requestId,
      creditedOn: creditDate,
      reference: bankReference,
      amountPaise: bankAmount,
    })

    switch (result) {
      case 'recorded':
      case 'replay':
      case 'voided-replay':
        return c.redirect(
          `/portal/cash-close?${new URLSearchParams({ branch, day, deposit: result === 'voided-replay' ? 'already-voided' : 'recorded' })}`,
          303,
        )
      case 'forbidden':
        return c.text('Only a branch owner can record a bank credit.', 403)
      case 'missing':
        return c.notFound()
      case 'stale':
        return page(c, { branch, day }, latestDay, {
          status: 409,
          error:
            'The latest cash close needs an approved revision that matches current recorded service cash.',
        })
      case 'amount-mismatch':
        return page(c, { branch, day }, latestDay, {
          status: 422,
          depositValues: { creditDate, bankReference, bankAmount: (bankAmount / 100).toFixed(2) },
          error:
            'The bank credit amount must equal the approved deposit. Check the statement before saving.',
        })
      case 'day-linked':
      case 'reference-used':
      case 'request-conflict':
        return page(c, { branch, day }, latestDay, {
          status: 409,
          error:
            'This bank credit cannot be linked. Check the reference and any saved link for this day.',
        })
    }
  },
)

cashCloseRoutes.post(
  '/deposit/void',
  bodyLimit({
    maxSize: 8192,
    onError: (c) => c.text('Bank credit correction form is too large.', 413),
  }),
  async (c) => {
    if (c.req.header('origin') !== new URL(c.req.url).origin)
      return c.text('Same-origin form required.', 403)
    if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
      return c.text('Expected a bank credit correction form.', 415)

    const form = voidDepositForm.safeParse(await c.req.parseBody({ all: true }))
    const latestDay = latestClosedDay()
    if (!form.success || form.data.day > latestDay)
      return c.text(
        'Choose a saved bank credit link and enter a correction reason of up to 500 characters.',
        400,
      )

    const { branch, day, evidenceId: id, voidReason: reason } = form.data
    const email = c.get('email')
    const role = await monthlyCloseBranchRole(c.env, email, branch)
    if (!role) return c.notFound()
    if (role !== 'owner') return c.text('Only a branch owner can void a bank credit link.', 403)

    const result = await voidCashDepositEvidence(c.env, { email, branch, day, id, reason })
    switch (result) {
      case 'voided':
      case 'replay':
        return c.redirect(
          `/portal/cash-close?${new URLSearchParams({ branch, day, deposit: 'voided' })}`,
          303,
        )
      case 'missing':
        return c.notFound()
      case 'forbidden':
        return c.text('Only a branch owner can void a bank credit link.', 403)
      case 'conflict':
        return page(c, { branch, day }, latestDay, {
          status: 409,
          error:
            'This bank credit link already has a recorded correction. Review its history below.',
        })
    }
  },
)

cashCloseRoutes.post(
  '/approve',
  bodyLimit({ maxSize: 8192, onError: (c) => c.text('Cash close form is too large.', 413) }),
  async (c) => {
    if (c.req.header('origin') !== new URL(c.req.url).origin)
      return c.text('Same-origin form required.', 403)
    if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
      return c.text('Expected a cash close approval form.', 415)

    const form = approvalForm.safeParse(await c.req.parseBody({ all: true }))
    const latestDay = latestClosedDay()
    if (!form.success || form.data.day > latestDay)
      return c.text('Check the branch, revision, completed IST date, and review note.', 400)

    const { branch, day, draftId: id, approvalNote: note } = form.data
    const email = c.get('email')
    const role = await monthlyCloseBranchRole(c.env, email, branch)
    if (!role) return c.notFound()
    if (role !== 'owner') return c.text('Only a branch owner can approve a cash close.', 403)

    const result = await approveCashCloseDraft(c.env, { id, email, branch, day, note })
    switch (result) {
      case 'approved':
      case 'replay':
        return c.redirect(
          `/portal/cash-close?${new URLSearchParams({ branch, day, approved: id })}`,
          303,
        )
      case 'forbidden':
        return c.text('Only a branch owner can approve a cash close.', 403)
      case 'missing':
        return c.notFound()
      case 'stale':
        return page(c, { branch, day }, latestDay, {
          status: 409,
          error:
            'The draft or recorded service cash changed. Review the current revision before approving.',
        })
      case 'conflict':
        return page(c, { branch, day }, latestDay, {
          status: 409,
          error: 'This revision already has an owner approval. Review the saved approval below.',
        })
      case 'note-required':
        return page(c, { branch, day }, latestDay, {
          status: 422,
          approvalNote: note,
          error: 'Enter an approval note explaining how the cash variance was reviewed.',
        })
    }
  },
)
