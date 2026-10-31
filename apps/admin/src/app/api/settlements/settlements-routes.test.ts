// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : settlements-routes.test
 * Scope        : Unit tests — cross-branch settlement routes (multi-branch R10)
 *
 * Description  : GET /api/settlements, GET /api/settlements/[id] (JSON and
 *                CSV), POST /api/settlements/[id]/paid and
 *                POST /api/settlements/entries/[id]/reverse:
 *                - statements are for the two branches' Owners and the
 *                  Developer; everyone else gets 404 (settlement.md);
 *                - the Developer reads every pair, an Owner the pairs with a
 *                  branch they own;
 *                - only the paying branch's Owner or the Developer marks a
 *                  statement paid, once, for a date not in the future, and
 *                  an internal transfer only between one Owner's branches;
 *                - only the Developer reverses an entry, with a reason.
 *
 * Approach     : requireSession, @rgss/db/queries and the audit are mocked.
 *                branch-context (the role read from the database now) and
 *                @rgss/business (who sees and settles what, the CSV) stay
 *                REAL, so the access rules are the production ones.
 *
 * Layer        : Testing
 ************************************************************/

import { istToday } from '@rgss/business'
import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  audit: vi.fn(async () => undefined),
}))

const dbMocks = vi.hoisted(() => ({
  getBranchAccessInputs: vi.fn(),
  listSettlementStatements: vi.fn(),
  getOpenSettlementMonths: vi.fn(),
  getSettlementStatement: vi.fn(),
  getSettlementStatementEntries: vi.fn(),
  markSettlementPaid: vi.fn(),
  reverseSettlementEntry: vi.fn(),
}))

vi.mock('@/lib/api/session', () => ({ requireSession: mocks.requireSession }))
vi.mock('@/lib/api/audit', () => ({ audit: mocks.audit }))
vi.mock('@rgss/db/queries', () => dbMocks)

import * as paidRoute from '@/app/api/settlements/[id]/paid/route'
import * as detailRoute from '@/app/api/settlements/[id]/route'
import * as reverseRoute from '@/app/api/settlements/entries/[id]/reverse/route'
import * as listRoute from '@/app/api/settlements/route'

/* ── People and branches ───────────────────────────────────────────────── */

const RS_ROW = {
  id: 'branch_rs',
  name: 'Rayasandra',
  code: 'RS',
  status: 'operational' as const,
  isPrimary: true,
  displayOrder: 1,
  ownerUserId: 'u_owner_rs',
  managerUserId: 'u_manager',
}
const MH_ROW = {
  id: 'branch_mh',
  name: 'Marathahalli',
  code: 'MH',
  status: 'operational' as const,
  isPrimary: false,
  displayOrder: 2,
  ownerUserId: 'u_owner_mh',
  managerUserId: null,
}
const RS = { id: 'branch_rs', name: 'Rayasandra' }
const MH = { id: 'branch_mh', name: 'Marathahalli' }

type Person = 'developer' | 'ownerRs' | 'ownerMh' | 'ownerBoth' | 'manager' | 'customer'

const PEOPLE: Record<Person, { id: string; role: string }> = {
  developer: { id: 'u_dev', role: 'developer' },
  ownerRs: { id: 'u_owner_rs', role: 'owner' },
  ownerMh: { id: 'u_owner_mh', role: 'owner' },
  ownerBoth: { id: 'u_owner_both', role: 'owner' },
  manager: { id: 'u_manager', role: 'manager' },
  customer: { id: 'u_customer', role: 'customer' },
}

/** Sign `person` in: the session, and their role and branches as stored now. */
function signIn(person: Person) {
  const user = PEOPLE[person]
  mocks.requireSession.mockResolvedValue({ user: { id: user.id, role: user.role } })
  const branches =
    person === 'ownerBoth'
      ? [
          { ...RS_ROW, ownerUserId: user.id },
          { ...MH_ROW, ownerUserId: user.id },
        ]
      : [RS_ROW, MH_ROW]
  dbMocks.getBranchAccessInputs.mockResolvedValue({ user, branches, profile: null })
}

