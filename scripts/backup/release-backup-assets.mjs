import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import {
  hashFile,
  verifyRecoveredAssets,
  verifyReferenceExport,
} from './verify-recovered-assets.mjs'

const MEDIA_BUCKET = 'rgss-uploads'
const MEDIA_ORIGIN = 'https://media.theroyalglow.in'
const CMS_ORIGIN = 'https://cms.theroyalglow.in'
const CMS_FILE_ROUTE = '/api/media/file/'
const ASSET_INDEX_NAME = 'inventory.json'
const RELEASE_DUMP = /^release\/rgss_full_\d{8}T\d{6}Z_\d+-\d+\.dump$/
const GIT_SHA = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const CMS_REFERENCE = /^cms\.media\.(?:sizes_(?:thumbnail|card|hero)_)?(url|filename)$/
const CMS_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const HASH = (bytes) => createHash('sha256').update(bytes).digest('hex')

function assetPrefix(manifest) {
  if (
    manifest?.version !== 1 ||
    !RELEASE_DUMP.test(manifest.key) ||
    !GIT_SHA.test(manifest.releaseCandidateCommit) ||
    !SHA256.test(manifest.dumpSha256)
  ) {
    throw new Error('Asset recovery requires an exact candidate-bound release manifest.')
  }
  return `${manifest.key.slice(0, -'.dump'.length)}.assets/`
}

function validateSegment(segment) {
  if (
    segment.length === 0 ||
    segment === '.' ||
    segment === '..' ||
    segment.includes('/') ||
    segment.includes('\\') ||
    [...segment].some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
  ) {
    throw new Error('A CMS media reference has an invalid object-key segment.')
  }
  return segment
}

function mediaUrlSegments(value) {
  const relative = value.startsWith('/')
  const source = URL.parse(value, MEDIA_ORIGIN)
  if (!source || (source.origin !== MEDIA_ORIGIN && source.origin !== CMS_ORIGIN)) {
    throw new Error('A CMS media reference uses an unsupported storage URL.')
  }
  // Require the original spelling so URL parsing cannot silently resolve dot
  // segments, credentials, a protocol-relative host, or an empty fragment.
  const canonical = `${relative ? '' : source.origin}${source.pathname}${source.search}`
  if (canonical !== value) {
    throw new Error('A CMS media reference must use a canonical storage URL.')
  }
  if (source.origin === MEDIA_ORIGIN && source.pathname.startsWith('/cms/')) {
    if (source.search) {
      throw new Error('A public CMS media reference has an unexpected query.')
    }
    return source.pathname.slice(1).split('/').map(decodeURIComponent).map(validateSegment)
  }
  if ((!relative && source.origin !== CMS_ORIGIN) || !source.pathname.startsWith(CMS_FILE_ROUTE)) {
    throw new Error('A CMS media reference uses an unsupported storage URL.')
  }
  const encodedName = source.pathname.slice(CMS_FILE_ROUTE.length)
  const search = source.searchParams
  const prefix = search.get('prefix') ?? 'cms'
  if (search.size > Number(search.has('prefix')) || !/^cms(?:\/|$)/.test(prefix)) {
    throw new Error('A CMS media file route has an unsupported storage prefix.')
  }
  return [
    ...prefix.split('/').map(validateSegment),
    validateSegment(decodeURIComponent(encodedName)),
  ]
}

