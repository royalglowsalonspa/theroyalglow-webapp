/************************************************************
 * Schema Drift Remediation — DB-free canonical fingerprint reference test.
 *
 * The CI drift gate runs WITHOUT a live Neon database, so the canonical
 * fingerprint cannot be derived by applying the schema to an empty DB at test
 * time (that path lives in `canonical.ts` and needs a fork). Instead, this test
 * re-derives the fingerprint from the COMMITTED drizzle snapshot
 * (`migrations/meta/0000_snapshot.json`) and asserts its hash equals the
 * committed reference artifact (`canonical-fingerprint.reference.json`).
 *
 * It FAILS when the schema/snapshot changes without regenerating the reference
 * — which only happens via `drizzle-kit generate` + `bun run drift:reference`.
 * That gives a deterministic, database-free drift gate: the reference moves iff
 * the committed schema moves.
 *
 * _Requirements: 12.4, 12.5_
 ************************************************************/

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { deriveSnapshotFingerprint } from '../snapshot-fingerprint'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

const REFERENCE_PATH = resolve(MODULE_DIR, '../canonical-fingerprint.reference.json')

type ReferenceArtifact = {
  version: number
  hash: string
}

function readReference(): ReferenceArtifact {
  return JSON.parse(readFileSync(REFERENCE_PATH, 'utf8')) as ReferenceArtifact
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
