import { describe, expect, it } from 'vitest'
import {
  type BranchContact,
  type BranchPeople,
  branchReportRecipients,
  frontDeskRecipients,
  holdsBranchRole,
  lacksManager,
  leadFollowUpMessageData,
  type ManagerCheckBranch,
  missingManagerMessageData,
  missingManagerReminders,
  planLeadFollowUps,
  planReportDeliveries,
  type RecipientBranch,
  type ReportBranchInput,
} from './recipients'

const person = (userId: string): BranchContact => ({
  userId,
  name: `Name ${userId}`,
  email: `${userId}@example.test`,
})

const OWNER = person('owner')
const MANAGER = person('manager')
const RECEPTION = person('reception')

const people = (overrides: Partial<BranchPeople> = {}): BranchPeople => ({
  owner: OWNER,
  manager: MANAGER,
  receptionist: RECEPTION,
  ...overrides,
})

const ids = (contacts: readonly BranchContact[]) => contacts.map((c) => c.userId)

describe('frontDeskRecipients', () => {
  it('is the Receptionist and the Manager, never the Owner while there is a Manager', () => {
    expect(ids(frontDeskRecipients(people()))).toEqual(['reception', 'manager'])
  })

  it('puts the Owner in for a missing Manager', () => {
    expect(ids(frontDeskRecipients(people({ manager: null })))).toEqual(['reception', 'owner'])
    expect(ids(frontDeskRecipients(people({ manager: null, receptionist: null })))).toEqual([
      'owner',
    ])
  })

  it('is the Manager alone without a Receptionist', () => {
    expect(ids(frontDeskRecipients(people({ receptionist: null })))).toEqual(['manager'])
  })

  it('is nobody when nobody holds a role', () => {
    expect(frontDeskRecipients({ owner: null, manager: null, receptionist: null })).toEqual([])
  })
})

describe('branchReportRecipients', () => {
  it('is the Owner and the Manager, not the Receptionist', () => {
    expect(ids(branchReportRecipients(people()))).toEqual(['owner', 'manager'])
    expect(ids(branchReportRecipients(people({ manager: null })))).toEqual(['owner'])
  })
})

describe('holdsBranchRole', () => {
  it('recognises the three role holders only', () => {
    expect(holdsBranchRole(people(), 'owner')).toBe(true)
    expect(holdsBranchRole(people(), 'manager')).toBe(true)
    expect(holdsBranchRole(people(), 'reception')).toBe(true)
    expect(holdsBranchRole(people(), 'stylist')).toBe(false)
  })
})

describe('planLeadFollowUps', () => {
  const RS: RecipientBranch = { id: 'rs', name: 'Rayasandra', people: people() }
  const MH: RecipientBranch = {
    id: 'mh',
    name: 'Marathahalli',
    people: { owner: OWNER, manager: null, receptionist: null },
  }

  it('keeps a lead with an assignee who still works at its branch', () => {
    const plan = planLeadFollowUps({
      leads: [{ name: 'Priya', branchId: 'rs', assignedTo: 'reception' }],
      branches: [RS, MH],
      developerUserId: 'dev',
    })
    expect(plan.digests).toEqual([
      {
        userId: 'reception',
        total: 1,
        leadName: 'Priya',
        branches: [{ branchId: 'rs', branchName: 'Rayasandra', count: 1 }],
      },
    ])
    expect(plan.unrouted).toBe(0)
  })

  it('sends a lead whose assignee left, or that nobody holds, to the front desk', () => {
    const plan = planLeadFollowUps({
      leads: [
        { name: 'Asha', branchId: 'rs', assignedTo: 'former-receptionist' },
        { name: 'Meera', branchId: 'rs', assignedTo: null },
      ],
      branches: [RS],
      developerUserId: null,
    })
    expect(plan.digests.map((d) => [d.userId, d.total])).toEqual([
      ['manager', 2],
      ['reception', 2],
    ])
    expect(plan.digests[0]?.leadName).toBeNull()
  })

  it('lets the Developer keep a lead at any branch', () => {
    const plan = planLeadFollowUps({
      leads: [{ name: 'Ravi', branchId: 'mh', assignedTo: 'dev' }],
      branches: [RS, MH],
      developerUserId: 'dev',
    })
    expect(plan.digests.map((d) => d.userId)).toEqual(['dev'])
  })

  it('uses the Owner at a branch without a Manager or Receptionist', () => {
    const plan = planLeadFollowUps({
      leads: [{ name: 'Kiran', branchId: 'mh', assignedTo: null }],
      branches: [RS, MH],
      developerUserId: null,
    })
    expect(plan.digests.map((d) => d.userId)).toEqual(['owner'])
  })

  it('combines one person’s leads across branches, in branch order', () => {
    const plan = planLeadFollowUps({
      leads: [
        { name: 'A', branchId: 'mh', assignedTo: 'owner' },
        { name: 'B', branchId: 'rs', assignedTo: 'owner' },
        { name: 'C', branchId: 'rs', assignedTo: 'owner' },
      ],
      branches: [RS, MH],
      developerUserId: null,
    })
    expect(plan.digests).toEqual([
      {
        userId: 'owner',
        total: 3,
        leadName: null,
        branches: [
          { branchId: 'rs', branchName: 'Rayasandra', count: 2 },
          { branchId: 'mh', branchName: 'Marathahalli', count: 1 },
        ],
      },
    ])
  })

  it('counts leads it cannot route: no branch, an unknown branch, or nobody there', () => {
    const empty: RecipientBranch = {
      id: 'new',
      name: 'New',
      people: { owner: null, manager: null, receptionist: null },
    }
    const plan = planLeadFollowUps({
      leads: [
        { name: 'X', branchId: null, assignedTo: 'reception' },
        { name: 'Y', branchId: 'gone', assignedTo: null },
        { name: 'Z', branchId: 'new', assignedTo: null },
      ],
      branches: [RS, empty],
      developerUserId: null,
    })
    expect(plan.digests).toEqual([])
    expect(plan.unrouted).toBe(3)
  })
})

