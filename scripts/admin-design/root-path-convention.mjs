#!/usr/bin/env node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : root-path-convention
 * Scope        : CI static gate (admin-portal-redesign)
 *
 * Description  : Fails (exit 1) if any `ADMIN_NAV` href in
 *                apps/admin/src/lib/rbac.ts introduces an `/admin`
 *                prefix. The Admin_Portal is served from the
 *                `admin.theroyalglow.in` subdomain, which already
 *                provides the admin namespace, so every navigation
 *                href MUST use the Root-Path Convention (a root path
 *                such as `/bookings`, never `/admin/bookings`).
 *                  → Requirement 4.9
 *
 * Source        : apps/admin/src/lib/rbac.ts (read-only — this gate
 *                 parses, never modifies, the RBAC nav config).
 *
 * Detection     : Statically extracts the `ADMIN_NAV` array literal
 *                 from the rbac.ts source text (dependency-free — no
 *                 TypeScript loader needed), collects every `href`
 *                 string value, and flags any value equal to `/admin`
 *                 or beginning with `/admin/`.
 *
 * Usage        : node scripts/admin-design/root-path-convention.mjs
 *                bun  scripts/admin-design/root-path-convention.mjs
 *                bun run check:admin-root-path
 * Dependencies : node:fs, node:path, node:url (no external deps)
 ************************************************************/
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve the repo root robustly: this file lives in <root>/scripts/admin-design/.
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')

const RBAC_REL = 'apps/admin/src/lib/rbac.ts'
const RBAC_ABS = resolve(REPO_ROOT, RBAC_REL)

if (!existsSync(RBAC_ABS)) {
  console.error(`\n✖ Root-Path gate FAILED — cannot find ${RBAC_REL}.\n`)
  process.exit(1)
}

const src = readFileSync(RBAC_ABS, 'utf8')

/**
 * Extract the `ADMIN_NAV` array literal by scanning from the declaration to its
 * balanced closing bracket. Returns the literal text (`[ ... ]`) or null.
 */
function extractAdminNav(text) {
  const decl = /export\s+const\s+ADMIN_NAV\b[^=]*=\s*/m.exec(text)
  if (!decl) return null
  const start = text.indexOf('[', decl.index + decl[0].length)
  if (start === -1) return null

  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

const navLiteral = extractAdminNav(src)

if (navLiteral === null) {
  console.error(
    `\n✖ Root-Path gate FAILED — could not locate the ADMIN_NAV array in ${RBAC_REL}.
  The gate parses ADMIN_NAV statically; if the export was renamed or its
  shape changed, update this script to keep enforcing Req 4.9.\n`,
  )
  process.exit(1)
}

// Collect every href string value within the ADMIN_NAV literal.
const HREF_RE = /href\s*:\s*(['"`])((?:\\.|(?!\1).)*)\1/g
/** @type {{ href: string }[]} */
const hrefs = [...navLiteral.matchAll(HREF_RE)].map((match) => ({ href: match[2] }))

if (hrefs.length === 0) {
  console.error(
    `\n✖ Root-Path gate FAILED — found no href values inside ADMIN_NAV in ${RBAC_REL}.
  A nav config with zero hrefs is almost certainly a parse/shape change;
  failing loudly rather than passing vacuously.\n`,
  )
  process.exit(1)
}

// A href violates the Root-Path Convention when it equals `/admin` or begins
// with the `/admin/` segment (Req 4.9).
const violations = hrefs.filter(
  ({ href }) => href === '/admin' || href.startsWith('/admin/'),
)

if (violations.length > 0) {
  console.error(
    '\n✖ Root-Path gate FAILED — ADMIN_NAV href(s) introduce an `/admin` prefix (Req 4.9):\n',
  )
  for (const v of violations) {
    console.error(`  • ${v.href}`)
  }
  console.error(
    `\nFix: drop the \`/admin\` prefix in ${RBAC_REL}. The Admin_Portal is served
from the admin.theroyalglow.in subdomain, which already provides the admin
namespace — nav hrefs use root paths (e.g. \`/bookings\`, not \`/admin/bookings\`).\n`,
  )
  process.exit(1)
}

console.log(
  `✔ Root-Path gate passed — all ${hrefs.length} ADMIN_NAV href(s) in ${relative(
    REPO_ROOT,
    RBAC_ABS,
  )} omit the \`/admin\` prefix (Req 4.9).`,
)
process.exit(0)
