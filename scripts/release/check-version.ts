import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  version?: string
}
const releaseManifest = JSON.parse(
  readFileSync(join(root, '.release-please-manifest.json'), 'utf8'),
) as Record<string, string>

const expected = rootPackage.version
if (!expected) throw new Error('Root package.json must define the platform version.')

const packageFiles = [
  ...new Bun.Glob('apps/*/package.json').scanSync({ cwd: root }),
  ...new Bun.Glob('packages/*/package.json').scanSync({ cwd: root }),
]

const mismatches = packageFiles.flatMap((file) => {
  const manifest = JSON.parse(readFileSync(join(root, file), 'utf8')) as { version?: string }
  return manifest.version === expected ? [] : [`${file}: ${manifest.version ?? 'missing'}`]
})

if (releaseManifest['.'] !== expected) {
  mismatches.push(`.release-please-manifest.json: ${releaseManifest['.'] ?? 'missing'}`)
}

if (mismatches.length > 0) {
  throw new Error(`Platform version must be ${expected}:\n${mismatches.join('\n')}`)
}

console.log(
  `Platform version ${expected} is synchronized across ${packageFiles.length} workspaces.`,
)