describe('leadFollowUpMessageData', () => {
  it('names the lead and branch for a single lead', () => {
    expect(
      leadFollowUpMessageData({
        userId: 'u',
        total: 1,
        leadName: 'Priya',
        branches: [{ branchId: 'rs', branchName: 'Rayasandra', count: 1 }],
      }),
    ).toEqual({ count: '1', leadName: 'Priya', branchName: 'Rayasandra' })
  })

  it('counts leads at one branch', () => {
    expect(
      leadFollowUpMessageData({
        userId: 'u',
        total: 3,
        leadName: null,
        branches: [{ branchId: 'rs', branchName: 'Rayasandra', count: 3 }],
      }),
    ).toEqual({ count: '3', branchName: 'Rayasandra' })
  })

  it('breaks leads down by branch across branches', () => {
    expect(
      leadFollowUpMessageData({
        userId: 'u',
        total: 4,
        leadName: null,
        branches: [
          { branchId: 'rs', branchName: 'Rayasandra', count: 3 },
          { branchId: 'mh', branchName: 'Marathahalli', count: 1 },
        ],
      }),
    ).toEqual({ count: '4', branchBreakdown: '3 at Rayasandra, 1 at Marathahalli' })
  })
})

describe('planReportDeliveries', () => {
  const OTHER_OWNER = person('franchise-owner')
  const input = (id: string, overrides: Partial<ReportBranchInput> = {}): ReportBranchInput => ({
    id,
    name: id.toUpperCase(),
    status: 'operational',
    people: people(),
    hasActivity: false,
    ...overrides,
  })

  it('sends one email per person covering every branch they may read', () => {
    const plan = planReportDeliveries([
      input('rs'),
      input('mh', { people: { owner: OWNER, manager: null, receptionist: null } }),
    ])
    expect(plan.branchIds).toEqual(['rs', 'mh'])
    expect(plan.deliveries.map((d) => [d.to.userId, d.branchIds])).toEqual([
      ['owner', ['rs', 'mh']],
      ['manager', ['rs']],
    ])
  })

  it('never shows one Owner another Owner’s branch', () => {
    const plan = planReportDeliveries([
      input('rs'),
      input('fr', { people: { owner: OTHER_OWNER, manager: null, receptionist: RECEPTION } }),
    ])
    const owner = plan.deliveries.find((d) => d.to.userId === 'owner')
    const franchise = plan.deliveries.find((d) => d.to.userId === 'franchise-owner')
    expect(owner?.branchIds).toEqual(['rs'])
    expect(franchise?.branchIds).toEqual(['fr'])
    // Receptionists don't receive sales reports.
    expect(plan.deliveries.some((d) => d.to.userId === 'reception')).toBe(false)
  })

  it('reports a branch that is not operational only when it had activity', () => {
    const plan = planReportDeliveries([
      input('closed', { status: 'temporarily_closed', hasActivity: true }),
      input('soon', { status: 'opens_soon' }),
      input('shut', { status: 'shutdown' }),
    ])
    expect(plan.branchIds).toEqual(['closed'])
  })
})

describe('missingManagerReminders', () => {
  const branch = (id: string, overrides: Partial<ManagerCheckBranch> = {}): ManagerCheckBranch => ({
    id,
    name: id.toUpperCase(),
    status: 'operational',
    owner: OWNER,
    manager: null,
    ...overrides,
  })

  it('reminds each Owner once, listing their operational branches without a Manager', () => {
    const other = person('other-owner')
    const reminders = missingManagerReminders([
      branch('rs', { manager: MANAGER }),
      branch('mh'),
      branch('ec'),
      branch('wf', { owner: other }),
    ])
    expect(reminders).toEqual([
      {
        owner: OWNER,
        branches: [
          { id: 'mh', name: 'MH' },
          { id: 'ec', name: 'EC' },
        ],
      },
      { owner: other, branches: [{ id: 'wf', name: 'WF' }] },
    ])
  })

  it('stops for a branch with a Manager or one that is not operational', () => {
    expect(
      missingManagerReminders([
        branch('rs', { manager: MANAGER }),
        branch('soon', { status: 'opens_soon' }),
        branch('shut', { status: 'shutdown' }),
        branch('closed', { status: 'temporarily_closed' }),
      ]),
    ).toEqual([])
  })

  it('skips a branch without an Owner account', () => {
    expect(missingManagerReminders([branch('mh', { owner: null })])).toEqual([])
  })

  it('lacksManager matches the same rule', () => {
    expect(lacksManager({ status: 'operational', hasManager: false })).toBe(true)
    expect(lacksManager({ status: 'operational', hasManager: true })).toBe(false)
    expect(lacksManager({ status: 'opens_soon', hasManager: false })).toBe(false)
  })
})

describe('missingManagerMessageData', () => {
  it('names one branch, or lists several', () => {
    expect(
      missingManagerMessageData({ owner: OWNER, branches: [{ id: 'mh', name: 'MH' }] }),
    ).toEqual({ count: '1', branchName: 'MH' })
    expect(
      missingManagerMessageData({
        owner: OWNER,
        branches: [
          { id: 'mh', name: 'Marathahalli' },
          { id: 'ec', name: 'Electronic City' },
          { id: 'wf', name: 'Whitefield' },
        ],
      }),
    ).toEqual({ count: '3', branchList: 'Marathahalli, Electronic City and Whitefield' })
  })
})
