/************************************************************
 * Module Name  : branch/recipients
 * Scope        : Business Logic — who hears about a branch (multi-branch R1.9, R7.4)
 *
 * Description  : Pure rules for whom a background job tells about something
 *                that happened at one branch. The caller reads each branch's
 *                current role holders; these functions decide.
 *
 * Rules :
 * - Day-to-day alerts (a booking still pending, a possible no-show, a lead to
 *   follow up) go to the branch's Receptionist and Manager. The Owner stands
 *   in for a missing Manager, as they cover its administration (R1.9). The
 *   Developer is never on them.
 * - Sales reports go to the branch's Owner and Manager. Only the Developer
 *   gets the summary across branches (R2.1, R3.2, R7.4).
 * - A lead follow-up goes to the person it is assigned to while they still
 *   hold a role at the lead's branch, otherwise to the branch's front desk.
 * - The missing-Manager reminder goes to the Owner of each operational branch
 *   without a Manager: one message per Owner, listing their branches (R1.9).
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic (pure, no I/O)
 ************************************************************/

import type { BranchStatusValue } from '@rgss/types'

/** Someone who holds a branch role, with how to reach them. */
export type BranchContact = { userId: string; name: string; email: string }

/** A branch's role holders now. */
export type BranchPeople = {
  owner: BranchContact | null
  manager: BranchContact | null
  receptionist: BranchContact | null
}

function uniqueContacts(candidates: readonly (BranchContact | null)[]): BranchContact[] {
  const seen = new Set<string>()
  const out: BranchContact[] = []
  for (const candidate of candidates) {
    if (candidate !== null && !seen.has(candidate.userId)) {
      seen.add(candidate.userId)
      out.push(candidate)
    }
  }
  return out
}

/**
 * Who handles a branch's day-to-day alerts: its Receptionist, and its Manager
 * or, without one, its Owner.
 */
export function frontDeskRecipients(people: BranchPeople): BranchContact[] {
  return uniqueContacts([people.receptionist, people.manager ?? people.owner])
}

/** Who receives a branch's sales reports: its Owner and its Manager. */
export function branchReportRecipients(people: BranchPeople): BranchContact[] {
  return uniqueContacts([people.owner, people.manager])
}

/** True when the person is the branch's Owner, Manager or Receptionist. */
export function holdsBranchRole(people: BranchPeople, userId: string): boolean {
  return [people.owner, people.manager, people.receptionist].some(
    (holder) => holder?.userId === userId,
  )
}

// ── Lead follow-ups ─────────────────────────────────────────────────────────

export type StaleLeadInput = {
  name: string
  branchId: string | null
  assignedTo: string | null
}

export type RecipientBranch = {
  id: string
  name: string
  people: BranchPeople
}

/** One person's follow-up reminder: every stale lead they should chase. */
export type LeadFollowUpDigest = {
  userId: string
  total: number
  /** The lead's name when the digest covers exactly one lead. */
  leadName: string | null
  /** Leads per branch, in the order the branches were given. */
  branches: { branchId: string; branchName: string; count: number }[]
}

export type LeadFollowUpPlan = {
  /** Ordered by user id. */
  digests: LeadFollowUpDigest[]
  /** Leads nobody can be told about: no known branch, or nobody there. */
  unrouted: number
}

/**
 * Who chases which stale lead. The assignee keeps a lead while they hold a
 * role at its branch (the Developer acts at every branch); otherwise the
 * branch's front desk gets it.
 */
export function planLeadFollowUps(params: {
  leads: readonly StaleLeadInput[]
  branches: readonly RecipientBranch[]
  developerUserId: string | null
}): LeadFollowUpPlan {
  const branchOrder = new Map(params.branches.map((b, index) => [b.id, index]))
  const byId = new Map(params.branches.map((b) => [b.id, b]))
  const perUser = new Map<string, { names: string[]; perBranch: Map<string, number> }>()
  let unrouted = 0

  for (const lead of params.leads) {
    const branch = lead.branchId === null ? undefined : byId.get(lead.branchId)
    if (!branch) {
      unrouted += 1
      continue
    }
    const assignee = lead.assignedTo
    const keepsLead =
      assignee !== null &&
      (holdsBranchRole(branch.people, assignee) || assignee === params.developerUserId)
    const recipients = keepsLead
      ? [assignee]
      : frontDeskRecipients(branch.people).map((c) => c.userId)
    if (recipients.length === 0) {
      unrouted += 1
      continue
    }
    for (const userId of recipients) {
      const entry = perUser.get(userId) ?? { names: [], perBranch: new Map<string, number>() }
      entry.names.push(lead.name)
      entry.perBranch.set(branch.id, (entry.perBranch.get(branch.id) ?? 0) + 1)
      perUser.set(userId, entry)
    }
  }

  const digests = [...perUser.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([userId, entry]) => {
      const branches = [...entry.perBranch.entries()]
        .sort(([a], [b]) => (branchOrder.get(a) ?? 0) - (branchOrder.get(b) ?? 0))
        .map(([branchId, count]) => ({
          branchId,
          branchName: byId.get(branchId)?.name ?? branchId,
          count,
        }))
      const total = entry.names.length
      return { userId, total, leadName: total === 1 ? (entry.names[0] ?? null) : null, branches }
    })

  return { digests, unrouted }
}

