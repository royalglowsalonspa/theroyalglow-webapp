/************************************************************
 * Module Name  : catalogue-fields.test
 * Scope        : CMS — SAC code, branch availability and editor fields
 *                (multi-branch tasks §6, catalogue-availability.md)
 *
 * Description  : The shared catalogue fields as both collections declare
 *                them: the SAC select is limited to the reviewed codes, the
 *                branch list is validated (shape while editing, branch ids on
 *                save) and cleared for All branches, every save records the
 *                CMS login, and both collections keep every version.
 *
 * Notes        : `txDb` is the only seam doubled; it answers the branch
 *                lookup the save-time validation makes.
 ************************************************************/

import { REVIEWED_SAC_CODES } from '@rgss/types'
import type { Field, FieldHook } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Service } from '../../collections/Service'
import { ServiceCategory } from '../../collections/ServiceCategory'
import {
  availabilityFields,
  editedByField,
  normaliseBranchIds,
  sacCodeField,
  setEditedBy,
  validateAvailableBranches,
} from '../catalogue-fields'
import { txDb } from '../sync-db'

vi.mock('../sync-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sync-db')>()
  return { ...actual, txDb: vi.fn() }
})

afterEach(() => {
  vi.mocked(txDb).mockReset()
})

type Named = { name?: string } & Record<string, unknown>

function fieldNamed(fields: readonly Field[], name: string): Named {
  const found = (fields as readonly unknown[] as readonly Named[]).find((f) => f.name === name)
  if (!found) {
    throw new Error(`no field ${name}`)
  }
  return found
}

/** A fake `txDb` handle whose branch lookup knows `ids`. */
function branchesKnown(ids: readonly string[]) {
  const where = vi.fn(async () => ids.map((id) => ({ id })))
  const from = vi.fn(() => ({ where }))
  vi.mocked(txDb).mockResolvedValue({ select: vi.fn(() => ({ from })) } as never)
  return { where }
}

type ValidateArgs = Parameters<typeof validateAvailableBranches>[1]

function validate(
  value: string[] | null,
  siblingData: Record<string, unknown>,
  event: 'onChange' | 'submit',
) {
  return validateAvailableBranches(
    value as string[],
    {
      event,
      req: {},
      siblingData,
    } as unknown as ValidateArgs,
  )
}

describe('sacCodeField', () => {
  it('offers exactly the reviewed codes, labelled with what they cover', () => {
    const field = sacCodeField({ required: true, description: 'x' }) as Named & {
      options: { label: string; value: string }[]
    }
    expect(field.options.map((o) => o.value)).toEqual([...REVIEWED_SAC_CODES])
    expect(field.options[0]?.label).toBe('999721 · Hair care and barber work')
    expect(field.type).toBe('select')
  })

  it('is required on a category and clearable (the category’s) on a service', () => {
    const category = fieldNamed(ServiceCategory.fields, 'sacCode') as Named & {
      admin: { isClearable: boolean }
    }
    const service = fieldNamed(Service.fields, 'sacCode') as Named & {
      admin: { isClearable: boolean }
    }
    expect(category.required).toBe(true)
    expect(category.admin.isClearable).toBe(false)
    expect(service.required).toBe(false)
    expect(service.admin.isClearable).toBe(true)
  })
})

