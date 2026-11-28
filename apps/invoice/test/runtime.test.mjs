import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'

const issuer = 'https://rgss-fixture.cloudflareaccess.com'
const audience = 'invoice-runtime-test'
const secret = randomBytes(32).toString('hex')
const rosterSecret = randomBytes(32).toString('hex')
const webhookKey = randomBytes(24)
const event = {
  version: 1,
  type: 'invoice.issued',
  source: 'staging',
  eventId: 'event-1',
  invoiceId: 'invoice-1',
  branchId: 'branch-1',
  bookingId: 'booking-1',
  invoice: {
    templateVersion: 'takumi-v1',
    invoiceNumber: 'TEST/2627/000001',
    issuedAt: '2026-11-25T19:00:00.000Z',
    paymentMethod: 'upi',
    bookingNumber: 'BK-PROBE-1',
    invoiceType: 'service',
    taxReviewStatus: 'provisional',
    seller: { name: 'Royal Glow test branch', addressLines: ['Synthetic address, Bengaluru'] },
    customer: { name: 'Zoë Martín · అమృత · ಅಮೃತ' },
    items: [{ name: 'Sample service', quantity: 1, unitPricePaise: 50000, totalPricePaise: 50000 }],
    totals: {
      subtotalPaise: 50000,
      discountPaise: 0,
      taxableValuePaise: 50000,
      cgstPaise: 0,
      sgstPaise: 0,
      gstPaise: 0,
      totalPaise: 50000,
    },
  },
}