function planObjects(manifest, referenceExport) {
  const prefix = assetPrefix(manifest)
  verifyReferenceExport(manifest.facts?.objectReferences, referenceExport)

  const mediaById = new Map()
  for (const { kind, position, pair } of referenceExport) {
    if (kind === 'public.invoice.pdf_url') {
      throw new Error(
        'This release contains private invoice PDF references that require scoped recovery access.',
      )
    }
    const match = CMS_REFERENCE.exec(kind)
    if (!match) {
      throw new Error('This release contains an unsupported backup object-reference kind.')
    }
    const [id, value] = JSON.parse(pair)
    const media = mediaById.get(id) ?? new Map()
    media.set(kind, {
      reference: { kind, position },
      segments: match[1] === 'url' ? mediaUrlSegments(value) : null,
      filename: match[1] === 'filename' ? validateSegment(value) : null,
    })
    mediaById.set(id, media)
  }

  const objects = new Map()
  for (const media of mediaById.values()) {
    const mediaPrefixes = new Set(
      [...media.values()].flatMap(({ segments }) =>
        segments ? [segments.slice(0, -1).join('/')] : [],
      ),
    )
    for (const { reference, segments, filename } of media.values()) {
      let objectKey = segments?.join('/')
      if (filename) {
        const pairedUrl = media.get(reference.kind.replace(/filename$/, 'url'))?.segments
        if (pairedUrl && pairedUrl.at(-1) !== filename) {
          throw new Error('A CMS media URL and its filename refer to different objects.')
        }
        if (!pairedUrl && mediaPrefixes.size > 1) {
          throw new Error('A CMS media filename has multiple possible storage prefixes.')
        }
        objectKey =
          pairedUrl?.join('/') ?? `${mediaPrefixes.values().next().value ?? 'cms'}/${filename}`
      }
      const object = objects.get(objectKey)
      if (object) {
        object.references.push(reference)
      } else {
        const file = `media-${objects.size + 1}.object`
        objects.set(objectKey, {
          bucket: MEDIA_BUCKET,
          key: objectKey,
          recoveryReference: prefix + file,
          file,
          references: [reference],
        })
      }
    }
  }
  return [...objects.values()]
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function downloadMedia(object, destination) {
  const url = `${MEDIA_ORIGIN}/${object.key.split('/').map(encodeURIComponent).join('/')}`
  // Only fetch public image bytes from the configured R2 hostname. Disable
  // redirects and content transformations before computing the recovery hash.
  const response = await fetch(url, {
    redirect: 'error',
    headers: { 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache, no-transform' },
    signal: AbortSignal.timeout(45_000),
  })
  const contentEncoding = response.headers.get('content-encoding')
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (
    response.status !== 200 ||
    !response.body ||
    (contentEncoding && contentEncoding !== 'identity') ||
    !CMS_IMAGE_TYPES.has(contentType)
  ) {
    await response.body?.cancel()
    throw new Error(
      'A referenced CMS image could not be retrieved from the approved public media origin.',
    )
  }
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
  )
  return contentType
}

async function visitObjects(objects, visit) {
  const results = []
  for (let index = 0; index < objects.length; index += 6) {
    const batch = await Promise.allSettled(objects.slice(index, index + 6).map(visit))
    for (const result of batch) {
      if (result.status === 'rejected') throw result.reason
      results.push(result.value)
    }
  }
  return results
}

async function createBundle(directory) {
  await mkdir(directory, { mode: 0o700 })
  const objectsDirectory = join(directory, 'objects')
  await mkdir(objectsDirectory, { mode: 0o700 })
  return { objectsDirectory, inventoryPath: join(directory, ASSET_INDEX_NAME) }
}

export async function captureReleaseAssets(
  manifestPath,
  exportPath,
  directory,
  fetchMedia = downloadMedia,
) {
  const manifest = await readJson(manifestPath)
  if (Object.hasOwn(manifest, 'assetRecovery')) {
    throw new Error('The release manifest already declares an asset inventory.')
  }
  const objects = planObjects(manifest, await readJson(exportPath))
  const { objectsDirectory, inventoryPath } = await createBundle(directory)
  const index = {
    version: 2,
    reviewReference: `Automated full reference capture for release ${manifest.releaseCandidateCommit}`,
    objects: await visitObjects(objects, async (object) => {
      const path = join(objectsDirectory, object.file)
      const contentType = await fetchMedia(object, path)
      if (!CMS_IMAGE_TYPES.has(contentType)) {
        throw new Error('A captured CMS image has an unsupported content type.')
      }
      return { ...object, contentType, ...(await hashFile(path)) }
    }),
    excludedReferences: [],
  }
  // The manifest binds the inventory payload. The inventory binds the exact
  // manifest bytes without creating a circular checksum.
  const manifestBytes = JSON.stringify({
    ...manifest,
    assetRecovery: { version: 1, indexSha256: HASH(JSON.stringify(index)) },
  })
  await writeFile(manifestPath, manifestBytes, { mode: 0o600 })
  await writeFile(
    inventoryPath,
    JSON.stringify({ manifestSha256: HASH(manifestBytes), ...index }),
    {
      flag: 'wx',
      mode: 0o600,
    },
  )
  return verifyRecoveredAssets(manifestPath, inventoryPath, objectsDirectory, exportPath)
}

async function inventoryFor(manifestPath, inventoryPath, exportPath) {
  const manifestBytes = await readFile(manifestPath)
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  const plan = planObjects(manifest, await readJson(exportPath))
  const { manifestSha256, ...index } = await readJson(inventoryPath)
  if (
    manifest.assetRecovery?.version !== 1 ||
    manifestSha256 !== HASH(manifestBytes) ||
    manifest.assetRecovery.indexSha256 !== HASH(JSON.stringify(index)) ||
    index.version !== 2 ||
    !Array.isArray(index.excludedReferences) ||
    index.excludedReferences.length !== 0 ||
    !Array.isArray(index.objects) ||
    index.objects.length !== plan.length
  ) {
    throw new Error('The asset inventory does not match the exact release manifest.')
  }
  for (const [position, expected] of plan.entries()) {
    const captured = index.objects[position]
    if (
      captured?.bucket !== expected.bucket ||
      captured.key !== expected.key ||
      captured.file !== expected.file ||
      captured.recoveryReference !== expected.recoveryReference ||
      !CMS_IMAGE_TYPES.has(captured.contentType) ||
      JSON.stringify(captured.references) !== JSON.stringify(expected.references)
    ) {
      throw new Error('The asset inventory maps a restored CMS reference to a different object.')
    }
  }
  return plan
}

function backupTransport() {
  const { R2_BACKUP_BUCKET: bucket, R2_BACKUP_ENDPOINT: endpoint } = process.env
  if (
    bucket !== 'rgss-backups' ||
    !/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint ?? '')
  ) {
    throw new Error('Use the verified private R2 backup bucket endpoint for release assets.')
  }
  const copy = (source, destination) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        'aws',
        [
          's3',
          'cp',
          source,
          destination,
          '--endpoint-url',
          endpoint,
          '--only-show-errors',
          '--no-progress',
        ],
        { stdio: 'ignore', windowsHide: true },
      )
      child.once('error', reject)
      child.once('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error('The private R2 release asset transfer failed.'))
      })
    })
  return {
    upload: (key, source) => copy(source, `s3://${bucket}/${key}`),
    download: (key, destination) => copy(`s3://${bucket}/${key}`, destination),
  }
}

