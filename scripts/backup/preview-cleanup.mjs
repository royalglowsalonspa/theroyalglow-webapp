import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { SQL } from 'bun'

// Only these record types can appear in a removal allowlist. The preview checks
// every incoming FK regardless of whether its source table is eligible.
const eligible = new Set([
  'public.booking',
  'public.booking_service',
  'public.booking_status_log',
  'public.booking_reassignment',
  'public.staff_occupancy',
  'public.staff_work',
  'public.invoice',
  'public.invoice_item',
  'public.spa_membership',
  'public.membership_hold',
  'public.membership_correction',
  'public.membership_session_completion',
  'public.loyalty_transaction',
  'public.loyalty_allocation',
  'public.settlement_entry',
  'public.offer',
  'public.offer_service',
  'public.offer_redemption',
  'public.notification',
  'public.lead',
  'public.lead_note',
  'public.waitlist',
  'cms.offer',
  'cms.offer_rels',
  'cms._offer_v',
  'cms._offer_v_rels',
])

// These references are maintained by the application rather than PostgreSQL.
const applicationLinks = [
  ['public.booking', 'id', 'public.offer_redemption', 'booking_id'],
  ['public.invoice', 'id', 'public.spa_membership', 'invoice_id'],
  ['cms.offer', 'id', 'public.offer', 'cms_id'],
  ['public.offer', 'cms_id', 'cms.offer', 'id'],
]

