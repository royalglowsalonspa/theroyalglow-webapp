/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : admin-web-separation.invariants.test
 * Scope        : Static verification of the admin/web separation (Req 9)
 *
 * Description  : Filesystem-level invariants that prove the staff self-service
 *                relocation is complete and the customer site holds only
 *                public/customer code. These are static checks (node:fs), not
 *                runtime behavior tests:
 *                  - no leftover staff page/API directories in apps/web (Req 9.4)
 *                  - no apps/web source references the relocated staff modules
 *                    or removed `/api/staff` paths (Req 9.3)
 *                  - kept public surfaces still exist (Req 6.1, 6.2)
 *                  - the admin/web-separation feature adds no migration of its
 *                    own; the committed canonical baseline + pg_cron are intact
 *                    (Req 9.7, updated for schema-drift-remediation discipline)
 *
 * Tech Stack   : Vitest + node:fs
 * Layer        : Test (static verification)
 ************************************************************/

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Resolve the repository root from this file's location:
// apps/web/src/__tests__ -> up four levels -> repo root.
const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '../../../..')

const WEB_SRC = join(REPO_ROOT, 'apps', 'web', 'src')

/** Recursively collect non-test TS/TSX source files under a directory. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip build output, deps, and the test directory itself (which contains
      // the very strings being grepped for).
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '__tests__') {
        continue
      }
      out.push(...collectSourceFiles(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      continue
    }
    // Exclude test files so their fixtures/strings never trip the grep.
    if (/\.test\.(ts|tsx)$/.test(entry.name)) {
      continue
    }
    out.push(full)
  }
  return out
}

describe('admin-web-separation: no leftover staff surfaces in apps/web (Req 9.4)', () => {
  it('does not contain a staff self-service page directory', () => {
    expect(existsSync(join(WEB_SRC, 'app', 'staff'))).toBe(false)
  })

  it('does not contain a staff self-service API directory', () => {
    expect(existsSync(join(WEB_SRC, 'app', 'api', 'staff'))).toBe(false)
  })

  it('still has no admin page or API directory (prior migration)', () => {
    expect(existsSync(join(WEB_SRC, 'app', 'admin'))).toBe(false)
    expect(existsSync(join(WEB_SRC, 'app', 'api', 'admin'))).toBe(false)
  })
})

describe('admin-web-separation: no dead staff imports/references in apps/web (Req 9.3)', () => {
  // Markers that would only appear if a relocated staff module or removed staff
  // API path were still referenced from the customer site.
  const FORBIDDEN_MARKERS = ['/api/staff', 'staff-leave-panel', 'app/staff/']

  it('no non-test source references a relocated staff module or removed staff API path', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(WEB_SRC)) {
      const content = readFileSync(file, 'utf8')
      for (const marker of FORBIDDEN_MARKERS) {
        if (content.includes(marker)) {
          offenders.push(`${file} -> "${marker}"`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('admin-web-separation: kept public surfaces remain in apps/web (Req 6.1, 6.2)', () => {
  it('retains the public lead-capture page', () => {
    expect(existsSync(join(WEB_SRC, 'app', '(landing)', 'book', 'page.tsx'))).toBe(true)
  })

  it('retains the LeadCaptureForm component', () => {
    expect(existsSync(join(WEB_SRC, 'components', 'lead', 'LeadCaptureForm.tsx'))).toBe(true)
  })
})

describe('admin-web-separation: no admin/web-separation migration (Req 9.7)', () => {
  // NOTE (schema-drift-remediation, task 13.1): the project has since adopted
  // `drizzle-kit generate` with committed SQL migrations. A canonical Baseline_
  // Migration (`0000_*.sql`) now lives alongside the special hand-written
  // `0001_pg_cron_jobs.sql`. The admin/web-separation feature itself still
  // introduces NO schema change, so the invariant is restated as: the special
  // pg_cron migration is preserved and no migration is attributable to the
  // admin/web-separation work.
  const migrationsDir = join(REPO_ROOT, 'packages', 'db', 'migrations')

  const sqlFiles = () =>
    readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) => statSync(join(migrationsDir, name)).isFile())
      .sort()

  it('preserves the special pg_cron migration', () => {
    expect(existsSync(migrationsDir)).toBe(true)
    expect(sqlFiles()).toContain('0001_pg_cron_jobs.sql')
  })

  it('contains the canonical baseline migration ordered before pg_cron', () => {
    const files = sqlFiles()
    const baseline = files.find((name) => name.startsWith('0000_'))
    expect(baseline).toBeDefined()
    // Baseline (0000_*) must sort before the pg_cron migration (0001_*) so the
    // forward-only migration history applies the canonical schema first.
    expect((baseline as string) < '0001_pg_cron_jobs.sql').toBe(true)
  })

  it('introduces no migration attributable to the admin/web-separation feature', () => {
    const offending = sqlFiles().filter((name) =>
      /admin[_-](?:web|subdomain|separation)/i.test(name),
    )
    expect(offending).toEqual([])
  })
})
