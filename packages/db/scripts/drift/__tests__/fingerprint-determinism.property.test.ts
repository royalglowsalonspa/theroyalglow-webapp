/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/fingerprint-determinism.property.test
 * Scope        : Property 1: Fingerprint determinism / order-independence
 *
 * Validates    : Requirements 3.1, 13.1
 *
 * Description  : fast-check + Vitest property test for the pure fingerprinter
 *                (`packages/db/scripts/drift/fingerprint.ts`). Asserts the
 *                fingerprint depends ONLY on schema content — never on catalog
 *                row order, column declaration order (attnum assignment),
 *                constraint naming, or catalog type / default spelling.
 *
 * Responsibilities :
 * - `serialize(build(R)) === serialize(build(π(R)))` for every permutation π
 * - The same holds for the sha256 `hash`
 * - Re-declaring columns in a different order (different attnums) is invisible
 * - Auto-generated constraint / index names never affect the fingerprint
 * - Denormalized catalog spellings (`int4`, `::character varying`, `ASC`/`DESC`
 *   index members) normalize to one canonical fingerprint
 * - `build` is referentially transparent: it never mutates its input rows
 *
 * Features / Functionality :
 * - Generators live in `./drift-arbitraries`; row sets are rendered from a
 *   coherent schema model so permutations describe the SAME logical schema.
 * - ≥100 runs per property (Requirement 13.9).
 *
 * Tech Stack   : Vitest + fast-check 4
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, ../fingerprint, ./drift-arbitraries
 *
 * Notes        : DB-free by construction — CI has no Neon branch. Fixtures
 *                never contain pg_cron / cron.schedule objects (pg_cron is
 *                RETIRED; jobs run as QStash scheduled HTTP jobs).
 *
 * Feature: schema-drift-remediation, Property 1: Fingerprint determinism / order-independence
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { Fingerprinter } from '../fingerprint'
import {
  defaultRenderOptions,
  permuteCatalogRows,
  renderCatalogRows,
  renderOptionsArb,
  schemaModelArb,
} from './drift-arbitraries'

const RUNS = { numRuns: 200 } as const

// Feature: schema-drift-remediation, Property 1: Fingerprint determinism / order-independence
describe('Property 1: Fingerprint determinism / order-independence', () => {
  it('serialize(build(R)) === serialize(build(π(R))) for any row permutation', () => {
    fc.assert(
      fc.property(schemaModelArb, fc.integer({ min: 1, max: 2 ** 30 }), (model, seed) => {
        const rows = renderCatalogRows(model)
        const permuted = permuteCatalogRows(rows, seed)

        expect(Fingerprinter.serialize(Fingerprinter.build(permuted))).toBe(
          Fingerprinter.serialize(Fingerprinter.build(rows)),
        )
      }),
      RUNS,
    )
  })

  it('hash(build(R)) === hash(build(π(R))) for any row permutation', () => {
    fc.assert(
      fc.property(schemaModelArb, fc.integer({ min: 1, max: 2 ** 30 }), (model, seed) => {
        const rows = renderCatalogRows(model)
        const permuted = permuteCatalogRows(rows, seed)

        expect(Fingerprinter.hash(Fingerprinter.build(permuted))).toBe(
          Fingerprinter.hash(Fingerprinter.build(rows)),
        )
      }),
      RUNS,
    )
  })

  it('is invariant to column declaration order (different attnums, same schema)', () => {
    fc.assert(
      fc.property(schemaModelArb, (model) => {
        // `reversed` re-assigns every `ordinal_position`, so FK conkey/confkey
        // attnums differ while the logical schema is unchanged.
        const declared = renderCatalogRows(model, {
          ...defaultRenderOptions,
          columnOrder: 'declared',
        })
        const reversed = renderCatalogRows(model, {
          ...defaultRenderOptions,
          columnOrder: 'reversed',
        })

        expect(Fingerprinter.hash(Fingerprinter.build(reversed))).toBe(
          Fingerprinter.hash(Fingerprinter.build(declared)),
        )
      }),
      RUNS,
    )
  })

  it('is invariant to catalog spelling, constraint naming, and index member noise', () => {
    fc.assert(
      fc.property(
        schemaModelArb,
        renderOptionsArb,
        renderOptionsArb,
        fc.integer({ min: 1, max: 2 ** 30 }),
        (model, optionsA, optionsB, seed) => {
          const a = permuteCatalogRows(renderCatalogRows(model, optionsA), seed)
          const b = permuteCatalogRows(renderCatalogRows(model, optionsB), seed + 1)

          expect(Fingerprinter.hash(Fingerprinter.build(b))).toBe(
            Fingerprinter.hash(Fingerprinter.build(a)),
          )
        },
      ),
      RUNS,
    )
  })

  it('build never mutates the catalog rows it is given', () => {
    fc.assert(
      fc.property(schemaModelArb, (model) => {
        const rows = renderCatalogRows(model)
        const before = JSON.stringify(rows)

        Fingerprinter.build(rows)

        expect(JSON.stringify(rows)).toBe(before)
      }),
      RUNS,
    )
  })
})
