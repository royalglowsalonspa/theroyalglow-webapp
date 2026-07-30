/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : service-fields.properties.test
 * Scope        : Property-based test — Service collection field hooks
 *
 * Validates    : Requirements 1.7, 1.9, 1.11, 1.13
 *
 * Description  : fast-check + Vitest property tests for the field-level rules
 *                the `service` Payload collection enforces BEFORE the sync hook
 *                writes `public.service`: slug auto-generation, the fixed
 *                duration option set, and the conditional gems rule.
 *
 *                Design Correctness Properties covered:
 *                - Property 1: Slug Generation Correctness (Services) — Req 1.7
 *                - Property 2: Duration Value Correctness — Req 1.9, 1.13
 *                - Property 4: Gems Conditional Validation — Req 1.11
 *
 * Responsibilities :
 * - Slug is ALWAYS lowercase, URL-safe, non-empty and hyphen-separated
 * - Slug generation is idempotent and never overwrites an editor's slug
 * - The durationMinutes option set is EXACTLY SERVICE_DURATION_MINUTES, and an
 *   accepted option always coerces to that positive integer (never NaN)
 * - The gems rule accepts EXACTLY the valid combinations and rejects all others
 *
 * Features / Functionality :
 * - Hooks are invoked off the real collection config (`Service.hooks.*`) — the
 *   logic is NEVER reimplemented in the test
 * - The duration set and the mapper are both read from source, so the expected
 *   values cannot drift from `SERVICE_DURATION_MINUTES`
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : CMS (Collections — test)
 *
 * Dependencies : fast-check, vitest, payload, @rgss/types, ../Service,
 *                ../../hooks/mappers
 *
 * Notes        :
 * - Name generators are constrained to contain at least one ASCII alphanumeric
 *   character. That is the real input space for a bookable service name, and it
 *   is what makes "slug is never empty" a true property: `slugify(..., { strict:
 *   true })` legitimately reduces a name made only of punctuation or unmapped
 *   non-Latin script to an empty string.
 * - Complements (does not duplicate) the example-based coercion cases in
 *   `apps/cms/src/hooks/__tests__/mappers.test.ts`: Property 2 here quantifies
 *   over REJECTED values too, which the example suite never exercises.
 ************************************************************/

import { SERVICE_DURATION_MINUTES } from '@rgss/types'
import fc from 'fast-check'
import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook } from 'payload'
import { ValidationError } from 'payload'
import { describe, expect, it } from 'vitest'
import { mapPayloadToPublicService, type PayloadServiceDoc } from '../../hooks/mappers'
import { Service } from '../Service'

// ─── Subject under test: the real hooks, off the real collection config ──────

/** The partial document shape Payload hands a `beforeChange`/`beforeValidate` hook. */
// `| undefined` is spelled out on every member because the CMS typechecks with
// `exactOptionalPropertyTypes: true`, and an ABSENT gems field really does reach
// the hook as an explicit `undefined` (Payload sends only changed fields on an
// update). The generators exercise that case, so the draft type must admit it.
type ServiceDraft = {
  name?: string | undefined
  slug?: string | undefined
  gemsRedeemable?: boolean | null | undefined
  gemsRequired?: number | null | undefined
}

/**
 * Invoke the collection's slug hook.
 *
 * Payload passes a large args object at runtime; this hook reads only `data` and
 * `operation`, so a minimal object is sufficient and the cast is confined here.
 * The length assertion fails loudly if another hook is added to the array, so
 * the test can never silently start exercising the wrong function.
 */
function runSlugHook(data: ServiceDraft, operation: 'create' | 'update'): ServiceDraft {
  const hooks = Service.hooks?.beforeChange
  if (hooks?.length !== 1) {
    throw new Error('Service.hooks.beforeChange no longer holds exactly the slug hook')
  }
  const hook = hooks[0] as CollectionBeforeChangeHook
  return hook({
    data,
    operation,
  } as unknown as Parameters<CollectionBeforeChangeHook>[0]) as ServiceDraft
}

/** Invoke the collection's gems validation hook (`beforeValidate`). */
function runGemsHook(data: ServiceDraft, originalDoc?: ServiceDraft): ServiceDraft {
  const hooks = Service.hooks?.beforeValidate
  if (hooks?.length !== 1) {
    throw new Error('Service.hooks.beforeValidate no longer holds exactly the gems hook')
  }
  const hook = hooks[0] as CollectionBeforeValidateHook
  return hook({
    data,
    originalDoc,
    operation: originalDoc ? 'update' : 'create',
  } as unknown as Parameters<CollectionBeforeValidateHook>[0]) as ServiceDraft
}

