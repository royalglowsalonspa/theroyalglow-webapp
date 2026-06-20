// @vitest-environment node

/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : cutover-invariants.test
 * Scope        : Admin Subdomain Migration — Cutover Smoke / Invariant Tests
 *
 * Description  : Static / filesystem invariant assertions that guard the
 *                admin-subdomain cutover. These do NOT need a running server —
 *                they verify the source tree after the web→admin migration:
 *                no admin artifacts remain under apps/web, the web middleware
 *                carries no admin role logic (only the 301 redirect branch),
 *                no web source still imports admin modules, the legacy
 *                /admin → admin.theroyalglow.in mapping is correct, and the
 *                feature introduced no new DB migrations.
 *
 * Responsibilities :
 * - Assert admin route/component/lib/api directories are gone from apps/web (Req 9.1, 9.2)
 * - Assert web middleware has no RBAC artifacts and keeps the 301 redirect (Req 9.2)
 * - Assert zero unresolved admin imports across apps/web/src (Req 9.5)
 * - Assert the pure mapAdminRedirect mapping (Req 3.6 / 9.4 — /api/admin 404s by absence)
 * - Assert no new admin-subdomain DB migration was introduced (Req 14.5)
 *
 * Features / Functionality :
 * - node:fs existsSync directory checks against paths derived from this file
 * - Recursive .ts/.tsx scan for forbidden admin import specifiers
 * - Pure-function assertions for the redirect mapping
 * - Migration-directory name scan
 *
 * Tech Stack   : TypeScript, Vitest (node environment)
 * Layer        : Testing
 *
 * Dependencies : node:fs, node:path, node:url, vitest, ../lib/admin-redirect
 *
 * Notes        : The runtime behaviours (301 for /admin/*, 404 for /api/admin/*)
 *                are guaranteed statically here: the redirect mapping is pure and
 *                unit-tested, and /api/admin 404s purely because the directory no
 *                longer exists (covered by the artifact-absence checks). The
 *                "no new migration" check is necessarily heuristic (see test 5).
 * _Requirements: 3.6, 9.1, 9.2, 9.5, 14.5_
 ************************************************************/

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ADMIN_ORIGIN, mapAdminRedirect } from '../lib/admin-redirect'

// Resolve key roots from THIS file's location so the test is location-robust and
// does not depend on the process cwd.
//   here      = apps/web/src/__tests__
//   webRoot   = apps/web
//   repoRoot  = monorepo root
const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '../..')
const repoRoot = resolve(here, '../../../..')
const webSrc = join(webRoot, 'src')

