/************************************************************
 * Module Name  : branch/shutdown
 * Scope        : Business Logic — shutting a branch down (multi-branch R1.10)
 *
 * Description  : What the Developer is told before a branch can shut down,
 *                and when a shut-down branch may be deleted. Pure: the caller
 *                reads the rows, these decide and phrase.
 *
 * Rules :
 * - Before shutdown: the Manager moves (Users & Roles), everyone working there
 *   is removed or moved, bookings still to happen are completed, cancelled or
 *   moved, unpaid invoices are settled, and waitlist entries are resolved.
 * - A shut-down branch keeps its history and takes no new activity.
 * - Delete only a shut-down branch with no records left (the database's
 *   foreign keys decide); its audit history stays.
 *
 * Layer        : Business Logic (pure, no I/O)
 ************************************************************/

/** The open items the shutdown check reads. */
export type ShutdownBlockerSummary = {
  manager: { name: string } | null
  people: readonly { name: string; role: string }[]
  bookings: { count: number }
  unpaidInvoices: { count: number }
  waitlist: { count: number }
}

const ROLE_LABEL: Readonly<Record<string, string>> = {
  receptionist: 'Receptionist',
  staff: 'Stylist or Therapist',
  manager: 'Manager',
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** One line per open item, saying what to do about it. Empty when clear. */
export function shutdownBlockerLines(blockers: ShutdownBlockerSummary): string[] {
  const lines: string[] = []
  if (blockers.manager) {
    lines.push(`Move the Manager, ${blockers.manager.name}, in Users & Roles.`)
  }
  if (blockers.people.length > 0) {
    const names = blockers.people
      .map((p) => `${p.name} (${ROLE_LABEL[p.role] ?? p.role})`)
      .join(', ')
    lines.push(
      `Remove or move ${plural(blockers.people.length, 'person who works', 'people who work')} here: ${names}.`,
    )
  }
  if (blockers.bookings.count > 0) {
    lines.push(
      `Complete, cancel or move ${plural(blockers.bookings.count, 'booking', 'bookings')} still to happen.`,
    )
  }
  if (blockers.unpaidInvoices.count > 0) {
    lines.push(
      `Settle ${plural(blockers.unpaidInvoices.count, 'unpaid invoice', 'unpaid invoices')}.`,
    )
  }
  if (blockers.waitlist.count > 0) {
    lines.push(`Resolve ${plural(blockers.waitlist.count, 'waitlist entry', 'waitlist entries')}.`)
  }
  return lines
}

/** The 409 message for a refused shutdown. */
export function shutdownBlockedMessage(branchName: string, lines: readonly string[]): string {
  return `${branchName} can't shut down yet. ${lines.join(' ')}`
}
