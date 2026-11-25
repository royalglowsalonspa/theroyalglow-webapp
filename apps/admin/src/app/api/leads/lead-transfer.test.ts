// @vitest-environment node

import { ERROR_CODES, forbidden } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const db = vi.hoisted(() => ({
  addLeadNote: vi.fn(),
  getLeadById: vi.fn(),
  getLeadNotes: vi.fn(),
  getPublicBranches: vi.fn(),
  markLeadLost: vi.fn(),
  moveLead: vi.fn(),
  updateLead: vi.fn(),
}))
const requireBranchRole = vi.hoisted(() => vi.fn())

vi.mock('@rgss/db/queries', () => db)
vi.mock('@/lib/api/branch-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/branch-context')>()),
  requireBranchRole,
}))

import { POST as moveLead } from './[id]/move/route'
import { POST as addNote } from './[id]/notes/route'
import { GET as getLead, PATCH as updateLead } from './[id]/route'

const context = { params: Promise.resolve({ id: 'lead_1' }) }
const destination = { id: OTHER_BRANCH.id, name: OTHER_BRANCH.name }
const moveInput = { branchId: TEST_BRANCH.id, toBranchId: OTHER_BRANCH.id }

function request(method: string, path = '', body?: unknown) {
  return new Request(`https://admin.theroyalglow.in/api/leads/lead_1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  requireBranchRole.mockResolvedValue(branchContext())
})

describe('POST /api/leads/[id]/move', () => {
  it('allows a source receptionist to move to a branch they cannot operate', async () => {
    db.moveLead.mockResolvedValue({ ok: true, destination })

    const response = await moveLead(request('POST', '/move', moveInput), context)

    expect(requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(db.moveLead).toHaveBeenCalledWith({ id: 'lead_1', ...moveInput, actorId: 'user_1' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { destination } })
  })

  it('refuses an operator without the source branch role', async () => {
    requireBranchRole.mockRejectedValue(forbidden())

    const response = await moveLead(request('POST', '/move', moveInput), context)

    expect(response.status).toBe(403)
    expect(db.moveLead).not.toHaveBeenCalled()
  })

  it('rejects a request from a stale source branch tab', async () => {
    const response = await moveLead(
      request('POST', '/move', { branchId: OTHER_BRANCH.id, toBranchId: TEST_BRANCH.id }),
      context,
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: { code: ERROR_CODES.BRANCH_CONTEXT_CHANGED },
    })
    expect(db.moveLead).not.toHaveBeenCalled()
  })

  it('requires the destination and rendered source IDs', async () => {
    const response = await moveLead(request('POST', '/move', { toBranchId: '' }), context)

    expect(response.status).toBe(400)
    expect(db.moveLead).not.toHaveBeenCalled()
  })

  it.each([
    ['not_found', 404],
    ['destination_unavailable', 400],
    ['status_conflict', 409],
  ])('reports %s without destination pipeline details', async (reason, status) => {
    db.moveLead.mockResolvedValue({ ok: false, reason })

    const response = await moveLead(request('POST', '/move', moveInput), context)

    expect(response.status).toBe(status)
    expect(await response.json()).not.toHaveProperty('data')
  })
})

describe('lead detail while moving across branches', () => {
  it('returns only public destination metadata for an eligible lead', async () => {
    db.getLeadById.mockResolvedValue({ id: 'lead_1', status: 'follow_up' })
    db.getLeadNotes.mockResolvedValue([])
    db.getPublicBranches.mockResolvedValue([
      TEST_BRANCH,
      OTHER_BRANCH,
      { ...OTHER_BRANCH, id: 'closed', status: 'shutdown' },
    ])

    const response = await getLead(request('GET'), context)

    expect(await response.json()).toMatchObject({ data: { destinations: [destination] } })
    expect(db.getLeadNotes).toHaveBeenCalledWith('lead_1', TEST_BRANCH.id)
  })

  it('checks the source before looking up notes or destinations', async () => {
    db.getLeadById.mockResolvedValue(null)

    const response = await getLead(request('GET'), context)

    expect(response.status).toBe(404)
    expect(db.getLeadById).toHaveBeenCalledWith('lead_1', TEST_BRANCH.id)
    expect(db.getLeadNotes).not.toHaveBeenCalled()
    expect(db.getPublicBranches).not.toHaveBeenCalled()
  })

  it('offers no destinations for a booked lead', async () => {
    db.getLeadById.mockResolvedValue({ id: 'lead_1', status: 'booked' })
    db.getLeadNotes.mockResolvedValue([])

    const response = await getLead(request('GET'), context)

    expect(await response.json()).toMatchObject({ data: { destinations: [] } })
    expect(db.getPublicBranches).not.toHaveBeenCalled()
  })

  it('reports a conflict if a lead moved during a status change', async () => {
    db.getLeadById.mockResolvedValue({ id: 'lead_1', status: 'new' })
    db.updateLead.mockResolvedValue(null)

    const response = await updateLead(
      request('PATCH', '', { branchId: TEST_BRANCH.id, status: 'contacted' }),
      context,
    )

    expect(response.status).toBe(409)
    expect(db.updateLead).toHaveBeenCalledWith('lead_1', TEST_BRANCH.id, 'new', {
      status: 'contacted',
      lastContactedAt: expect.any(Date),
    })
  })

  it('records the acting user and reason when marking a lead lost', async () => {
    db.getLeadById.mockResolvedValue({ id: 'lead_1', status: 'follow_up' })
    db.markLeadLost.mockResolvedValue({ id: 'lead_1', status: 'lost' })

    const response = await updateLead(
      request('PATCH', '', { branchId: TEST_BRANCH.id, status: 'lost', reason: '  Moved away  ' }),
      context,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { lead: { id: 'lead_1', status: 'lost' } },
    })
    expect(db.markLeadLost).toHaveBeenCalledWith(
      'lead_1',
      TEST_BRANCH.id,
      'follow_up',
      'user_1',
      'Moved away',
    )
    expect(db.updateLead).not.toHaveBeenCalled()
  })

  it('refuses a missing loss reason without changing the lead', async () => {
    db.getLeadById.mockResolvedValue({ id: 'lead_1', status: 'follow_up' })

    const response = await updateLead(
      request('PATCH', '', { branchId: TEST_BRANCH.id, status: 'lost', reason: '  ' }),
      context,
    )

    expect(response.status).toBe(400)
    expect(db.markLeadLost).not.toHaveBeenCalled()
    expect(db.updateLead).not.toHaveBeenCalled()
  })

  it('adds a note only while the lead belongs to the active branch', async () => {
    db.addLeadNote.mockResolvedValue(null)

    const response = await addNote(
      request('POST', '/notes', { branchId: TEST_BRANCH.id, content: 'Follow-up' }),
      context,
    )

    expect(response.status).toBe(404)
    expect(db.addLeadNote).toHaveBeenCalledWith('lead_1', TEST_BRANCH.id, 'user_1', 'Follow-up')
  })
})