/** Recursively collect every .ts/.tsx file under `dir`, skipping build/vendor dirs. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', 'coverage', 'dist', 'e2e'])
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue
      }
      out.push(...collectSourceFiles(full))
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe('admin-subdomain cutover invariants (static / filesystem)', () => {
  // ── 1. No admin artifacts remain under apps/web (Req 9.1, 9.2) ──────────────
  describe('no admin artifacts under apps/web', () => {
    const adminDirs = [
      join(webSrc, 'app', 'admin'),
      join(webSrc, 'app', 'api', 'admin'),
      join(webSrc, 'lib', 'admin'),
      join(webSrc, 'components', 'admin'),
    ]

    for (const dir of adminDirs) {
      it(`directory does not exist: ${dir.replace(repoRoot, '<repo>')}`, () => {
        expect(existsSync(dir)).toBe(false)
      })
    }
  })

  // ── 2. Web middleware has no admin role logic, keeps the 301 redirect (Req 9.2)
  describe('web middleware', () => {
    const middlewarePath = join(webSrc, 'middleware.ts')
    const source = existsSync(middlewarePath) ? readFileSync(middlewarePath, 'utf8') : ''

    it('middleware.ts exists', () => {
      expect(existsSync(middlewarePath)).toBe(true)
    })

    it('contains NO RBAC role-check artifacts', () => {
      // No role-level table, no requireRole helper, no session-endpoint lookup.
      expect(source).not.toContain('ROLE_LEVELS')
      expect(source).not.toContain('requireRole')
      expect(source).not.toContain('get-session')
      expect(source).not.toMatch(/role\s*(?:Level|level)/)
    })

    it('keeps the 301 redirect to the admin subdomain (mapAdminRedirect usage)', () => {
      expect(source).toContain('mapAdminRedirect')
      expect(source).toContain('301')
    })

    it("matcher includes '/admin/:path*'", () => {
      expect(source).toContain('/admin/:path*')
    })
  })

  // ── 3. Zero unresolved admin imports across apps/web/src (Req 9.5) ──────────
  describe('no unresolved admin imports in apps/web/src', () => {
    it('no .ts/.tsx file imports @/components/admin, @/lib/admin, or @/app/admin', () => {
      // Match import/export/require specifiers that reference an admin *module
      // directory* — `@/lib/admin/x` or `@/lib/admin` (quote-terminated). The
      // trailing (\/|['"]) guard means the sibling helper `@/lib/admin-redirect`
      // (followed by `-`) is intentionally NOT flagged.
      const forbidden =
        /(?:from\s+|import\s*\(\s*|require\(\s*)['"]@\/(?:components|lib|app)\/admin(?:\/|['"])/
      const files = collectSourceFiles(webSrc)
      // Exclude this test file (it embeds the specifiers as regex literals).
      const offenders = files
        .filter((f) => !/\.test\.tsx?$/.test(f))
        .filter((f) => forbidden.test(readFileSync(f, 'utf8')))
        .map((f) => f.replace(repoRoot, '<repo>'))

      expect(offenders).toEqual([])
    })
  })

  // ── 4. Legacy /admin → admin subdomain mapping is correct (Req 3.6 / 9.4) ───
  // The /api/admin/* paths 404 purely by absence of the directory (asserted in
  // test 1); the customer site's only remaining admin behaviour is this pure
  // 301 mapping. Runtime 301/404 status codes are covered by middleware/E2E.
  describe('mapAdminRedirect (pure)', () => {
    it('maps /admin/bookings to the admin subdomain, dropping the prefix', () => {
      expect(mapAdminRedirect('/admin/bookings')).toBe('https://admin.theroyalglow.in/bookings')
    })

    it('maps bare /admin to the admin origin root', () => {
      expect(mapAdminRedirect('/admin')).toBe(ADMIN_ORIGIN)
      expect(mapAdminRedirect('/admin')).toBe('https://admin.theroyalglow.in')
    })

    it('preserves nested sub-paths and the query string', () => {
      expect(mapAdminRedirect('/admin/bookings/123', '?status=pending')).toBe(
        'https://admin.theroyalglow.in/bookings/123?status=pending',
      )
    })
  })

  // ── 5. No new admin-subdomain DB migration introduced (Req 14.5) ────────────
  // LIMITATION: statically counting "new" migrations vs a baseline is not
  // possible without git history here, so we assert the weaker (but reliable)
  // invariant that this feature added NO migration whose name references the
  // admin-subdomain work. The migration dir is otherwise expected to be
  // unchanged by this feature (design §Data Models: "introduces no DB schema
  // changes"). A git-diff based count lives in the CI migration-diff check.
  describe('no new DB migrations for this feature', () => {
    const migrationsDir = join(repoRoot, 'packages', 'db', 'migrations')

    it('migrations directory exists', () => {
      expect(existsSync(migrationsDir)).toBe(true)
      expect(statSync(migrationsDir).isDirectory()).toBe(true)
    })

    it('no migration filename references the admin-subdomain feature', () => {
      const offending = readdirSync(migrationsDir)
        .filter((name) => /\.sql$/.test(name))
        .filter((name) => /admin[_-](?:subdomain|migration)/i.test(name))
      expect(offending).toEqual([])
    })
  })
})
