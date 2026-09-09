import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const advisoryUrl = 'https://github.com/advisories/GHSA-jg8r-5jh2-v2xj'

export function evaluateAudit(report: unknown, payloadVersion: string): string[] {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Unexpected bun audit report')
  }
  const failures: string[] = []
  for (const [pkg, advisories] of Object.entries(report)) {
    if (!Array.isArray(advisories) || advisories.length === 0) {
      throw new Error(`Unexpected advisory list for ${pkg}`)
    }
    for (const advisory of advisories) {
      if (!advisory || typeof advisory.url !== 'string' || typeof advisory.title !== 'string') {
        throw new Error(`Malformed advisory for ${pkg}`)
      }
      const accepted =
        pkg === 'payload' &&
        payloadVersion === '3.88.0' &&
        advisory.url === advisoryUrl &&
        advisory.vulnerable_versions === '<=3.88.0'
      if (!accepted) failures.push(`${pkg}: ${advisory.title} (${advisory.url})`)
    }
  }
  return failures
}

if (import.meta.main) {
  const result = spawnSync('bun', ['audit', '--json'], { encoding: 'utf8' })
  if (result.error || result.signal || ![0, 1].includes(result.status ?? -1)) {
    throw new Error(`bun audit could not complete: ${result.error ?? result.stderr}`)
  }
  const report = JSON.parse(result.stdout)
  if (result.status === 1 && Object.keys(report).length === 0) {
    throw new Error('bun audit failed without reporting advisories')
  }
  const cmsRequire = createRequire(new URL('../../apps/cms/package.json', import.meta.url))
  const failures = evaluateAudit(report, cmsRequire('payload/package.json').version)
  console.log(result.stdout)
  if (failures.length) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  } else if (Object.keys(report).length) {
    console.warn(
      `::warning::Maintainer-accepted Payload 3.88.0 advisory: ${advisoryUrl}. Explicit unlock access is regression-tested. Remove this exception when upgrading Payload.`,
    )
  } else {
    console.log('No dependency advisories found.')
  }
}
