// @vitest-environment node
/************************************************************
 * Module Name  : jobs/branch-jobs.test
 * Scope        : API — Background Jobs (multi-branch R1.9, R7.2, R7.4)
 *
 * Description  : Background jobs carry branch context from the records they
 *                act on: alerts reach the record's own branch, reports reach
 *                only the people who may read each branch, the summary across
 *                branches reaches only the Developer, the missing-Manager
 *                reminder reaches the right Owner once a day, and customer
 *                messages name the real branch. DB, delivery and heartbeat
 *                seams are mocked; the QStash verifier and @rgss/business
 *                are real.
 ************************************************************/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  getBranchPeople: vi.fn(),
  hasNotification: vi.fn(),
  hasNotificationSince: vi.fn(),
  createNotification: vi.fn(),
  getStaleFollowUpLeads: vi.fn(),
  getBookingForNoShow: vi.fn(),
  getDailyBranchReports: vi.fn(),
  getWeeklyBranchReports: vi.fn(),
  getUpcomingConfirmedBookings: vi.fn(),
  getBookingForFollowup: vi.fn(),
}))
const dispatchMock = vi.hoisted(() => vi.fn())
const heartbeatMock = vi.hoisted(() => vi.fn())
const sendEmailMock = vi.hoisted(() => vi.fn())
const slackMock = vi.hoisted(() => vi.fn())

vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchNotification: dispatchMock }))
vi.mock('@/lib/jobs/heartbeat', () => ({ pingHeartbeat: heartbeatMock }))
vi.mock('@/lib/notifications/providers/email', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/reports/slack', () => ({ postToSlack: slackMock }))

import { POST as remindersPOST } from './appointment-reminders/route'
import { POST as dailyPOST } from './daily-sales-report/route'
import { POST as leadsPOST } from './lead-followups/route'
import { POST as missingManagerPOST } from './missing-manager-reminder/route'
import { POST as noshowPOST } from './noshow-check/route'
import { POST as followupPOST } from './post-service-followup/route'
import { POST as weeklyPOST } from './weekly-report/route'

// ── Fixtures: RS has an Owner, a Manager and a Receptionist; MH shares the
// Owner and has neither; FR is a franchise with its own Owner. ──────────────

const OWNER = { userId: 'owner', name: 'Royal Glow Owner', email: 'owner@x.test' }
const MANAGER = { userId: 'manager', name: 'Manish', email: 'manager@x.test' }
const RECEPTION = { userId: 'reception', name: 'Kavya', email: 'reception@x.test' }
const FRANCHISE = { userId: 'franchise', name: 'Franchise Owner', email: 'franchise@x.test' }
const DEV = { userId: 'dev', name: 'Developer', email: 'dev@x.test' }

function branchRow(id: string, name: string, people: Record<string, unknown>) {
  return {
    id,
    name,
    code: name.slice(0, 2).toUpperCase(),
    status: 'operational',
    isPrimary: id === 'branch_rs',
    phone: '+910000000000',
    googleMapsUrl: null,
    owner: null,
    manager: null,
    receptionist: null,
    ...people,
  }
}

const RS = branchRow('branch_rs', 'Rayasandra', {
  owner: OWNER,
  manager: MANAGER,
  receptionist: RECEPTION,
})
const MH = branchRow('branch_mh', 'Marathahalli', { owner: OWNER })
const FR = branchRow('branch_fr', 'Whitefield', { owner: FRANCHISE })

function jobRequest(body = '{}'): Request {
  return new Request('https://admin.theroyalglow.in/api/jobs/x', { method: 'POST', body })
}

function figures(totalPaise: number, completed = 0) {
  return {
    services: [],
    revenue: { salonPaise: totalPaise, spaPaise: 0, membershipPaise: 0, totalPaise },
    bookings: { completed, noShows: 0, cancelled: 0, walkIns: 0 },
    customers: { newCount: 0, returning: 0 },
    membershipSessions: 0,
  }
}

function created(p: {
  userId: string
  type: string
  title: string
  body: string
  channel?: string
}) {
  return { id: `n_${p.userId}`, channel: p.channel ?? 'push', ...p }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Outside production with no keys or token, the real verifier allows the
  // documented local invocation.
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', undefined)
  vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', undefined)
  vi.stubEnv('INTERNAL_JOB_TOKEN', undefined)
  dbMocks.hasNotification.mockResolvedValue(false)
  dbMocks.hasNotificationSince.mockResolvedValue(false)
  dbMocks.createNotification.mockImplementation(async (p) => created(p))
  sendEmailMock.mockResolvedValue(true)
  slackMock.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

function notifiedUsers(): string[] {
  return dbMocks.createNotification.mock.calls.map(([p]) => p.userId)
}

function notificationFor(userId: string) {
  return dbMocks.createNotification.mock.calls.map(([p]) => p).find((p) => p.userId === userId)
}

function emailTo(address: string) {
  return sendEmailMock.mock.calls.map(([p]) => p).find((p) => p.to === address)
}

describe('POST /api/jobs/noshow-check', () => {
  it("alerts the booking's own branch, whatever the payload claims", async () => {
    dbMocks.getBookingForNoShow.mockResolvedValue({
      id: 'bk_1',
      status: 'confirmed',
      branchId: 'branch_mh',
      bookingDate: new Date('2026-10-25T00:00:00.000Z'),
    })
    dbMocks.getBranchPeople.mockResolvedValue({ branches: [MH], developer: DEV })

    const res = await noshowPOST(
      jobRequest(JSON.stringify({ bookingId: 'bk_1', branchId: 'branch_rs' })),
    )

    expect(await res.json()).toEqual({ success: true, notified: 1 })
    expect(dbMocks.getBranchPeople).toHaveBeenCalledWith(['branch_mh'])
    // MH has no Manager or Receptionist: its Owner covers. Not the Developer.
    expect(notifiedUsers()).toEqual(['owner'])
    expect(notificationFor('owner')?.body).toContain('at Marathahalli')
    expect(heartbeatMock).toHaveBeenCalledWith('NOSHOW_CHECK')
  })

  it('leaves a booking that was already actioned alone', async () => {
    dbMocks.getBookingForNoShow.mockResolvedValue({ id: 'bk_2', status: 'completed' })

    const res = await noshowPOST(jobRequest(JSON.stringify({ bookingId: 'bk_2' })))

    expect(await res.json()).toEqual({ success: true, notified: 0 })
    expect(dbMocks.getBranchPeople).not.toHaveBeenCalled()
  })
})

describe('POST /api/jobs/lead-followups', () => {
  const leads = [
    { id: 'l1', name: 'Priya', branchId: 'branch_rs', assignedTo: 'reception' },
    { id: 'l2', name: 'Asha', branchId: 'branch_mh', assignedTo: 'former-receptionist' },
    { id: 'l3', name: 'Ravi', branchId: 'branch_fr', assignedTo: null },
    { id: 'l4', name: 'Nobody', branchId: null, assignedTo: 'reception' },
  ]

  it("sends each lead to its branch: the assignee while they're there, else the front desk", async () => {
    dbMocks.getStaleFollowUpLeads.mockResolvedValue(leads)
    dbMocks.getBranchPeople.mockResolvedValue({ branches: [RS, MH, FR], developer: DEV })

    const res = await leadsPOST(jobRequest())

    expect(await res.json()).toEqual({ success: true, processed: 3, unrouted: 1 })
    expect(dbMocks.getBranchPeople).toHaveBeenCalledWith(['branch_rs', 'branch_mh', 'branch_fr'])
    expect(notifiedUsers().sort()).toEqual(['franchise', 'owner', 'reception'])
    expect(notificationFor('reception')?.body).toBe(
      'A follow-up with Priya at Rayasandra is due. Reach out to keep the lead warm.',
    )
    expect(notificationFor('owner')?.body).toContain('Asha at Marathahalli')
    expect(notificationFor('franchise')?.body).toContain('Ravi at Whitefield')
    // The franchise's lead never reaches the Royal Glow Owner, and vice versa.
    expect(notificationFor('owner')?.body).not.toContain('Ravi')
    expect(notificationFor('franchise')?.body).not.toContain('Asha')
    expect(heartbeatMock).toHaveBeenCalledWith('LEAD_FOLLOWUPS')
  })

  it('sends a person at most one reminder per IST day', async () => {
    dbMocks.getStaleFollowUpLeads.mockResolvedValue(leads)
    dbMocks.getBranchPeople.mockResolvedValue({ branches: [RS, MH, FR], developer: DEV })
    dbMocks.hasNotificationSince.mockImplementation(async (userId: string) => userId === 'owner')

    await leadsPOST(jobRequest())

    expect(notifiedUsers().sort()).toEqual(['franchise', 'reception'])
    const [, type, since] = dbMocks.hasNotificationSince.mock.calls[0] ?? []
    expect(type).toBe('lead_follow_up_due')
    // IST midnight is 18:30 UTC.
    expect((since as Date).toISOString()).toMatch(/T18:30:00\.000Z$/)
  })

  it('reads no branches when nothing is stale', async () => {
    dbMocks.getStaleFollowUpLeads.mockResolvedValue([])

    const res = await leadsPOST(jobRequest())

    expect(await res.json()).toEqual({ success: true, processed: 0, unrouted: 0 })
    expect(dbMocks.getBranchPeople).not.toHaveBeenCalled()
  })
})

describe('POST /api/jobs/missing-manager-reminder', () => {
  it('rejects an unverified request before reading anything', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const res = await missingManagerPOST(jobRequest())

    expect(res.status).toBe(401)
    expect(dbMocks.getBranchPeople).not.toHaveBeenCalled()
  })

  it('emails each Owner about their own branches without a Manager', async () => {
    dbMocks.getBranchPeople.mockResolvedValue({ branches: [RS, MH, FR], developer: DEV })

    const res = await missingManagerPOST(jobRequest())

    expect(await res.json()).toEqual({ success: true, branches: 2, sent: 2 })
    expect(notifiedUsers()).toEqual(['owner', 'franchise'])
    expect(notificationFor('owner')).toMatchObject({
      type: 'branch_manager_missing',
      channel: 'email',
      title: 'Marathahalli has no Manager',
    })
    expect(notificationFor('franchise')?.title).toBe('Whitefield has no Manager')
    expect(heartbeatMock).toHaveBeenCalledWith('MISSING_MANAGER')
  })

  it('names several branches in one reminder', async () => {
    const third = branchRow('branch_ec', 'Electronic City', { owner: OWNER })
    dbMocks.getBranchPeople.mockResolvedValue({ branches: [RS, MH, third], developer: DEV })

    await missingManagerPOST(jobRequest())

    expect(notifiedUsers()).toEqual(['owner'])
    expect(notificationFor('owner')?.title).toBe('2 branches have no Manager')
    expect(notificationFor('owner')?.body).toContain('Marathahalli and Electronic City')
  })

  it('stops once a Manager is assigned, and sends once a day', async () => {
    dbMocks.getBranchPeople.mockResolvedValue({
      branches: [RS, { ...MH, manager: MANAGER }, FR],
      developer: DEV,
    })
    dbMocks.hasNotificationSince.mockImplementation(
      async (userId: string, type: string) =>
        userId === 'franchise' && type === 'branch_manager_missing',
    )

    const res = await missingManagerPOST(jobRequest())

    expect(await res.json()).toEqual({ success: true, branches: 1, sent: 0 })
    expect(dbMocks.createNotification).not.toHaveBeenCalled()
  })

  it('answers 500 without the heartbeat when reading fails', async () => {
    dbMocks.getBranchPeople.mockRejectedValue(new Error('connection reset'))

    const res = await missingManagerPOST(jobRequest())

    expect(res.status).toBe(500)
    expect(heartbeatMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/jobs/daily-sales-report', () => {
  beforeEach(() => {
    dbMocks.getBranchPeople.mockResolvedValue({ branches: [RS, MH, FR], developer: DEV })
    dbMocks.getDailyBranchReports.mockResolvedValue({
      date: new Date('2026-10-25T00:00:00.000Z'),
      branches: new Map([
        ['branch_rs', figures(150_000, 3)],
        ['branch_fr', figures(90_000, 2)],
      ]),
    })
  })

  it("emails each Owner and Manager only their branches' reports", async () => {
    const res = await dailyPOST(jobRequest())

    expect(await res.json()).toMatchObject({ success: true, branches: 3, emailed: 3, planned: 3 })

    const owner = emailTo('owner@x.test')
    expect(owner?.subject).toBe('Royal Glow — Daily Sales Reports: Rayasandra, Marathahalli')
    expect(owner?.html).toContain('Royal Glow Rayasandra — Daily Sales Report')
    expect(owner?.html).toContain('Royal Glow Marathahalli — Daily Sales Report')
    expect(owner?.html).not.toContain('Whitefield')

    const manager = emailTo('manager@x.test')
    expect(manager?.subject).toBe('Royal Glow Rayasandra — Daily Sales Report')
    expect(manager?.html).not.toContain('Marathahalli')

    const franchise = emailTo('franchise@x.test')
    expect(franchise?.subject).toBe('Royal Glow Whitefield — Daily Sales Report')
    expect(franchise?.html).not.toContain('Rayasandra')
    expect(franchise?.html).toContain('₹900.00')

    // The Receptionist gets no sales report.
    expect(emailTo('reception@x.test')).toBeUndefined()
  })

  it('sends the summary across branches to the Developer and Slack only', async () => {
    await dailyPOST(jobRequest())

    const dev = emailTo('dev@x.test')
    expect(dev?.subject).toBe('Royal Glow — Daily Summary, All Branches')
    for (const name of ['Rayasandra', 'Marathahalli', 'Whitefield']) {
      expect(dev?.html).toContain(name)
    }
    expect(dev?.html).toContain('₹2,400.00')
    const [slackText] = slackMock.mock.calls[0] ?? []
    expect(slackText).toContain('Daily Summary, All Branches')
    expect(slackText).toContain('Whitefield')
    expect(heartbeatMock).toHaveBeenCalledWith('NIGHTLY_SALES')
  })

  it('answers 500 before sending anything when reading fails', async () => {
    dbMocks.getDailyBranchReports.mockRejectedValue(new Error('timeout'))

    const res = await dailyPOST(jobRequest())

    expect(res.status).toBe(500)
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(slackMock).not.toHaveBeenCalled()
    expect(heartbeatMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/jobs/weekly-report', () => {
  it('compares each branch with its own previous week', async () => {
    dbMocks.getBranchPeople.mockResolvedValue({ branches: [RS, MH, FR], developer: DEV })
    const thisWeek = new Map([['branch_rs', figures(150_000)]])
    const lastWeek = new Map([
      ['branch_rs', figures(100_000)],
      ['branch_fr', figures(50_000)],
    ])
    let call = 0
    dbMocks.getWeeklyBranchReports.mockImplementation(async (start: string, end: string) => {
      call += 1
      return {
        date: new Date(`${start}T00:00:00.000Z`),
        periodStart: new Date(`${start}T00:00:00.000Z`),
        periodEnd: new Date(`${end}T00:00:00.000Z`),
        branches: call === 1 ? thisWeek : lastWeek,
      }
    })

    const res = await weeklyPOST(jobRequest())

    expect(await res.json()).toMatchObject({ success: true, branches: 3 })
    const manager = emailTo('manager@x.test')
    expect(manager?.subject).toBe('Royal Glow Rayasandra — Weekly Sales Report')
    expect(manager?.html).toContain('Week-over-week: +₹500.00 (+50%)')
    const franchise = emailTo('franchise@x.test')
    expect(franchise?.html).toContain('Week-over-week: -₹500.00 (-100%)')
    expect(franchise?.html).not.toContain('Rayasandra')
    expect(emailTo('dev@x.test')?.subject).toBe('Royal Glow — Weekly Summary, All Branches')
  })
})

describe('customer messages name the real branch', () => {
  it('appointment reminders say which branch the appointment is at', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 10:00 IST on 25/10; the appointment is 10:05 IST the next day.
    vi.setSystemTime(new Date('2026-10-25T04:30:00.000Z'))
    dbMocks.getUpcomingConfirmedBookings.mockResolvedValue([
      {
        id: 'bk_9',
        bookingNumber: 'BK-MH-2610-H-12345',
        customerId: 'cust_1',
        bookingDate: new Date('2026-10-26T00:00:00.000Z'),
        startTime: '10:05:00',
        branchName: 'Marathahalli',
        customerName: 'Priya',
        customerEmail: 'priya@x.test',
        appointmentRemindersEnabled: true,
      },
    ])

    const res = await remindersPOST(jobRequest())

    expect(await res.json()).toEqual({ success: true, processed: 1 })
    expect(notificationFor('cust_1')).toMatchObject({ type: 'reminder_24h', bookingId: 'bk_9' })
    expect(notificationFor('cust_1')?.body).toContain('Royal Glow Marathahalli')
  })

  it("the review request links the branch's own Google listing, escaped", async () => {
    dbMocks.getBookingForFollowup.mockResolvedValue({
      id: 'bk_7',
      status: 'completed',
      serviceType: 'salon',
      customerId: 'cust_2',
      customerName: 'Asha',
      customerEmail: 'asha@x.test',
      marketingConsent: true,
      branchName: 'Rayasandra',
      branchGoogleMapsUrl: 'https://maps.app.goo.gl/abc?x=1&y=2',
    })

    const res = await followupPOST(jobRequest(JSON.stringify({ bookingId: 'bk_7' })))

    expect(await res.json()).toEqual({ success: true, sent: true })
    const email = emailTo('asha@x.test')
    expect(email?.html).toContain('at Royal Glow Rayasandra')
    expect(email?.html).toContain('href="https://maps.app.goo.gl/abc?x=1&amp;y=2"')
  })

  it('drops a review link that is not https', async () => {
    dbMocks.getBookingForFollowup.mockResolvedValue({
      id: 'bk_8',
      status: 'completed',
      serviceType: 'spa',
      customerId: 'cust_3',
      customerName: 'Meera',
      customerEmail: 'meera@x.test',
      marketingConsent: true,
      branchName: 'Marathahalli',
      branchGoogleMapsUrl: 'javascript:alert(1)',
    })

    await followupPOST(jobRequest(JSON.stringify({ bookingId: 'bk_8' })))

    const email = emailTo('meera@x.test')
    expect(email?.html).not.toContain('href=')
    expect(email?.html).toContain('Royal Glow Marathahalli')
  })
})
