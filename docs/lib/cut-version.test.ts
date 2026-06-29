import { VersionCutConflictError, cutVersion } from '@/lib/cut-version'
import type { VersionMeta } from '@/lib/versions'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// Feature: docs-theming-and-versioning, Property 16: Cutting a version is additive and preserves existing versions
// Feature: docs-theming-and-versioning, Property 17: Cutting an existing version is rejected without side effects
//
// cutVersion is the pure decision core of the Version_Workflow. For an absent
// integer N it returns a NEW registry containing v{N} plus every pre-existing
// entry unchanged, never mutating the input. For an already-registered N it
// throws an error naming /v{N}, again without mutating the input. Invalid N
// (0, negative, non-integer) is rejected.

const LATEST: VersionMeta = {
  id: 'latest',
  label: 'Latest',
  versionNumber: null,
  basePath: '/docs',
  isLatest: true,
}

function legacyMeta(n: number): VersionMeta {
  return {
    id: `v${n}`,
    label: `v${n}`,
    versionNumber: n,
    basePath: `/docs/v${n}`,
    isLatest: false,
  }
}

/** A registry: one Latest plus distinct legacy version numbers. */
function registryArb(options: { minLegacy?: number } = {}): fc.Arbitrary<VersionMeta[]> {
  return fc
    .uniqueArray(fc.integer({ min: 1, max: 50 }), {
      minLength: options.minLegacy ?? 0,
      maxLength: 6,
    })
    .map((numbers) => [LATEST, ...numbers.map(legacyMeta)])
}

function snapshot(registry: readonly VersionMeta[]): VersionMeta[] {
  return structuredClone(registry as VersionMeta[])
}

describe('cutVersion', () => {
  it('Property 16: an additive cut adds v{N} and preserves every existing version without mutation', () => {
    fc.assert(
      fc.property(registryArb(), fc.integer({ min: 1, max: 100 }), (registry, n) => {
        const present = registry.some((v) => v.versionNumber === n)
        fc.pre(!present)

        const before = snapshot(registry)
        const result = cutVersion(registry, n)

        // The new version is present, well-formed, and legacy.
        const added = result.find((v) => v.id === `v${n}`)
        expect(added).toEqual({
          id: `v${n}`,
          label: `v${n}`,
          versionNumber: n,
          basePath: `/docs/v${n}`,
          isLatest: false,
        })

        // Exactly one entry was added.
        expect(result).toHaveLength(registry.length + 1)

        // Every pre-existing entry survives unchanged.
        for (const original of before) {
          expect(result.find((v) => v.id === original.id)).toEqual(original)
        }

        // The input registry was not mutated.
        expect(registry).toEqual(before)
      }),
      { numRuns: 200 },
    )
  })

  it('Property 17: cutting an already-registered version throws naming /v{N} and leaves the input unchanged', () => {
    fc.assert(
      fc.property(
        registryArb({ minLegacy: 1 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (registry, pick) => {
          const legacyNumbers = registry
            .filter((v) => v.versionNumber !== null)
            .map((v) => v.versionNumber as number)
          // registryArb({ minLegacy: 1 }) guarantees at least one legacy entry,
          // so this index is always in-bounds; guard satisfies noUncheckedIndexedAccess.
          const n = legacyNumbers[pick % legacyNumbers.length]
          if (n === undefined) {
            throw new Error('expected at least one legacy version number')
          }

          const before = snapshot(registry)

          let thrown: unknown
          try {
            cutVersion(registry, n)
          } catch (err) {
            thrown = err
          }

          expect(thrown).toBeInstanceOf(VersionCutConflictError)
          expect((thrown as Error).message).toContain(`/v${n}`)

          // No side effects: the input registry is untouched.
          expect(registry).toEqual(before)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('rejects invalid version numbers (0, negative, non-integer) without mutating the input', () => {
    const invalidArb = fc.oneof(
      fc.constant(0),
      fc.integer({ min: -1000, max: -1 }),
      fc.double({ min: 0.1, max: 100, noNaN: true }).filter((x) => !Number.isInteger(x)),
    )

    fc.assert(
      fc.property(registryArb(), invalidArb, (registry, n) => {
        const before = snapshot(registry)
        expect(() => cutVersion(registry, n)).toThrow(RangeError)
        expect(registry).toEqual(before)
      }),
      { numRuns: 200 },
    )
  })
})
