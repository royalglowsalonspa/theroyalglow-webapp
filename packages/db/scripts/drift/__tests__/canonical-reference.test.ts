/************************************************************
 * Schema Drift Remediation — DB-free canonical fingerprint reference test.
 *
 * The CI drift gate runs WITHOUT a live Neon database, so the canonical
 * fingerprint cannot be derived by applying the schema to an empty DB at test
 * time (that path lives in `canonical.ts` and needs a fork). Instead, this test
 * re-derives the fingerprint from the LATEST COMMITTED drizzle snapshot
 * (`migrations/meta/<NNNN>_snapshot.json`, resolved from the migration journal)
 * and asserts its hash equals the committed reference artifact
 * (`canonical-fingerprint.reference.json`).
 *
 * It FAILS when the schema/snapshot changes without regenerating the reference
 * — which only happens via `drizzle-kit generate` + `bun run drift:reference`.
 * That gives a deterministic, database-free drift gate: the reference moves iff
 * the committed schema moves.
 *
 * _Requirements: 12.4, 12.5_
 ************************************************************/

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  deriveSnapshotFingerprint,
  JOURNAL_PATH,
  resolveLatestSnapshotPath,
} from '../snapshot-fingerprint'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

const REFERENCE_PATH = resolve(MODULE_DIR, '../canonical-fingerprint.reference.json')

type ReferenceArtifact = {
  version: number
  hash: string
}

function readReference(): ReferenceArtifact {
  return JSON.parse(readFileSync(REFERENCE_PATH, 'utf8')) as ReferenceArtifact
}

function readJournalMaxIdx(): number {
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as {
    entries: { idx: number }[]
  }
  return Math.max(...journal.entries.map((entry) => entry.idx))
}

describe('canonical fingerprint reference (DB-free drift gate)', () => {
  it('matches the committed reference hash derived from the drizzle snapshot', () => {
    const reference = readReference()
    const { hash } = deriveSnapshotFingerprint()

    // The core drift gate: a schema change that rewrote the committed snapshot
    // without regenerating the reference (via `bun run drift:reference`) flips
    // this hash and fails the build.
    expect(hash).toBe(reference.hash)
  })

  it('reference records the current fingerprint format version', () => {
    const reference = readReference()
    const { fingerprint } = deriveSnapshotFingerprint()

    expect(reference.version).toBe(fingerprint.version)
  })

  it('re-derivation from the snapshot is deterministic', () => {
    const first = deriveSnapshotFingerprint()
    const second = deriveSnapshotFingerprint()

    expect(second.hash).toBe(first.hash)
  })
})

/**
 * Guards the snapshot-selection rule itself.
 *
 * `drizzle-kit generate` writes a NEW `<NNNN>_snapshot.json` per migration and
 * never rewrites earlier ones. If the fingerprint source were pinned to
 * `0000_snapshot.json`, the drift gate would keep re-deriving the BASELINE
 * schema forever — passing happily while the real schema moved. These tests
 * fail if that pinning is ever reintroduced.
 */
describe('latest-snapshot resolution (drift gate source selection)', () => {
  it('resolves to a snapshot file that exists on disk', () => {
    const snapshotPath = resolveLatestSnapshotPath()

    expect(existsSync(snapshotPath)).toBe(true)
  })

  it('resolves the snapshot matching the journal’s highest migration index', () => {
    const expectedIdx = readJournalMaxIdx()
    const expectedFile = `${String(expectedIdx).padStart(4, '0')}_snapshot.json`

    expect(basename(resolveLatestSnapshotPath())).toBe(expectedFile)
  })

  it('tracks the newest migration rather than being pinned to the baseline', () => {
    // Passes trivially while `0000` is the only migration; becomes a REAL
    // assertion the moment a second migration lands, which is exactly when the
    // old hardcoded `0000_snapshot.json` would have started lying.
    const maxIdx = readJournalMaxIdx()

    if (maxIdx > 0) {
      expect(basename(resolveLatestSnapshotPath())).not.toBe('0000_snapshot.json')
    }

    expect(basename(resolveLatestSnapshotPath())).toBe(
      `${String(maxIdx).padStart(4, '0')}_snapshot.json`,
    )
  })

  it('derives the same fingerprint whether the path is explicit or resolved', () => {
    const resolved = deriveSnapshotFingerprint()
    const explicit = deriveSnapshotFingerprint(resolveLatestSnapshotPath())

    expect(explicit.hash).toBe(resolved.hash)
  })
})
