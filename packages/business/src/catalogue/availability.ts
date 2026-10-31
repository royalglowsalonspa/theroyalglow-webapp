/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : catalogue/availability
 * Scope        : Business Logic — Service catalogue
 *
 * Description  : Which branches offer a service (multi-branch R4.2–R4.3,
 *                R7.2; catalogue-availability.md). A category and a service
 *                are each offered at all branches, including ones added
 *                later, or at the branches listed; a service is offered at a
 *                branch only when its category is too.
 *
 * Responsibilities :
 * - effectiveBranchIds(service, category) → null (all) or the branch list
 * - isOfferedAt(availableBranchIds, branchId)
 * - assertServicesOfferedAt(services, branch) — 400 naming what isn't offered
 * - availabilityLabel(availableBranchIds, branchNames) — "Only at …"
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/errors
 *
 * Notes        :
 * - Pure: no I/O. The database decides the same with
 *   `service_available_at` (0034), which refuses a booking line for a
 *   service its booking's branch doesn't offer.
 ************************************************************/
import { badRequest } from '@rgss/errors'

/** An entity's own availability: every branch, or the listed ones. */
export interface BranchAvailability {
  allBranches: boolean
  branchIds: readonly string[]
}

function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort()
}

/**
 * The branches a service is offered at, from its own and its category's
 * availability: null for every branch (including branches added later),
 * otherwise the sorted list, which can be empty.
 */
export function effectiveBranchIds(
  service: BranchAvailability,
  category: BranchAvailability,
): string[] | null {
  if (service.allBranches && category.allBranches) {
    return null
  }
  if (service.allBranches) {
    return uniqueSorted(category.branchIds)
  }
  if (category.allBranches) {
    return uniqueSorted(service.branchIds)
  }
  const inCategory = new Set(category.branchIds)
  return uniqueSorted(service.branchIds.filter((id) => inCategory.has(id)))
}

/**
 * Whether a service with these effective branches is offered at `branchId`.
 * Null (or absent, from a read that doesn't carry it) means every branch.
 */
export function isOfferedAt(
  availableBranchIds: readonly string[] | null | undefined,
  branchId: string,
): boolean {
  return !availableBranchIds || availableBranchIds.includes(branchId)
}

/**
 * Throw 400 VALIDATION_ERROR when any service isn't offered at the branch,
 * naming them, so the customer or the counter can choose again. The database
 * refuses the same lines (0034); this gives the message.
 */
export function assertServicesOfferedAt(
  services: readonly { name: string; availableBranchIds?: readonly string[] | null }[],
  branch: { id: string; name: string },
): void {
  const missing = services.filter((s) => !isOfferedAt(s.availableBranchIds, branch.id))
  if (missing.length === 0) {
    return
  }
  const names = [...new Set(missing.map((s) => s.name))]
  const subject = names.length === 1 ? `${names[0]} isn't` : `${joinNames(names)} aren't`
  throw badRequest(
    `${subject} offered at ${branch.name}. Choose another service, or book at a branch that offers it.`,
  )
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? ''
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * A customer-facing note for a restricted service: "Only at Rayasandra",
 * "Only at Marathahalli and Rayasandra". Null when every branch offers it.
 * Branches missing from `branchNames` (shut down, or not public) are left out;
 * with none left the note says it isn't offered anywhere now.
 */
export function availabilityLabel(
  availableBranchIds: readonly string[] | null,
  branchNames: ReadonlyMap<string, string>,
): string | null {
  if (availableBranchIds === null) {
    return null
  }
  const names = availableBranchIds
    .map((id) => branchNames.get(id))
    .filter((name): name is string => typeof name === 'string')
    .sort((a, b) => a.localeCompare(b))
  if (names.length === 0) {
    return 'Not offered at any branch right now'
  }
  return `Only at ${joinNames(names)}`
}