/** The values the `lead_follow_up_due` notification text is built from. */
export function leadFollowUpMessageData(digest: LeadFollowUpDigest): Record<string, string> {
  const [only] = digest.branches
  if (digest.total === 1 && only) {
    return {
      count: '1',
      ...(digest.leadName ? { leadName: digest.leadName } : {}),
      branchName: only.branchName,
    }
  }
  if (digest.branches.length === 1 && only) {
    return { count: String(digest.total), branchName: only.branchName }
  }
  return {
    count: String(digest.total),
    branchBreakdown: digest.branches.map((b) => `${b.count} at ${b.branchName}`).join(', '),
  }
}

// ── Sales reports (R7.4) ────────────────────────────────────────────────────

export type ReportBranchInput = {
  id: string
  name: string
  status: BranchStatusValue
  people: BranchPeople
  /** Whether the branch had any paid invoice or booking in the period. */
  hasActivity: boolean
}

/** One email: every branch report this person may read, in branch order. */
export type ReportDelivery = {
  to: BranchContact
  branchIds: string[]
}

export type ReportPlan = {
  /** Branches that get a report: every operational one, and any with activity. */
  branchIds: string[]
  /** One per person, in the order they first appear. */
  deliveries: ReportDelivery[]
}

/**
 * Which branches get a report and who reads each: the branch's Owner and
 * Manager. Someone with several branches gets one email covering them all.
 * The summary across branches is the Developer's alone and isn't planned here.
 */
export function planReportDeliveries(branches: readonly ReportBranchInput[]): ReportPlan {
  const reported = branches.filter((b) => b.status === 'operational' || b.hasActivity)
  const byUser = new Map<string, ReportDelivery>()
  for (const branch of reported) {
    for (const contact of branchReportRecipients(branch.people)) {
      const delivery = byUser.get(contact.userId) ?? { to: contact, branchIds: [] }
      delivery.branchIds.push(branch.id)
      byUser.set(contact.userId, delivery)
    }
  }
  return { branchIds: reported.map((b) => b.id), deliveries: [...byUser.values()] }
}

// ── Missing Manager (R1.9) ──────────────────────────────────────────────────

export type ManagerCheckBranch = {
  id: string
  name: string
  status: BranchStatusValue
  owner: BranchContact | null
  manager: BranchContact | null
}

/** One Owner's reminder, naming each of their branches without a Manager. */
export type MissingManagerReminder = {
  owner: BranchContact
  branches: { id: string; name: string }[]
}

/** True when the branch is operational and has no Manager (banner and reminder). */
export function lacksManager(branch: { status: BranchStatusValue; hasManager: boolean }): boolean {
  return branch.status === 'operational' && !branch.hasManager
}

/**
 * The reminders to send: each Owner with at least one operational branch
 * without a Manager, with those branches in the order given. A branch gets
 * none once it has a Manager or stops being operational.
 */
export function missingManagerReminders(
  branches: readonly ManagerCheckBranch[],
): MissingManagerReminder[] {
  const byOwner = new Map<string, MissingManagerReminder>()
  for (const branch of branches) {
    const missing = lacksManager({ status: branch.status, hasManager: branch.manager !== null })
    if (!(missing && branch.owner)) {
      continue
    }
    const reminder = byOwner.get(branch.owner.userId) ?? { owner: branch.owner, branches: [] }
    reminder.branches.push({ id: branch.id, name: branch.name })
    byOwner.set(branch.owner.userId, reminder)
  }
  return [...byOwner.values()]
}

function listNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? ''
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`
}

/** The values the `branch_manager_missing` notification text is built from. */
export function missingManagerMessageData(
  reminder: MissingManagerReminder,
): Record<string, string> {
  const names = reminder.branches.map((b) => b.name)
  return names.length === 1
    ? { count: '1', branchName: names[0] ?? '' }
    : { count: String(names.length), branchList: listNames(names) }
}