/** The `durationMinutes` select options, read from the live collection config. */
function durationOptionValues(): string[] {
  const field = Service.fields.find(
    (candidate) => 'name' in candidate && candidate.name === 'durationMinutes',
  ) as { options?: readonly { label: string; value: string }[] } | undefined

  const options = field?.options
  if (!options) {
    throw new Error('Service.fields no longer declares a durationMinutes select with options')
  }
  return options.map((option) => option.value)
}

// ─── Generators ─────────────────────────────────────────────────────────────

const ASCII_ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')
// Punctuation, separators and accented characters that really do turn up in
// salon service names ("Hair & Beauty", "Mani-Pedi", "Blow-dry (Long)", "₹").
const NAME_NOISE = ' \t-_&/()\'".,!+#%@:;*é ü ñ Ç ₹'.split('')

const alnumRunArb = fc.string({
  unit: fc.constantFrom(...ASCII_ALNUM),
  minLength: 1,
  maxLength: 10,
})
const noiseArb = fc.string({
  unit: fc.constantFrom(...ASCII_ALNUM, ...NAME_NOISE),
  minLength: 0,
  maxLength: 14,
})

/**
 * A realistic service name: arbitrary noise around at least one guaranteed
 * ASCII alphanumeric run. See the file header for why the alphanumeric anchor
 * is part of the property rather than a weakening of it.
 */
const serviceNameArb = fc
  .tuple(noiseArb, alnumRunArb, noiseArb)
  .map(([prefix, core, suffix]) => `${prefix}${core}${suffix}`)

/** A lowercase, single-hyphen-separated, URL-safe slug. */
const URL_SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const DURATIONS = [...SERVICE_DURATION_MINUTES]
const durationArb = fc.constantFrom(...DURATIONS)

const positiveGemsArb = fc.integer({ min: 1, max: 100_000 })
/** Everything the gems rule must REJECT when gemsRedeemable is true. */
const invalidGemsArb = fc.oneof(
  fc.integer({ min: -10_000, max: 0 }),
  fc
    .double({ min: 0.5, max: 9_999, noNaN: true, noDefaultInfinity: true })
    .filter((value) => !Number.isInteger(value)),
  fc.constant(null),
  fc.constant(undefined),
)
const anyGemsArb = fc.oneof(positiveGemsArb, invalidGemsArb)
const redeemableArb = fc.constantFrom<boolean | null | undefined>(true, false, null, undefined)

/** The rule as the acceptance criterion states it (Req 1.11), not as coded. */
function shouldAccept(redeemable: boolean | null | undefined, required: unknown): boolean {
  if (redeemable !== true) {
    return true
  }
  return typeof required === 'number' && Number.isInteger(required) && required > 0
}

function serviceDocWithDuration(durationMinutes: string | number): PayloadServiceDoc {
  return {
    id: 'V1StGXR8Z5jdHi6BmyT_1',
    categoryId: 'p1StGXR8Z5jdHi6BmyT_9',
    name: 'Haircut',
    slug: 'haircut',
    durationMinutes,
    pricePaise: 30_000,
    createdAt: '2026-06-01T10:00:00.000Z',
  }
}

// ─── Property 1: Slug Generation Correctness (Services) ─────────────────────

describe('Property 1: Slug Generation Correctness (Services) — Requirements 1.7', () => {
  it('always derives a lowercase, URL-safe, non-empty hyphen-separated slug', () => {
    fc.assert(
      fc.property(serviceNameArb, (name) => {
        const slug = runSlugHook({ name }, 'create').slug

        expect(typeof slug).toBe('string')
        const generated = slug as string
        // Lowercase, only [a-z0-9-], no leading/trailing/doubled hyphen, never empty.
        expect(generated).toMatch(URL_SAFE_SLUG)
        expect(generated).toBe(generated.toLowerCase())
        expect(generated).not.toMatch(/\s/)
      }),
      { numRuns: 300 },
    )
  })

  it('is idempotent — feeding a generated slug back as the name reproduces it', () => {
    fc.assert(
      fc.property(serviceNameArb, (name) => {
        const first = runSlugHook({ name }, 'create').slug as string
        const second = runSlugHook({ name: first }, 'create').slug

        expect(second).toBe(first)
      }),
      { numRuns: 300 },
    )
  })

  it('never overwrites a slug the editor supplied', () => {
    fc.assert(
      fc.property(serviceNameArb, serviceNameArb, (name, otherName) => {
        const explicit = runSlugHook({ name: otherName }, 'create').slug as string

        expect(runSlugHook({ name, slug: explicit }, 'create').slug).toBe(explicit)
      }),
      { numRuns: 200 },
    )
  })

  it('only generates on create — an update never invents a slug', () => {
    fc.assert(
      fc.property(serviceNameArb, (name) => {
        expect(runSlugHook({ name }, 'update').slug).toBeUndefined()
      }),
      { numRuns: 200 },
    )
  })
})

