import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SHA256 = /^[a-f0-9]{64}$/
const BACKUP_KEY = /^weekly\/rgss_full_\d{8}T\d{6}Z_\d+-\d+\.dump$/
const BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/
const FILE_NAME = /^[a-z0-9][a-z0-9_-]{0,79}\.object$/

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

async function hashFile(path) {
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
    size += chunk.length
  }
  return { size, sha256: hash.digest('hex') }
}

export async function verifyRecoveredAssets(manifestPath, inventoryPath, recoveredDirectory) {
  const manifestBytes = await readFile(manifestPath)
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  if (
    manifest?.version !== 1 ||
    !BACKUP_KEY.test(manifest.key) ||
    !SHA256.test(manifest.dumpSha256)
  ) {
    throw new Error('Expected a named full backup manifest')
  }
  const inventoryBytes = await readFile(inventoryPath)
  const inventory = JSON.parse(inventoryBytes.toString('utf8'))
  const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex')
  if (
    inventory?.version !== 1 ||
    inventory.manifestSha256 !== manifestSha256 ||
    !hasText(inventory.reviewReference) ||
    !Array.isArray(inventory.objects)
  ) {
    throw new Error('Expected a reviewed asset inventory for this exact backup manifest')
  }
  const references = manifest.facts?.objectReferences
  if (!references || typeof references !== 'object' || Array.isArray(references)) {
    throw new Error('The selected backup manifest must include its database reference facts')
  }
  const referenceCounts = Object.values(references).map((entry) => entry?.count)
  if (referenceCounts.some((count) => typeof count !== 'string' || !/^\d+$/.test(count))) {
    throw new Error('The selected backup manifest has invalid database reference counts')
  }
  const requiresObjects = referenceCounts.some((count) => BigInt(count) > 0n)
  if (requiresObjects && inventory.objects.length === 0) {
    throw new Error('The database backup has object references but the asset inventory is empty')
  }

  const files = new Set()
  const sourceObjects = new Set()
  for (const [index, object] of inventory.objects.entries()) {
    if (
      !object ||
      typeof object.bucket !== 'string' ||
      !BUCKET.test(object.bucket) ||
      !hasText(object.key) ||
      !hasText(object.recoveryReference) ||
      typeof object.file !== 'string' ||
      !FILE_NAME.test(object.file) ||
      !Number.isSafeInteger(object.size) ||
      object.size < 0 ||
      typeof object.sha256 !== 'string' ||
      !SHA256.test(object.sha256)
    ) {
      throw new Error(`Invalid asset inventory entry ${index + 1}`)
    }
    const source = JSON.stringify([object.bucket, object.key])
    if (files.has(object.file) || sourceObjects.has(source)) {
      throw new Error(`Duplicate file or source object at inventory entry ${index + 1}`)
    }
    files.add(object.file)
    sourceObjects.add(source)
  }

  if (!(await lstat(recoveredDirectory)).isDirectory()) {
    throw new Error('Recovered assets must be in an ordinary directory')
  }
  const recovered = await readdir(recoveredDirectory, { withFileTypes: true })
  if (
    recovered.length !== files.size ||
    recovered.some((entry) => !entry.isFile() || !files.has(entry.name))
  ) {
    throw new Error('The recovered directory must contain exactly the listed regular files')
  }

  let bytesVerified = 0n
  for (const [index, object] of inventory.objects.entries()) {
    const result = await hashFile(join(recoveredDirectory, object.file))
    if (result.size !== object.size || result.sha256 !== object.sha256) {
      throw new Error(`Recovered bytes differ at inventory entry ${index + 1}`)
    }
    bytesVerified += BigInt(result.size)
  }
  return {
    manifestSha256,
    inventorySha256: createHash('sha256').update(inventoryBytes).digest('hex'),
    objectsVerified: files.size,
    bytesVerified: bytesVerified.toString(),
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 3) {
      throw new Error(
        'Usage: verify-recovered-assets.mjs <manifest> <inventory> <recovered-directory>',
      )
    }
    console.log(JSON.stringify(await verifyRecoveredAssets(...args)))
  } catch (error) {
    // IO and JSON errors can contain private object names or document contents.
    const message =
      error?.code || error instanceof SyntaxError ? 'Could not read recovery inputs' : error.message
    console.error(message)
    process.exitCode = 1
  }
}
