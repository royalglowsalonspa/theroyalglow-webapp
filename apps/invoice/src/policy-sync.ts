import { DurableObject } from 'cloudflare:workers'
import { z } from 'zod'
import { developerEmail, gmail } from './auth'
import type { InvoiceEnv } from './env'

const rule = z.record(z.string(), z.unknown())
const emailRule = z.object({ email: z.object({ email: gmail }).strict() }).strict()
const policyResponse = z.object({
  success: z.literal(true),
  result: z
    .object({
      id: z.string(),
      account_id: z.string(),
      name: z.string(),
      app_count: z.literal(1),
      decision: z.literal('allow'),
      include: z.array(emailRule),
      require: z.array(rule),
      exclude: z.array(rule).optional(),
      approval_groups: z.array(rule).optional(),
      approval_required: z.boolean().optional(),
      connection_rules: rule.optional(),
      isolation_required: z.boolean().optional(),
      mfa_config: rule.optional(),
      policy_resolution_account_id: z.string().optional(),
      purpose_justification_prompt: z.string().optional(),
      purpose_justification_required: z.boolean().optional(),
      session_duration: z.string().optional(),
      reusable: z.literal(true),
      created_at: z.string().optional(),
      updated_at: z.string().optional(),
    })
    .strict(),
})

async function reconcile(env: InvoiceEnv) {
  const developer = developerEmail(env)
  if (
    !developer ||
    !env.ACCESS_POLICY_TOKEN ||
    !/^[0-9a-f]{32}$/.test(env.ACCESS_ACCOUNT_ID ?? '') ||
    !z.uuid().safeParse(env.ACCESS_POLICY_ID).success ||
    !z.uuid().safeParse(env.ACCESS_GOOGLE_IDP_ID).success
  ) {
    throw new Error('Incomplete Access sync configuration')
  }
  const rows = await env.DB.prepare('SELECT DISTINCT email FROM invoice_effective_grant').all<{
    email: string
  }>()
  const desired = [
    ...new Set([developer, ...rows.results.map(({ email }) => gmail.parse(email))]),
  ].sort()
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.ACCESS_ACCOUNT_ID}/access/policies/${env.ACCESS_POLICY_ID}`
  const headers = {
    authorization: `Bearer ${env.ACCESS_POLICY_TOKEN}`,
    'content-type': 'application/json',
  }
  async function fetchPolicy(body?: string) {
    const res = await fetch(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      ...(body ? { method: 'PUT', body } : {}),
    })
    if (!res.ok) throw new Error('Access policy request failed')
    const { result } = policyResponse.parse(await res.json())
    const googleRequired = result.require.some(
      (item) =>
        z
          .object({ login_method: z.object({ id: z.literal(env.ACCESS_GOOGLE_IDP_ID) }).strict() })
          .strict()
          .safeParse(item).success,
    )
    if (
      result.id !== env.ACCESS_POLICY_ID ||
      result.account_id !== env.ACCESS_ACCOUNT_ID ||
      result.name !== `rgss-invoice-${env.BILLING_SOURCE}-portal` ||
      !googleRequired
    ) {
      throw new Error('Unexpected Access policy configuration')
    }
    return result
  }

  const desiredJson = JSON.stringify(desired)
  const matches = (policy: z.infer<typeof policyResponse>['result']) =>
    JSON.stringify(policy.include.map((item) => item.email.email).sort()) === desiredJson
  const current = await fetchPolicy()
  if (!matches(current)) {
    // Strip response metadata and preserve every recognized writable control. Unknown fields fail closed.
    const {
      id: _id,
      account_id: _account,
      app_count: _count,
      reusable: _reusable,
      created_at: _created,
      updated_at: _updated,
      ...settings
    } = current
    const updated = await fetchPolicy(
      JSON.stringify({ ...settings, include: desired.map((email) => ({ email: { email } })) }),
    )
    if (!matches(updated)) throw new Error('Access policy membership was not confirmed')
  }
  await env.DB.prepare(
    "UPDATE invoice_access_sync SET members_json = ?, checked_at = ?, status = 'confirmed' WHERE id = 1",
  )
    .bind(desiredJson, new Date().toISOString())
    .run()
}

export class InvoiceAccessSync extends DurableObject<InvoiceEnv> {
  private running: Promise<void> | undefined

  async reconcile() {
    if (this.env.ACCESS_POLICY_SYNC_ENABLED !== 'true') return
    this.running ??= reconcile(this.env)
      .catch(async () => {
        await this.env.DB.prepare(
          "UPDATE invoice_access_sync SET status = 'failed' WHERE id = 1",
        ).run()
        throw new Error('Invoice Access synchronization failed')
      })
      .finally(() => {
        this.running = undefined
      })
    await this.running
  }
}
