/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-07-2026 & Updated - 30-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : custom-id.properties.test
 * Scope        : Property-based test — custom nanoid `id` field override
 *
 * Validates    : Requirements 1.8, 2.10
 *
 * Description  : fast-check + Vitest property tests for the `id` field override
 *                declared on BOTH the `service` and `service_category`
 *                collections. Payload's Postgres adapter auto-creates an
 *                integer/serial primary key unless a top-level `id` field is
 *                declared; Drizzle's FKs on booking_service, staff_service,
 *                offer_service and waitlist are `text` nanoids referencing
 *                public.service(.category).id, so the generated id MUST be a
 *                21-character nanoid — never an integer, never a UUID.
 *
 *                Design Correctness Property covered:
 *                - Property 3: Custom ID Format Correctness — Req 1.8, 2.10
 *
 * Responsibilities :
 * - Property 3: a create with no id yields a 21-char string over `0-9A-Za-z-_`
 * - Property 3: the generated id is never a number and never UUID-shaped
 * - An id the caller already supplied is returned verbatim (seed script path)
 * - Generation happens on create only — an update never invents an id
 *
 * Features / Functionality :
 * - The hook is invoked off the real collection configs (`Service.fields` /
 *   `ServiceCategory.fields`) — nanoid generation is NEVER reimplemented here,
 *   so a regression in either collection cannot be masked by the test
 * - Both collections are quantified over in one property, matching the design
 *   statement's "any service or category document"
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : CMS (Collections — property test)
 *
 * Dependencies : fast-check, vitest, payload, ../Service, ../ServiceCategory,
 *                ../../hooks/__tests__/arbitraries
 *
 * Notes        :
 * - "Never an integer" is asserted as `typeof !== 'number'` plus a length/charset
 *   check, NOT as "does not look numeric": an all-digit nanoid is astronomically
 *   unlikely but legal, and asserting against it would be a theoretically flaky
 *   test rather than a stronger property.
 * - The blank-value generator covers `undefined` (field absent), `null` and `''`
 *   because all three reach the hook as falsy and all three must be filled.
 ************************************************************/

import fc from 'fast-check'
import type { FieldHook } from 'payload'
import { describe, expect, it } from 'vitest'
import { nanoidArb } from '../../hooks/__tests__/arbitraries'
import { Service } from '../Service'
import { ServiceCategory } from '../ServiceCategory'

// ─── Subject under test: the real id hook, off the real collection configs ────

/**
 * Pull the `beforeValidate` hook off the collection's declared `id` field.
 *
 * The assertions here fail loudly if the field or its hook is removed or
 * duplicated, so this test can never silently start exercising nothing — which
 * is precisely the failure mode that let this property go unwritten.
 */
function idHookOf(collection: { fields: unknown[]; slug: string }): FieldHook {
  const field = collection.fields.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'name' in candidate &&
      (candidate as { name?: unknown }).name === 'id',
  ) as { hooks?: { beforeValidate?: FieldHook[] } } | undefined

  const hooks = field?.hooks?.beforeValidate
  if (hooks?.length !== 1) {
    throw new Error(`${collection.slug} no longer declares exactly one id beforeValidate hook`)
  }
  return hooks[0] as FieldHook
}

/** Invoke an id hook the way Payload does: with `value` and `operation`. */
function runIdHook(hook: FieldHook, value: unknown, operation: 'create' | 'update'): unknown {
  return hook({ value, operation } as unknown as Parameters<FieldHook>[0])
}

const COLLECTIONS = [
  { label: 'service', hook: idHookOf(Service) },
  { label: 'service_category', hook: idHookOf(ServiceCategory) },
] as const

// ─── Generators ─────────────────────────────────────────────────────────────

/** Both collections, so the property is quantified over "service or category". */
const collectionArb = fc.constantFrom(...COLLECTIONS)

/** The three shapes an unset Payload field value arrives in. */
const blankValueArb = fc.constantFrom<undefined | null | string>(undefined, null, '')

/** `@rgss/db`'s nanoid() alphabet and length — the shared cms/public id space. */
const NANOID_FORMAT = /^[0-9A-Za-z_-]{21}$/
const NANOID_LENGTH = 21

/** Payload's other possible default primary key, which must NEVER be produced. */
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Property 3: Custom ID Format Correctness ───────────────────────────────

describe('Property 3: Custom ID Format Correctness — Requirements 1.8, 2.10', () => {
  it('generates a 21-character nanoid on create — never an integer, never a UUID', () => {
    fc.assert(
      fc.property(collectionArb, blankValueArb, ({ hook }, blank) => {
        const generated = runIdHook(hook, blank, 'create')

        // A text nanoid, not Payload's default serial integer.
        expect(typeof generated).toBe('string')
        expect(typeof generated).not.toBe('number')

        const id = generated as string
        expect(id).toHaveLength(NANOID_LENGTH)
        expect(id).toMatch(NANOID_FORMAT)

        // Not a UUID: wrong length, and no hyphen-grouped hex layout.
        expect(id).not.toMatch(UUID_FORMAT)
        expect(id.length).not.toBe(36)
      }),
      { numRuns: 400 },
    )
  })

  it('returns an already-supplied id verbatim, in the same nanoid space', () => {
    // The seed script creates Payload documents with ids read FROM public.*, so
    // overwriting a supplied id would split the two id spaces apart.
    fc.assert(
      fc.property(collectionArb, nanoidArb, ({ hook }, existingId) => {
        expect(runIdHook(hook, existingId, 'create')).toBe(existingId)
        expect(runIdHook(hook, existingId, 'update')).toBe(existingId)
      }),
      { numRuns: 300 },
    )
  })

  it('never invents an id on update', () => {
    fc.assert(
      fc.property(collectionArb, blankValueArb, ({ hook }, blank) => {
        expect(runIdHook(hook, blank, 'update')).toBe(blank)
      }),
      { numRuns: 200 },
    )
  })
})