async function exerciseInvoiceWorker(t, legacyResendEnabled) {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256' }
  const dist = new URL('../dist/worker/', import.meta.url)
  const files = await readdir(dist)
  const modules = await Promise.all(
    files
      .filter((file) => file === 'worker.js' || /\.(woff2|png|wasm)$/.test(file))
      .map(async (file) => ({
        type: file === 'worker.js' ? 'ESModule' : file.endsWith('.wasm') ? 'CompiledWasm' : 'Data',
        path: fileURLToPath(new URL(file, dist)),
        contents: await readFile(new URL(file, dist)),
      })),
  )
  modules.sort((a, b) => Number(b.type === 'ESModule') - Number(a.type === 'ESModule'))
  const attempts = []
  const providerResponses = new Map()
  let failNextDelivery = false
  let callbackBeforeAck
  const developer = 'developer.test@gmail.com'
  const policyId = '11111111-1111-4111-b111-111111111111'
  const idpId = '22222222-2222-4222-b222-222222222222'
  const accountId = '3'.repeat(32)
  const policy = {
    id: policyId,
    account_id: accountId,
    app_count: 1,
    reusable: true,
    name: 'rgss-invoice-staging-portal',
    decision: 'allow',
    include: [{ email: { email: developer } }],
    require: [{ login_method: { id: idpId } }],
    exclude: [{ geo: { country_code: 'XX' } }],
    session_duration: '8h',
  }
  const policyWrites = []
  let policyOffline = false
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules,
      modulesRoot: fileURLToPath(dist),
      compatibilityDate: '2026-11-26',
      cf: false,
      unsafeTriggerHandlers: true,
      bindings: {
        ACCESS_TEAM: 'rgss-fixture',
        ACCESS_AUDIENCE: audience,
        ACCESS_DEVELOPER_EMAIL: developer,
        ACCESS_POLICY_SYNC_ENABLED: 'true',
        ACCESS_ACCOUNT_ID: accountId,
        ACCESS_POLICY_ID: policyId,
        ACCESS_GOOGLE_IDP_ID: idpId,
        ACCESS_POLICY_TOKEN: 'fixture-policy-token',
        BILLING_SOURCE: 'staging',
        BILLING_EVENT_SECRET: secret,
        INVOICE_ROSTER_SECRET: rosterSecret,
        INVOICE_EMAIL_ENABLED: 'true',
        ...(legacyResendEnabled ? { INVOICE_LEGACY_RESEND_ENABLED: 'true' } : {}),
        RESEND_API_KEY: 'fixture-resend-key',
        RESEND_FROM_EMAIL: 'Royal Glow <test@example.invalid>',
        RESEND_WEBHOOK_SECRET: `whsec_${webhookKey.toString('base64')}`,
      },
      d1Databases: ['DB', 'RESTORE_DB'],
      r2Buckets: ['FILES', 'RESTORE_FILES'],
      durableObjects: {
        PDF: { className: 'InvoicePdf', useSQLite: true },
        ACCESS_SYNC: { className: 'InvoiceAccessSync', useSQLite: true },
        REGISTER: { className: 'InvoiceRegister', useSQLite: true },
      },
      outboundService: async (request) => {
        if (new URL(request.url).hostname === 'api.cloudflare.com') {
          assert.equal(
            request.url,
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/policies/${policyId}`,
          )
          assert.equal(request.headers.get('authorization'), 'Bearer fixture-policy-token')
          if (policyOffline) return new Response(null, { status: 503 })
          if (request.method === 'PUT') {
            const body = await request.json()
            assert.deepEqual(body.require, policy.require)
            assert.deepEqual(body.exclude, policy.exclude)
            assert.equal(body.session_duration, policy.session_duration)
            assert.equal(body.decision, 'allow')
            assert.equal(body.id, undefined)
            policyWrites.push(body)
            policy.include = body.include
          } else assert.equal(request.method, 'GET')
          return Response.json({ success: true, result: policy })
        }
        if (new URL(request.url).hostname === 'api.resend.com') {
          const key = request.headers.get('idempotency-key')
          const authorization = request.headers.get('authorization')
          const body = await request.json()
          attempts.push({ key, authorization, body })
          const response = providerResponses.get(body.subject)
          if (response) {
            providerResponses.delete(body.subject)
            return response
          }
          const providerId = key === attempts[0].key ? 'fixture-provider-id' : key.split('/').at(-1)
          if (callbackBeforeAck) {
            await callbackBeforeAck(providerId, body)
            return Response.json({ message: 'Simulated lost receipt' }, { status: 503 })
          }
          const unavailable = attempts.length === 1 || failNextDelivery
          failNextDelivery = false
          return unavailable
            ? Response.json({ message: 'Simulated temporary failure' }, { status: 503 })
            : Response.json({ id: providerId })
        }
        assert.equal(request.url, `${issuer}/cdn-cgi/access/certs`)
        return Response.json({ keys: [jwk] })
      },
    }),
  )

  try {
    const db = await runtime.getD1Database('DB')
    const files = await runtime.getR2Bucket('FILES')
    const grants = [
      ['owner.test@gmail.com', 'branch-1', 'owner'],
      ['ca.test@gmail.com', 'branch-1', 'accountant'],
      ['other.test@gmail.com', 'branch-2', 'manager'],
    ]
    const migrationDir = new URL('../migrations/', import.meta.url)
    for (const name of (await readdir(migrationDir))
      .filter((file) => file.endsWith('.sql'))
      .sort()) {
      const migration = await readFile(new URL(name, migrationDir), 'utf8')
      if (name.startsWith('0003_')) {
        await db.batch(
          grants.map((grant) =>
            db.prepare('INSERT INTO invoice_grant VALUES (?, ?, ?)').bind(...grant),
          ),
        )
      }
      await db.batch(unstable_splitSqlQuery(migration).map((sql) => db.prepare(sql)))
    }
    assert.deepEqual((await db.prepare('SELECT role FROM invoice_effective_grant').all()).results, [
      { role: 'accountant' },
    ])
    await db.batch(
      grants
        .filter((g) => g[2] !== 'accountant')
        .map((grant) =>
          db.prepare('INSERT INTO invoice_staff_assignment VALUES (?, ?, ?)').bind(...grant),
        ),
    )

    const access = async (email, aud = audience) => ({
      'cf-access-jwt-assertion': await new SignJWT({ email })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(issuer)
        .setAudience(aud)
        .setSubject(email)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey),
    })
    const call = (path, init) => runtime.dispatchFetch(`https://invoice.staging.test${path}`, init)
    const send = (data, time = Date.now(), signed = true, path = '/internal/v1/invoice-events') => {
      const body = typeof data === 'string' ? data : JSON.stringify(data)
      const signature = createHmac('sha256', secret).update(`${time}.${body}`).digest('hex')
      return call(path, {
        method: 'POST',
        body,
        headers: {
          'x-rgss-timestamp': String(time),
          'x-rgss-signature': signed ? signature : '0'.repeat(64),
        },
      })
    }

    assert.equal((await send(event, Date.now(), false)).status, 401)
    assert.equal((await send(event, Date.now() - 600_000)).status, 401)
    assert.equal((await send({ ...event, source: 'prod' })).status, 400)
    assert.equal((await send(event)).status, 201)
    assert.equal((await send(event)).status, 204)
    assert.equal((await send({ ...event, branchId: 'branch-2' })).status, 409)

    const search = '/portal/search?booking=booking-1'
    const download = '/portal/invoices/invoice-1/pdf'
    const owner = await access(grants[0][0])
    const ca = await access(grants[1][0])
    const other = await access(grants[2][0])
    if (!legacyResendEnabled) {
      const service = {
        ...event,
        eventId: 'cutover-service',
        invoiceId: 'cutover-service',
        invoice: {
          ...event.invoice,
          invoiceNumber: 'CUTOVER-LEGACY',
          taxReviewStatus: 'reviewed',
          paymentStatus: 'paid',
          customer: { ...event.invoice.customer, email: 'cutover@example.invalid' },
        },
      }
      const emailPage = '/portal/invoices/cutover-service/email'
      const queue = (path) =>
        call(path, {
          method: 'POST',
          redirect: 'manual',
          headers: { ...owner, origin: 'https://invoice.staging.test' },
          body: new URLSearchParams({ operationId: randomUUID() }),
        })
      assert.equal((await send(service)).status, 201)
      const legacy = await call(emailPage, { headers: owner })
      assert.equal(legacy.status, 200)
      assert.match(await legacy.text(), /imported without email history/)
      assert.equal((await queue(emailPage)).status, 409)

      assert.equal(
        (
          await send({
            ...service,
            eventId: 'cutover-automated',
            invoiceId: 'cutover-automated',
            invoice: { ...service.invoice, invoiceNumber: 'CUTOVER-WORKER' },
            delivery: { mode: 'automatic', completed: true, paid: true },
          })
        ).status,
        201,
      )
      await db
        .prepare(
          "UPDATE invoice_delivery SET state = 'accepted' WHERE invoice_id = 'cutover-automated'",
        )
        .run()
      const automaticPage = '/portal/invoices/cutover-automated/email'
      const automatic = await call(automaticPage, { headers: owner })
      assert.equal(automatic.status, 200)
      assert.match(await automatic.text(), /Queue invoice email/)
      assert.equal((await queue(automaticPage)).status, 303)
      assert.equal(attempts.length, 0)
      return
    }
    const worker = await runtime.getWorker()
    const sweep = () => worker.scheduled({ cron: '*/5 * * * *' })
    const accessPath = '/portal/access'
    const edit = (
      identity,
      email,
      role,
      expected = 'none',
      branch = 'branch-1',
      origin = 'https://invoice.staging.test',
    ) =>
      call(accessPath, {
        method: 'POST',
        redirect: 'manual',
        headers: { ...identity, origin, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email, role, expected, branch }).toString(),
      })
    await t.test('branch grants, management-only developer and read-only accountant', async () => {
      const dev = await access(developer)
      assert.equal((await call(accessPath)).status, 401)
      for (const identity of [other, ca, await access('unlisted.test@gmail.com')]) {
        assert.equal((await call(accessPath, { headers: identity })).status, 403)
        assert.equal((await edit(identity, 'fixture@gmail.com', 'accountant')).status, 403)
      }
      const response = await call(accessPath, { headers: owner })
      assert.equal(response.headers.get('referrer-policy'), 'same-origin')
      const ownerPage = await response.text()
      assert.match(ownerPage, /ca\.test@gmail\.com/)
      assert.doesNotMatch(ownerPage, /branch-2|other\.test@gmail\.com/)
      assert.equal((await call(`${accessPath}?branch=branch-2`, { headers: owner })).status, 404)
      assert.equal(
        (await edit(owner, 'fixture@gmail.com', 'accountant', 'none', 'branch-2')).status,
        403,
      )
      assert.equal(
        (
          await edit(
            owner,
            'fixture@gmail.com',
            'accountant',
            'none',
            'branch-1',
            'https://foreign.test',
          )
        ).status,
        403,
      )
      assert.equal((await edit(owner, 'fixture@example.com', 'accountant')).status, 400)
      assert.equal(
        (await edit(owner, 'fixture@gmail.com', 'accountant', 'none', 'branch-1', 'null')).status,
        403,
      )
      assert.equal((await edit(owner, developer, 'accountant')).status, 403)
      assert.equal((await edit(owner, grants[0][0], 'accountant', 'owner')).status, 403)
      assert.equal((await edit(owner, grants[0][0], 'revoke', 'accountant')).status, 409)
      assert.equal((await edit(owner, 'fixture@gmail.com', 'manager')).status, 409)
      assert.equal((await edit(dev, 'fixture@gmail.com', 'owner')).status, 409)
      assert.equal((await call(`${accessPath}?branch=branch-2`, { headers: dev })).status, 200)
      for (const path of [search, download])
        assert.equal((await call(path, { headers: dev })).status, 403)
      assert.equal(
        (await call('/portal/home', { headers: dev, redirect: 'manual' })).headers.get('location'),
        accessPath,
      )
      const target = 'new.staff@gmail.com'
      const member = await access(target)
      assert.equal((await edit(owner, ' New.Staff@GMAIL.com ', 'accountant')).status, 303)
      assert.equal((await edit(owner, target, 'accountant')).status, 409)
      assert.match(await (await call(search, { headers: member })).text(), /TEST\/2627\/000001/)
      await db
        .prepare('INSERT INTO invoice_staff_assignment VALUES (?, ?, ?)')
        .bind(target, 'branch-1', 'manager')
        .run()
      assert.equal((await edit(owner, target, 'manager', 'accountant')).status, 303)
      assert.equal((await edit(owner, target, 'revoke', 'accountant')).status, 409)
      await db.prepare('DELETE FROM invoice_staff_assignment WHERE email=?').bind(target).run()
      assert.equal((await call(search, { headers: member })).status, 403)
      await db
        .prepare('INSERT INTO invoice_staff_assignment VALUES (?, ?, ?)')
        .bind(target, 'branch-2', 'owner')
        .run()
      assert.equal((await edit(dev, target, 'owner', 'none', 'branch-2')).status, 303)
      assert.doesNotMatch(
        await (await call(search, { headers: member })).text(),
        /TEST\/2627\/000001/,
      )
      assert.equal((await edit(owner, target, 'revoke', 'manager')).status, 303)
      assert.equal((await edit(dev, target, 'revoke', 'owner', 'branch-2')).status, 303)
      assert.deepEqual(
        (
          await db
            .prepare(
              'SELECT actor, old_role, new_role FROM invoice_grant_change WHERE email=? ORDER BY rowid',
            )
            .bind(target)
            .all()
        ).results,
        [
          { actor: grants[0][0], old_role: null, new_role: 'accountant' },
          { actor: grants[0][0], old_role: 'accountant', new_role: 'manager' },
          { actor: developer, old_role: null, new_role: 'owner' },
          { actor: grants[0][0], old_role: 'manager', new_role: null },
          { actor: developer, old_role: 'owner', new_role: null },
        ],
      )
    })
    assert.equal((await call(search)).status, 401)
    assert.equal(
      (await call(search, { headers: await access(grants[0][0], 'wrong-audience') })).status,
      401,
    )
    assert.equal(
      (await call(search, { headers: await access('unlisted.test@gmail.com') })).status,
      403,
    )
    assert.match(await (await call(search, { headers: owner })).text(), /TEST\/2627\/000001/)
    assert.match(await (await call(search, { headers: other })).text(), /No matching invoice/)
    assert.equal((await call(download, { headers: other })).status, 404)
    assert.equal((await call(download, { headers: ca, method: 'POST' })).status, 404)
    assert.equal((await files.list({ prefix: 'pdf-cache/' })).objects.length, 0)

    async function readPdf(headers, path = download) {
      const response = await call(path, { headers })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'application/pdf')
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      const pdf = Buffer.from(await response.arrayBuffer())
      assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
      return pdf
    }

    const [ownerPdf, caPdf] = await Promise.all([readPdf(owner), readPdf(ca)])
    assert.deepEqual(ownerPdf, caPdf)
    const [cached] = (await files.list({ prefix: 'pdf-cache/' })).objects
    assert.ok(cached)
    assert.deepEqual(await readPdf(owner), ownerPdf)
    await files.delete(cached.key)
    assert.equal((await files.list({ prefix: 'records/' })).objects.length, 1)
    await readPdf(owner)
    assert.equal((await files.list({ prefix: 'pdf-cache/' })).objects.length, 1)

    const [snapshot] = (await files.list({ prefix: 'records/' })).objects
    assert.ok(snapshot)
    await files.delete(cached.key)
    await files.put(
      snapshot.key,
      JSON.stringify({ ...event, invoice: { ...event.invoice, notes: 'changed' } }),
    )
    assert.equal((await call(download, { headers: owner })).status, 503)
    assert.equal((await files.list({ prefix: 'pdf-cache/' })).objects.length, 0)
    await files.delete(snapshot.key)
    assert.equal((await send(event)).status, 204)
    await readPdf(owner)

    await t.test('allowlist convergence, failed sync and immediate branch revocation', async () => {
      const syncObject = (await runtime.getDurableObjectNamespace('ACCESS_SYNC')).getByName(
        'portal-policy',
      )
      const sync = () => syncObject.reconcile()
      const caAddress = grants[1][0]
      const allowed = () => policy.include.map((rule) => rule.email.email)
      await Promise.all([sync(), sync()])
      assert.equal(policyWrites.length, 1)
      assert.deepEqual(allowed(), [developer, ...grants.map((g) => g[0])].sort())
      const dev = await access(developer)
      assert.equal((await edit(dev, caAddress, 'accountant', 'none', 'branch-2')).status, 303)
      assert.equal((await edit(owner, caAddress, 'revoke', 'accountant')).status, 303)
      await sync()
      assert.equal(policyWrites.length, 1)
      assert.equal((await call(download, { headers: ca })).status, 404)
      assert.ok(allowed().includes(caAddress))
      policyOffline = true
      assert.equal((await edit(dev, caAddress, 'revoke', 'accountant', 'branch-2')).status, 303)
      await assert.rejects(sync())
      assert.equal((await call(download, { headers: ca })).status, 403)
      assert.match(
        await (await call(accessPath, { headers: owner })).text(),
        /last Google allowlist sync failed/,
      )
      policyOffline = false
      policy.app_count = 2
      await assert.rejects(sync())
      assert.equal(policyWrites.length, 1)
      policy.app_count = 1
      await sweep()
      assert.ok(!allowed().includes(caAddress))
      assert.equal(policyWrites.length, 2)
    })

    const eligible = {
      ...event,
      eventId: 'event-email',
      invoiceId: 'invoice-email',
      bookingId: 'booking-email',
      delivery: { mode: 'automatic', completed: true, paid: true },
      invoice: {
        ...event.invoice,
        invoiceNumber: 'TEST/2627/000002',
        taxReviewStatus: 'reviewed',
        paymentStatus: 'paid',
        customer: { ...event.invoice.customer, email: 'customer@example.invalid' },
      },
    }
    assert.equal(
      (await send({ ...eligible, delivery: { ...eligible.delivery, paid: false } })).status,
      400,
    )
    assert.equal((await send(eligible)).status, 201)
    assert.equal((await send(eligible)).status, 204)
    const delivery = () =>
      db.prepare('SELECT invoice_id, state, attempts, provider_id FROM invoice_delivery').all()
    assert.deepEqual((await delivery()).results, [
      { invoice_id: 'invoice-email', state: 'queued', attempts: 0, provider_id: null },
    ])

    await sweep()
    assert.equal((await delivery()).results[0].state, 'retry')
    await db.prepare('UPDATE invoice_delivery SET due_at = 0').run()
    await Promise.all([sweep(), sweep()])
    assert.equal(
      attempts.length,
      2,
      JSON.stringify(await db.prepare('SELECT state, failure FROM invoice_delivery').first()),
    )
    assert.deepEqual((await delivery()).results, [
      {
        invoice_id: 'invoice-email',
        state: 'accepted',
        attempts: 2,
        provider_id: 'fixture-provider-id',
      },
    ])
    assert.deepEqual(attempts[0], attempts[1])
    assert.match(attempts[0].key, /^rgss\/staging\/[a-f0-9]{64}\/initial$/)
    assert.equal(attempts[0].authorization, 'Bearer fixture-resend-key')
    assert.deepEqual(attempts[0].body.to, ['customer@example.invalid'])
    const attachment = Buffer.from(attempts[0].body.attachments[0].content, 'base64')
    assert.equal(attachment.subarray(0, 5).toString('ascii'), '%PDF-')
    await sweep()
    assert.equal(attempts.length, 2)

    const provisional = {
      ...eligible,
      eventId: 'provisional',
      invoiceId: 'provisional',
      invoice: {
        ...eligible.invoice,
        invoiceNumber: 'TEST/2627/000003',
        taxReviewStatus: 'provisional',
      },
    }
    assert.equal((await send(provisional)).status, 201)
    assert.equal((await delivery()).results.length, 1)

    const late = {
      ...eligible,
      eventId: 'late',
      invoiceId: 'late',
      invoice: { ...eligible.invoice, invoiceNumber: 'TEST/2627/000004' },
    }
    assert.equal((await send(late)).status, 201)
    await db
      .prepare(`UPDATE invoice_delivery SET state = 'sending', due_at = 0,
      attempts = 1, first_attempt_at = ?, request_hash = 'previous-request' WHERE invoice_id = ?`)
      .bind(Date.now() - 13 * 60 * 60 * 1000, late.invoiceId)
      .run()
    await sweep()
    assert.equal(
      (
        await db
          .prepare('SELECT state FROM invoice_delivery WHERE invoice_id = ?')
          .bind(late.invoiceId)
          .first()
      ).state,
      'uncertain',
    )
    assert.equal(attempts.length, 2)

    await t.test(
      'dashboard totals and recent invoices respect branch grants and IST month boundaries',
      async () => {
        const dashboard = '/portal/home?month=2026-12'
        const fixtures = [
          ['before-december', 'branch-1', '2026-11-30T18:29:59.999Z'],
          ['first-december', 'branch-1', '2026-11-30T18:30:00Z'],
          ['later-december', 'branch-1', '2026-11-30T18:30:00.001Z'],
          ['other-branch', 'branch-2', '2026-12-12T12:00:00Z'],
          ['after-december', 'branch-1', '2026-12-31T18:30:00Z'],
        ]
        for (const [id, branchId, issuedAt] of fixtures) {
          assert.equal(
            (
              await send({
                ...event,
                eventId: id,
                invoiceId: id,
                branchId,
                invoice: { ...event.invoice, issuedAt, invoiceNumber: id },
              })
            ).status,
            201,
          )
        }
        const page = await call(dashboard, { headers: owner, redirect: 'manual' })
        assert.equal(page.status, 200)
        assert.equal(page.headers.get('cache-control'), 'private, no-store')
        const body = await page.text()
        assert.match(body, /₹1,000\.00/)
        assert.match(body, /later-december[\s\S]*first-december/)
        assert.doesNotMatch(body, /before-december|after-december|other-branch|branch-2/)
        assert.match(
          await (await call(`${dashboard}&branch=`, { headers: owner })).text(),
          /₹1,000\.00/,
        )
        assert.equal((await call(`${dashboard}&branch=branch-2`, { headers: owner })).status, 404)
        assert.equal((await call('/portal/home?month=2026-13', { headers: owner })).status, 400)
        assert.match(
          await (await call('/portal/home?month=2026-10', { headers: owner })).text(),
          /₹0\.00/,
        )
        assert.equal((await call(dashboard)).status, 401)
        assert.equal(
          (
            await call(dashboard, { headers: await access(developer), redirect: 'manual' })
          ).headers.get('location'),
          accessPath,
        )
        const managerPage = await (await call(dashboard, { headers: other })).text()
        assert.match(managerPage, /other-branch/)
        assert.doesNotMatch(managerPage, /later-december/)
        assert.equal((await edit(owner, grants[1][0], 'accountant')).status, 303)
        assert.match(await (await call(dashboard, { headers: ca })).text(), /₹1,000\.00/)
        assert.equal((await call(dashboard, { headers: ca, method: 'POST' })).status, 404)
        assert.equal(
          (await edit(await access(developer), grants[1][0], 'accountant', 'none', 'branch-2'))
            .status,
          303,
        )
        assert.match(await (await call(dashboard, { headers: ca })).text(), /₹1,500\.00/)
        assert.match(
          await (await call(`${dashboard}&branch=branch-2`, { headers: ca })).text(),
          /₹500\.00/,
        )
        assert.equal((await edit(owner, grants[1][0], 'revoke', 'accountant')).status, 303)
        assert.doesNotMatch(await (await call(dashboard, { headers: ca })).text(), /later-december/)
      },
    )

    await t.test(
      'signed roster imports revoke removed staff grants and reject stale or conflicting updates',
      async () => {
        const initial = {
          version: 1,
          type: 'staff.roster',
          source: 'staging',
          revision: 100,
          branches: ['branch-1', 'branch-2', 'branch-3'],
          assignments: [grants[0], grants[2]].map(([email, branchId, role]) => ({
            email,
            branchId,
            role,
          })),
        }
        const importRoster = (data, key = rosterSecret, timestamp = Date.now()) => {
          const body = JSON.stringify(data)
          return call('/internal/v1/staff-roster', {
            method: 'POST',
            body,
            headers: {
              'x-rgss-timestamp': String(timestamp),
              'x-rgss-signature': createHmac('sha256', key)
                .update(`${timestamp}.${body}`)
                .digest('hex'),
            },
          })
        }
        const dev = await access(developer)
        assert.equal((await importRoster(initial, secret)).status, 401)
        assert.equal((await importRoster(initial, rosterSecret, Date.now() - 600_000)).status, 401)
        assert.equal((await importRoster({ ...initial, source: 'prod' })).status, 400)
        assert.equal(
          (await importRoster({ ...initial, revision: (Date.now() + 900_000) * 1_000 })).status,
          400,
        )
        assert.equal(
          (await importRoster({ ...initial, oversized: 'x'.repeat(64 * 1024) })).status,
          413,
        )
        assert.equal((await importRoster({ ...initial, branches: ['branch-1'] })).status, 400)
        assert.equal(
          (
            await importRoster({
              ...initial,
              assignments: [initial.assignments[0], initial.assignments[0]],
            })
          ).status,
          400,
        )
        assert.equal((await importRoster(initial)).status, 201)
        assert.equal((await importRoster(initial)).status, 204)
        assert.equal(
          (await importRoster({ ...initial, branches: ['branch-1', 'branch-2'] })).status,
          409,
        )
        assert.match(await (await call(accessPath, { headers: dev })).text(), /branch-3/)
        const reduced = {
          ...initial,
          revision: 101,
          branches: ['branch-1'],
          assignments: [initial.assignments[0]],
        }
        assert.equal((await importRoster(reduced)).status, 201)
        assert.equal((await importRoster(initial)).status, 204)
        assert.equal((await call('/portal/home', { headers: other })).status, 403)
        assert.match(
          await (await call('/portal/home?month=2026-12', { headers: ca })).text(),
          /other-branch/,
        )
        assert.equal((await importRoster({ ...initial, revision: 102 })).status, 201)
        assert.equal((await call('/portal/home', { headers: other })).status, 403)
        const history = await (await call(`${accessPath}?branch=branch-2`, { headers: dev })).text()
        assert.match(history, /system:staff-roster ·\s+other\.test@gmail\.com · manager → revoked/)
        assert.equal((await edit(dev, grants[2][0], 'manager', 'none', 'branch-2')).status, 303)
        assert.equal((await call('/portal/home', { headers: other })).status, 200)

        await db
          .prepare(`CREATE TRIGGER fail_roster_receipt BEFORE UPDATE ON invoice_roster_state
          BEGIN SELECT RAISE(ABORT, 'simulated transaction failure'); END`)
          .run()
        assert.equal((await importRoster({ ...reduced, revision: 103 })).status, 503)
        assert.equal((await call('/portal/home', { headers: other })).status, 200)
        assert.equal(
          (await db.prepare('SELECT revision FROM invoice_roster_state').first()).revision,
          102,
        )
        await db.prepare('DROP TRIGGER fail_roster_receipt').run()
        const [older, newer] = await Promise.all([
          importRoster({ ...initial, revision: 103 }),
          importRoster({ ...reduced, revision: 104 }),
        ])
        assert.ok([201, 204].includes(older.status))
        assert.equal(newer.status, 201)
        assert.equal((await call('/portal/home', { headers: other })).status, 403)
      },
    )
    await t.test('signed reconciliation returns complete closed IST month totals', async () => {
      const path = '/internal/v1/invoice-events/reconcile'
      const request = {
        version: 1,
        type: 'invoice.reconciliation',
        source: 'staging',
        month: '2025-09',
      }
      const reconcile = (data = request, signed = true) => send(data, Date.now(), signed, path)
      const fixtures = [
        ['before-period', 'branch-1', '2025-08-31T18:29:59.999Z'],
        ['first-period', 'branch-1', '2025-08-31T18:30:00Z'],
        ['historical-branch', 'retired-branch', '2025-09-12T12:00:00Z'],
        ['last-period', 'branch-1', '2025-09-30T18:29:59.999Z'],
        ['after-period', 'branch-2', '2025-09-30T18:30:00.001Z'],
      ]
      for (const [id, branchId, issuedAt] of fixtures) {
        assert.equal(
          (
            await send({
              ...event,
              eventId: id,
              invoiceId: id,
              branchId,
              invoice: { ...event.invoice, issuedAt, invoiceNumber: id },
            })
          ).status,
          201,
        )
      }
      const listKeys = async () => (await files.list()).objects.map(({ key }) => key)
      const invoiceCount = () => db.prepare('SELECT COUNT(*) AS count FROM issued_invoice').first()
      const deliveryCount = () =>
        db.prepare('SELECT COUNT(*) AS count FROM invoice_delivery').first()
      const before = await Promise.all([listKeys(), invoiceCount(), deliveryCount()])
      const earliestCheck = Date.now()
      const response = await reconcile()
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      const report = await response.json()
      assert.ok(Date.parse(report.checkedAt) >= earliestCheck)
      assert.deepEqual(report, {
        version: 1,
        source: 'staging',
        month: '2025-09',
        checkedAt: report.checkedAt,
        branches: [
          { branchId: 'branch-1', invoiceCount: 2, totalPaise: 100000 },
          { branchId: 'retired-branch', invoiceCount: 1, totalPaise: 50000 },
        ],
      })
      assert.deepEqual(await Promise.all([listKeys(), invoiceCount(), deliveryCount()]), before)
      assert.equal((await reconcile(request, false)).status, 401)
      assert.equal((await reconcile({ ...request, source: 'prod' })).status, 400)
      assert.equal((await reconcile({ ...request, month: '2025-13' })).status, 400)
      assert.equal((await reconcile({ ...request, extra: true })).status, 400)
      const currentMonth = new Date(Date.now() + 19_800_000).toISOString().slice(0, 7)
      assert.equal((await reconcile({ ...request, month: currentMonth })).status, 400)
      assert.equal((await reconcile({ ...request, month: '9999-12' })).status, 400)
      const empty = await reconcile({ ...request, month: '2025-06' })
      assert.equal(empty.status, 200)
      assert.deepEqual((await empty.json()).branches, [])

      const detailRequest = {
        ...request,
        type: 'invoice.branch-reconciliation',
        branchId: 'branch-1',
      }
      const detail = await reconcile(detailRequest)
      assert.equal(detail.status, 200)
      assert.equal(detail.headers.get('cache-control'), 'private, no-store')
      const branchReport = await detail.json()
      assert.deepEqual(branchReport, {
        ...detailRequest,
        checkedAt: branchReport.checkedAt,
        invoices: [
          { invoiceId: 'first-period', totalPaise: 50000 },
          { invoiceId: 'last-period', totalPaise: 50000 },
        ],
      })
      const retired = await reconcile({ ...detailRequest, branchId: 'retired-branch' })
      assert.deepEqual((await retired.json()).invoices, [
        { invoiceId: 'historical-branch', totalPaise: 50000 },
      ])
      assert.equal((await reconcile({ ...detailRequest, month: currentMonth })).status, 400)
      assert.equal((await reconcile({ ...detailRequest, source: 'prod' })).status, 400)
      assert.equal((await reconcile({ ...detailRequest, branchId: '../private' })).status, 400)
      assert.equal((await reconcile(detailRequest, false)).status, 401)
      assert.deepEqual(await Promise.all([listKeys(), invoiceCount(), deliveryCount()]), before)

      await db
        .prepare(`WITH RECURSIVE fixture(n) AS (
          VALUES(1) UNION ALL SELECT n + 1 FROM fixture WHERE n < 2001
        )
        INSERT INTO issued_invoice
          (id, event_id, invoice_number, branch_id, issued_at, total_paise, snapshot_hash, snapshot_key)
        SELECT 'detail-cap-' || n, 'detail-cap-' || n, 'detail-cap-' || n, 'detail-cap-branch',
          '2025-09-12T12:00:00Z', 0, 'fixture', 'fixture'
        FROM fixture`)
        .run()
      assert.equal(
        (await reconcile({ ...detailRequest, branchId: 'detail-cap-branch' })).status,
        422,
      )
      await db.prepare("DELETE FROM issued_invoice WHERE branch_id = 'detail-cap-branch'").run()

      await db
        .prepare(
          `WITH RECURSIVE fixture(n) AS (
            VALUES(1) UNION ALL SELECT n + 1 FROM fixture WHERE n < 201
          )
          INSERT INTO issued_invoice
            (id, event_id, invoice_number, branch_id, issued_at, total_paise, snapshot_hash, snapshot_key)
          SELECT 'cap-' || n, 'cap-' || n, 'cap-' || n, 'capped-' || n,
            '2025-07-12T12:00:00Z', 0, 'fixture', 'fixture'
          FROM fixture`,
        )
        .run()
      assert.equal((await reconcile({ ...request, month: '2025-07' })).status, 503)

      await db
        .prepare(
          `INSERT INTO issued_invoice
            (id, event_id, invoice_number, branch_id, issued_at, total_paise, snapshot_hash, snapshot_key)
          VALUES
            ('large-1', 'large-1', 'large-1', 'branch-1', '2025-06-01T12:00:00Z', 9007199254740991, 'fixture', 'fixture'),
            ('large-2', 'large-2', 'large-2', 'branch-1', '2025-06-01T12:00:00Z', 1, 'fixture', 'fixture')`,
        )
        .run()
      assert.equal((await reconcile({ ...request, month: '2025-06' })).status, 503)
    })

    await t.test(
      'renders pdfcn invoices by saved version and regenerates from R2 snapshots',
      async () => {
        const exportFixtures = process.env.INVOICE_RUNTIME_PDF_FIXTURES === '1'
        const directory = new URL('../dist/pdf-fixtures/', import.meta.url)
        if (exportFixtures) {
          await mkdir(directory, { recursive: true })
          await writeFile(new URL('takumi-v1.pdf', directory), ownerPdf)
        }

        const createFixture = (kind, count) => {
          const id = `pdfcn-${kind}`
          return {
            ...event,
            eventId: id,
            invoiceId: id,
            bookingId: `booking-${id}`,
            invoice: {
              ...event.invoice,
              templateVersion: 'takumi-v2',
              invoiceNumber: `RG/2627/${kind === 'regular' ? '000002' : '000003'}`,
              bookingNumber: `BK-${kind.toUpperCase()}`,
              taxReviewStatus: kind === 'regular' ? 'reviewed' : 'provisional',
              paymentStatus: 'paid',
              notes: 'For appointment questions, quote <reference> & invoice number.',
              seller: {
                name: 'Royal Glow Salon & Spa',
                legalName: 'Royal Glow Example LLP',
                addressLines: ['19 Sample Road', 'Bengaluru, Karnataka 560001'],
                gstin: '29ABCDE1234F1Z5',
                state: 'Karnataka',
              },
              items: Array.from({ length: count }, (_, i) => ({
                name: i === 0 ? 'Hair and scalp care · ಅಮೃತ · లత · आरती' : `Service line ${i + 1}`,
                quantity: 2,
                unitPricePaise: 59000,
                totalPricePaise: 118000,
                sacCode: '999721',
                rateBps: 1800,
                discountPaise: 5900,
                taxableValuePaise: 95000,
                taxPaise: 17100,
                cgstPaise: 8550,
                sgstPaise: 8550,
              })),
              totals: {
                subtotalPaise: 118000 * count,
                discountPaise: 5900 * count,
                taxableValuePaise: 95000 * count,
                cgstPaise: 8550 * count,
                sgstPaise: 8550 * count,
                gstPaise: 17100 * count,
                totalPaise: 112100 * count,
              },
            },
          }
        }

        const regular = createFixture('regular', 3)
        assert.equal(
          (await send({ ...regular, invoice: { ...regular.invoice, templateVersion: 'unknown' } }))
            .status,
          400,
        )
        for (const fixture of [regular, createFixture('large', 60)]) {
          assert.equal((await send(fixture)).status, 201)
          assert.equal((await send(fixture)).status, 204)
          const path = `/portal/invoices/${fixture.invoiceId}/pdf`
          assert.equal((await call(path, { headers: other })).status, 403)
          const pdf = await readPdf(owner, path)
          const pages = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length
          assert.ok(
            fixture === regular ? pages === 1 : pages > 1,
            `Unexpected page count: ${pages}`,
          )
          const [cache] = (await files.list({ prefix: `pdf-cache/${fixture.invoiceId}/` })).objects
          assert.ok(cache)
          assert.deepEqual(await readPdf(owner, path), pdf)
          await files.delete(cache.key)
          assert.equal(
            (await files.list({ prefix: `records/${fixture.invoiceId}/` })).objects.length,
            1,
          )
          assert.deepEqual(await readPdf(owner, path), pdf)
          assert.ok(await files.head(cache.key))
          if (exportFixtures) await writeFile(new URL(`${fixture.invoiceId}.pdf`, directory), pdf)
        }
      },
    )

    await t.test(
      'staff can queue an archived invoice from booking lookup with one email per confirmation',
      async () => {
        const managerEmail = 'resend-manager.test@gmail.com'
        const accountantEmail = 'resend-ca.test@gmail.com'
        await db.batch([
          db
            .prepare("INSERT INTO invoice_staff_assignment VALUES (?, 'branch-1', 'manager')")
            .bind(managerEmail),
          db
            .prepare("INSERT INTO invoice_grant VALUES (?, 'branch-1', 'manager')")
            .bind(managerEmail),
          db
            .prepare("INSERT INTO invoice_grant VALUES (?, 'branch-1', 'accountant')")
            .bind(accountantEmail),
          db
            .prepare("INSERT INTO invoice_staff_assignment VALUES (?, 'branch-2', 'manager')")
            .bind(grants[2][0]),
          db
            .prepare("INSERT INTO invoice_grant VALUES (?, 'branch-2', 'manager')")
            .bind(grants[2][0]),
        ])
        const manager = await access(managerEmail)
        const accountant = await access(accountantEmail)
        const dev = await access(developer)
        const archived = {
          ...eligible,
          delivery: undefined,
          eventId: 'archived-email',
          invoiceId: 'archived-email',
          bookingId: 'archived-booking',
          invoice: {
            ...eligible.invoice,
            invoiceNumber: 'RG/2526/000015',
            issuedAt: '2025-04-24T06:15:00.000Z',
            templateVersion: 'takumi-v2',
          },
        }
        assert.equal((await send(archived)).status, 201)
        await readPdf(owner, '/portal/invoices/archived-email/pdf')
        const [oldPdf] = (await files.list({ prefix: 'pdf-cache/archived-email/' })).objects
        assert.ok(oldPdf)
        await files.delete(oldPdf.key)
        const lookup = '/portal/search?booking=archived-booking'
        const path = '/portal/invoices/archived-email/email'
        const submit = (
          id,
          headers = manager,
          extras = {},
          origin = 'https://invoice.staging.test',
          route = path,
        ) =>
          call(route, {
            method: 'POST',
            redirect: 'manual',
            headers: { ...headers, origin },
            body: new URLSearchParams({ operationId: id, ...extras }),
          })
        assert.match(await (await call(lookup, { headers: manager })).text(), /Email invoice/)
        assert.doesNotMatch(
          await (await call(lookup, { headers: accountant })).text(),
          /Email invoice/,
        )
        assert.equal((await call(path, { headers: accountant })).status, 403)
        assert.equal((await call(path, { headers: dev })).status, 403)
        assert.equal((await call(path, { headers: other })).status, 404)
        const confirm = await call(path, { headers: manager })
        assert.equal(confirm.status, 200)
        const confirmation = await confirm.text()
        assert.match(confirmation, /customer@example\.invalid/)
        const id = confirmation.match(/name="operationId" value="([0-9a-f-]+)"/)?.[1]
        assert.ok(id)
        assert.equal((await submit(id, accountant)).status, 403)
        assert.equal((await submit(id, other)).status, 404)
        assert.equal((await submit(id, manager, {}, 'https://other.test')).status, 403)
        assert.equal((await submit(id, manager, { to: 'other@example.invalid' })).status, 400)
        assert.equal(
          (
            await submit(
              crypto.randomUUID(),
              owner,
              {},
              undefined,
              '/portal/invoices/provisional/email',
            )
          ).status,
          422,
        )
        assert.equal(
          (await submit(crypto.randomUUID(), owner, {}, undefined, '/portal/invoices/late/email'))
            .status,
          409,
        )
        const before = attempts.length
        const readOperations = () =>
          db
            .prepare(`SELECT operation_id, requested_by, state, attempts
        FROM invoice_delivery WHERE invoice_id = 'archived-email' ORDER BY requested_at`)
            .all()
        assert.equal((await readOperations()).results.length, 0)
        assert.equal((await files.list({ prefix: 'pdf-cache/archived-email/' })).objects.length, 0)

        const responses = await Promise.all([submit(id), submit(id)])
        assert.equal(responses[0].status, 303)
        assert.equal(responses[1].status, 303)
        assert.equal((await submit(crypto.randomUUID())).status, 409)
        assert.equal(attempts.length, before)
        assert.deepEqual((await readOperations()).results, [
          { operation_id: id, requested_by: managerEmail, state: 'queued', attempts: 0 },
        ])

        failNextDelivery = true
        await sweep()
        assert.equal((await readOperations()).results[0].state, 'retry')
        assert.ok((await files.list({ prefix: 'pdf-cache/archived-email/' })).objects.length)
        await db
          .prepare('UPDATE invoice_delivery SET due_at = 0 WHERE operation_id = ?')
          .bind(id)
          .run()
        await Promise.all([sweep(), sweep()])
        assert.deepEqual(
          attempts.slice(before).map(({ key }) => key),
          [attempts[before].key, attempts[before].key],
        )
        assert.match(attempts[before].key, new RegExp(`/resend/${id}$`))
        assert.deepEqual(attempts[before].body.to, ['customer@example.invalid'])
        assert.equal(
          Buffer.from(attempts[before].body.attachments[0].content, 'base64')
            .subarray(0, 5)
            .toString(),
          '%PDF-',
        )
        assert.match(
          await (await call(path, { headers: manager })).text(),
          /Accepted by email provider/,
        )
        assert.equal((await submit(id)).status, 303)
        assert.equal((await readOperations()).results.length, 1)
        const later = await Promise.all([
          submit(crypto.randomUUID(), owner),
          submit(crypto.randomUUID()),
        ])
        assert.deepEqual(later.map(({ status }) => status).sort(), [303, 409])
        assert.equal((await readOperations()).results.length, 2)
        await db
          .prepare(
            "DELETE FROM invoice_staff_assignment WHERE branch_id = 'branch-1' AND email = ?",
          )
          .bind(managerEmail)
          .run()
        assert.equal((await submit(id, manager)).status, 403)
        assert.equal((await readOperations()).results.length, 2)
      },
    )

    await t.test(
      'Resend callbacks are authenticated, deduplicated and correlated before acceptance',
      async () => {
        const now = Date.now()
        const webhook = async (id, event, { signed = true, secondsAgo = 0 } = {}) => {
          const body = JSON.stringify(event)
          const timestamp = Math.floor(now / 1000) - secondsAgo
          const signature = createHmac('sha256', webhookKey)
            .update(`${id}.${timestamp}.${body}`)
            .digest('base64')
          return call('/webhooks/resend', {
            method: 'POST',
            body,
            headers: {
              'content-type': 'application/json',
              'svix-id': id,
              'svix-timestamp': String(timestamp),
              'svix-signature': `v1,${signed ? signature : Buffer.alloc(32, 1).toString('base64')}`,
            },
          })
        }
        const emailEvent = (type, providerId, time = now, tag) => ({
          type: `email.${type}`,
          created_at: new Date(time).toISOString(),
          data: {
            email_id: providerId,
            to: ['customer@example.invalid'],
            subject: 'Synthetic invoice',
            tags: tag ? { rgss_invoice_delivery: tag } : {},
          },
        })
        const receipts = () =>
          db.prepare('SELECT count(*) AS count FROM invoice_email_webhook_receipt').first('count')
        const operationByProvider = (providerId) =>
          db
            .prepare(`SELECT operation_id, state, provider_status, provider_event_at
        FROM invoice_delivery WHERE provider_id = ?`)
            .bind(providerId)
            .first()
        const legacy = 'fixture-provider-id'
        const delivery = emailEvent('delivered', legacy)
        assert.equal((await webhook('msg_invalid', delivery, { signed: false })).status, 401)
        assert.equal((await webhook('msg_old', delivery, { secondsAgo: 301 })).status, 401)
        assert.equal((await webhook('msg_bad', { ...delivery, created_at: 'invalid' })).status, 400)
        assert.equal(
          (await webhook('msg_other', emailEvent('delivered', 'other-app-provider-id'))).status,
          200,
        )
        assert.equal((await webhook('msg_tracking', emailEvent('opened', legacy))).status, 200)
        assert.equal(await receipts(), 0)

        assert.equal((await webhook('msg_delivered', delivery)).status, 200)
        assert.equal((await webhook('msg_delivered', delivery)).status, 200)
        assert.equal(
          (await webhook('msg_delivered', emailEvent('bounced', legacy, now + 2000))).status,
          200,
        )
        assert.equal((await operationByProvider(legacy)).provider_status, 'delivered')
        assert.equal(await receipts(), 1)
        assert.equal(
          (await webhook('msg_old_bounce', emailEvent('bounced', legacy, now - 60_000))).status,
          200,
        )
        assert.equal(
          (await webhook('msg_late_sent', emailEvent('sent', legacy, now + 1000))).status,
          200,
        )
        assert.equal((await operationByProvider(legacy)).provider_status, 'delivered')

        let newestProviderId
        callbackBeforeAck = async (providerId, body) => {
          newestProviderId = providerId
          const tag = body.tags.find(({ name }) => name === 'rgss_invoice_delivery')?.value
          assert.ok(tag)
          assert.equal(
            (await webhook('msg_before_ack', emailEvent('delivery_delayed', providerId, now, tag)))
              .status,
            200,
          )
        }
        const before = attempts.length
        try {
          await sweep()
        } finally {
          callbackBeforeAck = undefined
        }
        assert.equal(attempts.length, before + 1)
        assert.equal((await operationByProvider(newestProviderId)).state, 'accepted')
        assert.equal((await operationByProvider(newestProviderId)).provider_status, 'delayed')
        const page = '/portal/invoices/archived-email/email'
        const pending = await (await call(page, { headers: owner })).text()
        assert.match(pending, /Delivery delayed/)
        assert.doesNotMatch(pending, /Queue invoice email/)
        assert.equal(
          (await webhook('msg_failed', emailEvent('failed', newestProviderId, now + 3000))).status,
          200,
        )
        assert.equal((await operationByProvider(newestProviderId)).provider_status, 'failed')
        assert.match(await (await call(page, { headers: owner })).text(), /Delivery failed/)
        assert.equal(
          (await webhook('msg_bounced', emailEvent('bounced', legacy, now + 4000))).status,
          200,
        )
        assert.equal((await operationByProvider(legacy)).provider_status, 'bounced')
        await sweep()
        assert.equal(attempts.length, before + 1)

        const confirmation = await (await call(page, { headers: owner })).text()
        const queuedId = confirmation.match(/name="operationId" value="([0-9a-f-]+)"/)?.[1]
        assert.ok(queuedId)
        assert.equal(
          (
            await call(page, {
              method: 'POST',
              redirect: 'manual',
              headers: { ...owner, origin: 'https://invoice.staging.test' },
              body: new URLSearchParams({ operationId: queuedId }),
            })
          ).status,
          303,
        )
        assert.equal(
          (await webhook('msg_complained', emailEvent('complained', newestProviderId, now + 5000)))
            .status,
          200,
        )
        assert.deepEqual(
          await db
            .prepare('SELECT state, failure FROM invoice_delivery WHERE operation_id = ?')
            .bind(queuedId)
            .first(),
          { state: 'failed', failure: 'provider_contact_blocked' },
        )
        const blocked = await (await call(page, { headers: owner })).text()
        assert.match(blocked, /Reported as spam/)
        assert.doesNotMatch(blocked, /Queue invoice email/)
        await sweep()
        assert.equal(attempts.length, before + 1)
      },
    )

    await t.test(
      'only the branch owner can log review evidence and a signed replay resolves the hold',
      async () => {
        const managerEmail = 'resend-manager.test@gmail.com'
        await db
          .prepare("INSERT INTO invoice_staff_assignment VALUES (?, 'branch-1', 'manager')")
          .bind(managerEmail)
          .run()
        const manager = await access(managerEmail)
        const invoice = {
          ...eligible,
          eventId: 'review-issue-event',
          invoiceId: 'review-invoice',
          bookingId: 'review-booking',
          invoice: { ...eligible.invoice, invoiceNumber: 'RG/2627/000209' },
        }
        const operation = `initial:${invoice.invoiceId}`
        assert.equal((await send(invoice)).status, 201)
        const before = attempts.length
        callbackBeforeAck = () => {}
        try {
          await sweep()
        } finally {
          callbackBeforeAck = undefined
        }
        const delivery = () =>
          db
            .prepare(`SELECT state, callback_tag, provider_id, provider_status
        FROM invoice_delivery WHERE operation_id = ?`)
            .bind(operation)
            .first()
        await db
          .prepare(
            'UPDATE invoice_delivery SET first_attempt_at = 0, due_at = 0 WHERE operation_id = ?',
          )
          .bind(operation)
          .run()
        await sweep()
        assert.equal((await delivery()).state, 'uncertain')
        const tag = (await delivery()).callback_tag
        assert.ok(tag)
        const providerId = crypto.randomUUID()
        const page = '/portal/invoices/review-invoice/email'
        const history = async (headers) => (await call(page, { headers })).text()
        assert.match(await history(owner), /Record for verification/)
        assert.match(await history(owner), new RegExp(tag))
        assert.doesNotMatch(await history(manager), new RegExp(`Record for verification|${tag}`))
        const record = (headers = owner, origin = 'https://invoice.staging.test', details = {}) =>
          call(`${page}/review`, {
            method: 'POST',
            redirect: 'manual',
            headers: { ...headers, origin },
            body: new URLSearchParams({ operationId: operation, providerId, ...details }),
          })
        assert.equal((await record(manager)).status, 403)
        assert.equal((await record(other)).status, 404)
        assert.equal((await record(owner, 'https://other.test')).status, 403)
        assert.equal((await record(owner, undefined, { providerId: 'anything' })).status, 400)
        assert.equal((await record(owner, undefined, { operationId: 'initial:late' })).status, 409)
        assert.equal((await record()).status, 303)
        assert.equal((await record()).status, 303)
        const review = () =>
          db
            .prepare(`SELECT operation_id, provider_id, requested_by FROM invoice_delivery_review
        WHERE operation_id = ?`)
            .bind(operation)
            .all()
        assert.deepEqual((await review()).results, [
          { operation_id: operation, provider_id: providerId, requested_by: grants[0][0] },
        ])
        const waiting = await history(owner)
        assert.match(waiting, /Awaiting a signed Resend event/)
        assert.doesNotMatch(waiting, /Queue invoice email/)
        assert.equal((await delivery()).state, 'uncertain')

        const replay = (callbackId, reference) => {
          const timestamp = Math.floor(Date.now() / 1000)
          const body = JSON.stringify({
            type: 'email.delivered',
            created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
            data: { email_id: providerId, tags: { rgss_invoice_delivery: reference } },
          })
          const signature = createHmac('sha256', webhookKey)
            .update(`${callbackId}.${timestamp}.${body}`)
            .digest('base64')
          return call('/webhooks/resend', {
            method: 'POST',
            body,
            headers: {
              'svix-id': callbackId,
              'svix-timestamp': String(timestamp),
              'svix-signature': `v1,${signature}`,
            },
          })
        }
        assert.equal((await replay('msg_unrelated_review', crypto.randomUUID())).status, 200)
        assert.equal((await delivery()).state, 'uncertain')
        assert.equal((await replay('msg_review_replay', tag)).status, 200)
        assert.deepEqual(await delivery(), {
          state: 'accepted',
          callback_tag: tag,
          provider_id: providerId,
          provider_status: 'delivered',
        })
        assert.match(await history(owner), /Matched by Resend/)
        assert.doesNotMatch(await history(manager), new RegExp(providerId))
        assert.equal((await record()).status, 409)
        assert.equal((await review()).results.length, 1)
        await sweep()
        assert.equal(attempts.length, before + 1)
      },
    )

    await t.test(
      'CA register exports assigned IST periods and records coverage without customer details',
      async () => {
        const csv = '/portal/reports/invoices.csv'
        const period = `${csv}?month=2025-05&branch=branch-1`
        const accountant = await access('resend-ca.test@gmail.com')
        const dev = await access(developer)
        const sample = (id, branchId, issuedAt, invoiceNumber) => ({
          ...event,
          eventId: id,
          invoiceId: id,
          branchId,
          bookingId: `booking-${id}`,
          invoice: {
            ...event.invoice,
            invoiceNumber,
            issuedAt,
            bookingNumber: `BK-${id}`,
            paymentStatus: 'paid',
            financialYear: '2526',
            seller: {
              ...event.invoice.seller,
              name: '=Example, "branch"',
              gstin: '29ABCDE1234F1Z5',
            },
            customer: {
              name: 'Private fixture customer',
              email: 'private@example.invalid',
              phone: '9000000000',
            },
            totals: {
              subtotalPaise: 58800,
              discountPaise: 1180,
              taxableValuePaise: 48830,
              cgstPaise: 4395,
              sgstPaise: 4395,
              gstPaise: 8790,
              totalPaise: 57620,
            },
          },
        })
        const first = sample('register-first', 'branch-1', '2025-04-30T18:30:00Z', '=2+2')
        const legacy = sample(
          'register-legacy',
          'branch-1',
          '2025-05-31T18:29:59.999Z',
          'CA/2526/000002',
        )
        for (const fixture of [
          sample('register-previous', 'branch-1', '2025-04-30T18:29:59.999Z', 'CA/2526/000003'),
          first,
          legacy,
          sample('register-next', 'branch-1', '2025-05-31T18:30:00.000Z', 'CA/2526/000004'),
          sample('register-other', 'branch-2', '2025-05-12T12:00:00Z', 'OTHER/2526/000001'),
        ])
          assert.equal((await send(fixture)).status, 201)

        const dashboard = await call('/portal/home?month=2025-05&branch=branch-1', {
          headers: accountant,
        })
        assert.equal(dashboard.status, 200)
        assert.match(await dashboard.text(), /Download invoice register \(CSV\)/)
        assert.equal((await call(period)).status, 401)
        assert.equal((await call(period, { headers: dev })).status, 403)
        assert.equal((await call(`${csv}?month=2025-13`, { headers: accountant })).status, 400)
        assert.equal(
          (await call(`${csv}?month=2025-05&branch=branch-2`, { headers: accountant })).status,
          404,
        )
        assert.equal((await call(period, { headers: other })).status, 404)
        assert.equal((await call(period, { headers: accountant, method: 'POST' })).status, 404)

        const facts = () =>
          db
            .prepare('SELECT * FROM invoice_register_fact WHERE invoice_id = ?')
            .bind(legacy.invoiceId)
            .first()
        assert.equal((await facts()).taxable_value_paise, 48830)
        await db
          .prepare('DELETE FROM invoice_line_tax_fact WHERE invoice_id = ?')
          .bind(legacy.invoiceId)
          .run()
        await db
          .prepare('DELETE FROM invoice_register_fact WHERE invoice_id = ?')
          .bind(legacy.invoiceId)
          .run()
        assert.equal(
          (await send({ ...legacy, invoice: { ...legacy.invoice, notes: 'Different bytes' } }))
            .status,
          409,
        )
        assert.equal(await facts(), null)
        const exported = await call(period, { headers: accountant })
        assert.equal(exported.status, 200)
        assert.match(exported.headers.get('content-type'), /^text\/csv/)
        assert.match(
          exported.headers.get('content-disposition'),
          /invoice-register-2025-05-branch-1\.csv/,
        )
        assert.equal(exported.headers.get('cache-control'), 'private, no-store')
        const bytes = Buffer.from(await exported.arrayBuffer())
        assert.equal(bytes.subarray(0, 3).toString('hex'), 'efbbbf')
        const text = bytes.subarray(3).toString('utf8')
        assert.match(text, /invoice_id,invoice_number,branch_id,booking_id,booking_number,/)
        assert.match(
          text,
          /register-first,'=2\+2,branch-1,booking-register-first,BK-register-first,2025-04-30T18:30:00Z,2025-05-01,/,
        )
        assert.match(
          text,
          /"'=Example, ""branch""",29ABCDE1234F1Z5,service,paid,provisional,2526,upi,58800,1180,48830,4395,4395,8790,57620,projected/,
        )
        assert.match(text, /register-legacy,CA\/2526\/000002,branch-1,.*57620,missing/)
        const legacyCells = text
          .split('\r\n')
          .find((row) => row.startsWith('register-legacy,'))
          ?.split(',')
        assert.ok(legacyCells?.slice(7, -2).every((cell) => cell === ''))
        assert.doesNotMatch(
          text,
          /register-previous|register-next|register-other|private@example\.invalid|9000000000|Private fixture customer/,
        )
        assert.deepEqual(
          await db
            .prepare(`SELECT actor_email, source, month, branch_id, invoice_count,
        missing_facts_count, total_paise, schema_version FROM invoice_register_export WHERE id = ?`)
            .bind(exported.headers.get('x-invoice-report-id'))
            .first(),
          {
            actor_email: 'resend-ca.test@gmail.com',
            source: 'staging',
            month: '2025-05',
            branch_id: 'branch-1',
            invoice_count: 2,
            missing_facts_count: 1,
            total_paise: 115240,
            schema_version: 1,
          },
        )

        assert.equal((await send(legacy)).status, 204)
        const repaired = await facts()
        assert.equal(repaired.issuer_gstin, '29ABCDE1234F1Z5')
        assert.equal((await send(legacy)).status, 204)
        assert.deepEqual(await facts(), repaired)
        const all = await call(`${csv}?month=2025-05`, { headers: accountant })
        assert.equal(all.status, 200)
        assert.doesNotMatch(await all.text(), /register-other/)
        await db
          .prepare(`WITH RECURSIVE counter(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM counter WHERE n < 2001)
        INSERT INTO issued_invoice (id, event_id, invoice_number, branch_id, issued_at, total_paise, snapshot_hash, snapshot_key)
        SELECT 'csv-cap-'||n, 'csv-cap-'||n, 'csv-cap-'||n, 'branch-1', '2024-10-12T12:00:00Z', 10, 'fixture', 'fixture'
        FROM counter`)
          .run()
        const overflow = await call(`${csv}?month=2024-10`, { headers: accountant })
        assert.equal(overflow.status, 422)
        assert.equal(overflow.headers.get('content-disposition'), null)
        assert.equal(
          await db.prepare('SELECT COUNT(*) FROM invoice_register_export').first('COUNT(*)'),
          2,
        )
        await db.prepare("DELETE FROM issued_invoice WHERE id = 'csv-cap-2001'").run()
        const atLimit = await call(`${csv}?month=2024-10`, { headers: accountant })
        assert.equal(atLimit.status, 200)
        assert.equal((await atLimit.text()).trimEnd().split('\r\n').length, 2001)
        assert.deepEqual(
          await db
            .prepare(
              'SELECT invoice_count, missing_facts_count, total_paise FROM invoice_register_export WHERE id = ?',
            )
            .bind(atLimit.headers.get('x-invoice-report-id'))
            .first(),
          { invoice_count: 2000, missing_facts_count: 2000, total_paise: 20000 },
        )
        await db
          .prepare(`CREATE TRIGGER fail_register_audit BEFORE INSERT ON invoice_register_export
          BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END`)
          .run()
        const failed = await call(period, { headers: accountant })
        assert.equal(failed.status, 503)
        assert.equal(failed.headers.get('content-disposition'), null)
        await db.prepare('DROP TRIGGER fail_register_audit').run()
      },
    )

    await t.test('line-tax export preserves saved facts, coverage and branch scope', async () => {
      const accountant = await access('resend-ca.test@gmail.com')
      const path = '/portal/reports/line-tax.csv?month=2025-03&branch=branch-1'
      const completeLine = {
        name: '=Sample, "service"',
        staffName: 'Private Staff',
        serviceId: 'service-1',
        taxVersionId: 'tax-1',
        sacCode: '999721',
        rateBps: 1800,
        quantity: 1,
        unitPricePaise: 50000,
        totalPricePaise: 50000,
        discountPaise: 2800,
        taxableValuePaise: 40000,
        cgstPaise: 3600,
        sgstPaise: 3600,
        taxPaise: 7200,
      }
      const zeroLine = {
        name: 'Membership usage',
        sacCode: '999721',
        rateBps: 0,
        quantity: 1,
        gemsCovered: true,
        unitPricePaise: 0,
        totalPricePaise: 0,
        discountPaise: 0,
        taxableValuePaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        taxPaise: 0,
      }
      const fixture = (id, at, items, branchId = 'branch-1') => ({
        ...event,
        eventId: id,
        invoiceId: id,
        branchId,
        bookingId: `booking-${id}`,
        invoice: {
          ...event.invoice,
          invoiceNumber: id,
          issuedAt: at,
          seller: { ...event.invoice.seller, gstin: '29ABCDE1234F1Z5' },
          customer: { name: 'Private Tax Buyer', email: 'private-tax@example.invalid' },
          items,
        },
      })
      const dashboard = await call('/portal/home?month=2025-03&branch=branch-1', {
        headers: accountant,
      })
      assert.match(await dashboard.text(), /Download line-tax register \(CSV\)/)
      const first = fixture('line-start', '2025-02-28T18:30:00Z', [completeLine, zeroLine])
      const incomplete = fixture('line-incomplete', '2025-03-31T18:29:59.999Z', [
        { ...zeroLine, taxPaise: undefined },
      ])
      const legacy = fixture('line-legacy', '2025-03-05T12:00:00Z', [completeLine, completeLine])
      for (const record of [
        first,
        incomplete,
        legacy,
        fixture('line-before', '2025-02-28T18:29:59.999Z', [completeLine]),
        fixture('line-after', '2025-03-31T18:30:00Z', [completeLine]),
        fixture('line-other', '2025-03-05T12:00:00Z', [completeLine], 'branch-2'),
      ])
        assert.equal((await send(record)).status, 201)

      const lineFacts = (id) =>
        db
          .prepare('SELECT * FROM invoice_line_tax_fact WHERE invoice_id = ? ORDER BY line_number')
          .bind(id)
          .all()
      const before = (await lineFacts(first.invoiceId)).results
      assert.equal(before.length, 2)
      assert.equal(before[0].cgst_paise, 3600)
      assert.equal(before[1].rate_bps, 0)
      assert.equal((await send(first)).status, 204)
      assert.deepEqual((await lineFacts(first.invoiceId)).results, before)
      await db
        .prepare('DELETE FROM invoice_line_tax_fact WHERE invoice_id = ?')
        .bind(legacy.invoiceId)
        .run()
      assert.equal(
        (await send({ ...legacy, invoice: { ...legacy.invoice, notes: 'Conflicting bytes' } }))
          .status,
        409,
      )
      assert.equal((await lineFacts(legacy.invoiceId)).results.length, 0)
      assert.equal((await call(path)).status, 401)
      assert.equal((await call(path, { headers: other })).status, 404)
      const report = await call(path, { headers: accountant })
      assert.equal(report.status, 200)
      assert.equal(report.headers.get('cache-control'), 'private, no-store')
      assert.match(
        report.headers.get('content-disposition'),
        /line-tax-register-2025-03-branch-1\.csv/,
      )
      const csv = await report.text()
      assert.match(
        csv,
        /invoice_id,invoice_number,branch_id,issuer_gstin,issued_at_utc,issue_date_ist,/,
      )
      assert.match(
        csv,
        /line-start,line-start,branch-1,29ABCDE1234F1Z5,2025-02-28T18:30:00Z,2025-03-01,provisional,service,1,"'=Sample, ""service""",service-1,tax-1,999721,1800,1,0,50000,50000,2800,40000,3600,3600,7200,projected/,
      )
      assert.match(csv, /line-start,.*Membership usage,,,999721,0,1,1,0,0,0,0,0,0,0,projected/)
      assert.match(csv, /line-incomplete,.*999721,0,1,1,0,0,0,0,0,0,,incomplete/)
      assert.match(csv, /line-legacy,.*,+missing/)
      assert.doesNotMatch(
        csv,
        /Private Tax Buyer|private-tax@example\.invalid|Private Staff|line-before|line-after|line-other/,
      )
      assert.equal(csv.trimEnd().split('\r\n').length, 5)
      const audit = await db
        .prepare(`SELECT report_kind, invoice_count, missing_facts_count, line_count,
        incomplete_line_count, total_paise, latest_received_at FROM invoice_register_export WHERE id = ?`)
        .bind(report.headers.get('x-invoice-report-id'))
        .first()
      assert.deepEqual(audit, {
        report_kind: 'line_tax',
        invoice_count: 3,
        missing_facts_count: 1,
        line_count: 3,
        incomplete_line_count: 1,
        total_paise: 150000,
        latest_received_at: Math.max(
          ...before.map((row) => row.received_at),
          ...(await lineFacts(incomplete.invoiceId)).results.map((row) => row.received_at),
        ),
      })
      assert.equal((await send(legacy)).status, 204)
      assert.equal((await lineFacts(legacy.invoiceId)).results.length, 2)
    })

    await t.test('GST review protects branch scope and withholds incomplete invoices', async () => {
      const accountant = await access('resend-ca.test@gmail.com')
      const path = '/portal/reports/gst?month=2025-01&branch=branch-1'
      const dashboard = await call('/portal/home?month=2025-01&branch=branch-1', {
        headers: accountant,
      })
      assert.match(await dashboard.text(), /Review monthly GST/)
      const item = {
        name: 'Service line',
        quantity: 1,
        sacCode: '999721',
        rateBps: 1800,
        unitPricePaise: 50000,
        totalPricePaise: 50000,
        discountPaise: 2801,
        taxableValuePaise: 40000,
        cgstPaise: 3599,
        sgstPaise: 3600,
        taxPaise: 7199,
      }
      const usageLine = {
        ...item,
        unitPricePaise: 0,
        totalPricePaise: 0,
        discountPaise: 0,
        taxableValuePaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        taxPaise: 0,
      }
      const reviewedTotals = {
        subtotalPaise: 50000,
        discountPaise: 2801,
        taxableValuePaise: 40000,
        cgstPaise: 3599,
        sgstPaise: 3600,
        gstPaise: 7199,
        totalPaise: 47199,
      }
      const seller = { ...event.invoice.seller, gstin: '29ABCDE1234F1ZW' }
      const fixture = (id, changes = {}, branchId = 'branch-1') => ({
        ...event,
        eventId: id,
        invoiceId: id,
        branchId,
        bookingId: `booking-${id}`,
        invoice: {
          ...event.invoice,
          invoiceNumber: id,
          issuedAt: '2024-12-31T18:30:00Z',
          taxReviewStatus: 'reviewed',
          paymentStatus: 'paid',
          seller,
          customer: { name: 'Private GST customer', email: 'gst-privacy@example.invalid' },
          items: [item],
          totals: reviewedTotals,
          ...changes,
        },
      })
      const fixtures = [
        fixture('gst-reviewed', { items: [item, { ...usageLine, sacCode: '999722', rateBps: 0 }] }),
        fixture('gst-provisional', {
          invoiceType: 'membership_purchase',
          taxReviewStatus: 'provisional',
          seller: { ...seller, gstin: undefined },
          items: [
            {
              ...item,
              unitPricePaise: 11800,
              totalPricePaise: 11800,
              discountPaise: 0,
              taxableValuePaise: 10000,
              cgstPaise: 900,
              sgstPaise: 900,
              taxPaise: 1800,
            },
          ],
          totals: {
            subtotalPaise: 11800,
            discountPaise: 0,
            taxableValuePaise: 10000,
            cgstPaise: 900,
            sgstPaise: 900,
            gstPaise: 1800,
            totalPaise: 11800,
          },
        }),
        fixture('gst-usage', {
          invoiceType: 'membership_session',
          items: [usageLine],
          totals: Object.fromEntries(Object.keys(reviewedTotals).map((key) => [key, 0])),
        }),
        fixture('gst-missing', { items: [{ ...item, sgstPaise: undefined }] }),
        fixture('gst-mismatch', { items: [{ ...item, discountPaise: 2799 }] }),
        fixture('gst-unconfirmed', { paymentStatus: undefined }),
        fixture('gst-no-registration', { seller: { ...seller, gstin: undefined } }),
        fixture('gst-before', { issuedAt: '2024-12-31T18:29:59.999Z' }),
        fixture('gst-after', { issuedAt: '2025-01-31T18:30:00Z' }),
        fixture(
          'gst-other-branch',
          { seller: { ...seller, gstin: '29ABCDE1234F1Z5' } },
          'branch-2',
        ),
      ]
      for (const row of fixtures) assert.equal((await send(row)).status, 201)
      assert.equal((await call(path)).status, 401)
      assert.equal((await call(path, { headers: await access(developer) })).status, 403)
      assert.equal((await call(path, { headers: other })).status, 404)
      assert.equal(
        (await call('/portal/reports/gst?month=2025-99', { headers: accountant })).status,
        400,
      )
      const report = await call(path, { headers: accountant })
      assert.equal(report.status, 200)
      assert.equal(report.headers.get('cache-control'), 'private, no-store')
      const summary = await report.text()
      assert.match(summary, /<dt>Reviewed GST<\/dt>\s*<dd>₹71\.99<\/dd>\s*<small>1 invoice/)
      assert.match(summary, /<dt>Provisional GST<\/dt>\s*<dd>₹18\.00<\/dd>/)
      assert.match(summary, /<dt>Invoices needing review<\/dt>\s*<dd>4<\/dd>/)
      assert.match(summary, /<dt>Membership usage records<\/dt>\s*<dd>1<\/dd>/)
      assert.match(summary, /999721/)
      assert.match(summary, /999722/)
      assert.match(summary, /29ABCDE1234F1ZW/)
      assert.match(summary, /CGST ₹35\.99/)
      assert.match(summary, /SGST ₹36\.00/)
      for (const id of ['gst-missing', 'gst-mismatch', 'gst-unconfirmed', 'gst-no-registration'])
        assert.match(summary, new RegExp(id))
      assert.doesNotMatch(
        summary,
        /gst-before|gst-after|gst-other-branch|gst-privacy@example\.invalid|Private GST customer/,
      )
      await db
        .prepare(
          "DELETE FROM invoice_grant WHERE branch_id = 'branch-1' AND email = 'resend-ca.test@gmail.com'",
        )
        .run()
      assert.equal((await call(path, { headers: accountant })).status, 403)
    })
    await t.test(
      'monthly close drafts preserve evidence and current branch permissions',
      async () => {
        const root = '/portal/reports/close'
        const month = '2025-01'
        const branch = 'branch-1'
        const page = `${root}?month=${month}&branch=${branch}`
        const accountant = await access('close-ca.test@gmail.com')
        const grant = db.prepare(
          "INSERT INTO invoice_grant(email, branch_id, role) VALUES (?, ?, 'accountant')",
        )
        await db.batch([
          grant.bind('close-ca.test@gmail.com', branch),
          grant.bind('close-ca.test@gmail.com', 'branch-2'),
          grant.bind('gstin-ca.test@gmail.com', branch),
          grant.bind('owner.test@gmail.com', 'branch-2'),
        ])
        const post = (headers, id, changes = {}, origin = 'https://invoice.staging.test') =>
          call(root, {
            method: 'POST',
            redirect: 'manual',
            headers: { ...headers, origin, 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ branch, month, id, ...changes }),
          })
        const path = (id, file = 'package.json') => `${root}/${branch}/${id}/${file}`
        const key = (id) => `finance-evidence/monthly-close/${id}.json`
        const digest = (body) => createHash('sha256').update(body).digest('hex')
        const evidenceState = async () => ({
          rows: await db
            .prepare(`SELECT
              (SELECT COUNT(*) FROM invoice_monthly_close_draft) AS drafts,
              (SELECT COUNT(*) FROM invoice_monthly_close_download) AS downloads,
              (SELECT COUNT(*) FROM invoice_register_export) AS exports`)
            .first(),
          archive: (await files.list({ prefix: 'finance-evidence/monthly-close/' })).objects.map(
            ({ key, etag }) => ({ key, etag }),
          ),
        })
        const compare = async (id, headers = accountant) => {
          const before = await evidenceState()
          const response = await call(path(id, 'compare'), { headers })
          assert.equal(response.status, 200)
          assert.equal(response.headers.get('cache-control'), 'private, no-store')
          assert.equal(response.headers.get('content-disposition'), null)
          const markup = await response.text()
          assert.match(markup, /Compare monthly close draft/)
          assert.deepEqual(await evidenceState(), before)
          return markup
        }
        const fetchPackage = async (id, headers = accountant) => {
          const response = await call(path(id), { headers })
          assert.equal(response.status, 200)
          assert.equal(response.headers.get('cache-control'), 'private, no-store')
          const body = await response.text()
          assert.equal(response.headers.get('x-invoice-close-sha256'), digest(body))
          return { body, data: JSON.parse(body) }
        }

        const ownerPage = await call(page, { headers: owner })
        assert.equal(ownerPage.status, 200)
        const ownerMarkup = await ownerPage.text()
        assert.match(ownerMarkup, /Save new draft/)
        const id = ownerMarkup.match(/name="id" value="([a-f0-9-]+)"/)?.[1]
        assert.ok(id)
        assert.equal((await call(page)).status, 401)
        assert.equal((await call(page, { headers: other })).status, 404)
        const developerHeaders = await access(developer)
        assert.equal((await call(page, { headers: developerHeaders })).status, 403)
        assert.equal((await post(owner, id, {}, 'https://third-party.invalid')).status, 403)
        assert.equal((await post(owner, 'invalid-uuid')).status, 400)
        assert.equal((await post(owner, id, { month: '9999-12' })).status, 422)
        assert.equal((await post(owner, id, { branch: 'branch-2' })).status, 403)
        assert.equal((await post(other, id, { branch: 'branch-2' })).status, 403)
        assert.equal((await post(accountant, id)).status, 403)
        assert.equal((await post(developerHeaders, id)).status, 403)
        assert.equal(await files.head(key(id)), null)

        // Simulate an incomplete restore of projected lines. Replaying the signed
        // immutable event later must repair the projection without reissuing it.
        const historical = await db
          .prepare('SELECT snapshot_key FROM issued_invoice WHERE id = ?')
          .bind('gst-missing')
          .first('snapshot_key')
        const snapshot = await files.get(historical)
        assert.ok(snapshot)
        const replay = JSON.parse(await snapshot.text())
        await db
          .prepare('DELETE FROM invoice_line_tax_fact WHERE invoice_id = ?')
          .bind(replay.invoiceId)
          .run()

        const submitted = await Promise.all([post(owner, id), post(owner, id)])
        for (const response of submitted) {
          assert.equal(response.status, 303)
          assert.equal(response.headers.get('location'), page)
        }
        assert.equal((await post(owner, id, { month: '2025-02' })).status, 409)
        const frozen = await fetchPackage(id)
        assert.equal(frozen.data.status, 'draft')
        assert.equal(frozen.data.branch, branch)
        assert.equal(frozen.data.scope.startUtc, '2024-12-31T18:30:00.000Z')
        assert.equal(frozen.data.scope.endUtcExclusive, '2025-01-31T18:30:00.000Z')
        assert.equal(frozen.data.breakdown.gst.reviewed.gstPaise, 7199)
        assert.equal(frozen.data.breakdown.gst.provisional.gstPaise, 1800)
        assert.equal(frozen.data.breakdown.gst.exceptionCount, 4)
        assert.doesNotMatch(
          frozen.body,
          /gst-other-branch|gst-after|gst-before|Private GST customer|gst-privacy@example/,
        )
        for (const file of ['invoice-register.csv', 'line-tax-register.csv']) {
          const url = file === 'invoice-register.csv' ? 'invoices.csv' : 'line-tax.csv'
          const live = await call(`/portal/reports/${url}?month=${month}&branch=${branch}`, {
            headers: accountant,
          })
          assert.equal(live.status, 200)
          const archived = await call(path(id, file), { headers: accountant })
          assert.equal(archived.status, 200)
          assert.match(archived.headers.get('content-disposition'), /branch-1-2025-01-v1/)
          const csv = Buffer.from(await archived.arrayBuffer())
          assert.deepEqual(csv, Buffer.from(await live.arrayBuffer()))
          assert.equal(frozen.data.files[file].content, csv.toString('utf8'))
          assert.equal(frozen.data.files[file].sha256, digest(csv))
          assert.equal(archived.headers.get('x-invoice-close-sha256'), digest(csv))
        }

        assert.equal((await call(path(id, 'compare'))).status, 401)
        assert.equal((await call(path(id, 'compare'), { headers: other })).status, 404)
        assert.equal((await call(path(id, 'compare'), { headers: developerHeaders })).status, 403)
        const manager = await access('resend-manager.test@gmail.com')
        for (const headers of [accountant, owner, manager]) {
          assert.match(await compare(id, headers), /No changes in portal records/)
        }

        const recoveryId = randomUUID()
        const pending = JSON.stringify({ ...frozen.data, id: recoveryId })
        await files.put(key(recoveryId), pending, {
          customMetadata: { actor: 'owner.test@gmail.com', sha256: digest(pending) },
        })
        assert.equal((await post(owner, recoveryId, { month: '2025-02' })).status, 409)
        const late = {
          ...event,
          eventId: 'close-late',
          invoiceId: 'close-late',
          invoice: {
            ...event.invoice,
            invoiceNumber: 'CLOSE-LATE',
            issuedAt: '2025-01-12T12:00:00Z',
            items: [
              {
                ...event.invoice.items[0],
                name: 'Service, with "quotes"\nSecond line',
              },
            ],
          },
        }
        assert.equal((await send(late)).status, 201)
        assert.equal((await send(replay)).status, 204)
        const changed = await compare(id)
        assert.match(changed, /Portal records changed/)
        assert.match(changed, /No billing check has been published/)
        assert.match(changed, /CLOSE-LATE/)
        assert.match(changed, /gst-missing/)
        assert.match(changed, /<td>Changed<small>Tax lines<\/small><\/td>/)
        assert.doesNotMatch(
          changed,
          /gst-other-branch|Private GST customer|gst-privacy@example|Second line/,
        )
        assert.equal((await post(owner, recoveryId)).status, 303)
        assert.equal((await fetchPackage(recoveryId)).body, pending)
        const freshId = randomUUID()
        assert.equal((await post(owner, freshId)).status, 303)
        const fresh = await fetchPackage(freshId)
        assert.equal(
          fresh.data.sourceWatermark.invoiceCount,
          frozen.data.sourceWatermark.invoiceCount + 1,
        )
        assert.match(fresh.data.files['invoice-register.csv'].content, /CLOSE-LATE/)
        assert.equal((await send(replay)).status, 204)
        assert.match(await compare(freshId), /No changes in portal records/)
        assert.equal(
          (await call(`${path(freshId, 'compare')}?page=0`, { headers: accountant })).status,
          400,
        )
        await db
          .prepare(
            "UPDATE issued_invoice SET issued_at = '2025-02-02T00:00:00Z' WHERE id = 'gst-unconfirmed'",
          )
          .run()
        assert.match(await compare(freshId), /gst-unconfirmed<\/th>\s*<td>Missing<\/td>/)
        await db
          .prepare(
            "UPDATE issued_invoice SET issued_at = '2024-12-31T18:30:00Z' WHERE id = 'gst-unconfirmed'",
          )
          .run()
        assert.equal((await fetchPackage(id)).body, frozen.body)
        const { results: postedInvoices } = await db
          .prepare(`
          SELECT id AS invoiceId, total_paise AS totalPaise FROM issued_invoice
          WHERE branch_id = ? AND rtrim(issued_at, 'Z') >= ? AND rtrim(issued_at, 'Z') < ?
          ORDER BY id
        `)
          .bind(branch, '2024-12-31T18:30', '2025-01-31T18:30')
          .all()
        const identityHash = (rows) =>
          digest(JSON.stringify(rows.map(({ invoiceId, totalPaise }) => [invoiceId, totalPaise])))
        const coveragePath = '/internal/v1/invoice-events/source-coverage'
        const sourceClock = Date.now() - 10_000
        const coverage = {
          version: 1,
          type: 'invoice.source-coverage',
          source: 'staging',
          branchId: branch,
          month,
          observedAt: new Date(sourceClock).toISOString(),
          invoiceCount: postedInvoices.length,
          totalPaise: postedInvoices.reduce((total, invoice) => total + invoice.totalPaise, 0),
          publishedCount: postedInvoices.length,
          pendingCount: 0,
          failedCount: 0,
          uncapturedCount: 0,
          identitiesSha256: identityHash(postedInvoices),
        }
        const publish = (payload, signed = true) => send(payload, Date.now(), signed, coveragePath)
        assert.equal((await publish(coverage, false)).status, 401)
        assert.equal((await publish({ ...coverage, source: 'production' })).status, 400)
        assert.equal((await publish({ ...coverage, pendingCount: 1 })).status, 400)
        assert.equal(
          (
            await publish({
              ...coverage,
              observedAt: new Date(sourceClock - 600_000).toISOString(),
            })
          ).status,
          400,
        )
        assert.equal((await publish({ ...coverage, branchId: 'branch-2' })).status, 201)
        assert.match(await compare(freshId), /No billing check has been published/)
        assert.equal((await publish(coverage)).status, 201)
        assert.equal((await publish(coverage)).status, 204)
        assert.match(await compare(freshId), /Invoice IDs and amounts agree\.<\/strong>/)
        assert.match(await compare(id), /Invoice IDs or amounts differ\./)
        const gstinReview = `/portal/reports/gstin-close?month=${month}&gstin=29ABCDE1234F1ZW`
        const gstinCa = await access('gstin-ca.test@gmail.com')
        const registration = await call(gstinReview, { headers: gstinCa })
        assert.equal(registration.status, 200)
        const registrationMarkup = await registration.text()
        assert.match(registrationMarkup, /Compare version 3/)
        assert.match(registrationMarkup, /Billing check predates the saved draft/)
        assert.match(registrationMarkup, /71\.99 GST/)
        assert.match(registrationMarkup, /Registration coverage unverified/)
        assert.match(registrationMarkup, /29ABCDE1234F1ZW/)
        assert.doesNotMatch(registrationMarkup, /branch-2/)
        const assigned = await call(gstinReview, { headers: accountant })
        assert.equal(assigned.status, 200)
        assert.match(await assigned.text(), /branch-2[\s\S]*No saved draft/)
        assert.equal(
          (await call(gstinReview.replace('29ABCDE1234F1ZW', 'invalid'), { headers: gstinCa }))
            .status,
          400,
        )
        const replacedInvoice = postedInvoices.find(({ invoiceId }) => invoiceId === 'close-late')
        assert.ok(replacedInvoice)
        const replaced = postedInvoices.map((invoice) =>
          invoice === replacedInvoice ? { ...invoice, invoiceId: 'aaa-different-id' } : invoice,
        )
        const unequal = {
          ...coverage,
          observedAt: new Date(sourceClock + 1).toISOString(),
          // Same count and paise, different invoice identity.
          identitiesSha256: identityHash(replaced),
        }
        assert.equal((await publish({ ...unequal, observedAt: coverage.observedAt })).status, 409)
        assert.equal((await publish(unequal)).status, 201)
        assert.equal((await publish(coverage)).status, 204)
        assert.match(await compare(freshId), /Invoice IDs or amounts differ\./)
        assert.equal(
          (
            await publish({
              ...coverage,
              observedAt: new Date(sourceClock + 2).toISOString(),
              publishedCount: postedInvoices.length - 1,
              uncapturedCount: 1,
            })
          ).status,
          201,
        )
        const incomplete = await compare(freshId)
        assert.match(incomplete, /Publication is incomplete/)
        assert.match(incomplete, /1 uncaptured/)
        assert.deepEqual(
          (
            await db
              .prepare('SELECT id, version FROM invoice_monthly_close_draft ORDER BY version')
              .all()
          ).results,
          [
            { id, version: 1 },
            { id: recoveryId, version: 2 },
            { id: freshId, version: 3 },
          ],
        )

        const caPage = await call(page, { headers: accountant })
        assert.equal(caPage.status, 200)
        const markup = await caPage.text()
        assert.match(markup, /Version 3/)
        assert.match(markup, /Full package/)
        assert.ok(markup.includes(path(id, 'compare')))
        assert.doesNotMatch(markup, /Save new draft/)
        assert.equal((await call(path(id), { headers: other })).status, 404)
        assert.equal((await call(path(id, 'other.csv'), { headers: accountant })).status, 404)
        const downloaded = await db
          .prepare(
            'SELECT COUNT(*) AS total FROM invoice_monthly_close_download WHERE draft_id = ?',
          )
          .bind(id)
          .first()
        assert.equal(downloaded.total, 4)

        const frozenHead = await files.head(key(id))
        const freshHead = await files.head(key(freshId))
        assert.ok(frozenHead && freshHead)
        await files.put(key(id), frozen.body.replace('"draft"', '"forged"'))
        assert.equal((await call(path(id), { headers: accountant })).status, 503)
        assert.equal((await call(path(id, 'compare'), { headers: accountant })).status, 503)
        assert.equal((await post(owner, id)).status, 503)
        await files.delete(key(freshId))
        assert.equal((await call(path(freshId), { headers: accountant })).status, 503)
        assert.equal((await call(path(freshId, 'compare'), { headers: accountant })).status, 503)
        assert.equal((await post(owner, freshId)).status, 503)
        await files.put(key(id), frozen.body, {
          customMetadata: frozenHead.customMetadata,
          httpMetadata: frozenHead.httpMetadata,
        })
        await files.put(key(freshId), fresh.body, {
          customMetadata: freshHead.customMetadata,
          httpMetadata: freshHead.httpMetadata,
        })
        await db
          .prepare('DELETE FROM invoice_grant WHERE email = ? AND branch_id = ?')
          .bind('close-ca.test@gmail.com', branch)
          .run()
        assert.equal((await call(page, { headers: accountant })).status, 404)
        assert.equal((await call(path(recoveryId), { headers: accountant })).status, 404)
        assert.equal((await call(path(recoveryId, 'compare'), { headers: accountant })).status, 404)
      },
    )

    await t.test('monthly close numbering checks the saved branch and issue month', async () => {
      const root = '/portal/reports/close'
      const month = '2025-11'
      const branch = 'branch-1'
      const accountant = await access('numbering-ca.test@gmail.com')
      await db
        .prepare("INSERT INTO invoice_grant (email, branch_id, role) VALUES (?, ?, 'accountant')")
        .bind('numbering-ca.test@gmail.com', branch)
        .run()
      const fixture = (id, invoiceNumber, issuedAt, branchId = branch) => ({
        ...event,
        eventId: id,
        invoiceId: id,
        branchId,
        invoice: { ...event.invoice, invoiceNumber, issuedAt, financialYear: '2526' },
      })
      const save = async () => {
        const id = randomUUID()
        const response = await call(root, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            ...owner,
            origin: 'https://invoice.staging.test',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ month, branch, id }),
        })
        assert.equal(response.status, 303)
        return id
      }
      const compare = async (id) => {
        const response = await call(`${root}/${branch}/${id}/compare`, { headers: accountant })
        assert.equal(response.status, 200)
        return response.text()
      }

      const issued = '2025-11-12T12:00:00Z'
      const fixtures = [
        fixture('numbering-first', 'RG/2526/000001', '2025-10-31T18:30:00Z'),
        fixture('numbering-fourth', 'RG/2526/000004', '2025-11-30T18:29:59.999Z'),
        fixture('numbering-legacy', 'INV-1-2526-91234', issued),
        fixture('numbering-wrong-year', 'RG/2425/000096', issued),
        fixture('numbering-before', 'RG/2526/000098', '2025-10-31T18:29:59.999Z'),
        fixture('numbering-after', 'RG/2526/000097', '2025-11-30T18:30:00Z'),
        fixture('numbering-other-branch', 'OT/2526/000099', issued, 'branch-2'),
      ]
      for (const row of fixtures) assert.equal((await send(row)).status, 201)

      const frozen = await save()
      const gap = /2 numbers are absent between observed invoices\./
      const markup = await compare(frozen)
      assert.match(markup, /Invoice numbering/)
      assert.match(markup, gap)
      assert.match(markup, /aria-label="Absent invoice number ranges"/)
      assert.match(markup, /RG\/2526\/000002<small>through RG\/2526\/000003<\/small>/)
      assert.match(markup, /2 invoices with sequential numbers in FY 2526/)
      assert.match(
        markup,
        /Outside the gap check · 1 legacy · 0 unrecognized format · 1 financial-year mismatch\./,
      )
      assert.doesNotMatch(markup, /RG\/2526\/00009[78]|OT\/2526\/000099/)

      assert.equal((await send(fixture('numbering-second', 'RG/2526/000002', issued))).status, 201)
      assert.equal((await send(fixture('numbering-third', 'RG/2526/000003', issued))).status, 201)
      const previous = await compare(frozen)
      assert.match(previous, /Portal records changed/)
      assert.match(previous, gap)

      const updated = await compare(await save())
      assert.match(updated, /Version 2/)
      assert.match(updated, /No internal gaps in the reviewed numbers\./)
      assert.match(updated, /4 invoices with sequential numbers in FY 2526/)
      assert.doesNotMatch(updated, /aria-label="Absent invoice number ranges"/)
    })

    await t.test(
      'only the branch owner can append feedback to the verified draft version',
      async () => {
        const root = '/portal/reports/close'
        const month = '2025-12'
        const branch = 'branch-1'
        const caEmail = 'feedback-ca.test@gmail.com'
        const accountant = await access(caEmail)
        const manager = await access('resend-manager.test@gmail.com')
        const developerHeaders = await access(developer)
        const grant = db.prepare("INSERT INTO invoice_grant VALUES (?, ?, 'accountant')")
        await db.batch([grant.bind(caEmail, branch), grant.bind(caEmail, 'branch-2')])
        const received = await send({
          ...event,
          eventId: 'feedback-issue-event',
          invoiceId: 'feedback-invoice',
          invoice: {
            ...event.invoice,
            invoiceNumber: 'FEEDBACK-FIXTURE-1',
            issuedAt: '2025-12-02T12:00:00Z',
          },
        })
        assert.equal(received.status, 201)

        const origin = 'https://invoice.staging.test'
        const submit = (path, headers, data, requestOrigin = origin) =>
          call(path, {
            method: 'POST',
            redirect: 'manual',
            headers: {
              ...headers,
              origin: requestOrigin,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(data),
          })
        const save = async () => {
          const id = randomUUID()
          assert.equal((await submit(root, owner, { id, month, branch })).status, 303)
          const base = `${root}/${branch}/${id}`
          const archive = await call(`${base}/package.json`, { headers: owner })
          assert.equal(archive.status, 200)
          const sha256 = archive.headers.get('x-invoice-close-sha256')
          assert.match(sha256, /^[a-f0-9]{64}$/)
          assert.equal(
            sha256,
            createHash('sha256')
              .update(await archive.text())
              .digest('hex'),
          )
          return { id, sha256, review: `${base}/review` }
        }
        const reviewPage = async (path, headers) => {
          const response = await call(path, { headers })
          assert.equal(response.status, 200)
          assert.equal(response.headers.get('cache-control'), 'private, no-store')
          const markup = await response.text()
          assert.match(markup, /CA feedback/)
          return markup
        }

        const draft = await save()
        assert.equal((await call(draft.review)).status, 401)
        assert.equal((await call(draft.review, { headers: other })).status, 404)
        assert.equal((await call(draft.review, { headers: developerHeaders })).status, 403)
        assert.match(await reviewPage(draft.review, owner), /Record feedback/)

        const first = {
          id: randomUUID(),
          sha256: draft.sha256,
          outcome: 'changes_requested',
          note: 'Check <em>service classification</em> & GST rounding.',
        }
        for (const headers of [accountant, manager, developerHeaders]) {
          assert.equal((await submit(draft.review, headers, first)).status, 403)
        }
        assert.equal((await submit(draft.review, other, first)).status, 404)
        assert.equal(
          (await submit(draft.review, owner, first, 'https://third-party.invalid')).status,
          403,
        )
        assert.equal(
          (await submit(draft.review, owner, { ...first, sha256: '0'.repeat(64) })).status,
          409,
        )
        assert.equal((await submit(draft.review, owner, { ...first, note: '' })).status, 400)
        assert.equal(
          (await submit(draft.review, owner, { ...first, note: 'a'.repeat(501) })).status,
          400,
        )
        for (const response of await Promise.all([
          submit(draft.review, owner, first),
          submit(draft.review, owner, first),
        ])) {
          assert.equal(response.status, 303)
          assert.equal(response.headers.get('location'), `${draft.review}#feedback-${first.id}`)
        }
        assert.equal(
          (await submit(draft.review, owner, { ...first, note: 'Conflicting replay' })).status,
          409,
        )
        const second = {
          id: randomUUID(),
          sha256: draft.sha256,
          outcome: 'reviewed',
          note: 'Checked the updated reconciliation workbook.',
        }
        const recorded = await submit(draft.review, owner, second)
        assert.equal(recorded.status, 303)
        assert.equal(recorded.headers.get('location'), `${draft.review}#feedback-${second.id}`)

        const history = await reviewPage(draft.review, owner)
        assert.match(history, /Record feedback/)
        assert.match(history, /<strong>Reviewed<\/strong>/)
        assert.match(history, /<strong>Changes requested<\/strong>/)
        assert.match(history, /Recorded by owner\.test@gmail\.com/)
        assert.match(
          history,
          /Check &lt;em&gt;service classification&lt;\/em&gt; &amp; GST rounding\./,
        )
        assert.match(history, /Checked the updated reconciliation workbook\./)
        assert.doesNotMatch(history, /<em>service classification<\/em>|Conflicting replay/)
        assert.equal(history.match(new RegExp(`id="feedback-${first.id}"`, 'g'))?.length, 1)
        assert.equal(history.match(new RegExp(`id="feedback-${second.id}"`, 'g'))?.length, 1)
        for (const headers of [accountant, manager]) {
          const readOnly = await reviewPage(draft.review, headers)
          assert.doesNotMatch(readOnly, /Record feedback|name="outcome"/)
          assert.match(readOnly, /GST rounding/)
          assert.match(readOnly, /reconciliation workbook/)
        }

        if (process.env.INVOICE_RUNTIME_CLOSE_FEEDBACK_FIXTURES === '1') {
          const directory = new URL('../dist/portal-fixtures/', import.meta.url)
          await mkdir(directory, { recursive: true })
          await writeFile(new URL('monthly-close-feedback.html', directory), history)
          await writeFile(
            new URL('monthly-close-feedback-ca.html', directory),
            await reviewPage(draft.review, accountant),
          )
        }

        const saved = await call(draft.review.replace(/\/review$/, '/package.json'), {
          headers: owner,
        })
        assert.equal(saved.status, 200)
        assert.equal(
          createHash('sha256')
            .update(await saved.text())
            .digest('hex'),
          draft.sha256,
        )

        const fresh = await save()
        const empty = await reviewPage(fresh.review, owner)
        assert.match(empty, /Record feedback/)
        assert.doesNotMatch(empty, /GST rounding|reconciliation workbook/)
        assert.equal(
          (await submit(fresh.review, owner, { ...first, sha256: fresh.sha256 })).status,
          409,
        )

        const key = `finance-evidence/monthly-close/${fresh.id}.json`
        const archive = await files.get(key)
        assert.ok(archive)
        const body = await archive.text()
        const metadata = {
          customMetadata: archive.customMetadata,
          httpMetadata: archive.httpMetadata,
        }
        const blocked = {
          id: randomUUID(),
          sha256: fresh.sha256,
          outcome: 'reviewed',
          note: 'Should never appear for damaged evidence.',
        }
        await files.put(key, body.replace('"draft"', '"fraud"'), metadata)
        assert.equal((await submit(fresh.review, owner, blocked)).status, 503)
        await files.delete(key)
        assert.equal((await submit(fresh.review, owner, blocked)).status, 503)
        await files.put(key, body, metadata)
        assert.doesNotMatch(await reviewPage(fresh.review, owner), /Should never appear/)

        await db
          .prepare('DELETE FROM invoice_grant WHERE email = ? AND branch_id = ?')
          .bind(caEmail, branch)
          .run()
        assert.equal((await call(draft.review, { headers: accountant })).status, 404)
        assert.equal((await submit(draft.review, accountant, first)).status, 404)
      },
    )
    await t.test(
      'signed service collections distinguish unpublished data, receipt totals and branch access',
      async () => {
        const path = '/internal/v1/invoice-events/checkout-collections'
        const month = '2025-10'
        const branch = 'branch-1'
        const page = `/portal/collections?branch=${branch}&month=${month}`
        const caEmail = 'collections-ca.test@gmail.com'
        const accountant = await access(caEmail)
        await db
          .prepare("INSERT INTO invoice_grant(email,branch_id,role) VALUES (?, ?, 'accountant')")
          .bind(caEmail, branch)
          .run()
        await db
          .prepare(
            "INSERT INTO invoice_grant(email,branch_id,role) VALUES (?, 'branch-2', 'accountant')",
          )
          .bind(caEmail)
          .run()
        const getPage = async () => {
          const response = await call(page, { headers: accountant })
          assert.equal(response.status, 200)
          assert.equal(response.headers.get('cache-control'), 'private, no-store')
          return response.text()
        }
        const time = Date.now() - 2_000
        const payload = {
          version: 1,
          type: 'invoice.checkout-collections',
          source: 'staging',
          branchId: branch,
          month,
          observedAt: new Date(time).toISOString(),
          rows: [],
        }
        const post = (data, signed = true) => send(data, Date.now(), signed, path)
        assert.equal((await call(page)).status, 401)
        assert.equal((await call(page, { headers: await access(developer) })).status, 403)
        assert.equal((await call(page, { headers: other })).status, 404)
        assert.match(await getPage(), /No collections snapshot has been published/)
        assert.equal((await post(payload, false)).status, 401)
        assert.equal((await post({ ...payload, source: 'prod' })).status, 400)
        assert.equal((await post({ ...payload, month: '9999-10' })).status, 400)
        assert.equal(
          (await post({ ...payload, observedAt: new Date(time - 600_000).toISOString() })).status,
          400,
        )
        assert.equal((await post({ ...payload, branchId: 'branch-2' })).status, 201)
        assert.match(await getPage(), /No collections snapshot has been published/)
        assert.equal((await post(payload)).status, 201)
        assert.match(await getPage(), /published snapshot contains zero recorded receipts/)

        const cash = { day: '2025-10-11', method: 'cash', receiptCount: 1, totalPaise: 80000 }
        const upi = { day: '2025-10-12', method: 'upi', receiptCount: 2, totalPaise: 100099 }
        const populated = {
          ...payload,
          observedAt: new Date(time + 1).toISOString(),
          rows: [cash, upi],
        }
        assert.equal((await post({ ...populated, rows: [cash, cash] })).status, 400)
        assert.equal(
          (await post({ ...populated, rows: [{ ...cash, day: '2025-11-01' }] })).status,
          400,
        )
        assert.equal(
          (await post({ ...populated, rows: [{ ...cash, reference: 'private-reference' }] }))
            .status,
          400,
        )
        assert.equal((await post(populated)).status, 201)
        assert.equal((await post(populated)).status, 204)
        assert.equal((await post({ ...populated, rows: [upi] })).status, 409)
        assert.equal((await post(payload)).status, 204)
        const markup = await getPage()
        assert.match(markup, /Recorded service collections/)
        assert.match(markup, /Gross receipts<\/dt><dd>₹1,800\.99/)
        assert.match(markup, /<td>UPI<\/td>\s*<td>2<\/td>\s*<td>₹1,000\.99/)
        if (process.env.INVOICE_RUNTIME_COLLECTIONS_FIXTURES === '1') {
          const directory = new URL('../dist/portal-fixtures/', import.meta.url)
          await mkdir(directory, { recursive: true })
          await writeFile(new URL('checkout-collections.html', directory), markup)
        }
        await db
          .prepare('DELETE FROM invoice_grant WHERE email = ? AND branch_id = ?')
          .bind(caEmail, branch)
          .run()
        assert.equal((await call(page, { headers: accountant })).status, 404)
      },
    )

    await t.test(
      'cash close saves and approves scoped revisions and corrects cleared bank links',
      async () => {
        const branch = 'branch-1'
        const day = '2025-11-14'
        const cashClose = '/portal/cash-close'
        const page = `${cashClose}?branch=${branch}&day=${day}`
        const month = day.slice(0, 7)
        const monthPage = `${cashClose}/month?branch=${branch}&month=${month}`
        const monthCsv = `${cashClose}/month.csv?branch=${branch}&month=${month}`
        const cashCsvHeader =
          'schema_version,branch_id,business_month_ist,business_date_ist,source_observed_at_utc,close_revision,approval_status,collections_status,recorded_service_cash_paise,draft_service_cash_paise,expected_cash_paise,counted_cash_paise,variance_paise,deposit_paise,bank_credit_paise,bank_credit_revision,bank_credit_status'
        const readMonth = async (headers) => {
          const response = await call(monthPage, { headers })
          assert.equal(response.status, 200)
          assert.equal(response.headers.get('cache-control'), 'private, no-store')
          return response.text()
        }
        const readMonthCsv = async (headers) => {
          const response = await call(monthCsv, { headers })
          assert.equal(response.status, 200)
          assert.equal(response.headers.get('cache-control'), 'private, no-store')
          assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8')
          assert.equal(
            response.headers.get('content-disposition'),
            `attachment; filename="cash-close-${month}-${branch}.csv"`,
          )
          assert.equal(response.headers.get('x-invoice-report-month'), month)
          const reportId = response.headers.get('x-invoice-report-id')
          assert.match(reportId, /^[a-f\d-]{36}$/)
          const bytes = Buffer.from(await response.arrayBuffer())
          assert.equal(bytes.subarray(0, 3).toString('hex'), 'efbbbf')
          const [header, ...lines] = bytes.subarray(3).toString('utf8').trimEnd().split('\r\n')
          assert.equal(header, cashCsvHeader)
          const columns = header.split(',')
          const rows = lines.map((line) => {
            const cells = line.split(',')
            assert.equal(cells.length, columns.length)
            return Object.fromEntries(columns.map((column, index) => [column, cells[index]]))
          })
          return { reportId, bytes, rows }
        }
        const monthlyExportCount = () =>
          db.prepare('SELECT COUNT(*) FROM invoice_cash_close_month_export').first('COUNT(*)')
        const dayRow = (markup, date) => {
          const row = [...markup.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].find(([tag]) =>
            tag.includes(`day=${date}`),
          )
          assert.ok(row, `Expected a link to ${date} in the monthly table`)
          return row[0]
        }
        const origin = 'https://invoice.staging.test'
        const accountantEmail = 'drawer-ca.test@gmail.com'
        const managerEmail = 'drawer-manager.test@gmail.com'
        const accountant = await access(accountantEmail)
        const manager = await access(managerEmail)
        await db.batch([
          db
            .prepare('INSERT INTO invoice_grant VALUES (?, ?, ?)')
            .bind(accountantEmail, branch, 'accountant'),
          db
            .prepare('INSERT INTO invoice_grant VALUES (?, ?, ?)')
            .bind(managerEmail, branch, 'manager'),
          db
            .prepare('INSERT INTO invoice_staff_assignment VALUES (?, ?, ?)')
            .bind(managerEmail, branch, 'manager'),
        ])
        const time = Date.now() - 1_000
        const observedAt = new Date(time).toISOString()
        const payload = {
          version: 1,
          type: 'invoice.checkout-collections',
          source: 'staging',
          branchId: branch,
          month: day.slice(0, 7),
          observedAt,
          rows: [
            { day, method: 'cash', receiptCount: 2, totalPaise: 80_000 },
            { day, method: 'upi', receiptCount: 1, totalPaise: 60_000 },
          ],
        }
        const publish = (snapshot) =>
          send(snapshot, Date.now(), true, '/internal/v1/invoice-events/checkout-collections')
        const first = {
          branch,
          day,
          draftId: randomUUID(),
          observedAt,
          serviceCashPaise: '80000',
          opening: '200.00',
          otherReceipts: '100.00',
          refunds: '50.00',
          payouts: '25.05',
          deposits: '100.00',
          counted: '900.00',
          note: 'Counted after evening handover.',
        }
        const submit = (headers, form = {}, requestOrigin = origin) =>
          call(cashClose, {
            method: 'POST',
            redirect: 'manual',
            headers: { ...headers, origin: requestOrigin },
            body: new URLSearchParams({ ...first, ...form }),
          })
        const approvalNote = 'Owner reviewed the drawer shortage.'
        const approve = (headers, form = {}, requestOrigin = origin) =>
          call(`${cashClose}/approve`, {
            method: 'POST',
            redirect: 'manual',
            headers: { ...headers, origin: requestOrigin },
            body: new URLSearchParams({
              branch,
              day,
              draftId: first.draftId,
              approvalNote,
              ...form,
            }),
          })
        const bankReference = 'BANK-CREDIT-100'
        const recordRequestId = randomUUID()
        const recordDeposit = (headers, form, requestOrigin = origin) =>
          call(`${cashClose}/deposit`, {
            method: 'POST',
            redirect: 'manual',
            headers: { ...headers, origin: requestOrigin },
            body: new URLSearchParams({
              branch,
              day,
              requestId: recordRequestId,
              creditDate: '2025-11-15',
              bankReference,
              bankAmount: '100.00',
              ...form,
            }),
          })
        const voidReason = 'Correcting the drawer deposit link after reviewing the bank statement.'
        const voidDeposit = (headers, form, requestOrigin = origin) =>
          call(`${cashClose}/deposit/void`, {
            method: 'POST',
            redirect: 'manual',
            headers: { ...headers, origin: requestOrigin },
            body: new URLSearchParams({ branch, day, voidReason, ...form }),
          })
        const savedDeposits = async () =>
          (
            await db
              .prepare(`SELECT id, draft_id, credited_on, reference, amount_paise, recorded_by,
                        recorded_at, voided_by, voided_at, void_reason
                      FROM invoice_cash_deposit_evidence WHERE branch_id = ? AND day = ? ORDER BY id`)
              .bind(branch, day)
              .all()
          ).results
        const savedDrafts = async () =>
          (
            await db
              .prepare(`SELECT revision, service_cash_paise, expected_paise, variance_paise,
            note, recorded_by FROM invoice_cash_close_draft
            WHERE branch_id = ? AND day = ? ORDER BY revision`)
              .bind(branch, day)
              .all()
          ).results

        assert.equal((await call(page)).status, 401)
        assert.equal((await call(page, { headers: other })).status, 404)
        assert.equal((await call(monthPage)).status, 401)
        assert.equal((await call(monthPage, { headers: other })).status, 404)
        assert.equal((await call(monthPage, { headers: await access(developer) })).status, 403)
        assert.doesNotMatch(
          await (await call(`${cashClose}/month`, { headers: accountant })).text(),
          /href="\/portal\/cash-close\/month\.csv\?/,
        )
        for (const [path, headers, status] of [
          [monthCsv, undefined, 401],
          [monthCsv, other, 404],
          [monthCsv, await access(developer), 403],
          [`${cashClose}/month.csv?branch=${branch}`, owner, 400],
          [`${cashClose}/month.csv?month=${month}`, owner, 400],
          [`${cashClose}/month.csv?branch=${branch}&month=2025-13`, owner, 400],
          [`${cashClose}/month.csv?branch=${branch}&month=9999-12`, owner, 422],
        ]) {
          assert.equal((await call(path, { headers })).status, status)
        }
        assert.equal(await monthlyExportCount(), 0)
        assert.equal(
          (await call(`${cashClose}/month?branch=${branch}&month=2025-13`, { headers: owner }))
            .status,
          400,
        )
        assert.equal(
          (await call(`${cashClose}/month?branch=${branch}&month=9999-12`, { headers: owner }))
            .status,
          422,
        )
        assert.equal((await submit(other)).status, 404)
        assert.equal((await submit(accountant)).status, 403)
        assert.equal((await submit(owner, {}, 'https://elsewhere.example.invalid')).status, 403)
        assert.equal((await submit(owner)).status, 409)
        assert.deepEqual(await savedDrafts(), [])
        assert.equal((await publish(payload)).status, 201)
        const noDraftClose = dayRow(await readMonth(manager), day)
        assert.match(noDraftClose, /No draft/)
        assert.match(noDraftClose, /₹800\.00 recorded service cash/)
        assert.equal((await submit(owner, { day: '9999-12-31' })).status, 400)
        assert.equal((await submit(owner, { opening: '200.001' })).status, 400)
        assert.equal((await submit(owner, { counted: '-1' })).status, 400)
        assert.equal((await submit(owner, { serviceCashPaise: '80001' })).status, 409)
        assert.equal((await submit(owner, { note: '' })).status, 422)
        assert.deepEqual(await savedDrafts(), [])

        const duplicateSubmissions = await Promise.all([submit(owner), submit(owner)])
        for (const response of duplicateSubmissions) {
          assert.equal(response.status, 303)
          assert.equal(response.headers.get('location'), `${page}&saved=${first.draftId}`)
        }
        assert.equal((await savedDrafts()).length, 1)
        assert.equal((await submit(owner)).status, 303)
        assert.equal((await submit(owner, { note: 'A different count.' })).status, 409)

        assert.equal((await approve(other)).status, 404)
        assert.equal((await approve(accountant)).status, 403)
        assert.equal((await approve(manager)).status, 403)
        assert.equal((await approve(owner, {}, 'https://elsewhere.example.invalid')).status, 403)
        assert.equal((await approve(owner, { draftId: randomUUID() })).status, 404)
        assert.equal((await approve(owner, { approvalNote: ' ' })).status, 422)
        assert.match(await (await call(page, { headers: owner })).text(), /name="approvalNote"/)

        const sameCash = { ...payload, observedAt: new Date(time + 1).toISOString() }
        assert.equal((await publish(sameCash)).status, 201)
        for (const response of await Promise.all([approve(owner), approve(owner)])) {
          assert.equal(response.status, 303)
          assert.equal(response.headers.get('location'), `${page}&approved=${first.draftId}`)
        }
        const firstMonthClose = dayRow(await readMonth(accountant), day)
        assert.match(firstMonthClose, /Approved/)
        assert.match(firstMonthClose, /Short by ₹24\.95/)
        const startOfDownload = Date.now()
        const firstExport = await readMonthCsv(accountant)
        assert.deepEqual(firstExport.rows, [
          {
            schema_version: '1',
            branch_id: branch,
            business_month_ist: month,
            business_date_ist: day,
            source_observed_at_utc: sameCash.observedAt,
            close_revision: '1',
            approval_status: 'approved',
            collections_status: 'current',
            recorded_service_cash_paise: '80000',
            draft_service_cash_paise: '80000',
            expected_cash_paise: '92495',
            counted_cash_paise: '90000',
            variance_paise: '-2495',
            deposit_paise: '10000',
            bank_credit_paise: '',
            bank_credit_revision: '',
            bank_credit_status: 'awaiting_credit',
          },
        ])
        const firstAudit = await db
          .prepare(`SELECT id, actor_email, source, branch_id, month, generated_at,
            source_observed_at, row_count, schema_version, sha256
            FROM invoice_cash_close_month_export WHERE id = ?`)
          .bind(firstExport.reportId)
          .first()
        assert.ok(
          firstAudit.generated_at >= startOfDownload && firstAudit.generated_at <= Date.now(),
        )
        assert.deepEqual(firstAudit, {
          id: firstExport.reportId,
          actor_email: accountantEmail,
          source: 'staging',
          branch_id: branch,
          month,
          generated_at: firstAudit.generated_at,
          source_observed_at: Date.parse(sameCash.observedAt),
          row_count: 1,
          schema_version: 1,
          sha256: createHash('sha256').update(firstExport.bytes).digest('hex'),
        })
        assert.equal((await approve(owner, { approvalNote: 'Changed approval.' })).status, 409)
        assert.doesNotMatch(
          await (await call(page, { headers: owner })).text(),
          /name="approvalNote"/,
        )

        const updated = {
          ...payload,
          observedAt: new Date(time + 2).toISOString(),
          rows: [{ ...payload.rows[0], totalPaise: 90_000 }, payload.rows[1]],
        }
        assert.equal((await publish(updated)).status, 201)
        assert.equal((await submit(owner, { draftId: randomUUID() })).status, 409)
        assert.equal((await submit(owner)).status, 303)
        const second = {
          draftId: randomUUID(),
          observedAt: updated.observedAt,
          serviceCashPaise: '90000',
          counted: '1024.95',
          note: 'Added the late service receipt from the till.',
        }
        assert.equal((await submit(manager, { ...second, note: '' })).status, 422)
        assert.equal((await submit(manager, second)).status, 303)
        assert.equal((await approve(owner)).status, 303)
        assert.deepEqual(await savedDrafts(), [
          {
            revision: 1,
            service_cash_paise: 80_000,
            expected_paise: 92_495,
            variance_paise: -2_495,
            note: first.note,
            recorded_by: grants[0][0],
          },
          {
            revision: 2,
            service_cash_paise: 90_000,
            expected_paise: 102_495,
            variance_paise: 0,
            note: second.note,
            recorded_by: managerEmail,
          },
        ])

        const readOnly = await call(page, { headers: accountant })
        assert.equal(readOnly.status, 200)
        assert.equal(readOnly.headers.get('cache-control'), 'private, no-store')
        const markup = await readOnly.text()
        assert.match(markup, /Counted after evening handover\./)
        assert.match(markup, /Added the late service receipt from the till\./)
        assert.equal(markup.split(approvalNote).length, 2)
        assert.doesNotMatch(markup, /name="counted"/)
        assert.doesNotMatch(markup, /name="approvalNote"/)
        const differentCash = {
          ...updated,
          observedAt: new Date(time + 3).toISOString(),
          rows: [{ ...updated.rows[0], totalPaise: 95_000 }, updated.rows[1]],
        }
        assert.equal((await publish(differentCash)).status, 201)
        const changedMonthClose = dayRow(await readMonth(owner), day)
        assert.match(changedMonthClose, /₹950\.00 recorded service cash/)
        assert.match(changedMonthClose, /Recorded service cash changed/)
        assert.equal((await approve(owner, { draftId: second.draftId })).status, 409)

        const sameCashAgain = { ...updated, observedAt: new Date(time + 4).toISOString() }
        assert.equal((await publish(sameCashAgain)).status, 201)
        const third = {
          ...second,
          draftId: randomUUID(),
          observedAt: sameCashAgain.observedAt,
          note: 'Recount confirmed the same balance.',
        }
        assert.equal((await submit(manager, third)).status, 303)
        assert.equal((await approve(owner, { draftId: second.draftId })).status, 409)
        const bankForm = { draftId: third.draftId }
        assert.equal((await recordDeposit(owner, bankForm)).status, 409)
        assert.equal(
          (await approve(owner, { draftId: third.draftId, approvalNote: '' })).status,
          303,
        )

        const eligible = await (await call(page, { headers: owner })).text()
        assert.match(eligible, /name="bankAmount"/)
        assert.match(eligible, /name="requestId"/)

        assert.equal((await recordDeposit(other, bankForm)).status, 404)
        assert.equal((await recordDeposit(manager, bankForm)).status, 403)
        assert.equal((await recordDeposit(accountant, bankForm)).status, 403)
        assert.equal(
          (await recordDeposit(owner, bankForm, 'https://elsewhere.example.invalid')).status,
          403,
        )
        assert.equal((await recordDeposit(owner, { draftId: randomUUID() })).status, 404)
        assert.equal(
          (await recordDeposit(owner, { ...bankForm, creditDate: '2025-11-13' })).status,
          400,
        )
        assert.equal(
          (await recordDeposit(owner, { ...bankForm, creditDate: '9999-12-31' })).status,
          400,
        )
        assert.equal(
          (await recordDeposit(owner, { ...bankForm, bankReference: 'BAD!' })).status,
          400,
        )
        assert.equal((await recordDeposit(owner, { ...bankForm, bankAmount: '99.99' })).status, 422)
        for (const response of await Promise.all([
          recordDeposit(owner, bankForm),
          recordDeposit(owner, bankForm),
        ])) {
          assert.equal(response.status, 303)
          assert.equal(response.headers.get('location'), `${page}&deposit=recorded`)
        }
        assert.equal(
          (await recordDeposit(owner, { ...bankForm, bankReference: 'OTHER-CREDIT-100' })).status,
          409,
        )
        assert.equal(
          (await recordDeposit(owner, { ...bankForm, requestId: randomUUID() })).status,
          409,
        )
        const linked = await (
          await call(`${page}&deposit=recorded`, { headers: accountant })
        ).text()
        assert.equal(linked.split(bankReference).length, 2)
        assert.doesNotMatch(linked, /name="bankAmount"/)

        const fourth = { ...third, draftId: randomUUID(), note: 'Confirmed the deposit ledger.' }
        assert.equal((await submit(manager, fourth)).status, 303)
        const revisedMonthClose = dayRow(await readMonth(accountant), day)
        assert.match(revisedMonthClose, /Awaiting approval/)
        assert.match(revisedMonthClose, /Linked to revision 3/)
        assert.equal((await recordDeposit(owner, bankForm)).status, 303)
        assert.match(await (await call(page, { headers: accountant })).text(), /BANK-CREDIT-100/)

        const nextDay = '2025-11-15'
        const serviceOnlyDay = '2025-11-16'
        const upiOnlyDay = '2025-11-17'
        const nextSnapshot = {
          ...sameCashAgain,
          observedAt: new Date(time + 5).toISOString(),
          rows: [
            ...sameCashAgain.rows,
            { ...sameCashAgain.rows[0], day: nextDay },
            { ...sameCashAgain.rows[0], day: serviceOnlyDay },
            { ...sameCashAgain.rows[1], day: upiOnlyDay },
          ],
        }
        const nextDraft = {
          ...third,
          day: nextDay,
          draftId: randomUUID(),
          observedAt: nextSnapshot.observedAt,
        }
        assert.equal((await publish(nextSnapshot)).status, 201)
        assert.equal((await submit(manager, nextDraft)).status, 303)
        assert.equal(
          (await approve(owner, { day: nextDay, draftId: nextDraft.draftId })).status,
          303,
        )
        assert.equal(
          (
            await recordDeposit(owner, {
              day: nextDay,
              draftId: nextDraft.draftId,
              requestId: randomUUID(),
              bankReference: bankReference.toLowerCase(),
            })
          ).status,
          409,
        )

        const [original] = await savedDeposits()
        assert.equal(original.draft_id, third.draftId)
        assert.equal(original.voided_at, null)
        const voidForm = { evidenceId: original.id }
        assert.match(await (await call(page, { headers: owner })).text(), /name="voidReason"/)
        assert.equal((await voidDeposit(other, voidForm)).status, 404)
        assert.equal((await voidDeposit(manager, voidForm)).status, 403)
        assert.equal((await voidDeposit(accountant, voidForm)).status, 403)
        assert.equal(
          (await voidDeposit(owner, voidForm, 'https://elsewhere.example.invalid')).status,
          403,
        )
        assert.equal((await voidDeposit(owner, { ...voidForm, day: nextDay })).status, 404)
        assert.equal((await voidDeposit(owner, { ...voidForm, voidReason: ' ' })).status, 400)
        for (const response of await Promise.all([
          voidDeposit(owner, voidForm),
          voidDeposit(owner, voidForm),
        ])) {
          assert.equal(response.status, 303)
          assert.equal(response.headers.get('location'), `${page}&deposit=voided`)
        }
        assert.equal(
          (await voidDeposit(owner, { ...voidForm, voidReason: 'Changed reason.' })).status,
          409,
        )
        const [voided] = await savedDeposits()
        assert.ok(
          Number.isSafeInteger(voided.voided_at) && voided.voided_at >= original.recorded_at,
        )
        assert.deepEqual(await savedDeposits(), [
          {
            ...original,
            voided_by: grants[0][0],
            voided_at: voided.voided_at,
            void_reason: voidReason,
          },
        ])

        const replayVoided = await recordDeposit(owner, {
          ...bankForm,
          bankReference: bankReference.toLowerCase(),
        })
        assert.equal(replayVoided.status, 303)
        assert.equal(replayVoided.headers.get('location'), `${page}&deposit=already-voided`)
        assert.equal((await savedDeposits()).length, 1)
        const afterVoid = (await readMonthCsv(accountant)).rows.find(
          (row) => row.business_date_ist === day,
        )
        assert.equal(afterVoid.close_revision, '4')
        assert.equal(afterVoid.approval_status, 'awaiting_approval')
        assert.equal(afterVoid.bank_credit_paise, '')
        assert.equal(afterVoid.bank_credit_revision, '')
        assert.ok(
          await db
            .prepare('SELECT draft_id FROM invoice_cash_close_approval WHERE draft_id = ?')
            .bind(third.draftId)
            .first(),
        )

        const replacement = { draftId: fourth.draftId, requestId: randomUUID() }
        assert.equal((await recordDeposit(owner, replacement)).status, 409)
        assert.equal((await approve(owner, { draftId: fourth.draftId })).status, 303)
        assert.equal((await recordDeposit(owner, replacement)).status, 303)
        assert.equal((await voidDeposit(owner, voidForm)).status, 303)
        const [historic, active] = await savedDeposits()
        assert.deepEqual(historic, voided)
        assert.equal(active.draft_id, fourth.draftId)
        assert.equal(active.reference, original.reference)
        assert.equal(active.voided_at, null)

        const corrected = await (await call(page, { headers: accountant })).text()
        assert.match(corrected, new RegExp(voidReason))
        assert.doesNotMatch(corrected, /name="(?:bankAmount|voidReason)"/)
        const monthly = await readMonth(accountant)
        const linkedMonthClose = dayRow(monthly, day)
        assert.match(linkedMonthClose, /Approved<\/strong> · Revision 4/)
        assert.match(linkedMonthClose, /Credit linked/)
        assert.match(dayRow(monthly, nextDay), /Awaiting bank credit/)
        assert.match(dayRow(monthly, serviceOnlyDay), /No draft/)
        assert.doesNotMatch(monthly, new RegExp(`day=${upiOnlyDay}`))
        assert.doesNotMatch(monthly, /₹24\.95|BANK-CREDIT-100/)
        const adjustedDraft = {
          ...fourth,
          draftId: randomUUID(),
          observedAt: nextSnapshot.observedAt,
          deposits: '110.00',
          counted: '1014.95',
          note: 'Updated the drawer deposit against the closing count.',
        }
        assert.equal((await submit(manager, adjustedDraft)).status, 303)
        assert.equal((await approve(owner, { draftId: adjustedDraft.draftId })).status, 303)
        const zeroCashDay = '2025-11-18'
        assert.equal(
          (
            await submit(manager, {
              ...third,
              day: zeroCashDay,
              draftId: randomUUID(),
              observedAt: nextSnapshot.observedAt,
              serviceCashPaise: '0',
              counted: '124.95',
              note: '',
            })
          ).status,
          303,
        )
        const adjustedMonth = await readMonth(accountant)
        assert.match(dayRow(adjustedMonth, day), /Bank credit differs/)
        const downloadLink = adjustedMonth.match(
          /href="(\/portal\/cash-close\/month\.csv\?[^"<>]+)"/,
        )
        assert.ok(downloadLink)
        const href = new URL(downloadLink[1].replaceAll('&amp;', '&'), origin)
        assert.deepEqual(Object.fromEntries(href.searchParams), { branch, month })
        const adjustedExport = await readMonthCsv(accountant)
        assert.deepEqual(
          adjustedExport.rows.map((row) => row.business_date_ist),
          [day, nextDay, serviceOnlyDay, zeroCashDay],
        )
        const [latest, , cashWithoutDraft, noRecordedCash] = adjustedExport.rows
        assert.equal(latest.close_revision, '5')
        assert.equal(latest.deposit_paise, '11000')
        assert.equal(latest.bank_credit_paise, '10000')
        assert.equal(latest.bank_credit_revision, '4')
        assert.equal(latest.bank_credit_status, 'amount_differs')
        assert.equal(cashWithoutDraft.approval_status, 'no_draft')
        assert.equal(cashWithoutDraft.collections_status, 'uncompared')
        assert.equal(cashWithoutDraft.expected_cash_paise, '')
        assert.equal(noRecordedCash.recorded_service_cash_paise, '0')
        assert.equal(noRecordedCash.variance_paise, '0')
        assert.doesNotMatch(
          adjustedExport.bytes.toString('utf8'),
          /@|BANK-CREDIT|bank statement|Zoë/,
        )
        if (process.env.INVOICE_RUNTIME_CASH_CLOSE_FIXTURES === '1') {
          const directory = new URL('../dist/portal-fixtures/', import.meta.url)
          await mkdir(directory, { recursive: true })
          const ownerHistory = await (await call(page, { headers: owner })).text()
          await writeFile(new URL('cash-close.html', directory), ownerHistory)
          await writeFile(new URL('cash-close-month.html', directory), adjustedMonth)
        }

        await db
          .prepare(
            'DELETE FROM invoice_checkout_collections WHERE source = ? AND branch_id = ? AND month = ?',
          )
          .bind('staging', branch, payload.month)
          .run()
        const missingSource = await readMonth(accountant)
        const savedWithoutSource = dayRow(missingSource, day)
        assert.match(savedWithoutSource, /Source unavailable for this day/)
        assert.match(savedWithoutSource, /Bank credit differs/)
        assert.doesNotMatch(missingSource, new RegExp(`day=${serviceOnlyDay}`))
        const absentExport = await readMonthCsv(accountant)
        const absentDay = absentExport.rows.find((row) => row.business_date_ist === day)
        assert.equal(absentDay.collections_status, 'unavailable')
        assert.equal(absentDay.recorded_service_cash_paise, '')
        assert.equal(absentDay.source_observed_at_utc, '')
        assert.equal(absentDay.draft_service_cash_paise, '90000')
        assert.equal(
          await db
            .prepare('SELECT source_observed_at FROM invoice_cash_close_month_export WHERE id = ?')
            .bind(absentExport.reportId)
            .first('source_observed_at'),
          null,
        )
        assert.equal((await publish(nextSnapshot)).status, 201)

        const today = (time) => new Date(time + 330 * 60_000).toISOString().slice(0, 10)
        const now = Date.now()
        const currentDay = today(now)
        const currentMonth = currentDay.slice(0, 7)
        const lastCloseMonth = today(now - 24 * 60 * 60_000).slice(0, 7)
        const defaults = await call(`${cashClose}/month?branch=${branch}`, { headers: owner })
        assert.equal(defaults.status, 200)
        assert.match(
          await defaults.text(),
          new RegExp(`name="month" required value="${lastCloseMonth}"`),
        )
        assert.equal(
          (
            await publish({
              ...payload,
              month: currentMonth,
              observedAt: new Date(now).toISOString(),
              rows: [{ ...payload.rows[0], day: currentDay }],
            })
          ).status,
          201,
        )
        const currentReview = await call(
          `${cashClose}/month?branch=${branch}&month=${currentMonth}`,
          { headers: accountant },
        )
        assert.equal(currentReview.status, 200)
        assert.doesNotMatch(await currentReview.text(), new RegExp(`day=${currentDay}`))

        await db
          .prepare('DELETE FROM invoice_grant WHERE email = ? AND branch_id = ?')
          .bind(accountantEmail, branch)
          .run()
        assert.equal((await call(page, { headers: accountant })).status, 403)
        assert.equal((await call(monthPage, { headers: accountant })).status, 403)
        assert.equal((await call(monthCsv, { headers: accountant })).status, 403)
        assert.equal(await monthlyExportCount(), 4)
      },
    )

    await t.test('split checkout preserves two tenders on one private invoice', async () => {
      const fixture = {
        ...event,
        eventId: 'split-checkout',
        invoiceId: 'split-checkout',
        bookingId: 'booking-split-checkout',
        invoice: {
          ...event.invoice,
          templateVersion: 'takumi-v2',
          invoiceNumber: 'RG/2526/000101',
          issuedAt: '2025-12-15T08:00:00Z',
          bookingNumber: 'BK-SPLIT-CHECKOUT',
          paymentStatus: 'paid',
          paymentMethod: 'cash',
          paymentTenders: [
            { method: 'cash', amountPaise: 20000 },
            { method: 'upi', amountPaise: 30000 },
          ],
        },
      }
      const badTotal = {
        ...fixture,
        invoice: {
          ...fixture.invoice,
          paymentTenders: [
            fixture.invoice.paymentTenders[0],
            { method: 'upi', amountPaise: 30001 },
          ],
        },
      }
      assert.equal((await send(badTotal)).status, 400)
      assert.equal((await send(fixture)).status, 201)

      await db
        .prepare('UPDATE invoice_register_fact SET has_split_payment = 0 WHERE invoice_id = ?')
        .bind(fixture.invoiceId)
        .run()
      assert.equal((await send(fixture)).status, 204)
      const report = await call('/portal/reports/invoices.csv?month=2025-12&branch=branch-1', {
        headers: owner,
      })
      assert.equal(report.status, 200)
      assert.match(
        await report.text(),
        /split-checkout,RG\/2526\/000101,branch-1,.*service,paid,provisional,,split,50000,0,50000,0,0,0,50000,projected/,
      )

      const path = `/portal/invoices/${fixture.invoiceId}/pdf`
      assert.equal((await call(path)).status, 401)
      const pdf = await readPdf(owner, path)
      const [cached] = (await files.list({ prefix: `pdf-cache/${fixture.invoiceId}/` })).objects
      assert.ok(cached)
      await files.delete(cached.key)
      assert.deepEqual(await readPdf(owner, path), pdf)
      const [record] = (await files.list({ prefix: `records/${fixture.invoiceId}/` })).objects
      assert.ok(record)
      assert.equal(await (await files.get(record.key)).text(), JSON.stringify(fixture))

      if (process.env.INVOICE_RUNTIME_PDF_FIXTURES === '1') {
        await writeFile(new URL('../dist/pdf-fixtures/split-checkout.pdf', import.meta.url), pdf)
      }
    })

    const financeCaEmail = 'finance-ca.test@gmail.com'
    await db
      .prepare("INSERT INTO invoice_grant VALUES (?, 'branch-1', 'accountant')")
      .bind(financeCaEmail)
      .run()
    const financeCa = await access(financeCaEmail)
    await t.test(
      'refund requests reserve original tenders and require branch owner review',
      async () => {
        const path = '/portal/refunds/split-checkout'
        const managerEmail = 'refund-manager.test@gmail.com'
        for (const table of ['invoice_grant', 'invoice_staff_assignment']) {
          await db
            .prepare(`INSERT INTO ${table} VALUES (?, 'branch-1', 'manager')`)
            .bind(managerEmail)
            .run()
        }
        const manager = await access(managerEmail)
        const post = (suffix, identity, payload, origin = 'https://invoice.staging.test') =>
          call(`${path}${suffix}`, {
            method: 'POST',
            redirect: 'manual',
            headers: { ...identity, origin },
            body: new URLSearchParams(payload),
          })
        assert.equal((await call(path, { headers: other })).status, 404)
        assert.doesNotMatch(
          await (await call(path, { headers: financeCa })).text(),
          /Submit for review/,
        )
        const first = {
          requestId: randomUUID(),
          method: 'cash',
          amount: '150.01',
          lines: '1',
          reason: '<script>fixture</script>',
        }
        assert.equal((await post('', financeCa, first)).status, 403)
        assert.equal((await post('', manager, first, 'https://elsewhere.test')).status, 403)
        assert.equal((await post('', manager, { ...first, lines: '2' })).status, 422)
        assert.equal((await post('', manager, { ...first, amount: '300.00' })).status, 422)
        assert.equal((await post('', manager, first)).status, 303)
        assert.equal((await post('', manager, first)).status, 303)
        assert.equal((await post('', manager, { ...first, reason: 'Changed' })).status, 409)
        const another = {
          ...first,
          requestId: randomUUID(),
          amount: '50.00',
          reason: 'New request',
        }
        assert.equal((await post('', manager, another)).status, 409)
        const rejected = {
          requestId: first.requestId,
          decision: 'rejected',
          note: 'Recheck amount',
        }
        assert.equal((await post('/decision', manager, rejected)).status, 403)
        assert.equal((await post('/decision', owner, rejected)).status, 303)
        const duelling = await Promise.all([
          post('', manager, { ...another, amount: '150.00' }),
          post('', manager, { ...another, requestId: randomUUID(), amount: '150.00' }),
        ])
        assert.deepEqual(duelling.map((response) => response.status).sort(), [303, 409])
        const active = await db
          .prepare(
            'SELECT id FROM invoice_refund_request WHERE invoice_id = ? AND decision IS NULL',
          )
          .bind('split-checkout')
          .first()
        assert.ok(active)
        const approval = {
          requestId: active.id,
          decision: 'approved',
          note: 'Approved for follow-up',
        }
        assert.equal((await post('/decision', owner, approval)).status, 303)
        assert.equal((await post('/decision', owner, approval)).status, 303)
        assert.equal(
          (await post('/decision', owner, { ...approval, decision: 'rejected' })).status,
          409,
        )
        assert.equal(
          (
            await post('', manager, {
              ...another,
              requestId: randomUUID(),
              method: 'upi',
              amount: '300.00',
            })
          ).status,
          303,
        )
        const caPage = await call(path, { headers: financeCa })
        assert.equal(caPage.headers.get('cache-control'), 'private, no-store')
        const history = await caPage.text()
        assert.match(history, /Approved for follow-up/)
        assert.match(history, /&lt;script&gt;fixture&lt;\/script&gt;/)
        assert.doesNotMatch(history, /Approve request|Submit for review/)
        assert.deepEqual(
          await db
            .prepare('SELECT total_paise FROM issued_invoice WHERE id = ?')
            .bind('split-checkout')
            .first(),
          {
            total_paise: 50000,
          },
        )
      },
    )

    await t.test(
      'statement preview and import preserve branch scope and unique references',
      async () => {
        const path = '/portal/statements'
        const statement =
          'branch_id,posted_on,reference,direction,amount_paise\nbranch-1,2025-12-15,STMT-REF-0001,credit,44567'
        const form = { branch: 'branch-1', account: 'bank-test', statement }
        const post = (suffix, identity, data) =>
          call(`${path}/${suffix}`, {
            method: 'POST',
            redirect: 'manual',
            headers: { ...identity, origin: 'https://invoice.staging.test' },
            body: new URLSearchParams(data),
          })
        const preview = async (data, body = post('preview', owner, data)) => {
          const response = await body
          assert.equal(response.status, 200)
          const digest = (await response.text()).match(/name="digest" value="([a-f0-9]{64})"/)?.[1]
          assert.ok(digest)
          return { ...data, digest }
        }
        assert.equal((await post('preview', financeCa, form)).status, 403)
        assert.equal((await call(`${path}?branch=branch-1`, { headers: other })).status, 404)
        const csv = new FormData()
        csv.set('branch', form.branch)
        csv.set('account', form.account)
        csv.set('statement', new File([statement], 'statement.csv', { type: 'text/csv' }))
        const upload = new Request('https://invoice.staging.test/portal/statements/preview', {
          method: 'POST',
          headers: { ...owner, origin: 'https://invoice.staging.test' },
          body: csv,
        })
        const first = await preview(
          form,
          call(`${path}/preview`, {
            method: 'POST',
            headers: upload.headers,
            body: await upload.arrayBuffer(),
          }),
        )
        assert.equal(
          (await post('import', owner, { ...first, statement: statement.replace('44567', '1') }))
            .status,
          409,
        )
        const saved = await post('import', owner, first)
        assert.equal(saved.status, 303)
        const location = saved.headers.get('location')
        assert.ok(location)
        assert.equal((await post('import', owner, first)).headers.get('location'), location)
        const overlap = await preview({ ...form, statement: statement.replace('44567', '1') })
        assert.equal((await post('import', owner, overlap)).status, 409)
        const record = await call(location, { headers: financeCa })
        assert.equal(record.status, 200)
        assert.equal(record.headers.get('cache-control'), 'private, no-store')
        const markup = await record.text()
        assert.match(markup, /STMT-REF-0001/)
        assert.match(markup, /445\.67/)
        assert.doesNotMatch(markup, /Preview import/)
      },
    )
    await t.test(
      'signed settlement activity exposes branch money only to owners and explicitly approved accountants',
      async () => {
        const endpoint = '/internal/v1/invoice-events/branch-settlement'
        const path = '/portal/settlements?branch=branch-1&month=2025-12'
        const manager = await access('refund-manager.test@gmail.com')
        const now = Date.now() - 1000
        const report = {
          memberships: {
            deliveredMinutes: 71,
            deliveredValuePaise: 56789,
            ownMembersMinutes: -16,
            ownMembersValuePaise: -12000,
            toReceivePaise: 56789,
            toPayPaise: -12000,
          },
          gems: { issued: 211, redeemed: 63, toReceivePaise: 25705, toPayPaise: 0 },
        }
        const snapshot = {
          version: 1,
          type: 'invoice.branch-settlement',
          source: 'staging',
          branchId: 'branch-1',
          month: '2025-12',
          through: '2025-12-31',
          observedAt: new Date(now).toISOString(),
          report,
        }
        const today = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        const currentMonth = today.slice(0, 7)
        const currentPath = `/portal/settlements?branch=branch-1&month=${currentMonth}`
        const membershipBalances = {
          activeCount: 3,
          purchasedMinutes: 600,
          usedMinutes: 140,
          heldMinutes: 60,
          availableMinutes: 400,
          expiringAvailableMinutes: 80,
        }
        const currentSnapshot = {
          ...snapshot,
          month: currentMonth,
          through: today,
          membershipBalances,
        }
        const publish = (data, signed = true) => send(data, now, signed, endpoint)
        assert.equal((await publish(snapshot, false)).status, 401)
        assert.equal((await publish({ ...snapshot, through: '2025-12-30' })).status, 400)
        assert.equal((await publish({ ...snapshot, branchId: 'unregistered-branch' })).status, 404)
        assert.equal((await publish({ ...snapshot, membershipBalances })).status, 400)
        assert.equal(
          (
            await publish({
              ...currentSnapshot,
              membershipBalances: { ...membershipBalances, availableMinutes: 399 },
            })
          ).status,
          400,
        )
        assert.equal((await publish(currentSnapshot)).status, 201)
        assert.equal((await publish(snapshot)).status, 201)
        assert.equal((await publish(snapshot)).status, 204)
        const modified = { ...report, gems: { ...report.gems, issued: 999 } }
        assert.equal((await publish({ ...snapshot, report: modified })).status, 409)
        const older = {
          ...snapshot,
          observedAt: new Date(now - 500).toISOString(),
          report: modified,
        }
        assert.equal((await publish(older)).status, 204)

        const ownerView = await call(path, { headers: owner })
        assert.equal(ownerView.status, 200)
        assert.equal(ownerView.headers.get('cache-control'), 'private, no-store')
        const ownerMarkup = await ownerView.text()
        assert.match(ownerMarkup, /<dt>Membership amount to receive<\/dt><dd>[^<]*567\.89/)
        assert.match(ownerMarkup, /<dt>Gems issued<\/dt><dd>211<\/dd>/)
        assert.doesNotMatch(ownerMarkup, /Membership balances/)
        const ownerBalances = await call(currentPath, { headers: owner })
        assert.equal(ownerBalances.status, 200)
        const currentMarkup = await ownerBalances.text()
        assert.match(currentMarkup, /Active memberships sold by this branch as of/)
        assert.match(currentMarkup, /<dt>Active memberships<\/dt><dd>3<\/dd>/)
        assert.match(currentMarkup, /<dt>Purchased minutes<\/dt><dd>600<\/dd>/)
        assert.match(currentMarkup, /<dt>Held minutes<\/dt><dd>60<\/dd>/)
        assert.match(currentMarkup, /<dt>Used minutes after corrections<\/dt><dd>140<\/dd>/)
        assert.match(currentMarkup, /<dt>Available minutes<\/dt><dd>400<\/dd>/)
        assert.match(
          currentMarkup,
          /<dt>Available minutes expiring within 30 days<\/dt><dd>80<\/dd>/,
        )

        const managerView = await call(path, { headers: manager })
        assert.equal(managerView.status, 200)
        const managerMarkup = await managerView.text()
        assert.match(managerMarkup, /<dt>Minutes delivered at this branch<\/dt><dd>71<\/dd>/)
        assert.match(managerMarkup, /<dt>Gems redeemed<\/dt><dd>63<\/dd>/)
        assert.doesNotMatch(managerMarkup, /amount to receive|amount to pay|567\.89|257\.05/)
        const managerBalances = await (await call(currentPath, { headers: manager })).text()
        assert.match(managerBalances, /<dt>Available minutes<\/dt><dd>400<\/dd>/)
        assert.doesNotMatch(managerBalances, /amount to receive|amount to pay|567\.89|257\.05/)
        assert.equal((await call(path, { headers: financeCa })).status, 404)
        assert.equal((await call(currentPath, { headers: financeCa })).status, 404)
        assert.equal((await call(path, { headers: other })).status, 404)
        assert.equal((await call(currentPath, { headers: other })).status, 404)
        assert.equal((await call(path)).status, 401)

        const settlementAccess = '/portal/access/settlements'
        const origin = 'https://invoice.staging.test'
        const dev = await access(developer)
        const setAccess = (identity, enabled, overrides = {}, requestOrigin = origin) =>
          call(settlementAccess, {
            method: 'POST',
            redirect: 'manual',
            headers: { ...identity, origin: requestOrigin },
            body: new URLSearchParams({
              branch: 'branch-1',
              email: financeCaEmail,
              enabled,
              ...overrides,
            }),
          })
        const dashboard = (branch) =>
          call(`/portal/home?branch=${branch}&month=2025-12`, { headers: financeCa })
        const reportLink = /Branch settlement activity/

        assert.equal(
          (await edit(dev, financeCaEmail, 'accountant', 'none', 'branch-2')).status,
          303,
        )
        assert.doesNotMatch(await (await dashboard('branch-1')).text(), reportLink)
        assert.match(
          await (await call(accessPath, { headers: owner })).text(),
          /action="\/portal\/access\/settlements"/,
        )
        assert.doesNotMatch(
          await (await call(accessPath, { headers: dev })).text(),
          /action="\/portal\/access\/settlements"/,
        )
        assert.equal((await setAccess(financeCa, '1')).status, 403)
        assert.equal((await setAccess(manager, '1')).status, 403)
        assert.equal((await setAccess(dev, '1')).status, 403)
        assert.equal((await setAccess(owner, '1', { branch: 'branch-2' })).status, 403)
        assert.equal((await setAccess(owner, '1', {}, 'https://outside.test')).status, 403)
        assert.equal(
          (await setAccess(owner, '1', { email: 'refund-manager.test@gmail.com' })).status,
          409,
        )
        assert.equal((await setAccess(owner, '1')).status, 303)
        assert.equal((await setAccess(owner, '1')).status, 409)

        const accountantView = await call(path, { headers: financeCa })
        assert.equal(accountantView.status, 200)
        assert.equal(accountantView.headers.get('cache-control'), 'private, no-store')
        assert.match(
          await accountantView.text(),
          /<dt>Membership amount to receive<\/dt><dd>[^<]*567\.89/,
        )
        assert.match(
          await (await call(currentPath, { headers: financeCa })).text(),
          /<dt>Available minutes<\/dt><dd>400<\/dd>/,
        )
        assert.match(await (await dashboard('branch-1')).text(), reportLink)
        assert.doesNotMatch(await (await dashboard('branch-2')).text(), reportLink)
        assert.equal(
          (await call(path.replace('branch-1', 'branch-2'), { headers: financeCa })).status,
          404,
        )
        assert.equal((await setAccess(owner, '0')).status, 303)
        assert.equal((await call(path, { headers: financeCa })).status, 404)
        assert.doesNotMatch(await (await dashboard('branch-1')).text(), reportLink)
        assert.deepEqual(
          (
            await db
              .prepare(
                'SELECT actor, email, branch_id, enabled FROM invoice_settlement_grant_change ORDER BY rowid',
              )
              .all()
          ).results,
          [1, 0].map((enabled) => ({
            actor: grants[0][0],
            email: financeCaEmail,
            branch_id: 'branch-1',
            enabled,
          })),
        )

        await db
          .prepare("INSERT INTO invoice_staff_assignment VALUES (?, 'branch-1', 'manager')")
          .bind(financeCaEmail)
          .run()
        assert.equal((await setAccess(owner, '1')).status, 303)
        assert.equal((await edit(owner, financeCaEmail, 'manager', 'accountant')).status, 303)
        assert.doesNotMatch(
          await (await call(path, { headers: financeCa })).text(),
          /amount to receive|amount to pay/,
        )
        assert.equal((await edit(owner, financeCaEmail, 'accountant', 'manager')).status, 303)
        assert.equal((await call(path, { headers: financeCa })).status, 404)
        assert.equal((await setAccess(owner, '1')).status, 303)
        assert.equal((await edit(owner, financeCaEmail, 'revoke', 'accountant')).status, 303)
        assert.equal((await edit(owner, financeCaEmail, 'accountant')).status, 303)
        assert.equal((await call(path, { headers: financeCa })).status, 404)
        assert.equal((await setAccess(owner, '1')).status, 303)
        assert.equal(
          (await edit(dev, financeCaEmail, 'revoke', 'accountant', 'branch-2')).status,
          303,
        )
      },
    )
    await t.test(
      'supplier bills and private evidence preserve branch scope and payment history',
      async () => {
        const path = '/portal/expenses'
        const branch = 'branch-1'
        const month = '2025-12'
        const manager = await access('refund-manager.test@gmail.com')
        const actor = 'https://invoice.staging.test'
        const post = async (suffix, identity, data) => {
          const req = new Request(`${actor}${path}/${suffix}`, {
            method: 'POST',
            headers: { ...identity, origin: actor },
            body: data instanceof FormData ? data : new URLSearchParams(data),
          })
          return call(`${path}/${suffix}`, {
            method: 'POST',
            redirect: 'manual',
            headers: req.headers,
            body: await req.arrayBuffer(),
          })
        }
        const bill = {
          branch,
          requestId: randomUUID(),
          supplier: '=Supplier fixture',
          billNumber: 'BILL-25-1',
          billedOn: '2025-12-05',
          category: 'utilities',
          amount: '100.23',
          gst: '',
        }
        assert.equal((await post('bills', financeCa, bill)).status, 403)
        assert.equal((await post('bills', other, bill)).status, 404)
        const saved = await post('bills', manager, bill)
        assert.equal(saved.status, 303)
        const location = saved.headers.get('location')
        assert.ok(location)
        assert.equal((await post('bills', manager, bill)).headers.get('location'), location)
        assert.equal(
          (await post('bills', manager, { ...bill, requestId: randomUUID() })).status,
          409,
        )
        assert.equal((await call(location, { headers: other })).status, 404)
        const payment = {
          branch,
          billId: bill.requestId,
          requestId: randomUUID(),
          paidOn: '2025-12-07',
          method: 'upi',
          amount: '75.13',
          reference: 'BANK-FIXTURE-25',
        }
        assert.equal((await post('payments', manager, payment)).status, 403)
        assert.equal((await post('payments', owner, payment)).status, 303)
        assert.equal((await post('payments', owner, payment)).status, 303)
        assert.equal(
          (
            await post('payments', owner, {
              ...payment,
              requestId: randomUUID(),
              amount: '25.11',
              reference: 'NEW-REFERENCE',
            })
          ).status,
          409,
        )
        const evidencePath = `bills/${bill.requestId}/evidence?branch=${branch}`
        const form = new FormData()
        form.set(
          'file',
          new Blob(['%PDF-1.7\nfixture'], { type: 'application/pdf' }),
          'supplier.pdf',
        )
        assert.equal((await post(evidencePath, financeCa, form)).status, 403)
        const interrupted = '%PDF-1.7\ninterrupted upload'
        const interruptedHash = createHash('sha256').update(interrupted).digest('hex')
        await files.put(
          `finance-evidence/expenses/${bill.requestId}/${interruptedHash}.pdf`,
          interrupted,
          {
            customMetadata: { sha256: interruptedHash },
          },
        )
        assert.equal((await call(`${path}/${evidencePath}`, { headers: financeCa })).status, 404)
        assert.equal((await post(evidencePath, manager, form)).status, 303)
        const evidence = await call(`${path}/${evidencePath}`, { headers: financeCa })
        assert.equal(evidence.status, 200)
        assert.equal(evidence.headers.get('cache-control'), 'private, no-store')
        assert.equal(await evidence.text(), '%PDF-1.7\nfixture')
        const evidenceHash = createHash('sha256').update('%PDF-1.7\nfixture').digest('hex')
        const objectKey = `finance-evidence/expenses/${bill.requestId}/${evidenceHash}.pdf`
        const archived = await files.get(objectKey)
        assert.ok(archived)
        const bytes = await archived.arrayBuffer()
        const sha256 = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
        assert.equal(archived.customMetadata.sha256, sha256)
        await files.delete(objectKey)
        assert.equal((await call(`${path}/${evidencePath}`, { headers: financeCa })).status, 503)
        await files.put(objectKey, new TextEncoder().encode('%PDF-1.7\ntamper!'))
        assert.equal((await call(`${path}/${evidencePath}`, { headers: financeCa })).status, 503)
        await files.put(objectKey, bytes, { customMetadata: { sha256 } })
        assert.equal(
          await (await call(`${path}/${evidencePath}`, { headers: financeCa })).text(),
          '%PDF-1.7\nfixture',
        )
        const register = await call(`${path}/register.csv?branch=${branch}&month=${month}`, {
          headers: financeCa,
        })
        assert.equal(register.status, 200)
        const id = register.headers.get('x-invoice-report-id')
        assert.ok(id)
        const csv = await register.text()
        assert.match(csv, /'=Supplier fixture/)
        assert.match(csv, /10023,,7513,2510,part_paid,attached/)
        assert.doesNotMatch(csv, /BANK-FIXTURE-25/)
        assert.equal(
          (
            await post('void', owner, {
              branch,
              billId: bill.requestId,
              paymentId: payment.requestId,
              reason: 'Fixture correction',
            })
          ).status,
          303,
        )
        const updated = await call(`${path}/register.csv?branch=${branch}&month=${month}`, {
          headers: financeCa,
        })
        assert.match(await updated.text(), /10023,,0,10023,unpaid,attached/)
      },
    )

    await t.test(
      'published outbox recovery preserves exact event bytes without reconstructing email history',
      async () => {
        const id = 'recovered-automatic'
        const fixture = {
          ...eligible,
          eventId: id,
          invoiceId: id,
          bookingId: 'recovery-booking',
          invoice: { ...eligible.invoice, invoiceNumber: 'RECOVERY/FIXTURE/001' },
        }
        const eventBody = JSON.stringify(fixture, null, 2)
        const hash = createHash('sha256').update(eventBody).digest('hex')
        const key = `records/${id}/${hash}.json`
        const request = { version: 1, type: 'invoice.recovery', eventBody }
        const recover = (data = request, signed = true) =>
          send(data, Date.now(), signed, '/internal/v1/invoice-events/recover')
        const deliveryRows = (invoiceId) =>
          db
            .prepare('SELECT * FROM invoice_delivery WHERE invoice_id = ? ORDER BY operation_id')
            .bind(invoiceId)
            .all()

        assert.equal((await recover(request, false)).status, 401)
        assert.equal((await recover(eventBody)).status, 400)
        assert.equal((await send(request)).status, 400)
        await files.put(key, 'Corrupt fixture bytes')
        assert.equal((await recover()).status, 409)
        assert.equal(
          await db.prepare('SELECT 1 FROM issued_invoice WHERE id = ?').bind(id).first(),
          null,
        )
        assert.equal(await (await files.get(key)).text(), 'Corrupt fixture bytes')
        await files.delete(key)

        assert.equal((await recover()).status, 201)
        assert.equal((await recover()).status, 204)
        assert.equal(await (await files.get(key)).text(), eventBody)
        const restored = await db
          .prepare(
            'SELECT recovered_from_outbox, snapshot_hash, snapshot_key FROM issued_invoice WHERE id = ?',
          )
          .bind(id)
          .first()
        assert.deepEqual(restored, {
          recovered_from_outbox: 1,
          snapshot_hash: hash,
          snapshot_key: key,
        })
        assert.equal((await send(eventBody)).status, 204)
        assert.deepEqual((await deliveryRows(id)).results, [])

        const email = `/portal/invoices/${id}/email`
        const preview = await call(email, { headers: owner })
        assert.equal(preview.status, 200)
        assert.match(await preview.text(), /Automatic email history is missing/)
        assert.equal(
          (
            await call(email, {
              method: 'POST',
              redirect: 'manual',
              headers: { ...owner, origin: 'https://invoice.staging.test' },
              body: new URLSearchParams({ operationId: randomUUID() }),
            })
          ).status,
          409,
        )
        assert.deepEqual((await deliveryRows(id)).results, [])

        const originalHistory = (await deliveryRows(eligible.invoiceId)).results
        assert.ok(originalHistory.length > 0)
        const original = await db
          .prepare('SELECT snapshot_key FROM issued_invoice WHERE id = ?')
          .bind(eligible.invoiceId)
          .first()
        await files.delete(original.snapshot_key)
        await db
          .prepare('DELETE FROM invoice_line_tax_fact WHERE invoice_id = ?')
          .bind(eligible.invoiceId)
          .run()
        const originalBody = JSON.stringify(eligible)
        assert.equal((await recover({ ...request, eventBody: originalBody })).status, 204)
        assert.equal(await (await files.get(original.snapshot_key)).text(), originalBody)
        assert.equal(
          (
            await db
              .prepare('SELECT COUNT(*) AS count FROM invoice_line_tax_fact WHERE invoice_id = ?')
              .bind(eligible.invoiceId)
              .first()
          ).count,
          eligible.invoice.items.length,
        )
        assert.deepEqual((await deliveryRows(eligible.invoiceId)).results, originalHistory)
      },
    )

    await t.test(
      'archives original PDF bytes without creating an issued or delivery record',
      async () => {
        const path = '/internal/v1/invoice-events/archive-original'
        const id = 'legacy-archived-fixture'
        const rendered = await call(`/portal/invoices/${event.invoiceId}/pdf`, { headers: owner })
        assert.equal(rendered.status, 200)
        const pdf = Buffer.from(await rendered.arrayBuffer())
        const sha256 = createHash('sha256').update(pdf).digest('hex')
        const key = `original-archive/${id}/${sha256}.pdf`
        const archive = {
          version: 1,
          type: 'invoice.original-archive',
          source: 'staging',
          invoiceId: id,
          branchId: 'branch-1',
          bookingId: 'legacy-archive-booking',
          bookingNumber: 'BK-ARCHIVE-FIXTURE',
          invoiceNumber: 'LEGACY/FIXTURE/001',
          recordedAt: '2025-05-30T10:00:00Z',
          dateBasis: 'created_at',
          totalPaise: 50000,
          pdfBase64: pdf.toString('base64'),
        }
        const submit = (payload = archive, signed = true) => send(payload, Date.now(), signed, path)
        assert.equal((await submit(archive, false)).status, 401)
        assert.equal((await submit(event)).status, 400)
        assert.equal((await send(archive)).status, 400)
        assert.equal((await submit({ ...archive, branchId: 'missing-archive-branch' })).status, 409)
        assert.equal(
          (await submit({ ...archive, pdfBase64: Buffer.from('not a PDF').toString('base64') }))
            .status,
          422,
        )
        assert.equal(
          (await submit({ ...archive, pdfBase64: pdf.subarray(0, -16).toString('base64') })).status,
          422,
        )
        assert.equal(
          await db.prepare('SELECT 1 FROM original_invoice_archive WHERE id = ?').bind(id).first(),
          null,
        )
        assert.equal((await submit({ ...archive, invoiceId: event.invoiceId })).status, 409)
        assert.equal(
          (await submit({ ...archive, invoiceNumber: event.invoice.invoiceNumber })).status,
          409,
        )
        assert.equal((await submit()).status, 201)
        const metadata = db
          .prepare('SELECT archived_at, sha256, bytes FROM original_invoice_archive WHERE id = ?')
          .bind(id)
        const saved = await metadata.first()
        assert.equal(saved.sha256, sha256)
        assert.equal(saved.bytes, pdf.length)
        assert.equal((await submit()).status, 204)
        assert.equal((await submit({ ...archive, totalPaise: 50001 })).status, 409)
        assert.equal(
          (await submit({ ...archive, invoiceId: 'duplicate-archived-number' })).status,
          409,
        )
        assert.equal(
          (
            await submit({
              ...archive,
              pdfBase64: Buffer.concat([pdf, Buffer.from('\n')]).toString('base64'),
            })
          ).status,
          409,
        )

        const archiveSearch = `/portal/search?booking=${archive.bookingId}`
        const found = await call(archiveSearch, { headers: owner })
        assert.equal(found.status, 200)
        const page = await found.text()
        assert.match(page, /Download archived original PDF/)
        assert.match(page, /billing record date/)
        assert.doesNotMatch(page, /Email invoice|Refund review/)
        const hidden = await call(archiveSearch, { headers: other })
        assert.doesNotMatch(await hidden.text(), /LEGACY\/FIXTURE\/001/)
        const downloadPath = `/portal/archive/${id}/pdf`
        assert.equal((await call(downloadPath)).status, 401)
        assert.equal((await call(downloadPath, { headers: other })).status, 404)
        const downloaded = await call(downloadPath, { headers: owner })
        assert.equal(downloaded.status, 200)
        assert.equal(downloaded.headers.get('cache-control'), 'private, no-store')
        assert.equal(downloaded.headers.get('content-type'), 'application/pdf')
        assert.match(downloaded.headers.get('content-disposition'), /^attachment;/)
        assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf)
        assert.equal(
          await db.prepare('SELECT 1 FROM issued_invoice WHERE id = ?').bind(id).first(),
          null,
        )
        assert.equal(
          await db.prepare('SELECT 1 FROM invoice_delivery WHERE invoice_id = ?').bind(id).first(),
          null,
        )

        const damaged = Buffer.from(pdf)
        damaged[damaged.length - 1] ^= 1
        await files.put(key, damaged)
        assert.equal((await submit()).status, 409)
        assert.equal((await call(downloadPath, { headers: owner })).status, 503)
        await files.delete(key)
        assert.equal((await call(downloadPath, { headers: owner })).status, 503)
        assert.equal((await submit()).status, 204)
        assert.deepEqual(await metadata.first(), saved)
        assert.deepEqual(Buffer.from(await (await files.get(key)).arrayBuffer()), pdf)
      },
    )

    await t.test('disposable restore retains D1 records and private R2 evidence', async () => {
      const restored = await runtime.getD1Database('RESTORE_DB')
      const copiedFiles = await runtime.getR2Bucket('RESTORE_FILES')
      // Use the same local D1 exporter as Wrangler so SQL quoting and schema round-trip together.
      const [dump] = await db.prepare('PRAGMA miniflare_d1_export(?,?,?);').bind(false, false).raw()
      assert.ok(dump?.length > 30)
      await restored.batch(dump.map((sql) => restored.prepare(sql)))
      const checks = [
        'SELECT * FROM invoice_effective_grant ORDER BY email, branch_id',
        'SELECT * FROM invoice_delivery ORDER BY operation_id',
        'SELECT * FROM invoice_email_webhook_receipt ORDER BY event_id',
        'SELECT * FROM invoice_refund_request ORDER BY id',
        'SELECT * FROM invoice_cash_deposit_evidence ORDER BY id',
        'SELECT * FROM invoice_statement_entry ORDER BY branch_id, account, reference',
        'SELECT * FROM invoice_branch_settlement ORDER BY source, branch_id, month',
        'SELECT * FROM invoice_settlement_access ORDER BY email, branch_id',
        'SELECT * FROM invoice_settlement_grant_change ORDER BY id',
        'SELECT * FROM invoice_supplier_payment ORDER BY id',
        'SELECT * FROM invoice_supplier_register_export ORDER BY id',
        'SELECT * FROM original_invoice_archive ORDER BY id',
      ]
      for (const sql of checks) {
        const original = (await db.prepare(sql).all()).results
        assert.ok(original.length, sql)
        assert.deepEqual((await restored.prepare(sql).all()).results, original, sql)
      }
      const references = (
        await restored
          .prepare(`
        SELECT snapshot_key AS key, snapshot_hash AS hash FROM issued_invoice WHERE id = 'split-checkout'
        UNION ALL SELECT object_key, sha256 FROM invoice_monthly_close_draft
        UNION ALL SELECT 'finance-evidence/expenses/' || bill_id || '/' || sha256 || '.pdf', sha256
          FROM invoice_supplier_bill_evidence
        UNION ALL SELECT 'original-archive/' || id || '/' || sha256 || '.pdf', sha256
          FROM original_invoice_archive
      `)
          .all()
      ).results
      assert.ok(references.length >= 3)
      for (const { key, hash } of references) {
        assert.match(key, /^(records|finance-evidence|original-archive)\//)
        const archived = await files.get(key)
        assert.ok(archived, key)
        const bytes = Buffer.from(await archived.arrayBuffer())
        assert.equal(createHash('sha256').update(bytes).digest('hex'), hash)
        await copiedFiles.put(key, bytes, { customMetadata: archived.customMetadata })
        assert.deepEqual(Buffer.from(await (await copiedFiles.get(key)).arrayBuffer()), bytes)
      }
      assert.deepEqual((await copiedFiles.list({ prefix: 'pdf-cache/' })).objects, [])
    })

    await t.test(
      'reports quota rejections and holds a previously uncertain invoice send',
      async () => {
        const outcomes = [
          ['daily_quota_exceeded', false, 'failed', 'Resend daily sending quota reached'],
          ['monthly_quota_exceeded', false, 'failed', 'Resend monthly sending quota reached'],
          ['daily_quota_exceeded', true, 'uncertain', 'Resend daily sending quota reached'],
        ]
        for (const [index, [quota, hadAmbiguousAttempt, state, label]] of outcomes.entries()) {
          const id = `quota-rehearsal-${index}`
          const invoiceNumber = `QUOTA/STAGING/${index + 1}`
          const subject = `Royal Glow invoice ${invoiceNumber}`
          const operation = `initial:${id}`
          assert.equal(
            (
              await send({
                ...eligible,
                eventId: id,
                invoiceId: id,
                invoice: { ...eligible.invoice, invoiceNumber },
              })
            ).status,
            201,
          )
          const delivery = db
            .prepare(
              'SELECT state, failure, attempts, provider_id AS providerId FROM invoice_delivery WHERE operation_id = ?',
            )
            .bind(operation)
          if (hadAmbiguousAttempt) {
            providerResponses.set(subject, new Response(null, { status: 503 }))
            await sweep()
            assert.equal((await delivery.first()).state, 'retry')
            await db
              .prepare('UPDATE invoice_delivery SET due_at = 0 WHERE operation_id = ?')
              .bind(operation)
              .run()
          }
          providerResponses.set(subject, Response.json({ name: quota }, { status: 429 }))
          await sweep()
          assert.deepEqual(await delivery.first(), {
            state,
            failure: quota,
            attempts: hadAmbiguousAttempt ? 2 : 1,
            providerId: null,
          })
          const page = await call(`/portal/invoices/${id}/email`, { headers: owner })
          const body = await page.text()
          assert.match(body, new RegExp(label))
          if (hadAmbiguousAttempt) assert.doesNotMatch(body, /Queue invoice email/)
          else assert.match(body, /Queue invoice email/)
          const requests = attempts.filter((attempt) => attempt.body.subject === subject)
          assert.equal(requests.length, hadAmbiguousAttempt ? 2 : 1)
          if (hadAmbiguousAttempt) assert.equal(requests[0].key, requests[1].key)
        }
      },
    )
  } finally {
    await runtime.dispose()
  }
}

test('invoice portal Worker with disposable services', (t) => exerciseInvoiceWorker(t, true))
test('legacy resends stay paused by default during delivery cutover', (t) =>
  exerciseInvoiceWorker(t, false))