describe('availabilityFields', () => {
  const [radio, list] = availabilityFields('service') as unknown as [Named, Named]

  it('defaults to All branches, and lists branches only for Selected branches', () => {
    expect(radio).toMatchObject({ name: 'availability', type: 'radio', defaultValue: 'all' })
    expect(list).toMatchObject({ name: 'availableBranches', type: 'text', hasMany: true })
    const condition = (list.admin as { condition: (d: unknown, s: unknown) => boolean }).condition
    expect(condition({}, { availability: 'selected' })).toBe(true)
    expect(condition({}, { availability: 'all' })).toBe(false)
    expect((list.admin as { components: { Field: string } }).components.Field).toBe(
      '/components/BranchAvailabilityField#BranchAvailabilityField',
    )
  })

  it('keeps the ids, cleaned up, only while Selected branches is chosen', () => {
    const [hook] = (list.hooks as { beforeChange: FieldHook[] }).beforeChange
    const run = (value: unknown, siblingData: object, originalDoc?: object) =>
      (hook as FieldHook)({
        value,
        siblingData,
        originalDoc,
      } as unknown as Parameters<FieldHook>[0])
    expect(run(['rs', ' mh ', 'rs'], { availability: 'selected' })).toEqual(['mh', 'rs'])
    expect(run(['rs'], { availability: 'all' })).toEqual([])
    // A partial update without the radio keeps the stored choice.
    expect(run(['rs'], {}, { availability: 'selected' })).toEqual(['rs'])
    expect(run(['rs'], {}, { availability: 'all' })).toEqual([])
  })

  it('is declared on both collections, after the gems and status fields', () => {
    for (const collection of [Service, ServiceCategory]) {
      expect(fieldNamed(collection.fields, 'availability').type).toBe('radio')
      expect(fieldNamed(collection.fields, 'availableBranches').hasMany).toBe(true)
    }
  })
})

describe('normaliseBranchIds', () => {
  it('keeps unique, trimmed, non-empty strings in order', () => {
    expect(normaliseBranchIds([' b', 'a', 'b', '', 3, null])).toEqual(['a', 'b'])
    expect(normaliseBranchIds('a')).toEqual([])
  })
})

describe('validateAvailableBranches', () => {
  it('accepts anything for All branches, without a database read', async () => {
    expect(await validate(null, { availability: 'all' }, 'submit')).toBe(true)
    expect(txDb).not.toHaveBeenCalled()
  })

  it('needs at least one branch for Selected branches', async () => {
    expect(await validate([], { availability: 'selected' }, 'onChange')).toMatch(
      /Choose at least one branch, or choose All branches/,
    )
  })

  it('checks only the shape while editing', async () => {
    expect(await validate(['nope'], { availability: 'selected' }, 'onChange')).toBe(true)
    expect(txDb).not.toHaveBeenCalled()
  })

  it('on save, refuses an id that names no branch', async () => {
    const { where } = branchesKnown(['branch_rs'])
    expect(await validate(['branch_rs', 'ghost'], { availability: 'selected' }, 'submit')).toBe(
      'No branch has the id ghost. Choose the branches again.',
    )
    expect(where).toHaveBeenCalledTimes(1)
  })

  it('on save, accepts branches that exist', async () => {
    branchesKnown(['branch_mh', 'branch_rs'])
    expect(await validate(['branch_rs', 'branch_mh'], { availability: 'selected' }, 'submit')).toBe(
      true,
    )
  })
})

describe('editedBy', () => {
  it('records the CMS login that saved, or system without one', () => {
    const run = (req: unknown) => setEditedBy({ req } as unknown as Parameters<FieldHook>[0])
    expect(run({ user: { email: 'owner@theroyalglow.in' } })).toBe('owner@theroyalglow.in')
    expect(run({ user: null })).toBe('system')
    expect(run(undefined)).toBe('system')
  })

  it('is read-only in the sidebar, and set by its hook on every save', () => {
    const field = editedByField() as Named & {
      admin: { readOnly: boolean; position: string }
      hooks: { beforeChange: FieldHook[] }
    }
    expect(field.admin).toMatchObject({ readOnly: true, position: 'sidebar' })
    expect(field.hooks.beforeChange).toEqual([setEditedBy])
    for (const collection of [Service, ServiceCategory]) {
      expect(fieldNamed(collection.fields, 'editedBy').type).toBe('text')
    }
  })
})

describe('version history', () => {
  it('keeps every version of services and categories, without drafts', () => {
    for (const collection of [Service, ServiceCategory]) {
      expect(collection.versions).toEqual({ maxPerDoc: 0 })
    }
  })
})
