import { expect, test } from 'bun:test'
import { parseAllowlist, verifyBackupReference } from './preview-cleanup.mjs'

const dumpSha256 = 'a'.repeat(64)
const allowlist = {
  version: 1,
  reviewReference: 'fixture review',
  dumpSha256,
  rows: [
    {
      table: 'public.offer_service',
      key: { offer_id: 'fixture-offer', service_id: 'fixture-service' },
      evidenceReference: 'fixture evidence',
    },
  ],
}

test.each(['weekly', 'release'])('requires a matching selected %s backup manifest', (purpose) => {
  const selected = parseAllowlist(JSON.stringify(allowlist))
  const key = `${purpose}/rgss_full_20261122T160000Z_123-1.dump`
  expect(verifyBackupReference(selected, { version: 1, dumpSha256, key })).toBe(key)
  expect(() => verifyBackupReference(selected, { version: 1, dumpSha256, key: 'latest' })).toThrow()
  expect(() =>
    verifyBackupReference(selected, { version: 1, dumpSha256: 'b'.repeat(64), key }),
  ).toThrow()
})

test('disallows duplicate composite keys regardless of key order', () => {
  const first = allowlist.rows[0]
  const other = { ...first, key: { service_id: 'fixture-service', offer_id: 'fixture-offer' } }
  expect(() => parseAllowlist(JSON.stringify({ ...allowlist, rows: [first, other] }))).toThrow(
    /duplicate row/,
  )
})

test('keeps customer accounts outside the cleanup allowlist', () => {
  const row = { ...allowlist.rows[0], table: 'public.user', key: { id: 'fixture-person' } }
  expect(() => parseAllowlist(JSON.stringify({ ...allowlist, rows: [row] }))).toThrow(
    /eligible table/,
  )
})
