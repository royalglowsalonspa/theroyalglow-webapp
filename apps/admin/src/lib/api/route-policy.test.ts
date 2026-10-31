// @vitest-environment node
/************************************************************
 * Module Name  : route-policy.test
 * Scope        : Unit tests — the admin API route inventory (multi-branch R2.5)
 *
 * Description  : Reads every `route.ts` under src/app/api and checks it
 *                against ADMIN_ROUTE_POLICIES:
 *                  1. every route and every exported method is classified,
 *                     and nothing classified has disappeared;
 *                  2. each handler file uses the guard its policy needs
 *                     (branch context, Developer check, QStash signature,
 *                     410 Gone).
 *
 *                A text check can't prove isolation; each route's own tests
 *                do. This one stops a new entry point arriving unclassified
 *                or unguarded.
 *
 * Notes        : PENDING lists routes whose policy is decided but whose
 *                handler doesn't follow it yet. It may only shrink: a pending
 *                route that already follows its policy fails the test until
 *                it is taken off the list.
 ************************************************************/

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ADMIN_ROUTE_POLICIES,
  type AdminRoute,
  BRANCH_CONTEXT_POLICIES,
  type HttpMethod,
  type RouteMethods,
  type RoutePolicy,
} from './route-policy'

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'api')

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

/**
 * Decided but not yet followed: these handlers still authorize on the global
 * role. Remove a route from here when its handler is migrated. Empty now; it
 * stays so a future policy change can be staged the same way.
 */
const PENDING: ReadonlySet<AdminRoute> = new Set<AdminRoute>([])

/** Every `route.ts` under the API folder, keyed by its route folder. */
function routeSources(): Map<string, string> {
  const found = new Map<string, string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path)
      } else if (entry.name === 'route.ts') {
        const route = relative(API_DIR, dir).split(sep).join('/')
        found.set(route, readFileSync(path, 'utf8'))
      }
    }
  }
  walk(API_DIR)
  return found
}

/** The HTTP methods a route module exports. */
function exportedMethods(source: string): HttpMethod[] {
  const names = new Set<string>()
  for (const match of source.matchAll(
    /export\s+(?:const|async\s+function|function)\s+([A-Z]+)\b/g,
  )) {
    names.add(match[1] ?? '')
  }
  // `export const { GET, POST } = handler(...)`
  for (const match of source.matchAll(/export\s+const\s*\{([^}]*)\}\s*=/g)) {
    for (const part of (match[1] ?? '').split(',')) {
      names.add(part.split(':').pop()?.trim() ?? '')
    }
  }
  return METHODS.filter((method) => names.has(method))
}

function policiesOf(route: string): RoutePolicy[] {
  const methods: RouteMethods = ADMIN_ROUTE_POLICIES[route as AdminRoute]
  return Object.values(methods)
}

/** Why `source` doesn't follow `policies`, or null when it does. */
function guardProblem(policies: RoutePolicy[], source: string): string | null {
  const has = (text: string) => source.includes(text)

  if (policies.some((p) => BRANCH_CONTEXT_POLICIES.has(p))) {
    if (!has('requireBranchRole(')) {
      return 'a branch-context handler must call requireBranchRole'
    }
    if (policies.every((p) => BRANCH_CONTEXT_POLICIES.has(p)) && has('requireRole(')) {
      return 'a branch-context handler must not authorize on the global role (requireRole)'
    }
  }
  if (
    policies.includes('developer') &&
    !has("requireCurrentRole('developer')") &&
    !has("requireRole('developer')")
  ) {
    return 'a Developer-only handler must check for the Developer'
  }
  if (policies.includes('job') && !has('verifyQStashSignature(')) {
    return 'a job must verify its QStash signature'
  }
  if (policies.includes('settlement') && !has('requireSettlementViewer(')) {
    return 'a settlement handler must check the viewer with requireSettlementViewer'
  }
  if (policies.includes('retired') && !has('gone(')) {
    return 'a retired handler must answer 410 Gone'
  }
  return null
}

const sources = routeSources()

describe('admin API route inventory', () => {
  it('classifies every route on disk, and only routes that exist', () => {
    const onDisk = [...sources.keys()].sort()
    const classified = Object.keys(ADMIN_ROUTE_POLICIES).sort()
    expect(
      onDisk.filter((r) => !classified.includes(r)),
      'unclassified routes',
    ).toEqual([])
    expect(
      classified.filter((r) => !onDisk.includes(r)),
      'classified routes not on disk',
    ).toEqual([])
  })

  it.each([...sources.entries()])(
    '%s classifies exactly the methods it exports',
    (route, source) => {
      const declared = Object.keys(ADMIN_ROUTE_POLICIES[route as AdminRoute] ?? {}).sort()
      expect(exportedMethods(source).sort()).toEqual(declared)
    },
  )

  it.each([...sources.entries()].filter(([route]) => !PENDING.has(route as AdminRoute)))(
    '%s uses the guard its policy needs',
    (route, source) => {
      expect(guardProblem(policiesOf(route), source)).toBeNull()
    },
  )

  it('lists as pending only routes that still need migrating', () => {
    const done = [...PENDING].filter((route) => {
      const source = sources.get(route)
      return source !== undefined && guardProblem(policiesOf(route), source) === null
    })
    expect(done, 'already migrated: remove these from PENDING').toEqual([])
    const unknown = [...PENDING].filter((route) => !sources.has(route))
    expect(unknown, 'pending routes that no longer exist').toEqual([])
  })
})

describe('guardProblem', () => {
  it('refuses a branch handler without branch context', () => {
    expect(guardProblem(['branch'], "await requireRole('receptionist')")).toMatch(
      /requireBranchRole/,
    )
  })

  it('refuses a branch handler that also trusts the global role', () => {
    expect(
      guardProblem(['branch'], "requireBranchRole('manager'); requireRole('manager')"),
    ).toMatch(/global role/)
  })

  it('accepts a route mixing a shared read with a branch write', () => {
    expect(
      guardProblem(['shared', 'branch'], "requireRole('manager'); requireBranchRole('manager')"),
    ).toBeNull()
  })

  it('refuses a Developer route checked at a lower role', () => {
    expect(guardProblem(['developer'], "requireRole('manager')")).toMatch(/Developer/)
  })

  it('refuses an unsigned job and a retired route that still works', () => {
    expect(guardProblem(['job'], 'export const POST = handler')).toMatch(/QStash/)
    expect(guardProblem(['retired'], 'return apiSuccess({})')).toMatch(/410/)
  })

  it('refuses a settlement route that trusts the active branch instead of the viewer', () => {
    expect(guardProblem(['settlement'], "requireBranchRole('owner')")).toMatch(
      /requireSettlementViewer/,
    )
    expect(guardProblem(['settlement'], 'await requireSettlementViewer()')).toBeNull()
  })
})
