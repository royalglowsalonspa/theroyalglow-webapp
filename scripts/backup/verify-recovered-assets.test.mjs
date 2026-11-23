import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyRecoveredAssets } from './verify-recovered-assets.mjs'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function withAssets(run, purpose = 'weekly') {
  const root = await mkdtemp(join(tmpdir(), 'rgss-assets-unit-'))
  try {
    const manifestPath = join(root, 'manifest.json')
    const inventoryPath = join(root, 'inventory.json')
    const referenceExportPath = join(root, 'reference-export.json')
    const recovered = join(root, 'recovered')
    const pdfReference = { kind: 'public.invoice.pdf_url', position: 1 }
    const filenameReference = { kind: 'cms.media.filename', position: 1 }
    const urlReference = { kind: 'cms.media.url', position: 1 }
    const referenceExport = [
      { ...pdfReference, pair: '["invoice-1", "/api/billing/invoice-1/pdf"]' },
      { ...filenameReference, pair: '[1, "hero.jpg"]' },
      { ...urlReference, pair: '[1, "https://media.example/cms/hero.jpg"]' },
    ]
    const manifest = JSON.stringify({
      version: 1,
      key: `${purpose}/rgss_full_20261123T000000Z_123-1.dump`,
      dumpSha256: '1'.repeat(64),
      facts: {
        objectReferences: Object.fromEntries(
          referenceExport.map(({ kind, pair }) => [
            kind,
            { count: '1', sha256: sha256(`[${pair}]`) },
          ]),
        ),
      },
    })
    const bytes = Buffer.from('%PDF-synthetic')
    const object = {
      bucket: 'fixture-invoices',
      key: 'invoices/2026/fixture.pdf',
      recoveryReference: 'fixture archive',
      file: 'invoice.object',
      size: bytes.length,
      sha256: sha256(bytes),
      references: [pdfReference],
    }
    const media = {
      bucket: 'fixture-media',
      key: 'cms/hero.jpg',
      recoveryReference: 'fixture archive',
      file: 'hero.object',
      size: 4,
      sha256: sha256('hero'),
      references: [filenameReference, urlReference],
    }
    const inventory = {
      version: 2,
      manifestSha256: sha256(manifest),
      reviewReference: 'fixture review',
      objects: [object, media],
      excludedReferences: [],
    }
    await mkdir(recovered)
    await writeFile(manifestPath, manifest)
    await writeFile(join(recovered, object.file), bytes)
    await writeFile(join(recovered, media.file), 'hero')
    await run({
      inventory,
      object,
      media,
      recovered,
      referenceExport,
      verify: async (value = inventory, exportedRows = referenceExport) => {
        await writeFile(inventoryPath, JSON.stringify(value))
        await writeFile(referenceExportPath, JSON.stringify(exportedRows))
        return verifyRecoveredAssets(manifestPath, inventoryPath, recovered, referenceExportPath)
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test.each(['weekly', 'release'])(
  'verifies exact files and accounts for both media aliases in a %s backup',
  async (purpose) => {
    await withAssets(async ({ verify, inventory, object, media }) => {
      expect(await verify()).toEqual({
        manifestSha256: inventory.manifestSha256,
        inventorySha256: sha256(JSON.stringify(inventory)),
        objectsVerified: 2,
        bytesVerified: String(object.size + media.size),
        referencesVerified: 3,
        referencesExcluded: 0,
      })
    }, purpose)
  },
)

test('refuses a different manifest and an inventory missing referenced objects', async () => {
  await withAssets(async ({ verify, inventory, object }) => {
    await expect(verify({ ...inventory, manifestSha256: 'b'.repeat(64) })).rejects.toThrow(
      /exact backup manifest/,
    )
    await expect(verify({ ...inventory, objects: [object] })).rejects.toThrow(
      /2 database references unaccounted for/,
    )
  })
})

test('rejects changed or truncated database reference exports', async () => {
  await withAssets(async ({ verify, inventory, referenceExport }) => {
    const [invoice, ...media] = referenceExport
    await expect(
      verify(inventory, [{ ...invoice, pair: '[1, "other"]' }, ...media]),
    ).rejects.toThrow(/differs from the selected backup manifest/)
    await expect(verify(inventory, media)).rejects.toThrow(
      /differs from the selected backup manifest/,
    )
  })
})

test('reports reviewed exclusions and refuses duplicate or unexplained assignments', async () => {
  await withAssets(async ({ verify, inventory, object, media, recovered }) => {
    await rm(join(recovered, media.file))
    const excludedReferences = media.references.map((reference) => ({
      ...reference,
      reason: 'Fixture media exclusion approved for this run',
    }))
    await expect(verify({ ...inventory, excludedReferences })).rejects.toThrow(
      /unknown or duplicate database reference/,
    )
    await expect(
      verify({ ...inventory, objects: [object], excludedReferences: media.references }),
    ).rejects.toThrow(/requires a reviewed reason/)
    expect(await verify({ ...inventory, objects: [object], excludedReferences })).toMatchObject({
      objectsVerified: 1,
      referencesVerified: 1,
      referencesExcluded: 2,
    })
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
