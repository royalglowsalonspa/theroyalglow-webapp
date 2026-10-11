import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveInstalledPackage } from './check-auth-dependencies'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rgss-package-resolution-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writePackage(directory: string, name: string, version: string, rootExport = false) {
  mkdirSync(join(directory, 'dist'), { recursive: true })
  const path = join(directory, 'package.json')
  writeFileSync(
    path,
    JSON.stringify({
      name,
      version,
      exports: rootExport ? { '.': './dist/index.js' } : { './server': './dist/index.js' },
    }),
  )
  writeFileSync(join(directory, 'dist/index.js'), 'module.exports = {}\n')
  return realpathSync(path)
}

describe('resolveInstalledPackage', () => {
  it('finds the owning manifest above a resolved root entry', () => {
    const consumer = writePackage(root, 'application', '1.0.0')
    const path = writePackage(join(root, 'node_modules/widget'), 'widget', '2.0.0', true)

    expect(resolveInstalledPackage(consumer, 'widget')).toMatchObject({
      path,
      manifest: { name: 'widget', version: '2.0.0' },
    })
  })

  it('reads scoped package metadata when only public subpaths are exported', () => {
    const consumer = writePackage(root, 'application', '1.0.0')
    const path = writePackage(join(root, 'node_modules/@vendor/sdk'), '@vendor/sdk', '3.0.0')

    expect(resolveInstalledPackage(consumer, '@vendor/sdk')).toMatchObject({
      path,
      manifest: { name: '@vendor/sdk', version: '3.0.0' },
    })
  })

  it('prefers the consumer dependency over the root dependency in the fallback', () => {
    writePackage(root, 'workspace', '1.0.0')
    writePackage(join(root, 'node_modules/widget'), 'widget', '1.0.0')
    const consumer = writePackage(join(root, 'apps/web'), 'web', '1.0.0')
    const path = writePackage(join(root, 'apps/web/node_modules/widget'), 'widget', '2.0.0')

    expect(resolveInstalledPackage(consumer, 'widget').path).toBe(path)
  })

  it.each([false, true])(
    'resolves peers from a symlinked consumer real location (root export: %s)',
    (rootExport) => {
      writePackage(root, 'workspace', '1.0.0')
      writePackage(join(root, 'node_modules/widget'), 'widget', '1.0.0', rootExport)
      const store = join(root, 'node_modules/.bun/consumer@1.0.0+peer/node_modules')
      const actualConsumer = join(store, 'consumer')
      writePackage(actualConsumer, 'consumer', '1.0.0')
      const path = writePackage(join(store, 'widget'), 'widget', '2.0.0', rootExport)
      const linkedConsumer = join(root, 'apps/web/node_modules/consumer')
      mkdirSync(dirname(linkedConsumer), { recursive: true })
      symlinkSync(actualConsumer, linkedConsumer, process.platform === 'win32' ? 'junction' : 'dir')

      expect(resolveInstalledPackage(join(linkedConsumer, 'package.json'), 'widget').path).toBe(
        path,
      )
    },
  )

  it('does not mistake a differently named package for the requested dependency', () => {
    const consumer = writePackage(root, 'application', '1.0.0')
    writePackage(join(root, 'node_modules/widget'), 'another-package', '9.0.0')

    expect(() => resolveInstalledPackage(consumer, 'widget')).toThrow(
      `Cannot locate installed widget manifest from ${consumer}`,
    )
  })

  it.each([false, true])(
    'finds an installed Bun builtin with hidden metadata: %s',
    (rootExport) => {
      const consumer = writePackage(root, 'application', '1.0.0')
      const path = writePackage(join(root, 'node_modules/undici'), 'undici', '7.30.0', rootExport)
      const module = pathToFileURL(join(import.meta.dirname, 'check-auth-dependencies.ts')).href
      const script = `import { resolveInstalledPackage } from ${JSON.stringify(module)};
      console.log(JSON.stringify(resolveInstalledPackage(${JSON.stringify(consumer)}, 'undici')))`
      const output = execFileSync('bun', ['--eval', script], { encoding: 'utf8', timeout: 30000 })
      expect(JSON.parse(output)).toMatchObject({
        path,
        manifest: { name: 'undici', version: '7.30.0' },
      })
    },
  )

  it('identifies the missing package and consumer and retains the resolution failure', () => {
    const consumer = writePackage(root, 'application', '1.0.0')

    expect(() => resolveInstalledPackage(consumer, '@missing/dependency')).toThrow(
      `Cannot locate installed @missing/dependency manifest from ${consumer}`,
    )
    try {
      resolveInstalledPackage(consumer, '@missing/dependency')
      expect.unreachable('Missing dependency unexpectedly resolved')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      if (!(error instanceof Error)) throw error
      expect(error.cause).toMatchObject({ code: 'MODULE_NOT_FOUND' })
    }
  })
})
