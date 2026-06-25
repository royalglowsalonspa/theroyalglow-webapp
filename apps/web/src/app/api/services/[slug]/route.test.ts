// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : services/[slug]/route.test
 * Scope        : Property-based test for GET /api/services/[slug]
 *
 * Description  : Validates Property 6 of the backend-api design — an unknown or
 *                inactive slug yields a NOT_FOUND (404) error envelope. The route
 *                is exercised directly with the query layer (`@rgss/db/queries`)
 *                mocked so no real database is touched. `getServiceBySlug` is the
 *                single seam: in the real query it returns a row ONLY for an
 *                active service matching the slug and `null` otherwise (unknown
 *                OR inactive), so the in-memory fake mirrors that exactly.
 *
 * Approach     : fast-check generates arbitrary candidate slugs alongside a set
 *                of known active slugs; the precondition keeps the candidate out
 *                of the active set (i.e. unknown-or-inactive). The fake resolves
 *                `null` for any such slug and the route must return 404.
 *
 * Layer        : Testing
 *
 * Notes        : Runs in the `node` environment (server route handler).
 *                Validates: Requirements 2.5
 ************************************************************/

// Feature: backend-api, Property 6: Unknown or inactive slug yields NOT_FOUND

import { ERROR_CODES } from '@rgss/errors'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock seam. Only the query layer is mocked; the route, the error handler, and
// the `@rgss/errors` factory all stay real so the produced envelope is the one
// the app actually returns.
// ---------------------------------------------------------------------------
const dbMocks = vi.hoisted(() => ({
  getServiceBySlug: vi.fn(),
}))

vi.mock('@rgss/db/queries', () => dbMocks)

import { GET } from '@/app/api/services/[slug]/route'

// A representative active service row (full read projection) returned by the
// fake when — and only when — the requested slug is a known active service.
function activeServiceRow(slug: string) {
  return {
    id: `svc_${slug}`,
    categoryId: 'cat_1',
    categoryName: 'Hair',
    serviceType: 'salon' as const,
    name: 'Some Service',
    slug,
    description: null,
    durationMinutes: 30,
    pricePaise: 50_000,
    gemsRedeemable: false,
    gemsRequired: null,
  }
}

function invokeGet(slug: string) {
  return GET(new Request(`https://theroyalglow.in/api/services/${encodeURIComponent(slug)}`), {
    params: Promise.resolve({ slug }),
  })
}

describe('GET /api/services/[slug] — Property 6: unknown or inactive slug yields NOT_FOUND', () => {
  it('returns a NOT_FOUND 404 envelope for any slug with no active service', async () => {
    await fc.assert(
      fc.asyncProperty(
        // The set of slugs that DO resolve to an active service.
        fc.array(fc.string({ minLength: 1, maxLength: 24 }), { maxLength: 8 }),
        // The slug actually requested.
        fc.string({ minLength: 0, maxLength: 24 }),
        async (activeSlugs, requestedSlug) => {
          const activeSet = new Set(activeSlugs)
          // Precondition: the requested slug is unknown OR inactive — i.e. it is
          // NOT one of the active slugs. This is exactly the input space of the
          // property (a slug with no matching active service).
          fc.pre(!activeSet.has(requestedSlug))

          // Mirror the real query: a row for active matches, null otherwise.
          dbMocks.getServiceBySlug.mockImplementation(async (slug: string) =>
            activeSet.has(slug) ? activeServiceRow(slug) : null,
          )

          const res = await invokeGet(requestedSlug)
          const body = await res.json()

          expect(res.status).toBe(404)
          expect(body.success).toBe(false)
          expect(body.error).toMatchObject({
            code: ERROR_CODES.NOT_FOUND,
            statusCode: 404,
            requestId: expect.any(String),
          })
        },
      ),
      { numRuns: 100 },
    )
  })
})
