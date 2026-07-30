/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/diff.property.test
 * Scope        : Property 3: Diff totality & symmetry
 *
 * Validates    : Requirements 4.2, 4.4, 13.3
 *
 * Description  : fast-check + Vitest property test for the pure structural
 *                differ (`packages/db/scripts/drift/diff.ts`). Asserts the diff
 *                is TOTAL (defined for any two fingerprints, never throws, and
 *                accounts for every object in either side exactly once) and
 *                SYMMETRIC (`diff(c,b)` and `diff(b,c)` are mirror images, and
 *                `diff(c,b).isIdentical ⟺ equal(c,b) ⟺ diff(b,c).isIdentical`).
 *
 * Responsibilities :
 * - Totality: every canonical/branch object is consumed by exactly one entry;
 *   the unconsumed remainders on both sides are the same multiset (the matched,
 *   structurally-equal objects that correctly produce no entry)
 * - `isIdentical ⟺ hash equality ⟺ isIdentical of the reversed diff`
 * - Mirror image: `missing_on_branch` <-> `extra_on_branch` counts swap and
 *   `divergent` counts are preserved under argument reversal
 * - Entry well-formedness: status matches which side is populated
 *
 * Features / Functionality :
 * - Object extraction is RE-IMPLEMENTED in the test (independent of diff.ts
 *   internals) so the accounting check is a genuine oracle.
 * - ≥100 runs per property (Requirement 13.9).
 *
 * Tech Stack   : Vitest + fast-check 4
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, ../diff, ../fingerprint, ./drift-arbitraries
 *
 * Notes        : DB-free. No pg_cron / cron.schedule fixtures (pg_cron RETIRED).
 *
 * Feature: schema-drift-remediation, Property 3: Diff totality & symmetry
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SchemaDiffer } from '../diff'
import { Fingerprinter } from '../fingerprint'
import type { DiffEntry, DiffKind, SchemaFingerprint } from '../types'
import { fingerprintPairArb } from './drift-arbitraries'

const RUNS = { numRuns: 200 } as const

const KINDS: readonly DiffKind[] = ['enum', 'column', 'primaryKey', 'unique', 'foreignKey', 'index']

// ─────────────────────────────────────────────────────────
// Independent object extraction — the totality oracle. Mirrors the design's
// object model (design "Data Models -> SchemaFingerprint") without importing
// any diff.ts internals.
// ─────────────────────────────────────────────────────────

/** Stable signature of one schema object: kind + owning table + its value. */
function objectSignature(kind: DiffKind, table: string | null, value: unknown): string {
  return `${kind}|${table ?? ''}|${JSON.stringify(value)}`
}

function objectsOf(fp: SchemaFingerprint, kind: DiffKind): string[] {
  const sigs: string[] = []

  if (kind === 'enum') {
    for (const e of fp.enums) sigs.push(objectSignature(kind, null, e))
    return sigs
  }

  for (const table of fp.tables) {
    switch (kind) {
      case 'column':
        for (const c of table.columns) sigs.push(objectSignature(kind, table.name, c))
        break
      case 'primaryKey':
        if (table.primaryKey !== null) {
          sigs.push(objectSignature(kind, table.name, table.primaryKey))
        }
        break
      case 'unique':
        for (const u of table.uniques) {
          sigs.push(objectSignature(kind, table.name, { columns: u.columns }))
        }
        break
      case 'foreignKey':
        for (const f of table.foreignKeys) sigs.push(objectSignature(kind, table.name, f))
        break
      case 'index':
        for (const i of table.indexes) sigs.push(objectSignature(kind, table.name, i))
        break
      default:
        break
    }
  }
  return sigs
}

type Multiset = Map<string, number>

function toMultiset(signatures: readonly string[]): Multiset {
  const counts: Multiset = new Map()
  for (const sig of signatures) counts.set(sig, (counts.get(sig) ?? 0) + 1)
  return counts
}

/** Remove one occurrence of `sig`; returns false when it was not present. */
function consume(counts: Multiset, sig: string): boolean {
  const current = counts.get(sig) ?? 0
  if (current === 0) return false
  if (current === 1) counts.delete(sig)
  else counts.set(sig, current - 1)
  return true
}

function multisetKey(counts: Multiset): string {
  return [...counts.entries()]
    .map(([sig, n]) => `${sig}#${n}`)
    .sort()
    .join('\n')
}

function entriesOfKind(entries: readonly DiffEntry[], kind: DiffKind): DiffEntry[] {
  return entries.filter((e) => e.kind === kind)
}

function countStatus(entries: readonly DiffEntry[], status: DiffEntry['status']): number {
  return entries.filter((e) => e.status === status).length
}