/* ── Statements ────────────────────────────────────────────────────────── */

function amounts(membershipPaise: number, gemsPaise: number) {
  return {
    membershipPaise,
    membershipValuePaise: membershipPaise,
    membershipGstSharePaise: 0,
    gemsPaise,
    totalPaise: membershipPaise + gemsPaise,
  }
}

const PAID = {
  paidOn: '2026-10-05',
  reference: 'UTR 4471',
  internalTransfer: false,
  recordedByName: 'Marathahalli Owner',
  recordedAt: '2026-10-05T06:00:00.000Z',
}

/**
 * September 2026 between Marathahalli (A, by byte order) and Rayasandra (B):
 * Marathahalli owes ₹2,500.00 for its member's session at Rayasandra,
 * Rayasandra owes ₹15.00 in gems, so Marathahalli pays ₹2,485.00.
 */
function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stl_1',
    month: '2026-09',
    branchA: MH,
    branchB: RS,
    aOwesB: amounts(250000, 0),
    bOwesA: amounts(0, 1500),
    net: { payingBranch: MH, receivingBranch: RS, amountPaise: 248500 },
    entryCount: 2,
    closedAt: '2026-09-30T19:00:00.000Z',
    paid: null,
    sameOwner: false,
    payingBranchId: MH.id,
    ...overrides,
  }
}

const NOTHING_OWED = {
  net: { payingBranch: null, receivingBranch: null, amountPaise: 0 },
  payingBranchId: null,
  aOwesB: amounts(0, 0),
  bOwesA: amounts(0, 0),
}

const OPEN = [
  {
    month: '2026-10',
    branchA: MH,
    branchB: RS,
    aOwesB: amounts(125000, 0),
    bOwesA: amounts(0, 0),
    net: { payingBranch: MH, receivingBranch: RS, amountPaise: 125000 },
    entryCount: 1,
  },
]

const ENTRIES = [
  {
    id: 'ste_1',
    kind: 'membership_session',
    reversedKind: null,
    month: '2026-09',
    recordedAt: '2026-09-14T06:30:00.000Z',
    owingBranch: MH,
    owedBranch: RS,
    membershipNumber: 'RG-MEM-26-2-12345',
    bookingNumber: 'BK-RS-2609-S-11111-M',
    minutes: 60,
    gems: null,
    valuePaise: 250000,
    gstSharePaise: 0,
    amountOwedPaise: 250000,
    shareBps: 10000,
    gemValuePaise: null,
    reversesEntryId: null,
    note: null,
    reversedByEntryId: null,
  },
  {
    id: 'ste_2',
    kind: 'gems_redemption',
    reversedKind: null,
    month: '2026-09',
    recordedAt: '2026-09-20T10:00:00.000Z',
    owingBranch: RS,
    owedBranch: MH,
    membershipNumber: null,
    bookingNumber: 'BK-MH-2609-H-22222',
    minutes: null,
    gems: 15,
    valuePaise: 1500,
    gstSharePaise: 0,
    amountOwedPaise: 1500,
    shareBps: 10000,
    gemValuePaise: 100,
    reversesEntryId: null,
    note: null,
    reversedByEntryId: null,
  },
]

/* ── Requests ──────────────────────────────────────────────────────────── */

const BASE = 'https://admin.theroyalglow.in/api/settlements'
const params = (id: string) => ({ params: Promise.resolve({ id }) })

const list = (query = '') => listRoute.GET(new Request(`${BASE}${query}`))
const detail = (query = '') =>
  detailRoute.GET(new Request(`${BASE}/stl_1${query}`), params('stl_1'))

function markPaid(body: unknown) {
  return paidRoute.POST(
    new Request(`${BASE}/stl_1/paid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params('stl_1'),
  )
}

function reverse(body: unknown, id = 'ste_1') {
  return reverseRoute.POST(
    new Request(`${BASE}/entries/${id}/reverse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params(id),
  )
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string } }).error
}