const reportFields = {
  'public.booking': ['branch_id', 'customer_id', 'status', 'total_amount_paise', 'redemption_key'],
  'public.invoice': [
    'branch_id',
    'customer_id',
    'payment_status',
    'payment_reference',
    'financial_year',
    'invoice_number',
    'total_amount_paise',
    'gst_amount_paise',
    'pdf_url',
  ],
  'public.spa_membership': [
    'customer_id',
    'price_paid_paise',
    'total_hours_minutes',
    'used_hours_minutes',
    'reserved_minutes',
  ],
  'public.membership_hold': ['spa_membership_id', 'minutes', 'state'],
  'public.membership_correction': ['membership_id', 'available_minutes_delta'],
  'public.loyalty_transaction': ['loyalty_account_id', 'gems_amount', 'type'],
  'public.loyalty_allocation': ['gems'],
  'public.settlement_entry': [
    'posting_month',
    'value_paise',
    'gst_share_paise',
    'amount_owed_paise',
  ],
  'public.offer': ['cms_id', 'image_url'],
  'public.notification': ['type', 'status', 'channel'],
  'cms.offer': ['image_id'],
  'cms._offer_v': ['version_image_id'],
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim().length > 0
const digest = (value) => createHash('sha256').update(value).digest('hex')
const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`
const qualified = (relation) => `${quote(relation.schema_name)}.${quote(relation.table_name)}`
const identity = (table, key) => JSON.stringify([table, Object.entries(key).sort()])

export function parseAllowlist(content) {
  const manifest = JSON.parse(content)
  if (
    !isObject(manifest) ||
    manifest.version !== 1 ||
    !isText(manifest.reviewReference) ||
    typeof manifest.dumpSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest.dumpSha256) ||
    !Array.isArray(manifest.rows) ||
    !manifest.rows.length
  ) {
    throw new Error('Provide version 1, a review reference, a SHA-256 dump hash and reviewed rows.')
  }

  const seen = new Set()
  for (const row of manifest.rows) {
    if (
      !isObject(row) ||
      !eligible.has(row.table) ||
      !isText(row.evidenceReference) ||
      !isObject(row.key) ||
      !Object.keys(row.key).length ||
      !Object.values(row.key).every(isText)
    ) {
      throw new Error(
        'Each row needs an eligible table, exact string key values and an evidence reference.',
      )
    }
    const token = identity(row.table, row.key)
    if (seen.has(token)) throw new Error('The reviewed allowlist contains a duplicate row.')
    seen.add(token)
  }
  return manifest
}

export function verifyBackupReference(allowlist, backup) {
  if (
    !isObject(backup) ||
    backup.version !== 1 ||
    typeof backup.key !== 'string' ||
    !/^weekly\/rgss_full_[0-9]{8}T[0-9]{6}Z_[0-9]+-[0-9]+\.dump$/.test(backup.key) ||
    backup.dumpSha256 !== allowlist.dumpSha256
  ) {
    throw new Error('The allowlist must name the selected full-backup manifest checksum.')
  }
  return backup.key
}

async function loadCatalog(sql) {
  const tables = await sql`
    SELECT c.oid::text AS oid, n.nspname AS schema_name, c.relname AS table_name,
           ARRAY(SELECT a.attname::text FROM unnest(p.conkey) WITH ORDINALITY k(num, ord)
                 JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.num
                 ORDER BY k.ord) AS key_columns
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_constraint p ON p.conrelid = c.oid AND p.contype = 'p'
    WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_%'
  `
  const relations = new Map(
    tables.map((table) => [`${table.schema_name}.${table.table_name}`, table]),
  )
  const byOid = new Map(tables.map((table) => [table.oid, table]))
  const foreignKeys = await sql`
    SELECT f.conname AS name, f.confrelid::text AS target_oid, f.conrelid::text AS source_oid,
           f.confdeltype::text AS delete_action,
           array_agg(s.attname::text ORDER BY k.ord) AS source_columns,
           array_agg(t.attname::text ORDER BY k.ord) AS target_columns
    FROM pg_constraint f
    CROSS JOIN LATERAL unnest(f.conkey, f.confkey) WITH ORDINALITY k(source_num, target_num, ord)
    JOIN pg_attribute s ON s.attrelid = f.conrelid AND s.attnum = k.source_num
    JOIN pg_attribute t ON t.attrelid = f.confrelid AND t.attnum = k.target_num
    WHERE f.contype = 'f'
    GROUP BY f.oid
    ORDER BY f.conname, f.oid
  `
  return { relations, byOid, foreignKeys }
}

function whereKey(relation, key, alias) {
  const columns = relation.key_columns
  if (
    !columns.length ||
    Object.keys(key).length !== columns.length ||
    columns.some((column) => !Object.hasOwn(key, column))
  ) {
    throw new Error('An approved row does not name every primary-key column exactly.')
  }
  return {
    where: columns.map((column, n) => `${alias}.${quote(column)} = $${n + 1}`).join(' AND '),
    parameters: columns.map((column) => key[column]),
  }
}

const textFields = (alias, fields) =>
  fields.map((field) => `${alias}.${quote(field)}::text AS ${quote(field)}`).join(', ')
const keyFrom = (relation, row) =>
  Object.fromEntries(relation.key_columns.map((col) => [col, row[col]]))

async function selectedRow(sql, entry, relation) {
  const { where, parameters } = whereKey(relation, entry.key, 't')
  const fields = [...new Set([...relation.key_columns, ...(reportFields[entry.table] ?? [])])]
  const [row] = await sql.unsafe(
    `SELECT ${textFields('t', fields)} FROM ${qualified(relation)} t WHERE ${where}`,
    parameters,
  )
  return row && identity(entry.table, keyFrom(relation, row)) === identity(entry.table, entry.key)
    ? row
    : null
}

async function incomingRows(sql, entry, relation, catalog, approved) {
  const relationships = catalog.foreignKeys.filter((key) => key.target_oid === relation.oid)
  for (const [target, targetColumn, source, sourceColumn] of applicationLinks) {
    if (target !== entry.table) continue
    const related = catalog.relations.get(source)
    if (!related) throw new Error('The release schema is missing a known cleanup relationship.')
    relationships.push({
      name: `application:${source}.${sourceColumn}`,
      source_oid: related.oid,
      source_columns: [sourceColumn],
      target_columns: [targetColumn],
      delete_action: 'application',
    })
  }

  const { where, parameters } = whereKey(relation, entry.key, 't')
  const incoming = []
  for (const key of relationships) {
    const source = catalog.byOid.get(key.source_oid)
    if (!source) throw new Error('An incoming relationship has an unsupported source relation.')
    const table = `${source.schema_name}.${source.table_name}`
    const join = key.source_columns
      .map((column, n) => `s.${quote(column)} = t.${quote(key.target_columns[n])}`)
      .join(' AND ')
    const fieldList = source.key_columns.length
      ? textFields('s', source.key_columns)
      : 'count(*)::text AS count'
    const rows = await sql.unsafe(
      `SELECT ${fieldList} FROM ${qualified(source)} s JOIN ${qualified(relation)} t ON ${join} WHERE ${where}${source.key_columns.length ? ` ORDER BY ${source.key_columns.map((column) => `s.${quote(column)}`).join(', ')}` : ''}`,
      parameters,
    )
    for (const row of rows) {
      const relatedKey = source.key_columns.length ? keyFrom(source, row) : null
      if (!relatedKey && row.count === '0') continue
      incoming.push({
        table,
        key: relatedKey,
        count: relatedKey ? '1' : row.count,
        relationship: key.name,
        deleteAction:
          { a: 'no action', r: 'restrict', c: 'cascade', n: 'set null', d: 'set default' }[
            key.delete_action
          ] ?? key.delete_action,
        reviewed: relatedKey !== null && approved.has(identity(table, relatedKey)),
      })
    }
  }
  return incoming
}

const total = (rows, field) =>
  rows.reduce((sum, row) => sum + BigInt(row[field] ?? '0'), 0n).toString()

function invoiceObject(row) {
  return row.pdf_url ? { urlSha256: digest(row.pdf_url) } : null
}

async function affectedDerivedRecords(sql, selected) {
  const removed = (table) =>
    selected.filter(({ entry }) => entry.table === table).map(({ row }) => row)
  const bookings = removed('public.booking')
  const invoices = removed('public.invoice')
  const customers = [...new Set([...bookings, ...invoices].map((row) => row.customer_id))].sort()
  const profiles = []
  for (const customer of customers) {
    const removedBookings = bookings
      .filter((row) => row.customer_id === customer)
      .map((row) => row.id)
    const removedInvoices = invoices
      .filter((row) => row.customer_id === customer)
      .map((row) => row.id)
    const [profile] = await sql`
      SELECT p.id, p.total_visits::text AS stored_visits, p.total_spent_paise::text AS stored_spent_paise,
        (SELECT count(*)::text FROM public.booking b
          WHERE b.customer_id = p.user_id AND b.status = 'completed'
          AND NOT (b.id = ANY (ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(removedBookings)}::jsonb))))) AS retained_visits,
        (SELECT coalesce(sum(i.total_amount_paise),0)::text FROM public.invoice i
          WHERE i.customer_id = p.user_id AND i.payment_status = 'paid'
          AND NOT (i.id = ANY (ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(removedInvoices)}::jsonb))))) AS retained_spent_paise
      FROM public.customer_profile p WHERE p.user_id = ${customer}
    `
    if (profile) profiles.push(profile)
  }

  const series = []
  const reviewedBySeries = new Map()
  for (const invoice of invoices) {
    const key = JSON.stringify([invoice.branch_id, invoice.financial_year])
    reviewedBySeries.set(key, (reviewedBySeries.get(key) ?? 0) + 1)
  }
  for (const [key, reviewed] of reviewedBySeries) {
    const [branch, year] = JSON.parse(key)
    const [counts] = await sql`
      SELECT count(*) FILTER (WHERE financial_year IS NOT DISTINCT FROM ${year}::text)::text AS invoice_count,
             count(*) FILTER (WHERE financial_year IS NULL)::text AS legacy_without_year_count
      FROM public.invoice WHERE branch_id = ${branch}
    `
    series.push({
      branch,
      year,
      reviewed,
      ...counts,
      retained: (BigInt(counts.invoice_count) - BigInt(reviewed)).toString(),
    })
  }

  const gems = []
  const movements = removed('public.loyalty_transaction')
  const accounts = [...new Set(movements.map((row) => row.loyalty_account_id))].sort()
  for (const account of accounts) {
    const approvedIds = movements
      .filter((row) => row.loyalty_account_id === account)
      .map((row) => row.id)
    const [balance] = await sql`
      SELECT a.id, a.gems_balance::text AS stored_balance,
        (SELECT coalesce(sum(CASE t.type WHEN 'redeemed' THEN -t.gems_amount ELSE t.gems_amount END),0)::text
          FROM public.loyalty_transaction t WHERE t.loyalty_account_id = a.id
          AND NOT (t.id = ANY (ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(approvedIds)}::jsonb))))) AS retained_ledger_balance
      FROM public.loyalty_account a WHERE a.id = ${account}
    `
    if (balance) gems.push(balance)
  }
  return { profiles, gems, invoiceSeries: series }
}

export async function buildPreview(database, manifest) {
  return database.begin('ISOLATION LEVEL REPEATABLE READ READ ONLY', async (sql) => {
    await sql`SET LOCAL search_path = pg_catalog`
    const [snapshot] =
      await sql`SELECT current_database() AS database, current_setting('transaction_read_only') AS read_only`
    if (snapshot.read_only !== 'on')
      throw new Error('Cleanup preview requires a read-only transaction.')
    const catalog = await loadCatalog(sql)
    const approved = new Set(manifest.rows.map(({ table, key }) => identity(table, key)))
    const missing = []
    const selected = []
    const dependencies = []
    for (const entry of manifest.rows) {
      const relation = catalog.relations.get(entry.table)
      if (!relation) throw new Error('An approved table is absent from the release schema.')
      const row = await selectedRow(sql, entry, relation)
      if (!row) {
        missing.push(entry)
        continue
      }
      selected.push({ entry, row })
      for (const incoming of await incomingRows(sql, entry, relation, catalog, approved)) {
        dependencies.push({ target: { table: entry.table, key: entry.key }, ...incoming })
      }
    }

    const grouped = new Map()
    for (const { entry, row } of selected) {
      const rows = grouped.get(entry.table) ?? []
      rows.push(row)
      grouped.set(entry.table, rows)
    }
    const rowsFor = (table) => grouped.get(table) ?? []
    const invoices = rowsFor('public.invoice')
    const memberships = rowsFor('public.spa_membership')
    const holds = rowsFor('public.membership_hold')
    const settlements = rowsFor('public.settlement_entry')
    const unresolved = dependencies.filter((dependency) => !dependency.reviewed).length
    return {
      database: snapshot.database,
      reviewReference: manifest.reviewReference,
      reviewedDumpSha256: manifest.dumpSha256,
      status: missing.length || unresolved ? 'database_review_blocked' : 'database_review_complete',
      selected: selected.map(({ entry }) => entry),
      missing,
      dependencies,
      tableCounts: Object.fromEntries(
        [...grouped].sort().map(([table, rows]) => [table, rows.length]),
      ),
      amounts: {
        bookingPaise: total(rowsFor('public.booking'), 'total_amount_paise'),
        invoicePaise: total(invoices, 'total_amount_paise'),
        paidInvoicePaise: total(
          invoices.filter((invoice) => invoice.payment_status === 'paid'),
          'total_amount_paise',
        ),
        invoiceGstPaise: total(invoices, 'gst_amount_paise'),
        membershipPricePaise: total(memberships, 'price_paid_paise'),
        membershipTotalMinutes: total(memberships, 'total_hours_minutes'),
        membershipUsedMinutes: total(memberships, 'used_hours_minutes'),
        membershipReservedMinutes: total(memberships, 'reserved_minutes'),
        heldMinutes: total(
          holds.filter((hold) => hold.state === 'held'),
          'minutes',
        ),
        gemsByMovementType: Object.fromEntries(
          [...new Set(rowsFor('public.loyalty_transaction').map((row) => row.type))]
            .sort()
            .map((type) => [
              type,
              total(
                rowsFor('public.loyalty_transaction').filter((row) => row.type === type),
                'gems_amount',
              ),
            ]),
        ),
        settlementValuePaise: total(settlements, 'value_paise'),
        settlementGstPaise: total(settlements, 'gst_share_paise'),
        settlementOwedPaise: total(settlements, 'amount_owed_paise'),
      },
      derived: await affectedDerivedRecords(sql, selected),
      externalReview: {
        invoiceRenderAndEmail: invoices.map((row) => ({
          id: row.id,
          invoiceNumber: row.invoice_number,
          paymentStatus: row.payment_status,
          hasPaymentReference: Boolean(row.payment_reference),
          pdf: invoiceObject(row),
        })),
        bookings: rowsFor('public.booking').map((row) => ({
          id: row.id,
          hasRedemptionKey: Boolean(row.redemption_key),
        })),
        membershipNotificationReview: memberships.map((row) => row.id),
        notificationRecords: rowsFor('public.notification').map(
          ({ id, type, status, channel }) => ({ id, type, status, channel }),
        ),
        retainedMediaIds: [
          ...new Set(
            [
              ...rowsFor('cms.offer').map((row) => row.image_id),
              ...rowsFor('cms._offer_v').map((row) => row.version_image_id),
            ].filter(Boolean),
          ),
        ].sort(),
        publicOfferImageReferences: rowsFor('public.offer')
          .filter((row) => row.image_url)
          .map((row) => ({ id: row.id, urlSha256: digest(row.image_url) })),
        settlementPeriods: [...new Set(settlements.map((row) => row.posting_month))].sort(),
      },
    }
  })
}

async function main() {
  const [allowlistPath, backupPath, ...extra] = process.argv.slice(2)
  if (!allowlistPath || !backupPath || extra.length) {
    throw new Error(
      'Usage: bun scripts/backup/preview-cleanup.mjs <allowlist.json> <manifest.json>',
    )
  }
  const url = Bun.env.CLEANUP_PREVIEW_DATABASE_URL
  if (!url || !/^postgres(?:ql)?:\/\//.test(url))
    throw new Error('Set CLEANUP_PREVIEW_DATABASE_URL explicitly.')
  const bytes = await readFile(allowlistPath)
  const manifest = parseAllowlist(bytes.toString('utf8'))
  const backupKey = verifyBackupReference(manifest, JSON.parse(await readFile(backupPath, 'utf8')))
  const database = new SQL(url, { max: 1 })
  try {
    const report = await buildPreview(database, manifest)
    console.log(JSON.stringify({ backupKey, allowlistSha256: digest(bytes), ...report }, null, 2))
    if (report.status === 'database_review_blocked') process.exitCode = 2
  } catch {
    throw new Error(
      'The database could not produce a complete cleanup preview. Check the target, schema and exact key values.',
    )
  } finally {
    await database.close()
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof SyntaxError ? 'The reviewed allowlist is not valid JSON.' : error.message,
    )
    process.exitCode = 1
  })
}
