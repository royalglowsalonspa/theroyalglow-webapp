/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/regenerate-reference
 * Scope        : Schema Drift Remediation — DB-free drift gate maintenance
 *
 * Description  : Regenerates the committed canonical fingerprint reference
 *                artifact (`canonical-fingerprint.reference.json`) from the
 *                committed drizzle snapshot. Run this AFTER an intentional
 *                schema change has been captured by `drizzle-kit generate`
 *                (which rewrites `migrations/meta/0000_snapshot.json`), then
 *                commit the regenerated reference alongside the migration.
 *
 *                Run: `bun run scripts/drift/regenerate-reference.ts`
 *                or via the package script: `bun run drift:reference`.
 *
 * Tech Stack   : TypeScript (strict), Bun, Node fs
 * Layer        : Data Access (control plane / tooling, DB-free)
 *
 * Dependencies : ./snapshot-fingerprint
 *
 * Notes        : Performs NO database or network I/O. Reads the committed
 *                snapshot and writes the committed reference JSON only.
 *
 * _Requirements: 12.4, 12.5_
 ************************************************************/

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveSnapshotFingerprint } from './snapshot-fingerprint'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/** Committed reference artifact consumed by the CI drift gate test. */
export const REFERENCE_PATH = resolve(MODULE_DIR, 'canonical-fingerprint.reference.json')

const COMMENT =
  'AUTHORITATIVE DB-free canonical reference derived from the committed drizzle ' +
  'snapshot (migrations/meta/0000_snapshot.json). Regenerate with ' +
  '`bun run drift:reference` after an intentional schema change captured by ' +
  '`drizzle-kit generate`, then commit this file with the migration.'

function regenerate(): void {
  const { fingerprint, hash } = deriveSnapshotFingerprint()

  const artifact = {
    _comment: COMMENT,
    version: fingerprint.version,
    hash,
    fingerprint,
  }

  // Trailing newline keeps the file POSIX-clean and diff-friendly.
  writeFileSync(REFERENCE_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  console.log(`Wrote canonical fingerprint reference: ${hash}`)
}

regenerate()
