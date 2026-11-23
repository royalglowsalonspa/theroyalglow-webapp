import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyRecoveredAssets } from './verify-recovered-assets.mjs'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function withAssets(run) {
  const root = await mkdtemp(join(tmpdir(), 'rgss-assets-unit-'))
  try {
    const manifestPath = join(root, 'manifest.json')
    const inventoryPath = join(root, 'inventory.json')
    const recovered = join(root, 'recovered')
    const manifest = JSON.stringify({
      version: 1,
      key: 'weekly/rgss_full_20261123T000000Z_123-1.dump',
      dumpSha256: '1'.repeat(64),
      facts: { objectReferences: { 'public.invoice.pdf_url': { count: '1' } } },
    })
    const bytes = Buffer.from('%PDF-synthetic')
    const object = {
      bucket: 'fixture-invoices',
      key: 'invoices/2026/fixture.pdf',
      recoveryReference: 'fixture archive',
      file: 'invoice.object',
      size: bytes.length,
      sha256: sha256(bytes),
    }
    const inventory = {
      version: 1,
      manifestSha256: sha256(manifest),
      reviewReference: 'fixture review',
      objects: [object],
    }
    await mkdir(recovered)
    await writeFile(manifestPath, manifest)
    await writeFile(join(recovered, object.file), bytes)
    await run({
      inventory,
      object,
      recovered,
      verify: async (value = inventory) => {
        await writeFile(inventoryPath, JSON.stringify(value))
        return verifyRecoveredAssets(manifestPath, inventoryPath, recovered)
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('verifies bytes against an inventory bound to the selected backup manifest', async () => {
  await withAssets(async ({ verify, inventory, object }) => {
    expect(await verify()).toEqual({
      manifestSha256: inventory.manifestSha256,
      inventorySha256: sha256(JSON.stringify(inventory)),
      objectsVerified: 1,
      bytesVerified: String(object.size),
    })
  })
})

test('refuses a different manifest and an empty inventory for referenced objects', async () => {
  await withAssets(async ({ verify, inventory }) => {
    await expect(verify({ ...inventory, manifestSha256: 'b'.repeat(64) })).rejects.toThrow(
      /exact backup manifest/,
    )
    await expect(verify({ ...inventory, objects: [] })).rejects.toThrow(/inventory is empty/)
  })
})

test('rejects duplicate source objects and paths outside the recovered directory', async () => {
  await withAssets(async ({ verify, inventory, object }) => {
    await expect(
      verify({ ...inventory, objects: [object, { ...object, file: 'copy.object' }] }),
    ).rejects.toThrow(/Duplicate file or source object/)
    await expect(
      verify({ ...inventory, objects: [{ ...object, file: '../invoice.object' }] }),
    ).rejects.toThrow(/Invalid asset inventory entry/)
  })
})

test('rejects extra files, missing files and same-length corrupt recovered bytes', async () => {
  await withAssets(async ({ verify, recovered, object }) => {
    const extra = join(recovered, 'unexpected.object')
    await writeFile(extra, 'unexpected')
    await expect(verify()).rejects.toThrow(/exactly the listed regular files/)
    await rm(extra)

    const invoice = join(recovered, object.file)
    await writeFile(invoice, Buffer.alloc(object.size))
    await expect(verify()).rejects.toThrow(/Recovered bytes differ/)
    await rm(invoice)
    await expect(verify()).rejects.toThrow(/exactly the listed regular files/)
  })
})
