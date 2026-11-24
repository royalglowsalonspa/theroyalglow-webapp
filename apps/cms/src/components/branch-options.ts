/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : branch-options
 * Scope        : CMS Admin — branch picker options (pure)
 *
 * Description  : Which branches the availability picker lists, and how each
 *                is labelled (catalogue-availability.md). Kept apart from the
 *                React component so it can be tested without the admin UI.
 *
 * Tech Stack   : TypeScript
 * Layer        : CMS (Admin component support)
 *
 * Dependencies : none
 *
 * Notes        : Shut-down branches are hidden unless already chosen, and a
 *                chosen id no branch has is shown so it can be unticked.
 ************************************************************/

/** A branch as GET /api/catalogue-branches returns it. */
export type CatalogueBranch = { id: string; name: string; code: string; status: string }

const STATUS_NOTE: Record<string, string> = {
  temporarily_closed: 'temporarily closed',
  opens_soon: 'opens soon',
  shutdown: 'shut down',
}

/** The branches to list: every one not shut down, plus any already chosen. */
export function branchOptions(
  branches: readonly CatalogueBranch[],
  selected: ReadonlySet<string>,
): { id: string; label: string }[] {
  const known = new Set(branches.map((b) => b.id))
  const listed = branches
    .filter((b) => b.status !== 'shutdown' || selected.has(b.id))
    .map((b) => {
      const note = STATUS_NOTE[b.status]
      return { id: b.id, label: note ? `${b.name} (${b.code}, ${note})` : `${b.name} (${b.code})` }
    })
  const unknown = [...selected]
    .filter((id) => !known.has(id))
    .sort()
    .map((id) => ({ id, label: `Unknown branch ${id}` }))
  return [...listed, ...unknown]
}