const PAYMENT = { paidOn: '2026-10-05', reference: 'UTR 4471' }

beforeEach(() => {
  vi.clearAllMocks()
  signIn('developer')
  dbMocks.listSettlementStatements.mockResolvedValue([record()])
  dbMocks.getOpenSettlementMonths.mockResolvedValue(OPEN)
  dbMocks.getSettlementStatement.mockResolvedValue(record())
  dbMocks.getSettlementStatementEntries.mockResolvedValue(ENTRIES)
  dbMocks.markSettlementPaid.mockResolvedValue({ ok: true })
  dbMocks.reverseSettlementEntry.mockResolvedValue({
    ok: true,
    entryId: 'ste_rev',
    month: '2026-10',
  })
})

/* ── Who may read statements ───────────────────────────────────────────── */

describe('settlement routes — who may read statements', () => {
  it.each([
    ['a Manager', 'manager'],
    ['a customer', 'customer'],
  ] as const)('answer %s 404, reading nothing', async (_label, person) => {
    signIn(person)

    const responses = [await list(), await detail(), await markPaid(PAYMENT)]

    for (const res of responses) {
      expect(res.status).toBe(404)
      expect((await errorOf(res)).code).toBe(ERROR_CODES.NOT_FOUND)
    }
    expect(dbMocks.listSettlementStatements).not.toHaveBeenCalled()
    expect(dbMocks.getSettlementStatement).not.toHaveBeenCalled()
    expect(dbMocks.markSettlementPaid).not.toHaveBeenCalled()
  })

  it('answers an Owner who owns no branch 404', async () => {
    mocks.requireSession.mockResolvedValue({ user: { id: 'u_new_owner', role: 'owner' } })
    dbMocks.getBranchAccessInputs.mockResolvedValue({
      user: { id: 'u_new_owner', role: 'owner' },
      branches: [RS_ROW, MH_ROW],
      profile: null,
    })

    expect((await list()).status).toBe(404)
    expect(dbMocks.listSettlementStatements).not.toHaveBeenCalled()
  })

  it('reads the role stored now, not the one in the session', async () => {
    // Signed in as an Owner, demoted to Manager since.
    mocks.requireSession.mockResolvedValue({ user: { id: 'u_owner_rs', role: 'owner' } })
    dbMocks.getBranchAccessInputs.mockResolvedValue({
      user: { id: 'u_owner_rs', role: 'manager' },
      branches: [RS_ROW, MH_ROW],
      profile: null,
    })

    expect((await list()).status).toBe(404)
  })

  it('→ 401 when signed out', async () => {
    mocks.requireSession.mockRejectedValue(
      new AppError({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'You must be signed in.',
        statusCode: 401,
      }),
    )

    expect((await list()).status).toBe(401)
    expect(dbMocks.listSettlementStatements).not.toHaveBeenCalled()
  })

  it('→ 401 when the session outlived its account', async () => {
    dbMocks.getBranchAccessInputs.mockResolvedValue(null)

    expect((await list()).status).toBe(401)
  })
})

/* ── GET /api/settlements ──────────────────────────────────────────────── */

