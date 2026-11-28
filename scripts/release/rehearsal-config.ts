const REHEARSAL_STAGE = /^rehearsal-[a-z0-9]+(?:-[a-z0-9]+)*$/
const DNS_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const CERTIFICATE = /^arn:aws:acm:us-east-1:\d{12}:certificate\/[a-f0-9-]{36}$/
const NEON_HOST = /^ep-[a-z0-9-]+\.(?:[a-z0-9-]+\.)+neon\.tech$/
const R2_ENDPOINT = /^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/
const INVOICE_STAGING_ORIGIN = 'https://invoice-staging.theroyalglow.in'

type Environment = Readonly<Record<string, string | undefined>>

function required(env: Environment, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Set ${name} for the isolated release rehearsal`)
  return value
}

function isProductionHostname(host: string): boolean {
  return host === 'theroyalglow.in' || host.endsWith('.theroyalglow.in')
}

export function rehearsalDomain(value: string): string {
  const domain = value.trim().toLowerCase()
  if (!DNS_NAME.test(domain) || isProductionHostname(domain)) {
    throw new Error('REHEARSAL_DOMAIN must identify the isolated SST rehearsal domain')
  }
  return domain
}

export function rehearsalQStashOrigin(input = 'https://qstash.upstash.io'): string {
  const url = URL.parse(input)
  if (
    url?.protocol !== 'https:' ||
    url.port ||
    !/^qstash(?:-[a-z0-9-]+)?\.upstash\.io$/.test(url.hostname) ||
    url.href !== `${url.origin}/`
  ) {
    throw new Error('REHEARSAL_QSTASH_URL must be an Upstash QStash HTTPS origin')
  }
  return url.origin
}

function isolatedOrigin(env: Environment, name: string): URL {
  const parsed = URL.parse(required(env, name))
  if (
    parsed?.protocol !== 'https:' ||
    !DNS_NAME.test(parsed.hostname) ||
    isProductionHostname(parsed.hostname) ||
    parsed.href !== `${parsed.origin}/`
  ) {
    throw new Error(`${name} must be a dedicated HTTPS origin outside the production domain`)
  }
  return parsed
}

function invoiceWorkerOrigin(
  env: Environment,
  name: 'REHEARSAL_INVOICE_EVENTS_ORIGIN' | 'REHEARSAL_INVOICE_ROSTER_ORIGIN',
): string | undefined {
  const value = env[name]?.trim()
  if (!value) return undefined
  if (value === INVOICE_STAGING_ORIGIN || value === `${INVOICE_STAGING_ORIGIN}/`) {
    return INVOICE_STAGING_ORIGIN
  }
  return isolatedOrigin(env, name).origin
}

export function readRehearsalConfig(stage: string, env: Environment) {
  if (stage !== 'rehearsal' && !stage.startsWith('rehearsal-')) return undefined
  if (!REHEARSAL_STAGE.test(stage)) throw new Error('Use a named rehearsal-* SST stage')

  const domain = rehearsalDomain(required(env, 'REHEARSAL_DOMAIN'))
  const cert = required(env, 'REHEARSAL_CERTIFICATE_ARN')
  if (!CERTIFICATE.test(cert)) {
    throw new Error(
      'REHEARSAL_CERTIFICATE_ARN must identify the rehearsal ACM certificate in us-east-1',
    )
  }
  const neonHost = required(env, 'REHEARSAL_NEON_HOST').toLowerCase()
  if (!NEON_HOST.test(neonHost) || neonHost.split('.')[0]?.endsWith('-pooler')) {
    throw new Error('REHEARSAL_NEON_HOST must be the direct endpoint of the isolated Neon branch')
  }

  const ablyAppId = required(env, 'REHEARSAL_ABLY_APP_ID')
  const productionAblyAppId = required(env, 'PRODUCTION_ABLY_APP_ID')
  if (!/^[A-Za-z0-9_-]+$/.test(ablyAppId) || ablyAppId === productionAblyAppId) {
    throw new Error('REHEARSAL_ABLY_APP_ID must identify a separate Ably app')
  }

  const r2Endpoint = isolatedOrigin(env, 'REHEARSAL_R2_ENDPOINT')
  if (!R2_ENDPOINT.test(r2Endpoint.hostname))
    throw new Error('REHEARSAL_R2_ENDPOINT must be an R2 S3 endpoint')
  const r2Bucket = required(env, 'REHEARSAL_R2_BUCKET')
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(r2Bucket) || r2Bucket === env.R2_BUCKET_NAME) {
    throw new Error('REHEARSAL_R2_BUCKET must identify the dedicated rehearsal bucket')
  }

  const webHost = `web.${domain}`
  const adminHost = `admin.${domain}`
  return {
    cookieDomain: `.${domain}`,
    neonHost,
    ablyAppId,
    qstashOrigin: rehearsalQStashOrigin(env.REHEARSAL_QSTASH_URL),
    web: { hostname: webHost, origin: `https://${webHost}`, cert },
    admin: { hostname: adminHost, origin: `https://${adminHost}`, cert },
    cmsOrigin: isolatedOrigin(env, 'REHEARSAL_CMS_ORIGIN').origin,
    invoicingOrigin: isolatedOrigin(env, 'REHEARSAL_INVOICING_ORIGIN').origin,
    invoiceRosterOrigin: invoiceWorkerOrigin(env, 'REHEARSAL_INVOICE_ROSTER_ORIGIN'),
    invoiceEventsOrigin: invoiceWorkerOrigin(env, 'REHEARSAL_INVOICE_EVENTS_ORIGIN'),
    r2Endpoint: r2Endpoint.origin,
    r2Bucket,
    r2PublicOrigin: isolatedOrigin(env, 'REHEARSAL_R2_PUBLIC_ORIGIN').origin,
    contactEmail: `rehearsal@${domain}`,
    vapidPublicKey: required(env, 'REHEARSAL_VAPID_PUBLIC_KEY'),
    posthogKey: required(env, 'REHEARSAL_POSTHOG_KEY'),
    posthogHost: isolatedOrigin(env, 'REHEARSAL_POSTHOG_HOST').origin,
  }
}

export function rehearsalDatabaseUrl(value: string, neonHost: string, direct: boolean): string {
  const url = URL.parse(value)
  const pooledHost = neonHost.replace('.', '-pooler.')
  if (
    !url ||
    (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') ||
    (url.hostname !== neonHost && url.hostname !== pooledHost)
  ) {
    throw new Error('The rehearsal database secret does not match REHEARSAL_NEON_HOST')
  }
  if (direct) url.hostname = neonHost
  return url.href
}

export function rehearsalAblyKey(value: string, appId: string): string {
  if (value.split('.')[0] !== appId || !/^[^.]+\.[^:]+:.+$/.test(value)) {
    throw new Error('The rehearsal Ably secret does not match REHEARSAL_ABLY_APP_ID')
  }
  return value
}
