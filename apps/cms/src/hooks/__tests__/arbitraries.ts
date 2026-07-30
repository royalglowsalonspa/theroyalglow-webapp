/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-07-2026 & Updated - 30-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : arbitraries (hooks test support)
 * Scope        : CMS Integration — Service Sync property-test generators
 *
 * Description  : fast-check generators producing VALID Payload service and
 *                service_category documents, constrained to the shapes the
 *                afterChange hooks actually receive: nanoid-format ids,
 *                relationship fields either bare or populated, `select` values
 *                as strings, and optional columns present / null / absent.
 *
 * Responsibilities :
 * - Generate nanoid-format (21-char, url-safe alphabet) document ids
 * - Generate service docs across every member of SERVICE_DURATION_MINUTES
 * - Generate BOTH relationship shapes (bare id string and populated object)
 * - Generate BOTH timestamp shapes (Date and ISO string)
 * - Exercise undefined / null / present for every optional column
 *
 * Features / Functionality :
 * - nanoidArb, serviceDocArb(id), categoryDocArb(id)
 *
 * Tech Stack   : TypeScript, fast-check
 * Layer        : CMS (Hooks — test support)
 *
 * Dependencies : fast-check, @rgss/types, ../mappers
 *
 * Notes        : fast-check 4 removed `fc.hexaString`; character-constrained
 *                strings are built with `fc.string({ unit: fc.constantFrom(...) })`.
 *                `durationMinutes` options are DERIVED from
 *                SERVICE_DURATION_MINUTES so the generators cannot drift from
 *                the single source of truth.
 ************************************************************/

import { SERVICE_DURATION_MINUTES } from '@rgss/types'
import fc from 'fast-check'
import type { PayloadServiceCategoryDoc, PayloadServiceDoc } from '../mappers'

/** nanoid's url-safe alphabet: `A-Za-z0-9_-` (Property 3). */
const NANOID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('')

/** A 21-character nanoid-format id — the id space shared by `cms.*` and `public.*`. */
export const nanoidArb = fc.string({
  unit: fc.constantFrom(...NANOID_ALPHABET),
  minLength: 21,
  maxLength: 21,
})

const nameArb = fc.string({ minLength: 1, maxLength: 40 })

/** Slugs are produced upstream by `slugify`, so they are lowercase + hyphens only. */
const slugArb = fc.string({
  unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
  minLength: 1,
  maxLength: 30,
})

// Optional columns are generated as `value | null`, and the KEY itself is made
// optional through `requiredKeys` below — so all three real states are covered
// (present, explicit null, absent) without widening the value type to
// `undefined`, which `exactOptionalPropertyTypes` forbids.

/** Nullable text column. */
const nullableTextArb = fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 60 }))

/** Nullable integer column. */
function nullableIntArb(max: number) {
  return fc.oneof(fc.constant(null), fc.integer({ min: 0, max }))
}

/** Nullable boolean column. */
const nullableBoolArb = fc.oneof(fc.constant(null), fc.boolean())

const dateArb = fc.date({
  min: new Date('2020-01-01T00:00:00.000Z'),
  max: new Date('2030-01-01T00:00:00.000Z'),
  noInvalidDate: true,
})

/**
 * Payload hands timestamps back as a real `Date` (local API) or as an ISO
 * string (serialised through REST/GraphQL). Both shapes reach the hook.
 */
const timestampArb = fc.oneof(
  dateArb,
  dateArb.map((d) => d.toISOString()),
)

/**
 * Payload `select` values serialise as STRINGS; a numeric value can still
 * arrive from the local API. Both are generated, both must map to an integer.
 */
const durationArb = fc.oneof(
  fc.constantFrom(...SERVICE_DURATION_MINUTES).map((m) => String(m)),
  fc.constantFrom(...SERVICE_DURATION_MINUTES).map((m) => m as number),
)

/**
 * A `relationship` field arrives as a bare id at `depth: 0` and as a populated
 * document at `depth >= 1`. Both shapes must normalise to the same id.
 */
function relationshipArb(): fc.Arbitrary<string | { id: string }> {
  return nanoidArb.chain((id) =>
    fc.oneof(fc.constant<string | { id: string }>(id), fc.constant({ id })),
  )
}

/** A valid Payload `service` document for the given id. */
export function serviceDocArb(id: string): fc.Arbitrary<PayloadServiceDoc> {
  return fc.record(
    {
      id: fc.constant(id),
      categoryId: relationshipArb(),
      name: nameArb,
      slug: slugArb,
      description: nullableTextArb,
      durationMinutes: durationArb,
      bufferMinutes: nullableIntArb(30),
      // Money is always integer paise — never a float.
      pricePaise: fc.integer({ min: 0, max: 10_000_000 }),
      isActive: nullableBoolArb,
      imageUrl: nullableTextArb,
      displayOrder: nullableIntArb(50),
      gemsRedeemable: nullableBoolArb,
      gemsRequired: nullableIntArb(500),
      gemsCatalogueOrder: nullableIntArb(50),
      createdAt: timestampArb,
    },
    // Everything else is optional in the Payload doc, so the key is sometimes
    // omitted entirely — that is the `undefined → null` coalescing path.
    {
      requiredKeys: [
        'id',
        'categoryId',
        'name',
        'slug',
        'durationMinutes',
        'pricePaise',
        'createdAt',
      ],
    },
  )
}

/** A valid Payload `service_category` document for the given id. */
export function categoryDocArb(id: string): fc.Arbitrary<PayloadServiceCategoryDoc> {
  return fc.record(
    {
      id: fc.constant(id),
      name: nameArb,
      slug: slugArb,
      description: nullableTextArb,
      serviceType: fc.constantFrom<'salon' | 'spa'>('salon', 'spa'),
      displayOrder: nullableIntArb(50),
      isActive: nullableBoolArb,
      createdAt: timestampArb,
    },
    { requiredKeys: ['id', 'name', 'slug', 'serviceType', 'createdAt'] },
  )
}
