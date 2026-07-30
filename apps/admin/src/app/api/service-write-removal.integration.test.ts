// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : service-write-removal.integration.test
 * Scope        : Integration tests for the retired admin service write APIs
 *
 * Description  : Task 6.5 counterpart to the unit suite in
 *                services/services-mgmt.test.ts. Where that suite mocks
 *                @/lib/api/session + @rgss/db/queries and asserts the exported
 *                handler answers 410, this suite asserts the endpoints are gone
 *                as HTTP SURFACES:
 *                  1. the exported verb surface of every route module in the
 *                     two API trees (no lingering PUT/DELETE, no new files),
 *                  2. the retired handlers still answer 410 with NOTHING mocked
 *                     (real session + real db modules loaded),
 *                  3. no retired route source references a write query at all,
 *                  4. the real edge middleware bounces anonymous callers before
 *                     the handler runs, and clearing that gate still yields 410.
 *
 * Layer        : Testing
 *
 * Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.7
 *
 * Notes        : Node environment. NO vi.mock — the point is that the retired
 *                handlers need neither a session nor a database, so a surviving
 *                write path would surface as a 401/403/500 here instead of 410.
 *
 *                A live-HTTP probe (fetch against `next dev`) is deliberately
 *                NOT used: the admin middleware 307-redirects unauthenticated
 *                requests — /api/* included — to the customer origin, so an
 *                anonymous probe never reaches the handler and proves nothing
 *                about it. That redirect is asserted here as its own layer, and
 *                the handler layer is driven through the real
 *                withErrorHandler/AppError composition instead.
 ************************************************************/

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ERROR_CODES } from '@rgss/errors'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as catIdRoute from '@/app/api/service-categories/[id]/route'
import * as catRoute from '@/app/api/service-categories/route'
import * as svcIdRoute from '@/app/api/services/[id]/route'
import * as svcAllRoute from '@/app/api/services/all/route'
import * as svcRoute from '@/app/api/services/route'
import { middleware, config as middlewareConfig } from '@/middleware'

/** This file's directory — `apps/admin/src/app/api/`. */
const API_DIR = fileURLToPath(new URL('.', import.meta.url))

const ADMIN_ORIGIN = 'https://admin.theroyalglow.in'

/** Every verb Next.js will route to a `route.ts` export. */
const HTTP_VERBS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const

type RouteModule = Record<string, unknown>

type RouteSurface = {
  /** Path as served on admin.theroyalglow.in. */
  path: string
  /** Source file, relative to this test's directory. */
  file: string
  module: RouteModule
  /** The COMPLETE set of verbs the module may export. */
  verbs: readonly string[]
}

// The five route files that make up the service + category API surface. The
// `verbs` lists are exhaustive: anything else exported is a regression.
const ROUTE_SURFACES: readonly RouteSurface[] = [
  {
    path: '/api/services',
    file: 'services/route.ts',
    module: svcRoute,
    verbs: ['GET', 'POST'],
  },
  {
    path: '/api/services/all',
    file: 'services/all/route.ts',
    module: svcAllRoute,
    verbs: ['GET'],
  },
  {
    path: '/api/services/svc1',
    file: 'services/[id]/route.ts',
    module: svcIdRoute,
    verbs: ['PATCH'],
  },
  {
    path: '/api/service-categories',
    file: 'service-categories/route.ts',
    module: catRoute,
    verbs: ['GET', 'POST'],
  },
  {
    path: '/api/service-categories/cat1',
    file: 'service-categories/[id]/route.ts',
    module: catIdRoute,
    verbs: ['PATCH'],
  },
]

type RetiredWrite = {
  name: string
  path: string
  method: 'POST' | 'PATCH'
  file: string
  invoke: (req: Request) => Promise<Response>
}

// The four retired writes, invoked exactly as Next.js would (dynamic routes get
// their `params` promise).
const RETIRED_WRITES: readonly RetiredWrite[] = [
  {
    name: 'POST /api/services',
    path: '/api/services',
    method: 'POST',
    file: 'services/route.ts',
    invoke: (req) => svcRoute.POST(req),
  },
  {
    name: 'PATCH /api/services/[id]',
    path: '/api/services/svc1',
    method: 'PATCH',
    file: 'services/[id]/route.ts',
    invoke: (req) => svcIdRoute.PATCH(req, { params: Promise.resolve({ id: 'svc1' }) }),
  },
  {
    name: 'POST /api/service-categories',
    path: '/api/service-categories',
    method: 'POST',
    file: 'service-categories/route.ts',
    invoke: (req) => catRoute.POST(req),
  },
  {
    name: 'PATCH /api/service-categories/[id]',
    path: '/api/service-categories/cat1',
    method: 'PATCH',
    file: 'service-categories/[id]/route.ts',
    invoke: (req) => catIdRoute.PATCH(req, { params: Promise.resolve({ id: 'cat1' }) }),
  },
]

const exportedVerbs = (module: RouteModule): string[] =>
  HTTP_VERBS.filter((verb) => typeof module[verb] === 'function')

const readRouteSource = (file: string): string => readFileSync(join(API_DIR, file), 'utf8')

/**
 * Collect every `route.ts`/`route.tsx` under an API subtree, returned as
 * forward-slashed paths relative to this file's directory.
 */
const collectRouteFiles = (dir: string): string[] => {
  const found: string[] = []
  for (const entry of readdirSync(join(API_DIR, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      found.push(...collectRouteFiles(rel))
    } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
      found.push(rel)
    }
  }
  return found
}