describe('GET /api/settlements', () => {
  it('gives the Developer every pair, with the open months', async () => {
    const res = await list()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(dbMocks.listSettlementStatements).toHaveBeenCalledWith(
      { all: true },
      { month: undefined },
    )
    expect(dbMocks.getOpenSettlementMonths).toHaveBeenCalledWith({ all: true })
    expect(body.data.scope).toBe('all')
    expect(body.data.open).toEqual(OPEN)
    const [statement] = body.data.statements
    expect(statement).toMatchObject({ id: 'stl_1', canMarkPaid: true })
    // Which branch pays is shown as the net, not as an internal id.
    expect(statement).not.toHaveProperty('payingBranchId')
  })

  it('gives an Owner the pairs with a branch they own', async () => {
    signIn('ownerRs')

    const body = await (await list()).json()

    expect(dbMocks.listSettlementStatements).toHaveBeenCalledWith(
      { all: false, branchIds: [RS.id] },
      { month: undefined },
    )
    expect(dbMocks.getOpenSettlementMonths).toHaveBeenCalledWith({
      all: false,
      branchIds: [RS.id],
    })
    expect(body.data.scope).toBe('owner')
  })

  it('gives an Owner of two branches both', async () => {
    signIn('ownerBoth')

    await list()

    expect(dbMocks.listSettlementStatements).toHaveBeenCalledWith(
      { all: false, branchIds: [RS.id, MH.id] },
      { month: undefined },
    )
  })

  it("lets the paying branch's Owner mark it paid, not the receiving branch's", async () => {
    signIn('ownerRs')
    const receiving = (await (await list()).json()).data.statements[0]
    signIn('ownerMh')
    const paying = (await (await list()).json()).data.statements[0]

    expect(receiving.canMarkPaid).toBe(false)
    expect(paying.canMarkPaid).toBe(true)
  })

  it('offers no mark-paid once paid, or when nothing is owed', async () => {
    dbMocks.listSettlementStatements.mockResolvedValue([
      record({ id: 'stl_paid', paid: PAID }),
      record({ id: 'stl_zero', ...NOTHING_OWED }),
    ])

    const body = await (await list()).json()

    expect(body.data.statements.map((s: { canMarkPaid: boolean }) => s.canMarkPaid)).toEqual([
      false,
      false,
    ])
  })

  it('filters by month', async () => {
    await list('?month=2026-09')

    expect(dbMocks.listSettlementStatements).toHaveBeenCalledWith(
      { all: true },
      { month: '2026-09' },
    )
  })

  it.each(['2026-13', '2026-9', 'September'])('rejects the month %s with 400', async (month) => {
    const res = await list(`?month=${month}`)

    expect(res.status).toBe(400)
    expect(dbMocks.listSettlementStatements).not.toHaveBeenCalled()
  })
})

/* ── GET /api/settlements/[id] ─────────────────────────────────────────── */

describe('GET /api/settlements/[id]', () => {
  it('returns the statement and its entries; the Developer may reverse them', async () => {
    const res = await detail()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(dbMocks.getSettlementStatement).toHaveBeenCalledWith('stl_1', { all: true })
    expect(dbMocks.getSettlementStatementEntries).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'stl_1', month: '2026-09', branchA: MH, branchB: RS }),
    )
    expect(body.data.statement).toMatchObject({ id: 'stl_1', canMarkPaid: true })
    expect(body.data.entries).toEqual(ENTRIES)
    expect(body.data.canReverse).toBe(true)
  })

  it('lets an Owner read it but not reverse entries', async () => {
    signIn('ownerRs')

    const body = await (await detail()).json()

    expect(dbMocks.getSettlementStatement).toHaveBeenCalledWith('stl_1', {
      all: false,
      branchIds: [RS.id],
    })
    expect(body.data.canReverse).toBe(false)
    expect(body.data.statement.canMarkPaid).toBe(false)
  })

  it("answers 404 for a statement outside the viewer's branches", async () => {
    signIn('ownerRs')
    dbMocks.getSettlementStatement.mockResolvedValue(null)

    const res = await detail()

    expect(res.status).toBe(404)
    expect(dbMocks.getSettlementStatementEntries).not.toHaveBeenCalled()
  })

  it('exports the statement as a CSV attachment for the accountant', async () => {
    const res = await detail('?format=csv')
    const csv = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="settlement-2026-09-marathahalli-rayasandra.csv"',
    )
    expect(res.headers.get('cache-control')).toBe('no-store')
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Settlement statement,Marathahalli and Rayasandra,09/2026')
    // Both entries, then the totals; the net matches the statement.
    expect(csv).toContain('RG-MEM-26-2-12345')
    expect(csv).toContain('BK-MH-2609-H-22222')
    expect(lines).toContain('Net: Marathahalli pays Rayasandra,2485.00')
  })

  it('names the payment in the CSV once paid', async () => {
    dbMocks.getSettlementStatement.mockResolvedValue(record({ paid: PAID }))

    const csv = await (await detail('?format=csv')).text()

    expect(csv).toContain('Paid on,05/10/2026,UTR 4471,')
  })
})