// Feature: schema-drift-remediation, Property 3: Diff totality & symmetry
describe('Property 3: Diff totality & symmetry', () => {
  it('is total: defined for any two fingerprints and never throws', () => {
    fc.assert(
      fc.property(fingerprintPairArb, ({ canonical, branch }) => {
        const result = SchemaDiffer.diff(canonical, branch)

        expect(Array.isArray(result.objects)).toBe(true)
        expect(result.fromCanonicalHash).toBe(Fingerprinter.hash(canonical))
        expect(result.toBranchHash).toBe(Fingerprinter.hash(branch))
        expect(result.isIdentical).toBe(result.objects.length === 0)
      }),
      RUNS,
    )
  })

  it('accounts for every object in either fingerprint in exactly one DiffEntry', () => {
    fc.assert(
      fc.property(fingerprintPairArb, ({ canonical, branch }) => {
        const { objects } = SchemaDiffer.diff(canonical, branch)

        for (const kind of KINDS) {
          const canonicalRest = toMultiset(objectsOf(canonical, kind))
          const branchRest = toMultiset(objectsOf(branch, kind))

          for (const entry of entriesOfKind(objects, kind)) {
            if (entry.canonical !== null) {
              const sig = objectSignature(kind, entry.table, entry.canonical)
              // Each referenced canonical object must exist and be consumed
              // exactly once — no double-counting across entries.
              expect(consume(canonicalRest, sig)).toBe(true)
            }
            if (entry.branch !== null) {
              const sig = objectSignature(kind, entry.table, entry.branch)
              expect(consume(branchRest, sig)).toBe(true)
            }
          }

          // Whatever is left on each side is the matched (structurally equal)
          // remainder, which must be the SAME multiset on both sides.
          expect(multisetKey(branchRest)).toBe(multisetKey(canonicalRest))
        }
      }),
      RUNS,
    )
  })

  it('entry status always agrees with which side is populated', () => {
    fc.assert(
      fc.property(fingerprintPairArb, ({ canonical, branch }) => {
        for (const entry of SchemaDiffer.diff(canonical, branch).objects) {
          if (entry.status === 'missing_on_branch') {
            expect(entry.canonical).not.toBeNull()
            expect(entry.branch).toBeNull()
          } else if (entry.status === 'extra_on_branch') {
            expect(entry.canonical).toBeNull()
            expect(entry.branch).not.toBeNull()
          } else {
            expect(entry.canonical).not.toBeNull()
            expect(entry.branch).not.toBeNull()
          }
        }
      }),
      RUNS,
    )
  })

  it('diff(c,b).isIdentical ⟺ equal(c,b) ⟺ diff(b,c).isIdentical', () => {
    fc.assert(
      fc.property(fingerprintPairArb, ({ canonical, branch }) => {
        const forward = SchemaDiffer.diff(canonical, branch)
        const reverse = SchemaDiffer.diff(branch, canonical)
        const areEqual = SchemaDiffer.equal(canonical, branch)

        expect(forward.isIdentical).toBe(areEqual)
        expect(reverse.isIdentical).toBe(areEqual)
        // `equal` is itself symmetric.
        expect(SchemaDiffer.equal(branch, canonical)).toBe(areEqual)
      }),
      RUNS,
    )
  })

  it('diff(c,b) and diff(b,c) are mirror images', () => {
    fc.assert(
      fc.property(fingerprintPairArb, ({ canonical, branch }) => {
        const forward = SchemaDiffer.diff(canonical, branch).objects
        const reverse = SchemaDiffer.diff(branch, canonical).objects

        expect(reverse.length).toBe(forward.length)

        for (const kind of KINDS) {
          const f = entriesOfKind(forward, kind)
          const r = entriesOfKind(reverse, kind)

          // missing <-> extra swap, divergent count preserved.
          expect(countStatus(r, 'extra_on_branch')).toBe(countStatus(f, 'missing_on_branch'))
          expect(countStatus(r, 'missing_on_branch')).toBe(countStatus(f, 'extra_on_branch'))
          expect(countStatus(r, 'divergent')).toBe(countStatus(f, 'divergent'))

          // The canonical-side objects reported by the forward diff are exactly
          // the branch-side objects reported by the reverse diff.
          const forwardCanonicalSide = f
            .filter((e) => e.canonical !== null)
            .map((e) => objectSignature(kind, e.table, e.canonical))
          const reverseBranchSide = r
            .filter((e) => e.branch !== null)
            .map((e) => objectSignature(kind, e.table, e.branch))

          expect(multisetKey(toMultiset(reverseBranchSide))).toBe(
            multisetKey(toMultiset(forwardCanonicalSide)),
          )
        }
      }),
      RUNS,
    )
  })

  it('a fingerprint always diffs identically against itself', () => {
    fc.assert(
      fc.property(fingerprintPairArb, ({ canonical }) => {
        const self = SchemaDiffer.diff(canonical, canonical)

        expect(self.objects).toEqual([])
        expect(self.isIdentical).toBe(true)
      }),
      RUNS,
    )
  })
})
