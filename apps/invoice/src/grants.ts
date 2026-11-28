import { formatDateIN } from '@rgss/business'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { html } from 'hono/html'
import { z } from 'zod'
import { developerEmail, gmail } from './auth'
import { invoiceId } from './contracts'
import type { PortalEnv } from './env'

const roles = z.enum(['owner', 'manager', 'accountant'])
type Role = z.infer<typeof roles>
const form = z
  .object({
    branch: invoiceId,
    email: gmail,
    expected: z.union([roles, z.literal('none')]),
    role: z.union([roles, z.literal('revoke')]),
  })
  .strict()
const settlementFormInput = z
  .object({
    branch: invoiceId,
    email: gmail,
    enabled: z.enum(['0', '1']),
  })
  .strict()
const accessFormLimit = bodyLimit({ maxSize: 2048, onError: (c) => c.text('Form too large.', 413) })
const managedBranches = `SELECT b.branch_id FROM invoice_access_branch b WHERE ?1 = 1 OR EXISTS (
  SELECT 1 FROM invoice_effective_grant g WHERE g.email = ?2
  AND g.branch_id = b.branch_id AND g.role = 'owner')`

interface Grant {
  email: string
  role: Role
  eligible: number
  listed: number
  settlement_enabled: number
}
interface Change {
  actor: string
  email: string
  old_role: Role | null
  new_role: Role | null
  settlement_enabled: number | null
  changed_at: string
}

function grantForm(branch: string, developer: boolean, grant?: Grant) {
  const allowed = developer ? ['accountant', 'manager', 'owner'] : ['accountant', 'manager']
  return html`<form method="post" action="/portal/access">
    <input type="hidden" name="branch" value="${branch}">
    <input type="hidden" name="expected" value="${grant?.role ?? 'none'}">
    ${
      grant
        ? html`<input type="hidden" name="email" value="${grant.email}">`
        : html`<label>Gmail address <input name="email" type="email" required maxlength="254" autocomplete="off"></label>`
    }
    <label>Role <select name="role">
      ${allowed.map((role) => html`<option value="${role}" ${role === grant?.role ? 'selected' : ''}>${role}</option>`)}
      ${grant ? html`<option value="revoke">Revoke access</option>` : ''}
    </select></label>
    <button type="submit">${grant ? 'Apply change' : 'Assign access'}</button></form>`
}

function settlementGrantForm(branch: string, grant: Grant) {
  const action = grant.settlement_enabled ? 'Remove settlement access' : 'Allow settlement access'
  return html`<form method="post" action="/portal/access/settlements">
    <input type="hidden" name="branch" value="${branch}">
    <input type="hidden" name="email" value="${grant.email}">
    <input type="hidden" name="enabled" value="${grant.settlement_enabled ? '0' : '1'}">
    <button type="submit" aria-label="${action} for ${grant.email}">${action}</button></form>`
}

export const grantRoutes = new Hono<PortalEnv>()