/* ── POST /api/settlements/[id]/paid ───────────────────────────────────── */

describe('POST /api/settlements/[id]/paid', () => {
  it("records the paying branch's Owner's payment once, audited", async () => {
    signIn('ownerMh')
    dbMocks.getSettlementStatement
      .mockResolvedValueOnce(record())
      .mockResolvedValueOnce(record({ paid: PAID }))

    const res = await markPaid(PAYMENT)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(dbMocks.markSettlementPaid).toHaveBeenCalledWith({
      id: 'stl_1',
      paidOn: '2026-10-05',
      reference: 'UTR 4471',
      internalTransfer: false,
      actorId: 'u_owner_mh',
    })
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      expect.objectContaining({
        action: 'update',
        entityType: 'branch_settlement',
        entityId: 'stl_1',
        newValues: {
          paidOn: '2026-10-05',
          reference: 'UTR 4471',
          internalTransfer: false,
          amountPaise: 248500,
        },
      }),
    )
    expect(body.data.statement).toMatchObject({ paid: PAID, canMarkPaid: false })
  })

  it('lets the Developer record it', async () => {
    const res = await markPaid(PAYMENT)

    expect(res.status).toBe(200)
    expect(dbMocks.markSettlementPaid).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'u_dev' }),
    )
  })

  it("refuses the receiving branch's Owner with 403, writing nothing", async () => {
    signIn('ownerRs')

    const res = await markPaid(PAYMENT)

    expect(res.status).toBe(403)
    expect(await errorOf(res)).toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      message: "Only Marathahalli's Owner or the Developer can mark this statement paid.",
    })
    expect(dbMocks.markSettlementPaid).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('accepts today', async () => {
    const res = await markPaid({ ...PAYMENT, paidOn: istToday(new Date()) })

    expect(res.status).toBe(200)
  })

  it('refuses a payment date in the future with 400, reading nothing', async () => {
    const res = await markPaid({ ...PAYMENT, paidOn: '2999-01-01' })

    expect(res.status).toBe(400)
    expect((await errorOf(res)).message).toBe("The payment date can't be in the future.")
    expect(dbMocks.getSettlementStatement).not.toHaveBeenCalled()
  })

  it.each([
    ['a date in another format', { ...PAYMENT, paidOn: '05/10/2026' }],
    ['an impossible date', { ...PAYMENT, paidOn: '2026-02-31' }],
    ['a date with a time', { ...PAYMENT, paidOn: '2026-10-05T10:00' }],
    ['no reference', { paidOn: '2026-10-05', reference: '   ' }],
    ['a reference past 120 characters', { ...PAYMENT, reference: 'x'.repeat(121) }],
    ['no body', null],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await markPaid(body)

    expect(res.status).toBe(400)
    expect(dbMocks.markSettlementPaid).not.toHaveBeenCalled()
  })

  it('answers 404 for a statement the viewer cannot see', async () => {
    dbMocks.getSettlementStatement.mockResolvedValue(null)

    expect((await markPaid(PAYMENT)).status).toBe(404)
    expect(dbMocks.markSettlementPaid).not.toHaveBeenCalled()
  })

  it('refuses a statement already paid: 409 SETTLEMENT_ALREADY_PAID', async () => {
    dbMocks.getSettlementStatement.mockResolvedValue(record({ paid: PAID }))

    const res = await markPaid(PAYMENT)

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.SETTLEMENT_ALREADY_PAID)
    expect(dbMocks.markSettlementPaid).not.toHaveBeenCalled()
  })

  it('refuses a statement with nothing owed: 409', async () => {
    dbMocks.getSettlementStatement.mockResolvedValue(record(NOTHING_OWED))

    const res = await markPaid(PAYMENT)

    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({
      code: ERROR_CODES.CONFLICT,
      message: 'Nothing is owed on this statement, so there is nothing to pay.',
    })
    expect(dbMocks.markSettlementPaid).not.toHaveBeenCalled()
  })

  it('refuses an internal transfer between branches of different Owners with 400', async () => {
    const res = await markPaid({ ...PAYMENT, internalTransfer: true })

    expect(res.status).toBe(400)
    expect((await errorOf(res)).message).toBe(
      'An internal transfer is only between two branches of the same Owner.',
    )
    expect(dbMocks.markSettlementPaid).not.toHaveBeenCalled()
  })

  it("records an internal transfer between one Owner's branches", async () => {
    signIn('ownerBoth')
    dbMocks.getSettlementStatement.mockResolvedValue(record({ sameOwner: true }))

    const res = await markPaid({ ...PAYMENT, internalTransfer: true })

    expect(res.status).toBe(200)
    expect(dbMocks.markSettlementPaid).toHaveBeenCalledWith(
      expect.objectContaining({ internalTransfer: true, actorId: 'u_owner_both' }),
    )
  })

  it.each([
    ['already_paid', 409, ERROR_CODES.SETTLEMENT_ALREADY_PAID],
    ['nothing_owed', 409, ERROR_CODES.CONFLICT],
    ['not_found', 404, ERROR_CODES.NOT_FOUND],
    ['not_same_owner', 400, ERROR_CODES.VALIDATION_ERROR],
  ])('maps a write that found it %s to %i, unaudited', async (reason, status, code) => {
    dbMocks.markSettlementPaid.mockResolvedValue({ ok: false, reason })

    const res = await markPaid(PAYMENT)

    expect(res.status).toBe(status)
    expect((await errorOf(res)).code).toBe(code)
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})

