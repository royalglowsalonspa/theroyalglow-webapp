#!/usr/bin/env node
/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : scripts/check-allowed-paths
 * Scope        : Admin Portal Redesign — path-allowlist CI gate (Req 21)
 *
 * Description  : Rejects a changeset that touches paths the presentation-only
 *                admin-portal-redesign must NOT modify: the DB schema, the
 *                committed migrations, the RBAC decision core, and the
 *                committed schema-drift fingerprint reference. Run in CI on the
 *                PR diff; exits non-zero (with the offending paths) if any
 *                forbidden path changed.
 *
 * Usage        : node apps/admin/scripts/check-allowed-paths.mjs [baseRef]
 *                (baseRef defaults to origin/prod, then HEAD~1, then a working-
 *                tree status fallback so it also runs locally pre-commit.)
 *
 * Tech Stack   : Node (ESM), git
 * Layer        : CI tooling
 *
 * Requirements : 21.1, 21.2, 21.3, 21.6, 21.7, 21.8
 ************************************************************/

import { execFileSync } from 'node:child_process'

/** Paths the redesign is forbidden from modifying (Req 21). */
const FORBIDDEN = [
  /^packages\/db\/src\/schema\//,
  /^packages\/db\/schema\//,
  /^packages\/db\/migrations\//,
  /^apps\/admin\/src\/lib\/rbac\.ts$/,
  /^packages\/db\/scripts\/drift\/canonical-fingerprint\.reference\.json$/,
]

function changedFiles() {
  const base = process.argv[2]
  const candidates = base ? [base] : ['origin/prod', 'HEAD~1']
  for (const ref of candidates) {
    try {
      const out = execFileSync('git', ['diff', '--name-only', `${ref}...HEAD`], { encoding: 'utf8' })
      const files = out.split('\n').map((s) => s.trim()).filter(Boolean)
      if (files.length > 0) {
        return files
      }
    } catch {
      // try the next candidate
    }
  }
  // Fallback: uncommitted working-tree changes (local pre-commit use).
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
  return status
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
}

const offenders = changedFiles().filter((file) => FORBIDDEN.some((re) => re.test(file)))

if (offenders.length > 0) {
  console.error('✖ Path-allowlist gate failed — these paths are off-limits for this change:')
  for (const file of offenders) {
    console.error(`  - ${file}`)
  }
  process.exit(1)
}

console.log('✔ Path-allowlist gate passed — no forbidden paths changed.')
