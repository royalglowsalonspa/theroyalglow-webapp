/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : create-mcp-api-key
 * Scope        : CMS Operations Script
 *
 * Description  : Provisions a READ-ONLY MCP API key in the
 *                `payload-mcp-api-keys` collection via the Payload Local API,
 *                enabling ONLY the `find` capability on every collection the
 *                MCP plugin exposes in payload.config.ts.
 *
 * Responsibilities :
 * - Resolve the owning CMS user by email
 * - Create (or refresh) a single named API key, idempotently by label
 * - Enable `find` and nothing else on every exposed collection
 * - Print the raw key EXACTLY ONCE (Payload stores only an HMAC index)
 *
 * Usage :
 *   cd apps/cms
 *   bun run --env-file=.env.local scripts/create-mcp-api-key.ts
 *
 *   Optional env overrides:
 *     MCP_KEY_OWNER_EMAIL  owning CMS user (default katbose.dev@gmail.com)
 *     MCP_KEY_LABEL        key label used for idempotency (default below)
 *
 * Notes :
 * - The printed key is a LIVE CREDENTIAL. It grants read access to all CMS
 *   content. Store it in `.kiro/settings/mcp.json` (gitignored) and nowhere
 *   that is version-controlled.
 * - Re-running ROTATES the key: the same labelled row is updated with a fresh
 *   secret, which immediately invalidates the previous one.
 * - Writes are deliberately NOT granted. `service` / `service_category` carry
 *   afterChange hooks that mirror into `public.*` — the live booking catalogue.
 ************************************************************/
import crypto from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'

/**
 * Collections exposed over MCP, keyed by the camelCased group name the plugin
 * derives from each collection slug (see plugin-mcp `toCamelCase`).
 * Keep in sync with the `mcpPlugin({ collections })` block in payload.config.ts.
 */
const READ_ONLY_GROUPS = [
  'service',
  'serviceCategory',
  'serviceCard',
  'blog',
  'gallery',
  'team',
  'banner',
  'faq',
  'testimonial',
  'offer',
  'media',
] as const

const OWNER_EMAIL = process.env.MCP_KEY_OWNER_EMAIL ?? 'katbose.dev@gmail.com'
const KEY_LABEL = process.env.MCP_KEY_LABEL ?? 'Kiro workspace (read-only)'

const main = async (): Promise<void> => {
  const payload = await getPayload({ config })

  const { docs: users } = await payload.find({
    collection: 'users',
    limit: 1,
    pagination: false,
    where: { email: { equals: OWNER_EMAIL } },
  })

  const owner = users[0]
  if (!owner) {
    throw new Error(
      `No CMS user with email "${OWNER_EMAIL}". Set MCP_KEY_OWNER_EMAIL to an existing admin.`,
    )
  }

  // `find: true` on every exposed collection, nothing else. Capabilities not
  // listed here stay at their `defaultValue: false`.
  const capabilities = Object.fromEntries(READ_ONLY_GROUPS.map((group) => [group, { find: true }]))

  const apiKey = crypto.randomUUID()

  const { docs: existing } = await payload.find({
    collection: 'payload-mcp-api-keys',
    limit: 1,
    pagination: false,
    where: { label: { equals: KEY_LABEL } },
  })

  const data = {
    apiKey,
    description: 'Read-only MCP access for the Kiro IDE workspace.',
    enableAPIKey: true,
    label: KEY_LABEL,
    user: owner.id,
    ...capabilities,
  }

  const current = existing[0]
  const saved = current
    ? await payload.update({ collection: 'payload-mcp-api-keys', data, id: current.id })
    : await payload.create({ collection: 'payload-mcp-api-keys', data })

  console.log(
    [
      current ? 'ROTATED existing MCP API key' : 'CREATED MCP API key',
      `  id      : ${saved.id}`,
      `  label   : ${KEY_LABEL}`,
      `  owner   : ${OWNER_EMAIL}`,
      `  scope   : find-only on ${READ_ONLY_GROUPS.length} collections`,
      '',
      '  Authorization header for the MCP client:',
      `    Authorization: Bearer ${apiKey}`,
      '',
      '  This is the only time the raw key is shown. Store it in',
      '  .kiro/settings/mcp.json (gitignored) — never in version control.',
    ].join('\n'),
  )

  process.exit(0)
}

await main()
