/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : integrations/health
 * Scope        : Server-only integration health checker
 *
 * Description  : Reports configured/reachability status for each external
 *                integration: Ably, Resend, QStash, R2, CMS. Never leaks
 *                secret values — only booleans/names/status strings.
 *
 * Tech Stack   : TypeScript, Node fetch (AbortController 2s timeout)
 * Layer        : API Infrastructure (server-only)
 *
 * Dependencies : none (reads process.env directly)
 *
 * Notes        : Safe, time-bounded (2s abort), never throws.
 ************************************************************/

import 'server-only'

export interface IntegrationStatus {
  name: string
  configured: boolean
  status: 'ok' | 'degraded' | 'unconfigured' | 'error'
  detail?: string
}

function isSet(key: string): boolean {
  const v = process.env[key]
  return v !== undefined && v !== ''
}

async function probe(url: string, timeout = 2000): Promise<'ok' | 'error'> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal })
    clearTimeout(timer)
    return res.ok || res.status === 405 ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const results: IntegrationStatus[] = []

  // Ably
  const ablyConfigured = isSet('ABLY_PRIVATE_KEY')
  results.push({
    name: 'Ably (Realtime)',
    configured: ablyConfigured,
    status: ablyConfigured ? 'ok' : 'unconfigured',
    detail: ablyConfigured ? 'Key present' : 'ABLY_PRIVATE_KEY not set',
  })

  // Resend
  const resendConfigured = isSet('RESEND_API_KEY')
  results.push({
    name: 'Resend (Email)',
    configured: resendConfigured,
    status: resendConfigured ? 'ok' : 'unconfigured',
    detail: resendConfigured ? 'Key present' : 'RESEND_API_KEY not set',
  })

  // QStash
  const qstashConfigured = isSet('QSTASH_TOKEN')
  results.push({
    name: 'QStash (Jobs)',
    configured: qstashConfigured,
    status: qstashConfigured ? 'ok' : 'unconfigured',
    detail: qstashConfigured ? 'Token present' : 'QSTASH_TOKEN not set',
  })

  // Object storage — Cloudflare R2 (S3-compatible). Unchanged by the AWS
  // migration; the probe is provider-agnostic either way.
  const r2Configured = isSet('R2_ACCESS_KEY_ID') && isSet('R2_SECRET_ACCESS_KEY')
  results.push({
    name: 'Object Storage (S3-compatible)',
    configured: r2Configured,
    status: r2Configured ? 'ok' : 'unconfigured',
    detail: r2Configured ? 'Credentials present' : 'R2 keys not set',
  })

  // Payload CMS — probe reachability if configured
  const cmsUrl = process.env.NEXT_PUBLIC_CMS_URL
  const cmsConfigured = !!cmsUrl
  if (cmsConfigured) {
    const reachable = await probe(`${cmsUrl}/api/access`)
    results.push({
      name: 'Payload CMS',
      configured: true,
      status: reachable === 'ok' ? 'ok' : 'degraded',
      detail: reachable === 'ok' ? 'Reachable' : 'Unreachable (check if CMS is running)',
    })
  } else {
    results.push({
      name: 'Payload CMS',
      configured: false,
      status: 'unconfigured',
      detail: 'NEXT_PUBLIC_CMS_URL not set',
    })
  }

  return results
}
