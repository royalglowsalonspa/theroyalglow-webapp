-- Run after SET TRANSACTION SNAPSHOT, with search_path set to pg_catalog.
-- Build one read-only query for tables that exist at the captured schema version.
-- The optional export emits private reference rows into a restricted local file.
\if :{?rgss_backup_reference_export}
\else
\set rgss_backup_reference_export false
\endif

WITH relations AS (
  SELECT n.nspname AS schema_name, c.relname AS table_name, c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname <> 'information_schema'
    AND n.nspname !~ '^pg_'
    AND c.relkind IN ('r', 'p', 'm')
), counts AS (
  SELECT string_agg(
    format(
      'SELECT %L as relation, count(*)::text as rows FROM %s%I.%I',
      format('%I.%I', schema_name, table_name),
      CASE WHEN relkind = 'm' THEN '' ELSE 'ONLY ' END,
      schema_name,
      table_name
    ),
    ' UNION ALL '
    ORDER BY schema_name, table_name
  ) AS statement
  FROM relations
), metrics(schema_name, table_name, column_name) AS (
  VALUES ('public', 'invoice', 'total_amount_paise'),
         ('public', 'invoice', 'gst_amount_paise'),
         ('public', 'loyalty_account', 'gems_balance'),
         ('public', 'loyalty_transaction', 'gems_amount'),
         ('public', 'spa_membership', 'total_hours_minutes'),
         ('public', 'spa_membership', 'used_hours_minutes'),
         ('public', 'spa_membership', 'reserved_minutes'),
         ('public', 'membership_hold', 'minutes'),
         ('public', 'membership_correction', 'available_minutes_delta'),
         ('public', 'settlement_entry', 'amount_owed_paise')
), sums AS (
  SELECT string_agg(
    format(
      'SELECT %L as metric, coalesce(sum(%I), 0)::text as amount FROM %I.%I',
      format('%I.%I.%I', m.schema_name, m.table_name, m.column_name),
      m.column_name, m.schema_name, m.table_name
    ),
    ' UNION ALL '
    ORDER BY m.schema_name, m.table_name, m.column_name
  ) AS statement
  FROM metrics m
  JOIN information_schema.columns c
    ON (m.schema_name, m.table_name, m.column_name) = (c.table_schema, c.table_name, c.column_name)
), reference_columns(schema_name, table_name, column_name) AS (
  VALUES ('public', 'invoice', 'pdf_url'),
         ('cms', 'media', 'url'),
         ('cms', 'media', 'filename'),
         ('cms', 'media', 'sizes_thumbnail_url'),
         ('cms', 'media', 'sizes_thumbnail_filename'),
         ('cms', 'media', 'sizes_card_url'),
         ('cms', 'media', 'sizes_card_filename'),
         ('cms', 'media', 'sizes_hero_url'),
         ('cms', 'media', 'sizes_hero_filename')
), object_references AS (
  SELECT string_agg(
    format(
      'SELECT %L as kind, count(%I)::text as refs, encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(id, %I) ORDER BY id) FILTER (WHERE %I IS NOT NULL)::text, %L), %L)), %L) as digest FROM %I.%I',
      format('%I.%I.%I', r.schema_name, r.table_name, r.column_name),
      r.column_name, r.column_name, r.column_name, '[]', 'UTF8', 'hex', r.schema_name, r.table_name
    ),
    ' UNION ALL '
    ORDER BY r.schema_name, r.table_name, r.column_name
  ) AS statement,
  string_agg(
    format(
      'SELECT %L as kind, row_number() OVER (ORDER BY id) as position, jsonb_build_array(id, %I)::text as pair FROM %I.%I WHERE %I IS NOT NULL',
      format('%I.%I.%I', r.schema_name, r.table_name, r.column_name),
      r.column_name, r.schema_name, r.table_name, r.column_name
    ),
    ' UNION ALL '
    ORDER BY r.schema_name, r.table_name, r.column_name
  ) AS export_statement
  FROM reference_columns r
  JOIN information_schema.columns c
    ON (r.schema_name, r.table_name, r.column_name) = (c.table_schema, c.table_name, c.column_name)
)
SELECT CASE WHEN :'rgss_backup_reference_export'::boolean THEN
  format($reference_export$
    SELECT coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'position', position, 'pair', pair)
      ORDER BY kind, position), '[]'::jsonb)
    FROM (%s) AS reference_rows
  $reference_export$, coalesce(object_references.export_statement,
    'SELECT NULL::text AS kind, NULL::bigint AS position, NULL::text AS pair WHERE false'))
ELSE format($facts$
WITH counts AS (%s), sums AS (%s), object_references AS (%s)
SELECT jsonb_build_object(
  'database', current_database(),
  'postgresMajor', current_setting('server_version_num')::int / 10000,
  'extensions', (SELECT jsonb_object_agg(extname, extversion) FROM pg_extension),
  'counts', coalesce((SELECT jsonb_object_agg(relation, rows) FROM counts), '{}'::jsonb),
  'sums', coalesce((SELECT jsonb_object_agg(metric, amount) FROM sums), '{}'::jsonb),
  'paidInvoicePaise', %s,
  'drizzleLedger', %s,
  'payloadLedger', %s,
  'objectReferences', coalesce((
    SELECT jsonb_object_agg(kind, jsonb_build_object('count', refs, 'sha256', digest))
    FROM object_references
  ), '{}'::jsonb)
);
$facts$,
  coalesce(counts.statement, 'SELECT NULL::text AS relation, NULL::text AS rows WHERE false'),
  coalesce(sums.statement, 'SELECT NULL::text AS metric, NULL::text AS amount WHERE false'),
  coalesce(object_references.statement, 'SELECT NULL::text AS kind, NULL::text AS refs, NULL::text AS digest WHERE false'),
  CASE WHEN to_regclass('public.invoice') IS NOT NULL THEN
    '(SELECT coalesce(sum(total_amount_paise) FILTER (WHERE payment_status = ''paid''), 0)::text FROM public.invoice)'
  ELSE 'NULL' END,
  CASE
    WHEN to_regclass('drizzle.__drizzle_migrations') IS NOT NULL THEN
      '(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id), ''[]''::jsonb) FROM drizzle.__drizzle_migrations m)'
    WHEN to_regclass('public.__drizzle_migrations') IS NOT NULL THEN
      '(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id), ''[]''::jsonb) FROM public.__drizzle_migrations m)'
    ELSE 'NULL'
  END,
  CASE WHEN to_regclass('cms.payload_migrations') IS NOT NULL THEN
    '(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id), ''[]''::jsonb) FROM cms.payload_migrations m)'
  ELSE 'NULL' END
) END
FROM counts CROSS JOIN sums CROSS JOIN object_references
\gexec
