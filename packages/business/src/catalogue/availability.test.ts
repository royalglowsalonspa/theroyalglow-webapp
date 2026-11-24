import { AppError } from '@rgss/errors'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  assertServicesOfferedAt,
  availabilityLabel,
  effectiveBranchIds,
  isOfferedAt,
} from './availability'

const ALL = { allBranches: true, branchIds: [] }
const only = (...branchIds: string[]) => ({ allBranches: false, branchIds })

describe('effectiveBranchIds', () => {
  it('is null (every branch, including later ones) when both are all branches', () => {
    expect(effectiveBranchIds(ALL, ALL)).toBeNull()
  })

  it('takes the restricted side when the other is all branches', () => {
    expect(effectiveBranchIds(only('mh', 'rs'), ALL)).toEqual(['mh', 'rs'])
    expect(effectiveBranchIds(ALL, only('rs'))).toEqual(['rs'])
  })

  it('intersects two restrictions, sorted and without repeats', () => {
    expect(effectiveBranchIds(only('rs', 'mh', 'rs'), only('mh', 'kr'))).toEqual(['mh'])
    expect(effectiveBranchIds(only('rs'), only('mh'))).toEqual([])
  })

  it('ignores the branch rows of a side that is all branches', () => {
    expect(effectiveBranchIds({ allBranches: true, branchIds: ['zz'] }, only('rs'))).toEqual(['rs'])
  })

  it('offers a service at a branch exactly when both sides include it', () => {
    const side = fc.record({
      allBranches: fc.boolean(),
      branchIds: fc.array(fc.constantFrom<string>('a', 'b', 'c', 'd'), { maxLength: 6 }),
    })
    fc.assert(
      fc.property(side, side, fc.constantFrom<string>('a', 'b', 'c', 'd', 'e'), (s, c, branch) => {
        const includes = (x: typeof s) => x.allBranches || x.branchIds.includes(branch)
        expect(isOfferedAt(effectiveBranchIds(s, c), branch)).toBe(includes(s) && includes(c))
      }),
    )
  })
})

describe('isOfferedAt', () => {
  it('offers an all-branches service everywhere, and a restricted one only where listed', () => {
    expect(isOfferedAt(null, 'any')).toBe(true)
    expect(isOfferedAt(['rs'], 'rs')).toBe(true)
    expect(isOfferedAt(['rs'], 'mh')).toBe(false)
    expect(isOfferedAt([], 'rs')).toBe(false)
  })
})

describe('assertServicesOfferedAt', () => {
  const branch = { id: 'mh', name: 'Marathahalli' }

  it('passes when every service is offered there', () => {
    expect(() =>
      assertServicesOfferedAt(
        [
          { name: 'Haircut', availableBranchIds: null },
          { name: 'Facial', availableBranchIds: ['mh', 'rs'] },
        ],
        branch,
      ),
    ).not.toThrow()
  })

  it('refuses with 400, naming the service and the branch', () => {
    let error: unknown
    try {
      assertServicesOfferedAt([{ name: 'Hot Stone', availableBranchIds: ['rs'] }], branch)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).statusCode).toBe(400)
    expect((error as AppError).code).toBe('VALIDATION_ERROR')
    expect((error as AppError).message).toBe(
      "Hot Stone isn't offered at Marathahalli. Choose another service, or book at a branch that offers it.",
    )
  })

  it('names every service that isn’t offered, once each', () => {
    expect(() =>
      assertServicesOfferedAt(
        [
          { name: 'Hot Stone', availableBranchIds: ['rs'] },
          { name: 'Haircut', availableBranchIds: null },
          { name: 'Potli', availableBranchIds: [] },
          { name: 'Hot Stone', availableBranchIds: ['rs'] },
        ],
        branch,
      ),
    ).toThrow("Hot Stone and Potli aren't offered at Marathahalli.")
  })
})

describe('availabilityLabel', () => {
  const names = new Map([
    ['rs', 'Rayasandra'],
    ['mh', 'Marathahalli'],
  ])

  it('says nothing for a service every branch offers', () => {
    expect(availabilityLabel(null, names)).toBeNull()
  })

  it('names the branches in alphabetical order', () => {
    expect(availabilityLabel(['rs'], names)).toBe('Only at Rayasandra')
    expect(availabilityLabel(['rs', 'mh'], names)).toBe('Only at Marathahalli and Rayasandra')
  })

  it('leaves out branches it can’t name and says when none are left', () => {
    expect(availabilityLabel(['rs', 'closed'], names)).toBe('Only at Rayasandra')
    expect(availabilityLabel(['closed'], names)).toBe('Not offered at any branch right now')
    expect(availabilityLabel([], names)).toBe('Not offered at any branch right now')
  })
})
