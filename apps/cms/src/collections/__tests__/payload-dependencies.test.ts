import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type Manifest = { name: string; version: string; dependencies: Record<string, string> }

describe('Payload dependency compatibility', () => {
  it('pins and installs all direct Payload packages as one release cohort', () => {
    const manifest: Manifest = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    )
    const dependencies = Object.entries(manifest.dependencies).filter(
      ([name]) => name === 'payload' || name.startsWith('@payloadcms/'),
    )
    expect(dependencies.length).toBeGreaterThan(1)
    const payloadVersion = manifest.dependencies.payload
    expect(payloadVersion).toMatch(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/)

    for (const [name, requested] of dependencies) {
      expect(requested, `${name} must use the same exact release as payload`).toBe(payloadVersion)
      const installed: Manifest = JSON.parse(
        readFileSync(
          new URL(`../../../node_modules/${name}/package.json`, import.meta.url),
          'utf8',
        ),
      )
      expect(installed.name).toBe(name)
      expect(installed.version, `${name} installed version must match the committed manifest`).toBe(
        payloadVersion,
      )
    }
  })
})
