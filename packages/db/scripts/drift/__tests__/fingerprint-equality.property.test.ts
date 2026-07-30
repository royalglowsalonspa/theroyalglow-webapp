/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/fingerprint-equality.property.test
 * Scope        : Property 2: Fingerprint equality soundness
 *
 * Validates    : Requirements 3.5, 13.2
 *
 * Description  : fast-check + Vitest property test asserting the BICONDITIONAL
 *                at the heart of drift detection:
 *                `hash(build(A)) === hash(build(B))` iff `A` and `B` are
 *                structurally identical (same tables / columns / types /
 *                nullability / defaults / primary keys / uniques / foreign keys
 *                with ON DELETE + ON UPDATE / indexes with predicates / enums).
 *
 *                Structural identity is decided by `modelSignature` — an ORACLE
 *                computed WITHOUT the fingerprinter — so the two notions of
 *                equality are genuinely independent. A hash collision (unsound
 *                "identical") or a spurious mismatch (false drift) both fail.
 *
 * Responsibilities |
 * - Round trip: `build(render(model))` equals the independently constructed
 *   fingerprint for that model
 * - Soundness: hash equality holds exactly when the models are identical
 * - Every individual structural dimension is drift-visible
 * - Auto-generated constraint names are NEVER drift-visible
 *
 * Features / Functionality :
 * - `modelPairArb` yields identical, noise-varied, and mutated pairs so both
 *   directions of the biconditional are exercised.
 * - ≥100 runs per property (Requirement 13.9).
 *
 * Tech Stack   : Vitest + fast-check 4
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, ../fingerprint, ./drift-arbitraries
 *
 * Notes        : DB-free. No pg_cron / cron.schedule fixtures (pg_cron RETIRED).
 *
 * Feature: schema-drift-remediation, Property 2: Fingerprint equality soundness
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { Fingerprinter } from '../fingerprint'
import {
  applyMutation,
  defaultRenderOptions,
  modelPairArb,
  modelSignature,
  modelToFingerprint,
  mutationArb,
  renderCatalogRows,
  renderOptionsArb,
  type SchemaModel,
  schemaModelArb,
} from './drift-arbitraries'

const RUNS = { numRuns: 200 } as const

function hashOf(model: SchemaModel, options = defaultRenderOptions): string {
  return Fingerprinter.hash(Fingerprinter.build(renderCatalogRows(model, options)))
}

// Feature: schema-drift-remediation, Property 2: Fingerprint equality soundness
describe('Property 2: Fingerprint equality soundness', () => {
  it('build(render(model)) reproduces the independently constructed fingerprint', () => {
    fc.assert(
      fc.property(schemaModelArb, renderOptionsArb, (model, options) => {
        const built = Fingerprinter.build(renderCatalogRows(model, options))

        expect(Fingerprinter.serialize(built)).toBe(
          Fingerprinter.serialize(modelToFingerprint(model)),
        )
      }),
      RUNS,
    )
  })

  it('hash equality holds exactly when the two schemas are structurally identical', () => {
    fc.assert(
      fc.property(
        modelPairArb,
        renderOptionsArb,
        renderOptionsArb,
        ({ canonical, branch }, optionsA, optionsB) => {
          const hashesEqual = hashOf(canonical, optionsA) === hashOf(branch, optionsB)
          const structurallyIdentical = modelSignature(canonical) === modelSignature(branch)

          // Both directions: no hash collisions (unsound "identical") and no
          // spurious mismatches (false drift).
          expect(hashesEqual).toBe(structurallyIdentical)
        },
      ),
      RUNS,
    )
  })

  it('any structural mutation that changes the schema also changes the hash', () => {
    fc.assert(
      fc.property(schemaModelArb, mutationArb, (model, spec) => {
        const mutated = applyMutation(model, spec)
        // Only assert on mutations that genuinely altered the structure.
        fc.pre(modelSignature(mutated) !== modelSignature(model))

        expect(hashOf(mutated)).not.toBe(hashOf(model))
      }),
      RUNS,
    )
  })

  it('a mutation that leaves the structure untouched leaves the hash untouched', () => {
    fc.assert(
      fc.property(schemaModelArb, mutationArb, (model, spec) => {
        const mutated = applyMutation(model, spec)
        fc.pre(modelSignature(mutated) === modelSignature(model))

        expect(hashOf(mutated)).toBe(hashOf(model))
      }),
      RUNS,
    )
  })

  it('auto-generated constraint and index names are never drift-visible', () => {
    fc.assert(
      fc.property(schemaModelArb, fc.constantFrom('', '_a', '_zz9', '_renamed'), (model, salt) => {
        const salted = hashOf(model, { ...defaultRenderOptions, constraintSalt: salt })

        expect(salted).toBe(hashOf(model, { ...defaultRenderOptions, constraintSalt: '' }))
      }),
      RUNS,
    )
  })
})