const expectGoneEnvelope = async (res: Response) => {
  const body = await res.json()
  expect(res.status).toBe(410)
  expect(body.success).toBe(false)
  expect(body.error).toMatchObject({
    code: ERROR_CODES.ENDPOINT_GONE,
    statusCode: 410,
    requestId: expect.any(String),
    retryable: false,
  })
  expect(body.error.message).toContain('Service management moved to CMS')
  expect(body.error.message).toContain('cms.theroyalglow.in')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('exported HTTP surface of the service API trees', () => {
  it.each(ROUTE_SURFACES)('$file exports exactly [$verbs]', ({ module, verbs }) => {
    expect(exportedVerbs(module).sort()).toEqual([...verbs].sort())
  })

  it('exposes no PUT or DELETE anywhere in the service API trees', () => {
    for (const surface of ROUTE_SURFACES) {
      expect(surface.module.PUT).toBeUndefined()
      expect(surface.module.DELETE).toBeUndefined()
    }
  })

  it('contains exactly the five known route files (no new write route slipped in)', () => {
    const files = [
      ...collectRouteFiles('services'),
      ...collectRouteFiles('service-categories'),
    ].sort()

    expect(files).toEqual([
      'service-categories/[id]/route.ts',
      'service-categories/route.ts',
      'services/[id]/route.ts',
      'services/all/route.ts',
      'services/route.ts',
    ])
  })

  it('keeps the preserved read verbs exported', () => {
    expect(typeof svcRoute.GET).toBe('function')
    expect(typeof svcAllRoute.GET).toBe('function')
    expect(typeof catRoute.GET).toBe('function')
  })
})

describe('retired route sources hold no write path at all', () => {
  const WRITE_QUERIES = [
    'createService',
    'updateService',
    'createServiceCategory',
    'updateServiceCategory',
  ]

  it.each(RETIRED_WRITES)('$name references no db write query', ({ file }) => {
    const source = readRouteSource(file)
    for (const query of WRITE_QUERIES) {
      expect(source).not.toContain(query)
    }
  })

  it.each(RETIRED_WRITES)('$name declares no extra verb export', ({ file }) => {
    const source = readRouteSource(file)
    expect(source).not.toMatch(/export const (PUT|DELETE)\b/)
  })
})

// Nothing is mocked in this block: the real @/lib/api/session and real
// @rgss/db/queries modules are loaded. A handler that still tried to
// authenticate or write would fail visibly (401/403/500) rather than answer 410.
describe('retired writes answer 410 with no session and no database', () => {
  const BODIES: readonly { label: string; body?: BodyInit }[] = [
    { label: 'no body' },
    { label: 'empty body', body: '' },
    { label: 'malformed json', body: 'not-json-at-all' },
    {
      label: 'valid-looking service payload',
      body: JSON.stringify({
        categoryId: 'cat_salon',
        name: 'Haircut',
        durationMinutes: 45,
        pricePaise: 49_900,
      }),
    },
    { label: 'unknown fields', body: JSON.stringify({ isActive: false, sneaky: true }) },
  ]

  for (const retired of RETIRED_WRITES) {
    it.each(BODIES)(`${retired.name} → 410 with $label`, async ({ body }) => {
      const res = await retired.invoke(
        new NextRequest(`${ADMIN_ORIGIN}${retired.path}`, {
          method: retired.method,
          headers: { 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body }),
        }),
      )

      await expectGoneEnvelope(res)
    })
  }

  it.each(RETIRED_WRITES)('$name → 410 even with a forged privileged session', async (retired) => {
    const res = await retired.invoke(
      new NextRequest(`${ADMIN_ORIGIN}${retired.path}`, {
        method: retired.method,
        headers: {
          'content-type': 'application/json',
          cookie: '__Secure-better-auth.session_token=forged; better-auth.session_token=forged',
          'x-role': 'developer',
        },
        body: JSON.stringify({ name: 'Anything' }),
      }),
    )

    await expectGoneEnvelope(res)
  })
})

describe('edge gate composition (real admin middleware)', () => {
  const matcherRe = new RegExp(`^${middlewareConfig.matcher[0]}$`)

  it('applies the RBAC gate to the service API paths', () => {
    for (const surface of ROUTE_SURFACES) {
      expect(matcherRe.test(surface.path)).toBe(true)
    }
    // Sanity: the exclusions in the matcher are still real exclusions.
    expect(matcherRe.test('/api/health')).toBe(false)
    expect(matcherRe.test('/api/auth/get-session')).toBe(false)
  })

  it.each(RETIRED_WRITES)(
    '$name is bounced off-origin before the handler runs when anonymous',
    async ({ path, method }) => {
      // Production mode: no dev bypass, no dev diagnostics logging.
      vi.stubEnv('NODE_ENV', 'production')

      const res = await middleware(new NextRequest(`${ADMIN_ORIGIN}${path}`, { method }))
      const location = res.headers.get('location')

      expect(res.status).toBe(307)
      expect(location).not.toBeNull()
      // Bounced to the customer origin — the request never reaches the route.
      expect(new URL(location as string).origin).not.toBe(ADMIN_ORIGIN)
    },
  )

  it.each(RETIRED_WRITES)(
    '$name still answers 410 once the gate lets the request through',
    async (retired) => {
      // Dev bypass stands in for a sufficiently-privileged session: it makes the
      // gate forward the request so the handler layer is the thing under test.
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('ADMIN_DEV_BYPASS_AUTH', '1')

      const request = new NextRequest(`${ADMIN_ORIGIN}${retired.path}`, {
        method: retired.method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Haircut' }),
      })

      const gateRes = await middleware(request)
      expect(gateRes.headers.get('location')).toBeNull()
      expect(gateRes.status).toBe(200)

      await expectGoneEnvelope(await retired.invoke(request))
    },
  )
})
