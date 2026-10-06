import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, parse, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import findup from './index.cjs'

let fixture: string
let cwd: string

beforeEach(() => {
  fixture = realpathSync(mkdtempSync(join(tmpdir(), 'rgss-findup-')))
  cwd = join(fixture, 'project', 'src', 'nested')
  mkdirSync(cwd, { recursive: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(fixture, { recursive: true, force: true })
})

function file(path: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '')
  return path
}

describe('ancestor finder compatibility', () => {
  it('finds the nearest literal file before a more distant ancestor', () => {
    file(join(fixture, 'marker.json'))
    const nearest = file(join(fixture, 'project', 'marker.json'))
    expect(findup('marker.json', { cwd })).toBe(nearest)
  })

  it('returns an existing directory and supports absolute literal paths', () => {
    const directory = join(fixture, 'project', 'node_modules')
    mkdirSync(directory)
    expect(findup('node_modules', { cwd })).toBe(directory)
    expect(findup(directory, { cwd })).toBe(directory)
  })

  it('uses the current working directory when options are omitted', () => {
    const marker = file(join(cwd, 'marker.json'))
    vi.spyOn(process, 'cwd').mockReturnValue(cwd)
    expect(findup('marker.json')).toBe(marker)
  })

  it('tries patterns in order within each ancestor', () => {
    const first = file(join(cwd, 'z-first.json'))
    file(join(cwd, 'a-second.json'))
    expect(findup(['z-first.json', 'a-second.json'], { cwd })).toBe(first)
    file(join(fixture, 'z-first.json'))
    expect(findup(['absent.json', 'a-second.json'], { cwd })).toBe(join(cwd, 'a-second.json'))
  })

  it('accepts a missing start directory and still searches its ancestors', () => {
    const marker = file(join(fixture, 'project', 'marker.json'))
    expect(findup('marker.json', { cwd: join(cwd, 'missing', 'nested') })).toBe(marker)
  })

  it('returns null for absent entries, empty patterns and root exhaustion', () => {
    expect(findup(`missing-${fixture.split(/[\\/]/).at(-1)}`, { cwd })).toBeNull()
    expect(findup([], { cwd })).toBeNull()
    expect(findup('rgss-absent-root-marker', { cwd: parse(cwd).root })).toBeNull()
  })

  it('rejects unsupported pattern input', () => {
    // Runtime callers can pass values outside the declaration contract.
    expect(() => Reflect.apply(findup, undefined, [42, { cwd }])).toThrow(TypeError)
  })

  it('supports glob, brace and extglob matching', () => {
    const marker = file(join(cwd, 'marker.json'))
    expect(findup('*.json', { cwd })).toBe(marker)
    expect(findup('{marker,other}.json', { cwd })).toBe(marker)
    expect(findup('@(marker|other).json', { cwd })).toBe(marker)
  })

  it('matches full paths in addition to basenames', () => {
    const marker = file(join(cwd, 'marker.json'))
    expect(findup(`${cwd.replaceAll('\\', '/')}/m*.json`, { cwd })).toBe(marker)
  })

  it('preserves dot and nocase options', () => {
    const hidden = file(join(cwd, '.marker.json'))
    expect(findup('*.json', { cwd })).toBeNull()
    expect(findup('*.json', { cwd, dot: true })).toBe(hidden)
    // Windows preserves requested casing when existsSync succeeds; Linux's
    // detect-file fallback returns the on-disk casing. Both name the same file.
    expect(findup('.MARKER.JSON', { cwd, nocase: true })?.toLowerCase()).toBe(hidden.toLowerCase())
    expect(findup('.*.JSON', { cwd, dot: true, nocase: true })).toBe(hidden)
  })

  it('retains literal filenames containing brackets', () => {
    const marker = file(join(cwd, 'marker[one].json'))
    expect(findup('marker*.json', { cwd })).toBe(marker)
  })

  it('preserves symlink paths without changing to their target', () => {
    const target = join(fixture, 'target')
    mkdirSync(target)
    const link = join(cwd, 'linked_modules')
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
    expect(findup('linked_modules', { cwd })).toBe(link)
  })

  it('retains tilde and global module directory expansion', () => {
    const ownRequire = createRequire(resolve(__dirname, 'package.json'))
    const expand: (path: string) => string = ownRequire('resolve-dir')
    for (const directory of ['~', '@']) {
      expect(findup('.', { cwd: directory })).toBe(resolve(expand(directory)))
    }
  })

  it('handles deeply nested hostile brace patterns without recursive AST exhaustion', () => {
    const pattern = `${'{'.repeat(4000)}marker${'}'.repeat(4000)}`
    expect(() => findup(pattern, { cwd })).not.toThrow()
    expect(findup(pattern, { cwd })).toBeNull()
  })

  it('enforces Picomatch input length bounds', () => {
    expect(() => findup('*'.repeat(70000), { cwd })).toThrow(/maximum allowed length/)
  })
})

describe('installed Payload finder integration', () => {
  it('resolves the maintained replacement and preserves original consumer results', () => {
    const root = resolve(__dirname, '../..')
    const cms = createRequire(join(root, 'apps/cms/package.json'))
    const storage = createRequire(cms.resolve('@payloadcms/storage-s3'))
    const cloud = createRequire(storage.resolve('@payloadcms/plugin-cloud-storage'))
    const finderPath = cloud.resolve('find-node-modules')
    const finderRequire = createRequire(finderPath)
    const replacementPath = realpathSync(finderRequire.resolve('findup-sync'))
    const manifest: { name: string } = JSON.parse(
      readFileSync(join(dirname(replacementPath), 'package.json'), 'utf8'),
    )
    expect(manifest.name).toBe('@rgss/findup-sync')
    expect(finderRequire('findup-sync')).toBeTypeOf('function')
    const finder: (
      options?: string | { cwd?: string; relative?: boolean; searchFor?: string | string[] },
    ) => string[] = cloud('find-node-modules')
    const nearest = join(fixture, 'project', 'node_modules')
    const outer = join(fixture, 'node_modules')
    mkdirSync(nearest)
    mkdirSync(outer)
    expect(finder({ cwd, relative: false }).slice(0, 2)).toEqual([nearest, outer])
    expect(finder(cwd).slice(0, 2)).toEqual([relative(cwd, nearest), relative(cwd, outer)])
    expect(finder({ cwd, searchFor: ['absent_modules', 'node_modules'] }).slice(0, 2)).toEqual([
      relative(cwd, nearest),
      relative(cwd, outer),
    ])
  })
})
