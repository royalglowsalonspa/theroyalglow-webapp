import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SHA256 = /^[a-f0-9]{64}$/
const BACKUP_KEY = /^(weekly|release)\/rgss_full_\d{8}T\d{6}Z_\d+-\d+\.dump$/
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

function verifyReferenceExport(referenceFacts, exportedRows) {
  if (
    !referenceFacts ||
    typeof referenceFacts !== 'object' ||
    Array.isArray(referenceFacts) ||
    !Array.isArray(exportedRows)
  ) {
    throw new Error('Expected database reference facts and a matching reference export')
  }
  const rowsByKind = new Map(Object.keys(referenceFacts).map((kind) => [kind, []]))
  const referenceIds = new Set()
  for (const row of exportedRows) {
    const rows = rowsByKind.get(row?.kind)
    if (!rows || row.position !== rows.length + 1 || typeof row.pair !== 'string') {
      throw new Error('The database reference export has an invalid row or position')
    }
    const pair = JSON.parse(row.pair)
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      (typeof pair[0] !== 'string' && !Number.isSafeInteger(pair[0])) ||
      typeof pair[1] !== 'string'
    ) {
      throw new Error('The database reference export has an invalid row or position')
    }
    rows.push(row.pair)
    referenceIds.add(JSON.stringify([row.kind, row.position]))
  }
  for (const [kind, rows] of rowsByKind) {
    const facts = referenceFacts[kind]
    // Match PostgreSQL's jsonb_agg text using the database's ordered row text.
    const digest = createHash('sha256')
      .update(`[${rows.join(', ')}]`)
      .digest('hex')
    if (facts?.count !== String(rows.length) || facts.sha256 !== digest) {
      throw new Error('The database reference export differs from the selected backup manifest')
    }
  }
  return referenceIds
}

export async function verifyRecoveredAssets(
  manifestPath,
  inventoryPath,
  recoveredDirectory,
  referenceExportPath,
) {
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
    inventory?.version !== 2 ||
    inventory.manifestSha256 !== manifestSha256 ||
    !hasText(inventory.reviewReference) ||
    !Array.isArray(inventory.objects) ||
    !Array.isArray(inventory.excludedReferences)
  ) {
    throw new Error('Expected a reviewed asset inventory for this exact backup manifest')
  }
  const referenceExport = JSON.parse(await readFile(referenceExportPath, 'utf8'))
  const remainingReferences = verifyReferenceExport(
    manifest.facts?.objectReferences,
    referenceExport,
  )
  const assignReference = (reference) => {
    if (!remainingReferences.delete(JSON.stringify([reference?.kind, reference?.position]))) {
      throw new Error('The inventory has an unknown or duplicate database reference')
    }
  }
  for (const excluded of inventory.excludedReferences) {
    if (!hasText(excluded?.reason)) {
      throw new Error('Every excluded database reference requires a reviewed reason')
    }
    assignReference(excluded)
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
      !SHA256.test(object.sha256) ||
      !Array.isArray(object.references) ||
      object.references.length === 0
    ) {
      throw new Error(`Invalid asset inventory entry ${index + 1}`)
    }
    const source = JSON.stringify([object.bucket, object.key])
    if (files.has(object.file) || sourceObjects.has(source)) {
      throw new Error(`Duplicate file or source object at inventory entry ${index + 1}`)
    }
    for (const reference of object.references) assignReference(reference)
    files.add(object.file)
    sourceObjects.add(source)
  }
  if (remainingReferences.size) {
    throw new Error(
      `The inventory leaves ${remainingReferences.size} database references unaccounted for`,
    )
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
    referencesVerified: referenceExport.length - inventory.excludedReferences.length,
    referencesExcluded: inventory.excludedReferences.length,
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 4) {
      throw new Error(
        'Usage: verify-recovered-assets.mjs <manifest> <inventory> <recovered-directory> <reference-export>',
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
