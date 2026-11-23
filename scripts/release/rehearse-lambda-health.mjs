import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const REGION = 'ap-southeast-1'
const STAGE = /^(dev|test|pprd|rehearsal-[a-z0-9-]+)$/
const FUNCTION_ARN = /^arn:aws:lambda:ap-southeast-1:(\d{12}):function:([A-Za-z0-9_-]+)$/
const REVISION_ID = /^[a-zA-Z0-9-]+$/
const REQUEST_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const SAMPLE_COUNT = 4

function aws(service, operation, ...args) {
  try {
    return JSON.parse(
      execFileSync(
        'aws',
        [service, operation, ...args, '--region', REGION, '--no-cli-pager', '--output', 'json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 },
      ),
    )
  } catch {
    throw new Error(`AWS ${service} ${operation} failed`)
  }
}

function functionConfiguration(command, arn) {
  return command(
    'lambda',
    'get-function-configuration',
    '--function-name',
    arn,
    '--query',
    '{RevisionId:RevisionId,CodeSha256:CodeSha256,LogGroup:LoggingConfig.LogGroup}',
  )
}

export function verifyRehearsalTarget(
  { stage, arn, distributionId, revisionId, adminOrigin },
  command = aws,
) {
  const match = FUNCTION_ARN.exec(arn)
  if (
    !STAGE.test(stage) ||
    !match?.[2]?.startsWith(`rgss-${stage}-AdminServer`) ||
    !/^[A-Z0-9]+$/.test(distributionId) ||
    !REVISION_ID.test(revisionId)
  ) {
    throw new Error(
      'Provide a nonproduction SST stage, admin function ARN, distribution and revision',
    )
  }

  const alias = adminOrigin ? URL.parse(adminOrigin) : null
  if (
    adminOrigin &&
    (alias?.protocol !== 'https:' ||
      alias.port ||
      alias.href !== `${alias.origin}/` ||
      !/^admin\.[a-z0-9.-]+\.[a-z]{2,}$/.test(alias.hostname) ||
      alias.hostname.endsWith('.theroyalglow.in'))
  ) {
    throw new Error('Provide the reviewed rehearsal admin HTTPS origin')
  }

  const { Tags: tags } = command('lambda', 'list-tags', '--resource', arn)
  if (tags?.['sst:app'] !== 'rgss' || tags?.['sst:stage'] !== stage) {
    throw new Error('Admin function tags do not match the requested rehearsal stage')
  }
  const config = functionConfiguration(command, arn)
  if (config.RevisionId !== revisionId || !config.CodeSha256) {
    throw new Error('The admin function does not match the reviewed deployed revision')
  }

  const { FunctionUrl: functionUrl } = command(
    'lambda',
    'get-function-url-config',
    '--function-name',
    arn,
  )
  const { Distribution: distribution } = command(
    'cloudfront',
    'get-distribution',
    '--id',
    distributionId,
  )
  const { DistributionConfig: distributionConfig, DomainName: hostname } = distribution
  const aliases = distributionConfig.Aliases
  const matchesAlias = alias
    ? aliases?.Quantity === 1 && aliases.Items?.[0] === alias.hostname
    : aliases?.Quantity === 0
  const serverOrigin = distributionConfig.Origins?.Items?.find(
    ({ DomainName }) => DomainName === new URL(functionUrl).hostname,
  )
  if (
    distribution.Status !== 'Deployed' ||
    !distributionConfig.Enabled ||
    !matchesAlias ||
    !/^d[a-z0-9]+\.cloudfront\.net$/.test(hostname) ||
    !serverOrigin ||
    distributionConfig.DefaultCacheBehavior?.TargetOriginId !== serverOrigin.Id
  ) {
    throw new Error('The CloudFront distribution does not match the rehearsal function URL')
  }
  return {
    ...config,
    hostname: alias?.hostname ?? hostname,
    logGroup: config.LogGroup ?? `/aws/lambda/${match[2]}`,
  }
}

export function readInvocationReport(message, requestId) {
  if (message.startsWith('{')) {
    const { type, record } = JSON.parse(message)
    if (type !== 'platform.report' || record?.requestId !== requestId) return null
    if (record.status && record.status !== 'success') throw new Error('Lambda invocation failed')
    return {
      durationMs: record.metrics?.durationMs,
      initMs: record.metrics?.initDurationMs ?? null,
    }
  }

  const prefix = `REPORT RequestId: ${requestId}`
  if (!message.startsWith(prefix) || !/^\s/.test(message.slice(prefix.length))) return null
  const status = /\bStatus:\s+(\w+)/.exec(message)?.[1]
  if (status && status !== 'success') throw new Error('Lambda invocation failed')
  const duration = /^\s+Duration: ([\d.]+) ms/.exec(message.slice(prefix.length))?.[1]
  const init = /\bInit Duration: ([\d.]+) ms/.exec(message)?.[1]
  return { durationMs: Number(duration), initMs: init === undefined ? null : Number(init) }
}

async function findReport(logGroup, requestId, startTime) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { events } = aws(
      'logs',
      'filter-log-events',
      '--log-group-name',
      logGroup,
      '--start-time',
      String(startTime - 1000),
      '--filter-pattern',
      `"${requestId}"`,
    )
    for (const { message, logStreamName } of events) {
      const report = readInvocationReport(message, requestId)
      if (report) return { ...report, logStreamName }
    }
    await setTimeout(3000)
  }
  throw new Error('No matching Lambda REPORT appeared in CloudWatch')
}

async function rehearse(target) {
  const { hostname, logGroup, CodeSha256: codeSha } = verifyRehearsalTarget(target)
  const requests = []
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const startTime = Date.now()
    const response = await fetch(`https://${hostname}/api/health?rehearsal=${randomUUID()}`, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    const body = await response.json()
    const requestId = response.headers.get('x-amzn-requestid')
    if (
      response.status !== 200 ||
      body?.status !== 'healthy' ||
      !requestId ||
      !REQUEST_ID.test(requestId) ||
      response.headers.get('x-cache') !== 'Miss from cloudfront' ||
      requests.some((sample) => sample.requestId === requestId)
    ) {
      throw new Error('DB health was not confirmed on a unique, uncached Lambda request')
    }
    requests.push({ requestId, startTime, elapsedMs: Date.now() - startTime })
  }

  const samples = await Promise.all(
    requests.map(async (sample) => ({
      ...sample,
      ...(await findReport(logGroup, sample.requestId, sample.startTime)),
    })),
  )
  const current = functionConfiguration(aws, target.arn)
  if (current.RevisionId !== target.revisionId || current.CodeSha256 !== codeSha) {
    throw new Error('The deployed function changed during the rehearsal')
  }

  const [cold, ...warm] = samples
  if (
    samples.some(({ durationMs }) => !Number.isFinite(durationMs)) ||
    !Number.isFinite(cold.initMs) ||
    warm.some(
      ({ initMs, logStreamName }) => initMs !== null || logStreamName !== cold.logStreamName,
    )
  ) {
    throw new Error('No cold request followed by warm requests on the same Lambda environment')
  }
  return { ...target, codeSha, samples }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [stage = '', arn = '', distributionId = '', revisionId = '', adminOrigin] =
    process.argv.slice(2)
  try {
    const result = await rehearse({ stage, arn, distributionId, revisionId, adminOrigin })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Lambda rehearsal did not pass')
    process.exitCode = 1
  }
}
