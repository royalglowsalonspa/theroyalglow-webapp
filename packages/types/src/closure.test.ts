import { describe, expect, it } from 'vitest'
import {
  CLOSURE_NAME_MAX_LENGTH,
  closureCreateSchema,
  closureListQuerySchema,
  isCalendarDate,
} from './closure'

describe('isCalendarDate', () => {
  it('accepts real dates only', () => {
    expect(isCalendarDate('2026-11-08')).toBe(true)
    expect(isCalendarDate('2028-02-29')).toBe(true)
    expect(isCalendarDate('2026-02-29')).toBe(false)
    expect(isCalendarDate('2026-02-30')).toBe(false)
    expect(isCalendarDate('2026-13-01')).toBe(false)
    expect(isCalendarDate('08/11/2026')).toBe(false)
    expect(isCalendarDate('2026-11-8')).toBe(false)
  })
})

describe('closureCreateSchema', () => {
  const valid = { branchId: 'branch_rs', date: '2026-11-08', name: '  Diwali  ' }

  it('accepts one day, trimming the name', () => {
    const parsed = closureCreateSchema.safeParse(valid)
    expect(parsed.success).toBe(true)
    expect(parsed.data?.name).toBe('Diwali')
    expect(parsed.data?.allBranches).toBeUndefined()
  })

  it('accepts a range and the every-branch flag', () => {
    const parsed = closureCreateSchema.safeParse({
      ...valid,
      endDate: '2026-11-10',
      allBranches: true,
    })
    expect(parsed.success).toBe(true)
  })

  it('requires the rendered branch, a real date and a name', () => {
    expect(closureCreateSchema.safeParse({ ...valid, branchId: '' }).success).toBe(false)
    expect(closureCreateSchema.safeParse({ ...valid, date: '2026-02-30' }).success).toBe(false)
    expect(closureCreateSchema.safeParse({ ...valid, endDate: 'tomorrow' }).success).toBe(false)
    expect(closureCreateSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false)
    expect(
      closureCreateSchema.safeParse({ ...valid, name: 'x'.repeat(CLOSURE_NAME_MAX_LENGTH + 1) })
        .success,
    ).toBe(false)
  })
})

describe('closureListQuerySchema', () => {
  it('takes optional from/to dates', () => {
    expect(closureListQuerySchema.safeParse({}).success).toBe(true)
    expect(closureListQuerySchema.safeParse({ from: '2026-11-01' }).success).toBe(true)
    expect(closureListQuerySchema.safeParse({ from: 'soon' }).success).toBe(false)
  })
})
