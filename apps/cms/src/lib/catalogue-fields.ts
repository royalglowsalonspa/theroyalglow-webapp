/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : catalogue-fields (lib)
 * Scope        : CMS Collections — fields shared by Service and
 *                ServiceCategory (multi-branch tasks §6)
 *
 * Description  : The tax classification (SAC code), branch availability and
 *                editor attribution fields the two catalogue collections
 *                share, with their validation and hooks
 *                (catalogue-availability.md).
 *
 * Responsibilities :
 * - sacCodeField — a select limited to REVIEWED_SAC_CODES
 * - availabilityFields — All branches / Selected branches + the branch ids
 * - editedByField — who saved each version, set from the CMS login
 * - normaliseBranchIds / validateAvailableBranches — exported for tests
 *
 * Tech Stack   : Payload CMS v3, TypeScript
 * Layer        : CMS (Collections)
 *
 * Dependencies : payload, @rgss/types, drizzle-orm, ./sync-db
 *
 * Notes        :
 * - Branches live in the application schema (`public.branch`), so the branch
 *   field uses a custom component that lists them from
 *   GET /api/catalogue-branches; on save, validation checks every id names a
 *   branch. While editing it checks only the shape (no database read).
 * - The sync hooks mirror these fields into `public.*` (sac_code,
 *   all_branches, service_branch / service_category_branch).
 ************************************************************/
import { REVIEWED_SAC_CODES, SAC_CODE_LABELS } from '@rgss/types'
import { inArray } from 'drizzle-orm'
import type { Field, FieldHook, TextFieldManyValidation } from 'payload'
import { branch, txDb } from './sync-db'

/** Where the availability radio lives, and its two values. */
export const AVAILABILITY_ALL = 'all'
export const AVAILABILITY_SELECTED = 'selected'
export type Availability = typeof AVAILABILITY_ALL | typeof AVAILABILITY_SELECTED

/** The SAC code select, limited to the reviewed codes (tax-settings.md §1). */
export function sacCodeField(options: { required: boolean; description: string }): Field {
  return {
    name: 'sacCode',
    type: 'select',
    label: 'SAC code (tax classification)',
    required: options.required,
    options: REVIEWED_SAC_CODES.map((code) => ({
      label: `${code} · ${SAC_CODE_LABELS[code]}`,
      value: code,
    })),
    admin: {
      description: options.description,
      isClearable: !options.required,
    },
  }
}

/** Unique, trimmed, non-empty ids in order. */
export function normaliseBranchIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const ids = value
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
  return [...new Set(ids)].sort()
}

function availabilityOf(
  siblingData: Record<string, unknown> | undefined,
  previous: Record<string, unknown> | undefined,
): Availability {
  const value = siblingData?.availability ?? previous?.availability
  return value === AVAILABILITY_SELECTED ? AVAILABILITY_SELECTED : AVAILABILITY_ALL
}

/**
 * "Selected branches" needs at least one branch, and on save every id must
 * name a branch. Payload skips this while the field is hidden (All branches).
 */
export const validateAvailableBranches: TextFieldManyValidation = async (value, options) => {
  const siblingData = options.siblingData as Record<string, unknown> | undefined
  if (availabilityOf(siblingData, undefined) !== AVAILABILITY_SELECTED) {
    return true
  }
  const ids = normaliseBranchIds(value)
  if (ids.length === 0) {
    return 'Choose at least one branch, or choose All branches. To stop offering it everywhere, untick Active instead.'
  }
  if (options.event !== 'submit') {
    return true
  }
  const db = await txDb(options.req)
  const known = await db.select({ id: branch.id }).from(branch).where(inArray(branch.id, ids))
  const knownIds = new Set(known.map((row) => row.id))
  const unknown = ids.filter((id) => !knownIds.has(id))
  if (unknown.length > 0) {
    return `No branch has the id ${unknown.join(', ')}. Choose the branches again.`
  }
  return true
}

/** Keep the ids only while Selected branches is chosen, cleaned up. */
const keepSelectedBranches: FieldHook = ({ value, siblingData, originalDoc }) =>
  availabilityOf(
    siblingData as Record<string, unknown> | undefined,
    originalDoc as Record<string, unknown> | undefined,
  ) === AVAILABILITY_SELECTED
    ? normaliseBranchIds(value)
    : []

/** All branches (default, includes branches added later) or the ones listed. */
export function availabilityFields(subject: 'service' | 'category'): Field[] {
  const intersection =
    subject === 'service'
      ? ' A service is only offered where its category is too.'
      : ' Its services can narrow this further.'
  return [
    {
      name: 'availability',
      type: 'radio',
      label: 'Offered at',
      required: true,
      defaultValue: AVAILABILITY_ALL,
      options: [
        { label: 'All branches', value: AVAILABILITY_ALL },
        { label: 'Selected branches', value: AVAILABILITY_SELECTED },
      ],
      admin: {
        layout: 'horizontal',
        description: `All branches includes branches opened later.${intersection}`,
      },
    },
    {
      name: 'availableBranches',
      type: 'text',
      hasMany: true,
      label: 'Branches',
      validate: validateAvailableBranches,
      hooks: { beforeChange: [keepSelectedBranches] },
      admin: {
        condition: (_data, siblingData) => siblingData?.availability === AVAILABILITY_SELECTED,
        description: 'Customers and the counter can only choose it at these branches.',
        components: {
          Field: '/components/BranchAvailabilityField#BranchAvailabilityField',
        },
      },
    },
  ]
}

/** The CMS login that saved this version: set on every save and restore. */
export const setEditedBy: FieldHook = ({ req }) => {
  const email = (req?.user as { email?: unknown } | null | undefined)?.email
  return typeof email === 'string' && email.length > 0 ? email : 'system'
}

/**
 * Who saved this version. Payload's version records don't name the editor, so
 * every saved (or restored) version carries it here (design §5).
 */
export function editedByField(): Field {
  return {
    name: 'editedBy',
    type: 'text',
    label: 'Last saved by',
    hooks: { beforeChange: [setEditedBy] },
    admin: {
      readOnly: true,
      position: 'sidebar',
      description: 'The CMS login that saved this version. Set automatically.',
    },
  }
}