/* ── POST /api/settlements/entries/[id]/reverse ────────────────────────── */

describe('POST /api/settlements/entries/[id]/reverse', () => {
  const NOTE = 'Session recorded against the wrong membership'

  it("records the Developer's reversal in the open month, audited", async () => {
    const res = await reverse({ note: NOTE })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ entryId: 'ste_rev', month: '2026-10' })
    expect(dbMocks.reverseSettlementEntry).toHaveBeenCalledWith({
      entryId: 'ste_1',
      note: NOTE,
      actorId: 'u_dev',
    })
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      expect.objectContaining({
        action: 'create',
        entityType: 'settlement_entry',
        entityId: 'ste_rev',
        newValues: { reverses: 'ste_1', note: NOTE, month: '2026-10' },
      }),
    )
  })

  it.each([
    ['an Owner', 'ownerRs'],
    ['a Manager', 'manager'],
  ] as const)('refuses %s with 403', async (_label, person) => {
    signIn(person)

    const res = await reverse({ note: NOTE })

    expect(res.status).toBe(403)
    expect(dbMocks.reverseSettlementEntry).not.toHaveBeenCalled()
  })

  it.each([
    ['no reason', {}],
    ['a reason too short to explain anything', { note: 'no' }],
    ['a blank reason', { note: '     ' }],
    ['a reason past 500 characters', { note: 'x'.repeat(501) }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await reverse(body)

    expect(res.status).toBe(400)
    expect(dbMocks.reverseSettlementEntry).not.toHaveBeenCalled()
  })

  it.each([
    ['not_found', 404, ERROR_CODES.NOT_FOUND, 'Entry not found.'],
    ['already_reversed', 409, ERROR_CODES.CONFLICT, 'This entry has already been reversed.'],
    [
      'is_reversal',
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "A reversing entry can't itself be reversed.",
    ],
    [
      'internal',
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'An entry within one branch settles nothing, so there is nothing to reverse.',
    ],
  ])('maps %s to %i, unaudited', async (reason, status, code, message) => {
    dbMocks.reverseSettlementEntry.mockResolvedValue({ ok: false, reason })

    const res = await reverse({ note: NOTE })

    expect(res.status).toBe(status)
    expect(await errorOf(res)).toMatchObject({ code, message })
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
