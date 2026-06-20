#!/usr/bin/env node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : assert-no-admin-artifacts
 * Scope        : CI cutover guard (admin-subdomain-migration)
 *
 * Description  : Fails (exit 1) if the admin portal has leaked back
 *                into apps/web, or if a new DB migration tied to the
 *                admin-subdomain migration was introduced. This guard
 *                runs in CI and BLOCKS the pipeline (and deploy) on a
 *                violation, enforcing the cutover invariants.
 *
 * Checks :
 * 1. No admin artifact directories under apps/web
 *    (src/app/admin, src/app/api/admin, src/lib/admin, src/components/admin)
 *      → Req 2.2, 2.7, 9.1
 * 2. apps/web/src/middleware.ts contains NO admin ROLE-ENFORCEMENT logic.
 *    A /admin REDIRECT branch (mapAdminRedirect) is explicitly ALLOWED;
 *    role-gating (ROLE_LEVELS, get-session fetch for /admin) is NOT.
 *      → Req 2.2, 9.2
 * 3. No DB migration under packages/db whose filename references the
 *    admin-subdomain migration (this feature adds no schema changes).
 *      → Req 14.5
 *
 * Usage        : node scripts/assert-no-admin-artifacts.mjs
 * Dependencies : node:fs, node:path, node:url (no external deps)
 ************************************************************/
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve the repo root robustly: this file lives in <root>/scripts/.
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

/** @type {string[]} */
const violations = []

// ---------------------------------------------------------------------------
// Check 1 — zero admin artifact directories under apps/web (Req 2.2, 2.7, 9.1)
// ---------------------------------------------------------------------------
const FORBIDDEN_WEB_DIRS = [
  'apps/web/src/app/admin',
  'apps/web/src/app/api/admin',
  'apps/web/src/lib/admin',
  'apps/web/src/components/admin',
]

for (const rel of FORBIDDEN_WEB_DIRS) {
  const abs = join(REPO_ROOT, rel)
  if (existsSync(abs)) {
    violations.push(
      `Admin artifact still present under apps/web: ${rel} (must be migrated to apps/admin)`,
    )
  }
}

// ---------------------------------------------------------------------------
// Check 2 — web middleware has no admin ROLE-ENFORCEMENT logic (Req 2.2, 9.2)
//
// IMPORTANT distinction:
//   ALLOWED  : a /admin 301-redirect branch (mapAdminRedirect) — kept on
//              purpose so legacy links still resolve (task 13.2).
//   FORBIDDEN: admin role-gating — ROLE_LEVELS tables or a get-session fetch
//              used to authorize /admin paths. That logic now lives in
//              apps/admin only.
// ---------------------------------------------------------------------------
const WEB_MIDDLEWARE = 'apps/web/src/middleware.ts'
const middlewareAbs = join(REPO_ROOT, WEB_MIDDLEWARE)

if (!existsSync(middlewareAbs)) {
  violations.push(`Expected web middleware not found: ${WEB_MIDDLEWARE}`)
} else {
  const src = readFileSync(middlewareAbs, 'utf8')

  // 2a — no ROLE_LEVELS table (admin role hierarchy must not live in web).
  if (/ROLE_LEVELS/.test(src)) {
    violations.push(
      `${WEB_MIDDLEWARE} contains 'ROLE_LEVELS' — admin role-enforcement must not live in the web app`,
    )
  }

  // 2b — no role-gating fetch to get-session for /admin. A bare cookie
  //      presence check for customer routes is fine; calling get-session to
  //      authorize /admin is the forbidden pattern.
  if (/get-session/.test(src) && /\/admin/.test(src)) {
    // Only flag when get-session is used in proximity to /admin role logic.
    // Heuristic: forbid any get-session usage in the web middleware, since
    // customer protection here is a lightweight cookie-presence check only.
    violations.push(
      `${WEB_MIDDLEWARE} calls 'get-session' — admin role-gating against the session endpoint must not live in the web app`,
    )
  }

  // 2c — defensive: explicit admin role-check identifiers should be gone.
  for (const marker of ['resolveRoleLevel', 'routeMinLevel', 'requireRole']) {
    if (new RegExp(`\\b${marker}\\b`).test(src)) {
      violations.push(
        `${WEB_MIDDLEWARE} references '${marker}' — admin RBAC logic must not live in the web app`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3 — no admin-subdomain DB migration introduced (Req 14.5)
//
// This feature introduces NO schema changes. Assert that no migration file
// under packages/db carries an admin-subdomain marker in its name. This is a
// lightweight filename scan; full migration diffing vs the base branch is a
// separate git-diff concern handled in CI.
// ---------------------------------------------------------------------------
const MIGRATION_NAME_MARKERS = [/admin[_-]subdomain/i, /admin[_-]migration/i]
const DB_DIR = join(REPO_ROOT, 'packages/db')

/** Recursively collect file paths under a directory, skipping node_modules. */
function walk(dir) {
  /** @type {string[]} */
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.turbo') {
      continue
    }
    const abs = join(dir, entry)
    const st = statSync(abs)
    if (st.isDirectory()) {
      out.push(...walk(abs))
    } else if (/\.sql$/i.test(entry)) {
      out.push(abs)
    }
  }
  return out
}

for (const file of walk(DB_DIR)) {
  const base = file.split(/[\\/]/).pop() ?? ''
  if (MIGRATION_NAME_MARKERS.some((re) => re.test(base))) {
    violations.push(
      `Unexpected admin-subdomain DB migration introduced: ${relative(REPO_ROOT, file)} (this feature adds no schema changes — Req 14.5)`,
    )
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (violations.length > 0) {
  console.error('\n✖ Cutover guard FAILED — admin-subdomain-migration invariants violated:\n')
  for (const v of violations) {
    console.error(`  • ${v}`)
  }
  console.error(
    '\nFix: admin code belongs in apps/admin (admin.theroyalglow.in). The web app may keep only the /admin 301-redirect branch.\n',
  )
  process.exit(1)
}

console.log('✔ Cutover guard passed — no admin artifacts under apps/web, no admin RBAC in web middleware, no admin-subdomain DB migrations.')
process.exit(0)
