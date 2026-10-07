import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { satisfies, subset, valid, validRange } from 'semver'
import {
  type InstalledPackage,
  type PackageResolver,
  resolveInstalledPackage,
} from './check-auth-dependencies'

const isPayload = (name: string) => name === 'payload' || name.startsWith('@payloadcms/')
const sharesSchema = (name: string) =>
  isPayload(name) || name.startsWith('graphql-') || name.startsWith('@graphql-tools/')

/** Follow installed vendor contracts, including Bun's isolated peer copies. */
export function inspectCMSDependencies(
  app: InstalledPackage,
  resolver: PackageResolver = resolveInstalledPackage,
): string[] {
  const problems: string[] = []
  const payloadDeclaration = app.manifest.dependencies?.payload
  const graphqlDeclaration = app.manifest.dependencies?.graphql
  if (!payloadDeclaration || !valid(payloadDeclaration)) {
    problems.push('CMS must declare an exact Payload version.')
  }
  if (!graphqlDeclaration || !validRange(graphqlDeclaration)) {
    problems.push('CMS must declare a GraphQL SemVer range.')
  }
  if (problems.length || !payloadDeclaration || !graphqlDeclaration) return problems

  const cache = new Map<string, InstalledPackage | null>()
  function locate(consumer: InstalledPackage, name: string): InstalledPackage | null {
    const key = `${consumer.path}:${name}`
    if (cache.has(key)) return cache.get(key) ?? null
    try {
      const installed = resolver(consumer.path, name)
      cache.set(key, installed)
      return installed
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      problems.push(
        `${consumer.manifest.name} -> ${name}: cannot resolve installed package: ${reason}`,
      )
      cache.set(key, null)
      return null
    }
  }

  const payload = locate(app, 'payload')
  const graphql = locate(app, 'graphql')
  if (!payload || !graphql) return problems
  const payloadVersion = payload.manifest.version
  const graphqlVersion = graphql.manifest.version
  const graphqlPath = graphql.path
  const declaredGraphQLRange = graphqlDeclaration
  if (!satisfies(graphqlVersion, graphqlDeclaration)) {
    problems.push(`CMS graphql: declares ${graphqlDeclaration}, resolves ${graphqlVersion}.`)
  }
  const visited = new Set<string>()
  let graphqlContracts = 0
  function visit(consumer: InstalledPackage) {
    if (visited.has(consumer.path)) return
    visited.add(consumer.path)
    const label = `${consumer.manifest.name}@${consumer.manifest.version}`
    if (isPayload(consumer.manifest.name) && consumer.manifest.version !== payloadVersion) {
      problems.push(
        `${label}: CMS Payload resolves ${payloadVersion}; update the Payload family together.`,
      )
    }
    for (const requirements of [
      consumer.manifest.dependencies,
      consumer.manifest.peerDependencies,
    ]) {
      for (const [name, required] of Object.entries(requirements ?? {})) {
        if (name === 'graphql') {
          graphqlContracts++
          if (!validRange(required)) {
            problems.push(`${label} -> graphql: unsupported vendor requirement ${required}.`)
            continue
          }
          if (!subset(declaredGraphQLRange, required)) {
            problems.push(
              `${label} -> graphql: requires ${required}, but CMS declares ${graphqlDeclaration}.`,
            )
          }
          if (!satisfies(graphqlVersion, required)) {
            problems.push(
              `${label} -> graphql: CMS resolves ${graphqlVersion}, outside ${required}.`,
            )
          }
          const installed = locate(consumer, name)
          if (!installed) continue
          if (!satisfies(installed.manifest.version, required)) {
            problems.push(
              `${label} -> graphql: resolves ${installed.manifest.version}, outside ${required}.`,
            )
          }
          // GraphQL schemas use instanceof: even equal versions at different real
          // package paths cannot safely exchange schema/type instances.
          if (installed.path !== graphqlPath) {
            problems.push(
              `${label} -> graphql: resolves a separate ${installed.manifest.version} copy; CMS uses ${graphqlVersion}. Share one GraphQL installation.`,
            )
          }
        } else if (sharesSchema(name)) {
          const installed = locate(consumer, name)
          if (!installed) continue
          if (!validRange(required) || !satisfies(installed.manifest.version, required)) {
            problems.push(
              `${label} -> ${name}: requires ${required}, resolves ${installed.manifest.version}.`,
            )
          }
          visit(installed)
        }
      }
    }
  }

  for (const [name, declared] of Object.entries(app.manifest.dependencies ?? {})) {
    if (!isPayload(name)) continue
    if (declared !== payloadDeclaration) {
      problems.push(
        `CMS ${name}: declares ${declared}, Payload declares ${payloadDeclaration}. Update the Payload family together.`,
      )
    }
    const installed = locate(app, name)
    if (!installed) continue
    if (installed.manifest.version !== declared) {
      problems.push(`CMS ${name}: declares ${declared}, resolves ${installed.manifest.version}.`)
    }
    visit(installed)
  }
  if (!graphqlContracts)
    problems.push(
      'Installed Payload exposes no GraphQL contract; review its schema integration before upgrading.',
    )
  return problems
}

export function checkCMSDependencies(root: string): string[] {
  const path = resolve(root, 'apps/cms/package.json')
  const manifest: InstalledPackage['manifest'] = JSON.parse(readFileSync(path, 'utf8'))
  return inspectCMSDependencies({ path, manifest })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkCMSDependencies(resolve(dirname(fileURLToPath(import.meta.url)), '../..'))
  if (problems.length) {
    console.error(`CMS dependency compatibility failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log('CMS Payload/GraphQL dependency compatibility passed.')
  }
}