// ─── Property 2: Duration Value Correctness ─────────────────────────────────

describe('Property 2: Duration Value Correctness — Requirements 1.9, 1.13', () => {
  it('offers exactly the SERVICE_DURATION_MINUTES set, as strings', () => {
    // Derived from the constant, never restated — Req 1.13's single source of truth.
    expect(durationOptionValues()).toEqual(DURATIONS.map((minutes) => String(minutes)))
  })

  it('coerces every accepted option to that positive integer, never NaN', () => {
    const accepted = new Set(durationOptionValues())

    fc.assert(
      fc.property(durationArb, (minutes) => {
        const optionValue = String(minutes)
        expect(accepted.has(optionValue)).toBe(true)

        const mapped = mapPayloadToPublicService(serviceDocWithDuration(optionValue))

        expect(mapped.durationMinutes).toBe(minutes)
        expect(Number.isInteger(mapped.durationMinutes)).toBe(true)
        expect(Number.isNaN(mapped.durationMinutes)).toBe(false)
        expect(mapped.durationMinutes).toBeGreaterThan(0)
        expect(DURATIONS).toContain(mapped.durationMinutes)
      }),
      { numRuns: 200 },
    )
  })

  it('accepts a candidate duration if and only if it is a member of the set', () => {
    const accepted = new Set(durationOptionValues())
    const allowed = new Set<number>(DURATIONS)

    fc.assert(
      fc.property(fc.integer({ min: -600, max: 600 }), (candidate) => {
        // The select field is the only gate: a value outside the constant has no
        // option, so Payload rejects it before any sync write can happen.
        expect(accepted.has(String(candidate))).toBe(allowed.has(candidate))
      }),
      { numRuns: 400 },
    )
  })

  // The real-catalogue outliers an earlier 15/30/60/90-only set would have broken.
  it.each([
    { minutes: 45, service: 'haircut-advanced' },
    { minutes: 120, service: 'makeup-bridal' },
    { minutes: 180, service: 'keratin' },
  ])('supports the $minutes-minute catalogue outlier ($service)', ({ minutes }) => {
    expect(durationOptionValues()).toContain(String(minutes))
    expect(mapPayloadToPublicService(serviceDocWithDuration(String(minutes))).durationMinutes).toBe(
      minutes,
    )
  })
})

// ─── Property 4: Gems Conditional Validation ────────────────────────────────

describe('Property 4: Gems Conditional Validation — Requirements 1.11', () => {
  it('accepts exactly the valid gems combinations and rejects every other one', () => {
    fc.assert(
      fc.property(redeemableArb, anyGemsArb, (gemsRedeemable, gemsRequired) => {
        const data: ServiceDraft = { name: 'Haircut', gemsRedeemable, gemsRequired }

        if (shouldAccept(gemsRedeemable, gemsRequired)) {
          expect(runGemsHook(data)).toBe(data)
          return
        }

        expect(() => runGemsHook(data)).toThrow(ValidationError)
      }),
      { numRuns: 400 },
    )
  })

  it('judges an update on the MERGED document, not the changed fields alone', () => {
    fc.assert(
      fc.property(redeemableArb, anyGemsArb, (gemsRedeemable, gemsRequired) => {
        // Toggling an unrelated field on an already gems-redeemable service must
        // reach the same verdict as sending both gems fields together.
        const originalDoc: ServiceDraft = { gemsRedeemable, gemsRequired }
        const patch: ServiceDraft = { name: 'Renamed' }
        const expected = shouldAccept(gemsRedeemable, gemsRequired)

        if (expected) {
          expect(runGemsHook(patch, originalDoc)).toBe(patch)
        } else {
          expect(() => runGemsHook(patch, originalDoc)).toThrow(ValidationError)
        }
      }),
      { numRuns: 400 },
    )
  })

  it('rejects clearing gemsRequired on a service that stays redeemable', () => {
    fc.assert(
      fc.property(positiveGemsArb, (gemsRequired) => {
        const originalDoc: ServiceDraft = { gemsRedeemable: true, gemsRequired }

        expect(() => runGemsHook({ gemsRequired: null }, originalDoc)).toThrow(ValidationError)
        expect(runGemsHook({ gemsRedeemable: false }, originalDoc)).toBeTruthy()
      }),
      { numRuns: 200 },
    )
  })
})