export async function restoreReleaseAssets(
  manifestPath,
  exportPath,
  directory,
  transport = backupTransport(),
) {
  const manifest = await readJson(manifestPath)
  const key = assetPrefix(manifest) + ASSET_INDEX_NAME
  const { objectsDirectory, inventoryPath } = await createBundle(directory)
  await transport.download(key, inventoryPath)
  const plan = await inventoryFor(manifestPath, inventoryPath, exportPath)
  await visitObjects(plan, ({ recoveryReference, file }) =>
    transport.download(recoveryReference, join(objectsDirectory, file)),
  )
  return verifyRecoveredAssets(manifestPath, inventoryPath, objectsDirectory, exportPath)
}

export async function publishReleaseAssets(
  manifestPath,
  exportPath,
  directory,
  transport = backupTransport(),
) {
  const manifest = await readJson(manifestPath)
  const inventoryPath = join(directory, ASSET_INDEX_NAME)
  const objectsDirectory = join(directory, 'objects')
  const plan = await inventoryFor(manifestPath, inventoryPath, exportPath)
  await verifyRecoveredAssets(manifestPath, inventoryPath, objectsDirectory, exportPath)
  await visitObjects(plan, ({ recoveryReference, file }) =>
    transport.upload(recoveryReference, join(objectsDirectory, file)),
  )
  await transport.upload(assetPrefix(manifest) + ASSET_INDEX_NAME, inventoryPath)
  const scratch = await mkdtemp(join(dirname(directory), 'asset-upload-check-'))
  try {
    return await restoreReleaseAssets(manifestPath, exportPath, join(scratch, 'assets'), transport)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [operation, ...args] = process.argv.slice(2)
    const operations = {
      capture: captureReleaseAssets,
      publish: publishReleaseAssets,
      restore: restoreReleaseAssets,
    }
    if (!Object.hasOwn(operations, operation) || args.length !== 3) {
      throw new Error(
        'Usage: release-backup-assets.mjs <capture|publish|restore> <manifest> <reference-export> <bundle-directory>',
      )
    }
    console.log(JSON.stringify(await operations[operation](...args)))
  } catch (error) {
    // IO, URL, parser, and transport errors can include object names or contents.
    const detail = error?.constructor === Error && !error.code && !error.cause
    console.error(detail ? error.message : 'Could not transfer or verify release assets.')
    process.exitCode = 1
  }
}
