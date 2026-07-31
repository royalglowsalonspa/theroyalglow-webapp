/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-02-2027 & Updated - 21-02-2027
 *
 * Project      : theroyalglow-webapp
 * Module Name  : blog-slug.properties.test
 * Scope        : Property-based test — Blog collection slug hook
 *
 * Description  : fast-check + Vitest property tests for the `slug` field hook on
 *                the `blog` Payload collection. The hook derives a kebab-case
 *                slug from the title (or normalises an editor-entered slug). A
 *                title with no ASCII alphanumerics — "!!!", "---", "🎉" — used to
 *                reduce to the EMPTY string, which breaks URL generation and
 *                collides with every other such title, so the hook now falls
 *                back to a deterministic `post-{hash}`.
 *
 * Responsibilities :
 * - The slug is ALWAYS non-empty and URL-safe, for ANY non-empty input
 * - The slug is deterministic: the same input always yields the same slug
 * - Slug derivation is idempotent — feeding a slug back in reproduces it
 * - Ordinary titles still slug exactly as before (no regression)
 *
 * Features / Functionality :
 * - The hook is invoked off the real collection config (`Blog.fields` → slug →
 *   `hooks.beforeValidate`) — the slugify logic is NEVER reimplemented here
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : CMS (Collections — test)
 *
 * Dependencies : fast-check, vitest, payload, ../Blog
 *
 * Notes        : Unlike the Service/ServiceCategory slug generators (npm
 *                `slugify`, whose inputs are anchored to at least one ASCII
 *                alphanumeric), this hook must stay total over the WHOLE input
 *                space: a blog title is free-form editorial text and Payload
 *                writes the derived slug to a `unique` + `index`ed field.
 ************************************************************/

import fc from 'fast-check'
import type { FieldHook } from 'payload'
import { describe, expect, it } from 'vitest'
import { Blog } from '../Blog'

// ─── Subject under test: the real hook, off the real collection config ───────

type SlugDraft = { value?: string | undefined; title?: string | undefined }

/**
 * Invoke the `slug` field's `beforeValidate` hook. Payload passes a large args
 * object at runtime; this hook reads only `value` and `data`, so a minimal object
 * is sufficient and the cast is confined here. The length assertion fails loudly
 * if another hook is added, so the test can never exercise the wrong function.
 */
function runSlugHook({ value, title }: SlugDraft): unknown {
  const field = Blog.fields.find((candidate) => 'name' in candidate && candidate.name === 'slug') as
    | { hooks?: { beforeValidate?: FieldHook[] } }
    | undefined

  const hooks = field?.hooks?.beforeValidate
  if (hooks?.length !== 1) {
    throw new Error('Blog slug field no longer holds exactly the formatSlug hook')
  }
  const hook = hooks[0] as FieldHook
  return hook({
    value,
    data: { title },
  } as unknown as Parameters<FieldHook>[0])
}

/** Derive a slug from a title, the way an editor creating a post does. */
function slugFromTitle(title: string): string {
  const slug = runSlugHook({ title })
  expect(typeof slug).toBe('string')
  return slug as string
}

/** Lowercase, single-hyphen-separated, URL-safe — and non-empty by construction. */
const URL_SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// ─── Generators ─────────────────────────────────────────────────────────────

// Titles with NO ASCII alphanumerics: the branch that used to produce ''.
const PUNCTUATION = ' \t-_!?.,&/()\'"+#%@:;*~'.split('')
const EMOJI = ['🎉', '💅', '✨', '🧖', '🌸']
const NON_LATIN = 'नमस्ते こんにちは Привет'.split('')

const degenerateTitleArb = fc.string({
  unit: fc.constantFrom(...PUNCTUATION, ...EMOJI, ...NON_LATIN),
  minLength: 1,
  maxLength: 20,
})

// Free-form editorial text: anything an author can type, including the
// degenerate shapes above and full-unicode noise.
const anyTitleArb = fc.oneof(
  degenerateTitleArb,
  fc.string({ minLength: 1, maxLength: 60 }),
  fc.string({ unit: 'grapheme', minLength: 1, maxLength: 60 }),
)

// ─── Property: the slug is always non-empty and URL-safe ────────────────────

describe('Blog slug hook — always yields a non-empty, URL-safe slug', () => {
  it('never returns an empty slug for any non-empty title', () => {
    fc.assert(
      fc.property(anyTitleArb, (title) => {
        const slug = slugFromTitle(title)

        expect(slug).not.toBe('')
        expect(slug).toMatch(URL_SAFE_SLUG)
        expect(slug).toBe(slug.toLowerCase())
        expect(slug).not.toMatch(/\s/)
      }),
      { numRuns: 500 },
    )
  })

  it('never returns an empty slug for an editor-entered slug either', () => {
    fc.assert(
      fc.property(anyTitleArb, (value) => {
        const slug = runSlugHook({ value, title: 'Ignored' })

        expect(slug).not.toBe('')
        expect(slug as string).toMatch(URL_SAFE_SLUG)
      }),
      { numRuns: 300 },
    )
  })

  it('is deterministic — the same title always yields the same slug', () => {
    fc.assert(
      fc.property(anyTitleArb, (title) => {
        expect(slugFromTitle(title)).toBe(slugFromTitle(title))
      }),
      { numRuns: 300 },
    )
  })

  it('is idempotent — feeding a generated slug back reproduces it', () => {
    fc.assert(
      fc.property(anyTitleArb, (title) => {
        const first = slugFromTitle(title)

        expect(runSlugHook({ value: first, title })).toBe(first)
      }),
      { numRuns: 300 },
    )
  })

  it('gives distinct degenerate titles distinct slugs', () => {
    fc.assert(
      fc.property(degenerateTitleArb, degenerateTitleArb, (first, second) => {
        fc.pre(first !== second)

        // Not a hard guarantee (it is a hash), but the fixed-prefix alternative
        // would collapse EVERY such title onto one slug, and `slug` is unique.
        expect(slugFromTitle(first)).not.toBe(slugFromTitle(second))
      }),
      { numRuns: 300 },
    )
  })
})

// ─── Examples: the degenerate inputs, and a normal title (no regression) ────

describe('Blog slug hook — examples', () => {
  it('slugs an ordinary title exactly as before', () => {
    expect(slugFromTitle('Top 5 Bridal Looks for 2026!')).toBe('top-5-bridal-looks-for-2026')
    expect(slugFromTitle('  Hair & Beauty  ')).toBe('hair-beauty')
  })

  it.each(['!!!', '---', '   ', '\t\t', '🎉🎉', 'नमस्ते', '...&&&...'])(
    'falls back to a stable non-empty slug for %j',
    (title) => {
      const slug = slugFromTitle(title)

      expect(slug).toMatch(/^post-[a-z0-9]+$/)
      expect(slug).toBe(slugFromTitle(title))
    },
  )

  it('has nothing to derive from when both slug and title are empty', () => {
    // The hook returns the incoming value untouched; Payload's `required: true`
    // on the slug field is what rejects the document. The fallback deliberately
    // does NOT invent a slug for a post with no title at all.
    expect(runSlugHook({ value: '', title: '' })).toBe('')
    expect(runSlugHook({})).toBeUndefined()
  })
})