grantRoutes.get('/', async (c) => {
  const actor = c.get('email')
  const developer = actor === developerEmail(c.env)
  const scope = [Number(developer), actor]
  const branches = (
    await c.env.DB.prepare(`${managedBranches} ORDER BY b.branch_id`)
      .bind(...scope)
      .all<{ branch_id: string }>()
  ).results
  if (!developer && !branches.length) return c.text('Access management permission required.', 403)
  const branch = c.req.query('branch') ?? branches[0]?.branch_id
  if (branch !== undefined && !branches.some((b) => b.branch_id === branch)) return c.notFound()

  const [grants, changes, check] = await Promise.all([
    c.env.DB.prepare(`SELECT g.email, g.role, EXISTS (SELECT 1 FROM invoice_effective_grant e
      WHERE e.email = g.email AND e.branch_id = g.branch_id) AS eligible,
      EXISTS (SELECT 1 FROM json_each(s.members_json) WHERE value = g.email) AS listed,
      EXISTS (SELECT 1 FROM invoice_accountant_settlement_grant a
        WHERE a.email = g.email AND a.branch_id = g.branch_id) AS settlement_enabled
      FROM invoice_grant g CROSS JOIN invoice_access_sync s
      WHERE g.branch_id IN (${managedBranches}) AND g.branch_id = ?3 ORDER BY g.email`)
      .bind(...scope, branch ?? null)
      .all<Grant>(),
    c.env.DB.prepare(`WITH branch_history AS (
      SELECT actor, email, old_role, new_role, changed_at, NULL AS settlement_enabled, rowid AS seq
      FROM invoice_grant_change WHERE branch_id = ?3
      UNION ALL
      SELECT actor, email, NULL, NULL, changed_at, enabled, rowid
      FROM invoice_settlement_grant_change WHERE branch_id = ?3
    )
    SELECT actor, email, old_role, new_role, changed_at, settlement_enabled FROM branch_history
    WHERE ?3 IN (${managedBranches}) ORDER BY changed_at DESC, seq DESC LIMIT 50`)
      .bind(...scope, branch ?? null)
      .all<Change>(),
    c.env.DB.prepare('SELECT checked_at, status FROM invoice_access_sync WHERE id = 1').first<{
      checked_at: string | null
      status: string
    }>(),
  ])
  const syncText =
    c.env.ACCESS_POLICY_SYNC_ENABLED !== 'true'
      ? 'Automatic Google allowlist sync is off.'
      : check?.status === 'failed'
        ? 'The last Google allowlist sync failed. A retry is scheduled.'
        : check?.checked_at
          ? `Google allowlist last checked at ${check.checked_at}.`
          : 'Awaiting the first Google allowlist sync.'
  return c.html(html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>Branch access · Royal Glow</title></head><body><main>
    ${developer ? '' : html`<nav aria-label="Invoice portal"><a href="/portal/home">Dashboard</a><a href="/portal/search">Invoice search</a></nav>`}
    <h1>Branch access</h1><p>${syncText}</p>
    ${
      branch
        ? html`<form method="get"><label>Branch <select name="branch">
      ${branches.map((b) => html`<option ${b.branch_id === branch ? 'selected' : ''}>${b.branch_id}</option>`)}
      </select></label><button>View branch</button></form>
      <h2>Assign access</h2>${grantForm(branch, developer)}
      <h2>Current grants</h2>
      ${
        !developer && grants.results.some((g) => g.role === 'accountant' && g.eligible)
          ? html`<p>Settlement access lets an accountant view this branch’s amounts due and receivable.</p>`
          : ''
      }
      ${
        grants.results.length
          ? html`<ul>${grants.results.map(
              (g) =>
                html`<li>${g.email} · ${g.role} · ${!g.eligible ? 'Staff assignment required' : g.listed ? 'Listed at last Google allowlist check' : 'Awaiting Google allowlist confirmation'}
        ${developer || g.role !== 'owner' ? grantForm(branch, developer, g) : ''}
        ${!developer && g.role === 'accountant' && g.eligible ? settlementGrantForm(branch, g) : ''}</li>`,
            )}</ul>`
          : 'No grants for this branch.'
      }
      <h2>Recent changes</h2>
      ${
        changes.results.length
          ? html`<ul>${changes.results.map(
              (change) =>
                html`<li><time datetime="${change.changed_at}">${formatDateIN(new Date(change.changed_at))}</time> · ${change.actor} ·
          ${change.email} · ${
            change.settlement_enabled === null
              ? `${change.old_role ?? 'unassigned'} → ${change.new_role ?? 'revoked'}`
              : change.settlement_enabled
                ? 'Settlement access allowed'
                : 'Settlement access removed'
          }</li>`,
            )}</ul>`
          : 'No recorded changes.'
      }`
        : html`<p>No branches have been provisioned.</p>`
    }
    </main></body></html>`)
})

grantRoutes.post('/', accessFormLimit, async (c) => {
  if (c.req.header('origin') !== new URL(c.req.url).origin)
    return c.text('Same-origin form required.', 403)
  if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') {
    return c.text('Expected an access form.', 415)
  }
  const parsed = form.safeParse(await c.req.parseBody({ all: true }))
  if (!parsed.success) return c.text('Check the branch, Gmail address and role.', 400)
  const { branch, email, expected, role } = parsed.data
  const actor = c.get('email')
  const designated = developerEmail(c.env)
  const developer = actor === designated
  if (email === designated || (!developer && (role === 'owner' || expected === 'owner'))) {
    return c.text('This grant cannot be assigned by this account.', 403)
  }
  const authorized = c.env.DB.prepare(
    `SELECT 1 FROM (${managedBranches}) WHERE branch_id = ?3`,
  ).bind(Number(developer), actor, branch)
  if (!(await authorized.first()))
    return c.text('Access management permission required for this branch.', 403)
  const changeId = crypto.randomUUID()
  const nextRole = role === 'revoke' ? null : role
  // Recheck actor, branch, target eligibility and displayed prior role inside the same write transaction.
  const audit =
    c.env.DB.prepare(`INSERT INTO invoice_grant_change (id, actor, email, branch_id, old_role, new_role)
    SELECT ?4, ?2, ?5, b.branch_id, g.role, ?6 FROM (${managedBranches}) b
    LEFT JOIN invoice_grant g ON g.branch_id = b.branch_id AND g.email = ?5
    WHERE b.branch_id = ?3 AND g.role IS ?7 AND g.role IS NOT ?6
    AND (?6 IS NULL OR ?6 = 'accountant' OR EXISTS (SELECT 1 FROM invoice_staff_assignment s
      WHERE s.branch_id = b.branch_id AND s.email = ?5 AND s.role = ?6))`).bind(
      Number(developer),
      actor,
      branch,
      changeId,
      email,
      nextRole,
      expected === 'none' ? null : expected,
    )
  const mutation =
    nextRole === null
      ? c.env.DB.prepare(`DELETE FROM invoice_grant WHERE (email, branch_id) IN
        (SELECT email, branch_id FROM invoice_grant_change WHERE id = ?)`)
      : c.env.DB.prepare(`INSERT INTO invoice_grant(email, branch_id, role)
        SELECT email, branch_id, new_role FROM invoice_grant_change WHERE id = ?
        ON CONFLICT(email, branch_id) DO UPDATE SET role = excluded.role`)
  const [written] = await c.env.DB.batch([audit, mutation.bind(changeId)])
  if (written?.meta.changes !== 1)
    return c.text('No change saved. Check the current grant and verified staff assignment.', 409)
  return c.redirect(`/portal/access?branch=${encodeURIComponent(branch)}`, 303)
})

grantRoutes.post('/settlements', accessFormLimit, async (c) => {
  if (c.req.header('origin') !== new URL(c.req.url).origin)
    return c.text('Same-origin form required.', 403)
  if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
    return c.text('Expected an access form.', 415)
  const parsed = settlementFormInput.safeParse(await c.req.parseBody({ all: true }))
  if (!parsed.success) return c.text('Check the branch, Gmail address and settlement access.', 400)
  const { branch, email, enabled } = parsed.data
  const actor = c.get('email')
  const { DB: db } = c.env
  const ownsBranch = `SELECT 1 FROM invoice_effective_grant
    WHERE email = ?1 AND branch_id = ?2 AND role = 'owner'`
  if (!(await db.prepare(ownsBranch).bind(actor, branch).first()))
    return c.text('Branch owner permission required.', 403)
  const id = crypto.randomUUID()
  const audit = db
    .prepare(`INSERT INTO invoice_settlement_grant_change (id, actor, email, branch_id, enabled)
    SELECT ?3, ?1, g.email, g.branch_id, ?5 FROM invoice_effective_grant g
    WHERE g.email = ?4 AND g.branch_id = ?2 AND g.role = 'accountant'
      AND EXISTS (${ownsBranch})
      AND EXISTS (SELECT 1 FROM invoice_accountant_settlement_grant a
        WHERE a.email = g.email AND a.branch_id = g.branch_id) <> ?5`)
    .bind(actor, branch, id, email, Number(enabled))
  const mutation =
    enabled === '1'
      ? db.prepare(`INSERT INTO invoice_accountant_settlement_grant (email, branch_id)
      SELECT email, branch_id FROM invoice_settlement_grant_change WHERE id = ?`)
      : db.prepare(`DELETE FROM invoice_accountant_settlement_grant WHERE (email, branch_id) IN
      (SELECT email, branch_id FROM invoice_settlement_grant_change WHERE id = ?)`)
  const [written] = await db.batch([audit, mutation.bind(id)])
  if (written?.meta.changes !== 1)
    return c.text('No change saved. Check the current accountant and settlement grants.', 409)
  return c.redirect(`/portal/access?branch=${encodeURIComponent(branch)}`, 303)
})
