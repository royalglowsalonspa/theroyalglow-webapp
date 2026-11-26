import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  captureReleaseAssets,
  publishReleaseAssets,
  restoreReleaseAssets,
} from './release-backup-assets.mjs'

const prefix = 'release/rgss_full_20261126T092000Z_123-1'
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function withFixture(run, references = {}, key = `${prefix}.dump`) {
  const root = await mkdtemp(join(tmpdir(), 'rgss-release-media-'))
  try {
    const manifest = join(root, 'manifest.json')
    const exported = join(root, 'references.json')
    const captured = join(root, 'captured')
    const manifestBytes = JSON.stringify({
      version: 1,
      key,
      releaseCandidateCommit: 'a'.repeat(40),
      dumpSha256: 'b'.repeat(64),
      facts: {
        objectReferences: Object.fromEntries(
          Object.entries(references).map(([kind, pairs]) => [
            kind,
            { count: String(pairs.length), sha256: sha256(`[${pairs.join(', ')}]`) },
          ]),
        ),
      },
    })
    await writeFile(manifest, manifestBytes)
    await writeFile(
      exported,
      JSON.stringify(
        Object.entries(references).flatMap(([kind, pairs]) =>
          pairs.map((pair, index) => ({ kind, position: index + 1, pair })),
        ),
      ),
    )
    const remote = new Map()
    const transport = {
      async upload(name, source) {
        remote.set(name, await readFile(source))
      },
      async download(name, destination) {
        if (!remote.has(name)) throw new Error('Missing recovery fixture object')
        await writeFile(destination, remote.get(name), { flag: 'wx' })
      },
    }
    await run({ root, manifest, exported, captured, remote, transport })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const mediaReferences = {
  'cms.media.filename': ['[1, "hero photo.jpg"]'],
  'cms.media.sizes_card_filename': ['[1, "hero-800.jpg"]'],
  'cms.media.sizes_card_url': ['[1, "https://media.theroyalglow.in/cms/hero-800.jpg"]'],
  'cms.media.url': ['[1, "/api/media/file/hero%20photo.jpg"]'],
  'public.invoice.pdf_url': [],
}

test('round-trips the exact release inventory and resolves original and derivative aliases', async () => {
  await withFixture(async ({ root, manifest, exported, captured, remote, transport }) => {
    const expected = { objectsVerified: 2, referencesVerified: 4, referencesExcluded: 0 }
    const downloaded = []
    const capture = await captureReleaseAssets(
      manifest,
      exported,
      captured,
      async (asset, path) => {
        downloaded.push(asset.key)
        await writeFile(path, `fixture bytes for ${asset.key}`)
        return 'image/jpeg'
      },
    )
    expect(capture).toMatchObject(expected)
    expect(downloaded.sort()).toEqual(['cms/hero photo.jpg', 'cms/hero-800.jpg'])
    expect(await publishReleaseAssets(manifest, exported, captured, transport)).toEqual(capture)
    expect([...remote.keys()].sort()).toEqual([
      `${prefix}.assets/inventory.json`,
      `${prefix}.assets/media-1.object`,
      `${prefix}.assets/media-2.object`,
    ])
    const inventory = JSON.parse(remote.get(`${prefix}.assets/inventory.json`).toString())
    expect(inventory.objects.map((object) => object.contentType)).toEqual([
      'image/jpeg',
      'image/jpeg',
    ])
    expect(
      await restoreReleaseAssets(manifest, exported, join(root, 'restored'), transport),
    ).toEqual(capture)
  }, mediaReferences)
})

test('rejects altered inventory mappings, changed bytes and missing private copies', async () => {
  await withFixture(async ({ root, manifest, exported, captured, remote, transport }) => {
    await captureReleaseAssets(manifest, exported, captured, async (_asset, path) => {
      await writeFile(path, 'fixture')
      return 'image/jpeg'
    })
    await publishReleaseAssets(manifest, exported, captured, transport)
    const inventoryKey = `${prefix}.assets/inventory.json`
    const original = remote.get(inventoryKey)
    const inventory = JSON.parse(original.toString())
    inventory.objects[0].key = 'cms/some-other.jpg'
    remote.set(inventoryKey, JSON.stringify(inventory))
    await expect(
      restoreReleaseAssets(manifest, exported, join(root, 'altered-inventory'), transport),
    ).rejects.toThrow('exact release manifest')

    remote.set(inventoryKey, original)
    const objectKey = `${prefix}.assets/media-1.object`
    remote.set(objectKey, Buffer.from('wrong!!'))
    await expect(
      restoreReleaseAssets(manifest, exported, join(root, 'altered-byte-copy'), transport),
    ).rejects.toThrow('Recovered bytes differ')

    remote.delete(objectKey)
    await expect(
      restoreReleaseAssets(manifest, exported, join(root, 'missing-copy'), transport),
    ).rejects.toThrow('Missing recovery fixture object')
  }, mediaReferences)
})

test.each([
  ['https://example.invalid/cms/photo.jpg', 'unsupported storage URL'],
  ['/cms/nested/%2e%2e/photo.jpg', 'must use a canonical storage URL'],
  ['https://cms.theroyalglow.in@other.invalid/api/media/file/photo.jpg', 'unsupported storage URL'],
  ['//media.theroyalglow.in/cms/photo.jpg', 'must use a canonical storage URL'],
  ['/api/media/file/photo.jpg?prefix=cms&prefix=other', 'unsupported storage prefix'],
  ['/api/media/file/photo.jpg?prefix=docs', 'unsupported storage prefix'],
])('refuses the unsafe media reference %s before any fetch', async (url, error) => {
  await withFixture(
    async ({ manifest, exported, captured }) => {
      await expect(
        captureReleaseAssets(manifest, exported, captured, () => {
          throw new Error('Unexpected fetch')
        }),
      ).rejects.toThrow(error)
    },
    { 'cms.media.url': [`[1, ${JSON.stringify(url)}]`] },
  )
})

test('requires an exact release and refuses any private invoice references', async () => {
  await withFixture(
    async ({ manifest, exported, captured }) => {
      await expect(captureReleaseAssets(manifest, exported, captured)).rejects.toThrow(
        'private invoice PDF references',
      )
    },
    { 'public.invoice.pdf_url': ['["invoice-fixture", "/api/billing/invoice-fixture/pdf"]'] },
  )

  await withFixture(
    async ({ manifest, exported, captured }) => {
      await expect(captureReleaseAssets(manifest, exported, captured)).rejects.toThrow(
        'candidate-bound release manifest',
      )
    },
    mediaReferences,
    `${prefix.replace('release/', 'weekly/')}.dump`,
  )
})

test('verifies a release that has no referenced asset bytes', async () => {
  await withFixture(
    async ({ root, manifest, exported, captured, transport }) => {
      const result = await captureReleaseAssets(manifest, exported, captured)
      expect(result).toMatchObject({
        objectsVerified: 0,
        bytesVerified: '0',
        referencesVerified: 0,
      })
      expect(await publishReleaseAssets(manifest, exported, captured, transport)).toEqual(result)
      expect(
        await restoreReleaseAssets(manifest, exported, join(root, 'restored'), transport),
      ).toEqual(result)
    },
    { 'public.invoice.pdf_url': [] },
  )
})
