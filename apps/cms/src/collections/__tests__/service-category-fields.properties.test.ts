/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : service-category-fields.properties.test
 * Scope        : Property-based test — ServiceCategory collection field hooks
 *
 * Validates    : Requirements 2.7
 *
 * Description  : fast-check + Vitest property tests for the `service_category`
 *                collection's slug auto-generation hook — the rule that runs
 *                before `syncServiceCategoryToPublic` mirrors the document into
 *                Drizzle `public.service_category`, whose `slug` column carries
 *                a UNIQUE constraint.
 *
 *                Design Correctness Property covered:
 *                - Property 5: Slug Generation Correctness (Categories) — Req 2.7
 *
 * Responsibilities :
 * - Slug is ALWAYS lowercase, URL-safe, non-empty and hyphen-separated
 * - Slug generation is idempotent when re-applied
 * - An editor-supplied slug is never overwritten
 * - Generation happens on create only, never on update
 *
 * Features / Functionality :
 * - The hook is invoked off the real collection config
 *   (`ServiceCategory.hooks.beforeChange`) — the slugify logic is NEVER
 *   reimplemented in the test
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : CMS (Collections — test)
 *
 * Dependencies : fast-check, vitest, payload, ../ServiceCategory
 *
 * Notes        :
 * - Name generators are constrained to contain at least one ASCII alphanumeric
 *   character. That is the real input space for a category name, and it is what
 *   makes "slug is never empty" a true property: `slugify(..., { strict: true })`
 *   legitimately reduces a name made only of punctuation or unmapped non-Latin
 *   script to an empty string.
 * - Kept separate from the services slug property (Property 1) because the two
 *   collections declare independent hooks; a regression in one must not be
 *   masked by the other passing.
 ************************************************************/

import fc from 'fast-check'
import type { CollectionBeforeChangeHook } from 'payload'
import { describe, expect, it } from 'vitest'
import { ServiceCategory } from '../ServiceCategory'

// ─── Subject under test: the real hook, off the real collection config ───────

/** The partial document shape Payload hands a `beforeChange` hook. */
type CategoryDraft = {
  name?: string
  slug?: string
}

/**
 * Invoke the collection's slug hook.
 *
 * Payload passes a large args object at runtime; this hook reads only `data` and
 * `operation`, so a minimal object is sufficient and the cast is confined here.
 * The length assertion fails loudly if another hook joins the array, so the test
 * can never silently start exercising the wrong function.
 */
function runSlugHook(data: CategoryDraft, operation: 'create' | 'update'): CategoryDraft {
  const hooks = ServiceCategory.hooks?.beforeChange
  if (hooks?.length !== 1) {
    throw new Error('ServiceCategory.hooks.beforeChange no longer holds exactly the slug hook')
  }
  const hook = hooks[0] as CollectionBeforeChangeHook
  return hook({
    data,
    operation,
  } as unknown as Parameters<CollectionBeforeChangeHook>[0]) as CategoryDraft
}

// ─── Generators ─────────────────────────────────────────────────────────────

const ASCII_ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')
// Punctuation, separators and accented characters that really do turn up in
// category names ("Hair & Beauty", "Mani-Pedi", "Body Massage (SPA)").
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
 * A realistic category name: arbitrary noise around at least one guaranteed
 * ASCII alphanumeric run. See the file header for why the alphanumeric anchor is
 * part of the property rather than a weakening of it.
 */
const categoryNameArb = fc
  .tuple(noiseArb, alnumRunArb, noiseArb)
  .map(([prefix, core, suffix]) => `${prefix}${core}${suffix}`)

/** A lowercase, single-hyphen-separated, URL-safe slug. */
const URL_SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// ─── Property 5: Slug Generation Correctness (Categories) ───────────────────

describe('Property 5: Slug Generation Correctness (Categories) — Requirements 2.7', () => {
  it('always derives a lowercase, URL-safe, non-empty hyphen-separated slug', () => {
    fc.assert(
      fc.property(categoryNameArb, (name) => {
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
      fc.property(categoryNameArb, (name) => {
        const first = runSlugHook({ name }, 'create').slug as string
        const second = runSlugHook({ name: first }, 'create').slug

        expect(second).toBe(first)
      }),
      { numRuns: 300 },
    )
  })

  it('never overwrites a slug the editor supplied', () => {
    fc.assert(
      fc.property(categoryNameArb, categoryNameArb, (name, otherName) => {
        const explicit = runSlugHook({ name: otherName }, 'create').slug as string

        expect(runSlugHook({ name, slug: explicit }, 'create').slug).toBe(explicit)
      }),
      { numRuns: 200 },
    )
  })

  it('only generates on create — an update never invents a slug', () => {
    fc.assert(
      fc.property(categoryNameArb, (name) => {
        expect(runSlugHook({ name }, 'update').slug).toBeUndefined()
      }),
      { numRuns: 200 },
    )
  })
})
