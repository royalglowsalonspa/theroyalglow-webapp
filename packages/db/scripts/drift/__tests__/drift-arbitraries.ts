/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/drift-arbitraries
 * Scope        : Shared fast-check generators for the drift tooling properties
 *
 * Validates    : Requirements 13.1, 13.2, 13.3, 13.5, 13.6 (support module)
 *
 * Description  : DB-free generators and helpers shared by the Schema Drift
 *                Remediation property tests (design "Correctness Properties"
 *                1, 2, 3, 5, 7). Builds a small, well-formed SCHEMA MODEL, then
 *                renders it into raw `CatalogRows` exactly as
 *                `information_schema` / `pg_catalog` would, so the pure
 *                fingerprint / diff / reconcile modules can be exercised with
 *                zero database access (CI has no Neon branch).
 *
 * Responsibilities :
 * - `schemaModelArb`         : generate a coherent, realistic schema model
 * - `renderCatalogRows`      : model -> raw catalog rows (with spelling noise)
 * - `permuteCatalogRows`     : seeded permutation of every emitted row array
 * - `modelToFingerprint`     : model -> `SchemaFingerprint` (independent path)
 * - `modelSignature`         : structural identity of a model, computed WITHOUT
 *                             the fingerprinter (the oracle for Property 2)
 * - `applyMutation`          : structural mutation used to build diff pairs
 *
 * Features / Functionality :
 * - Generators are constrained to the real catalog input space: unique table /
 *   column / enum names, unique ordinals, `text` nanoid primary keys, explicit
 *   FK referential actions, deduped constraint identities.
 * - Names are prefixed (`t_`, `f_`, `e_`, `c_id`) so they can never collide with
 *   the RETIRED pg_cron bookkeeping tables (`job`, `job_run_details`) that
 *   `fingerprint.ts` excludes. No fixture reintroduces pg_cron / cron.schedule.
 *
 * Tech Stack   : fast-check 4 (no `fc.hexaString`), TypeScript strict
 * Layer        : Test support
 *
 * Dependencies : fast-check, ../types
 *
 * Notes        : Pure. No I/O, no clock, no database. `renderCatalogRows` emits
 *                the DENORMALIZED spellings a real catalog returns (`int4`,
 *                `::character varying`, `ASC`/`DESC` index members, arbitrary
 *                constraint names) so normalization is genuinely exercised.
 ************************************************************/

import fc from 'fast-check'
import type {
  CatalogRows,
  ColumnFp,
  ColumnRow,
  EnumRow,
  FkFp,
  FkRow,
  IndexFp,
  IndexRow,
  PkRow,
  ReferentialAction,
  SchemaFingerprint,
  TableFp,
  TableRow,
  UniqueRow,
} from '../types'

// ─────────────────────────────────────────────────────────
// Schema model — an already-NORMALIZED description of a schema. Canonical type
// spellings and canonical default expressions, so `renderCatalogRows` is the
// only place denormalized catalog spellings appear.
// ─────────────────────────────────────────────────────────

export type ModelColumn = {
  name: string
  type: string
  nullable: boolean
  default: string | null
}

export type ModelIndex = {
  columns: string[]
  unique: boolean
  predicate: string | null
  method: string
}

export type ModelFk = {
  columns: string[]
  refTable: string
  refColumns: string[]
  onDelete: ReferentialAction
  onUpdate: ReferentialAction
}

export type ModelTable = {
  name: string
  columns: ModelColumn[]
  primaryKey: string[] | null
  uniques: string[][]
  indexes: ModelIndex[]
  foreignKeys: ModelFk[]
}

export type ModelEnum = { name: string; labels: string[] }

export type SchemaModel = { enums: ModelEnum[]; tables: ModelTable[] }

/** Every table carries a `text` nanoid primary-key column (repo convention). */
export const PK_COLUMN = 'c_id'

// ─────────────────────────────────────────────────────────
// Canonical type + default vocabularies.
// ─────────────────────────────────────────────────────────

/** Canonical (post-normalization) column type spellings. */
const CANONICAL_TYPES = [
  'integer',
  'bigint',
  'smallint',
  'boolean',
  'text',
  'varchar',
  'timestamptz',
  'numeric',
  'jsonb',
  'integer[]',
] as const

/**
 * `udt_name` spellings that all normalize to the same canonical type. Rendering
 * picks one so `fingerprint.normalizeType` is exercised (`int4` -> `integer`,
 * `_int4` -> `integer[]`, ...).
 */
const UDT_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  integer: ['integer', 'int4'],
  bigint: ['bigint', 'int8'],
  smallint: ['smallint', 'int2'],
  boolean: ['boolean', 'bool'],
  text: ['text'],
  varchar: ['varchar'],
  timestamptz: ['timestamptz'],
  numeric: ['numeric'],
  jsonb: ['jsonb'],
  'integer[]': ['_int4', '_integer'],
}

/**
 * Canonical default expressions paired with the catalog spellings that
 * normalize to them (`::character varying` -> `::varchar`).
 */
const DEFAULT_VARIANTS: readonly { canonical: string; variants: readonly string[] }[] = [
  { canonical: 'now()', variants: ['now()'] },
  { canonical: '0', variants: ['0'] },
  { canonical: 'false', variants: ['false'] },
  { canonical: "''::varchar", variants: ["''::varchar", "''::character varying"] },
  { canonical: "'{}'::jsonb", variants: ["'{}'::jsonb"] },
]

const REFERENTIAL_ACTIONS: readonly ReferentialAction[] = [
  'cascade',
  'restrict',
  'set null',
  'set default',
  'no action',
]

/** `pg_constraint.confdeltype` / `confupdtype` single-char codes. */
const ACTION_CODE: Readonly<Record<ReferentialAction, string>> = {
  cascade: 'c',
  restrict: 'r',
  'set null': 'n',
  'set default': 'd',
  'no action': 'a',
}

const INDEX_METHODS = ['btree', 'gin', 'hash'] as const

// ─────────────────────────────────────────────────────────
// Name generators. Distinct prefixes guarantee no accidental collision with
// each other or with the retired pg_cron tables.
// ─────────────────────────────────────────────────────────

const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('')

const wordArb = fc.string({ unit: fc.constantFrom(...LOWER), minLength: 1, maxLength: 4 })

const tableNameArb = wordArb.map((w) => `t_${w}`)
const enumNameArb = wordArb.map((w) => `e_${w}`)
const extraColumnNameArb = wordArb.map((w) => `f_${w}`)
const enumLabelArb = wordArb

// ─────────────────────────────────────────────────────────
// Model generators.
// ─────────────────────────────────────────────────────────

const enumsArb: fc.Arbitrary<ModelEnum[]> = fc
  .uniqueArray(enumNameArb, { minLength: 0, maxLength: 2 })
  .chain((names) =>
    fc.tuple(
      ...names.map((name) =>
        fc
          .uniqueArray(enumLabelArb, { minLength: 1, maxLength: 3 })
          .map<ModelEnum>((labels) => ({ name, labels })),
      ),
    ),
  )
  .map((defs) => [...defs])

function columnArb(name: string, typeChoices: readonly string[]): fc.Arbitrary<ModelColumn> {
  return fc
    .record({
      type: fc.constantFrom(...typeChoices),
      nullable: fc.boolean(),
      defaultIndex: fc.option(fc.nat({ max: DEFAULT_VARIANTS.length - 1 }), { nil: null }),
    })
    .map<ModelColumn>(({ type, nullable, defaultIndex }) => ({
      name,
      type,
      nullable,
      default: defaultIndex === null ? null : (DEFAULT_VARIANTS[defaultIndex]?.canonical ?? null),
    }))
}

function indexArb(columnNames: readonly string[]): fc.Arbitrary<ModelIndex> {
  return fc
    .record({
      columns: fc.uniqueArray(fc.constantFrom(...columnNames), { minLength: 1, maxLength: 2 }),
      unique: fc.boolean(),
      method: fc.constantFrom(...INDEX_METHODS),
      predicateColumn: fc.option(fc.constantFrom(...columnNames), { nil: null }),
    })
    .map<ModelIndex>(({ columns, unique, method, predicateColumn }) => ({
      // Index member order is insignificant -> store the canonical sorted form.
      columns: [...columns].sort(),
      unique,
      method,
      predicate: predicateColumn === null ? null : `(${predicateColumn} IS NOT NULL)`,
    }))
}

function fkArb(
  childColumns: readonly string[],
  tableNames: readonly string[],
): fc.Arbitrary<ModelFk> {
  return fc
    .record({
      column: fc.constantFrom(...childColumns),
      refTable: fc.constantFrom(...tableNames),
      onDelete: fc.constantFrom(...REFERENTIAL_ACTIONS),
      onUpdate: fc.constantFrom(...REFERENTIAL_ACTIONS),
    })
    .map<ModelFk>(({ column, refTable, onDelete, onUpdate }) => ({
      columns: [column],
      refTable,
      refColumns: [PK_COLUMN],
      onDelete,
      onUpdate,
    }))
}

function tableArb(
  name: string,
  tableNames: readonly string[],
  typeChoices: readonly string[],
): fc.Arbitrary<ModelTable> {
  return fc.uniqueArray(extraColumnNameArb, { minLength: 0, maxLength: 3 }).chain((extraNames) => {
    const columnNames = [PK_COLUMN, ...extraNames]
    return fc
      .record({
        extras: fc.tuple(...extraNames.map((n) => columnArb(n, typeChoices))),
        compositePk: fc.boolean(),
        uniqueSets: fc.array(
          fc.uniqueArray(fc.constantFrom(...columnNames), { minLength: 1, maxLength: 2 }),
          { maxLength: 2 },
        ),
        indexes: fc.array(indexArb(columnNames), { maxLength: 2 }),
        foreignKeys:
          extraNames.length === 0
            ? fc.constant<ModelFk[]>([])
            : fc.array(fkArb(extraNames, tableNames), { maxLength: 2 }),
      })
      .map<ModelTable>(({ extras, compositePk, uniqueSets, indexes, foreignKeys }) => {
        const columns: ModelColumn[] = [
          { name: PK_COLUMN, type: 'text', nullable: false, default: null },
          ...extras,
        ]
        const secondPkColumn = extras[0]?.name
        const primaryKey =
          compositePk && secondPkColumn !== undefined ? [PK_COLUMN, secondPkColumn] : [PK_COLUMN]
        return sanitizeTable({
          name,
          columns,
          primaryKey,
          uniques: uniqueSets.map((cols) => [...cols].sort()),
          indexes: [...indexes],
          foreignKeys: [...foreignKeys],
        })
      })
  })
}

/** A coherent, realistic schema model: 1-3 tables, 0-2 enums, text PKs. */
export const schemaModelArb: fc.Arbitrary<SchemaModel> = fc
  .record({
    tableNames: fc.uniqueArray(tableNameArb, { minLength: 1, maxLength: 3 }),
    enums: enumsArb,
  })
  .chain(({ tableNames, enums }) => {
    const typeChoices = [...CANONICAL_TYPES, ...enums.map((e) => e.name)]
    return fc
      .tuple(...tableNames.map((name) => tableArb(name, tableNames, typeChoices)))
      .map<SchemaModel>((tables) => sanitizeModel({ enums, tables: [...tables] }))
  })

// ─────────────────────────────────────────────────────────
// Coherence — drop constraint entries that reference absent objects and
// deduplicate constraint identities. Applied to generated AND mutated models so
// `renderCatalogRows` and `modelToFingerprint` always agree.
// ─────────────────────────────────────────────────────────

function uniqueKey(columns: readonly string[]): string {
  return [...columns].sort().join(',')
}

function indexKey(index: ModelIndex): string {
  return `${index.columns.join(',')}|${index.method}|${index.unique}|${index.predicate ?? ''}`
}

function fkKey(fk: ModelFk): string {
  return `${fk.columns.join(',')}|${fk.refTable}|${fk.refColumns.join(',')}`
}

function dedupeBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const k = key(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

function sanitizeTable(table: ModelTable): ModelTable {
  const names = new Set(table.columns.map((c) => c.name))
  const pk = table.primaryKey?.filter((c) => names.has(c)) ?? null
  return {
    name: table.name,
    columns: table.columns,
    primaryKey: pk === null || pk.length === 0 ? null : pk,
    uniques: dedupeBy(
      table.uniques.filter((cols) => cols.length > 0 && cols.every((c) => names.has(c))),
      uniqueKey,
    ).map((cols) => [...cols].sort()),
    indexes: dedupeBy(
      table.indexes.filter((i) => i.columns.length > 0 && i.columns.every((c) => names.has(c))),
      indexKey,
    ),
    foreignKeys: dedupeBy(
      table.foreignKeys.filter((f) => f.columns.every((c) => names.has(c))),
      fkKey,
    ),
  }
}

/** Drop FKs whose referenced table/columns no longer exist, then per-table fix. */
export function sanitizeModel(model: SchemaModel): SchemaModel {
  const columnsByTable = new Map<string, Set<string>>(
    model.tables.map((t) => [t.name, new Set(t.columns.map((c) => c.name))]),
  )
  const tables = model.tables.map((table) => {
    const scoped = sanitizeTable(table)
    return {
      ...scoped,
      foreignKeys: scoped.foreignKeys.filter((fk) => {
        const refColumns = columnsByTable.get(fk.refTable)
        if (refColumns === undefined) return false
        return (
          fk.refColumns.length === fk.columns.length &&
          fk.refColumns.every((c) => refColumns.has(c))
        )
      }),
    }
  })
  return { enums: dedupeBy(model.enums, (e) => e.name), tables }
}

// ─────────────────────────────────────────────────────────
// Rendering — model -> raw catalog rows, with catalog spelling noise.
// ─────────────────────────────────────────────────────────

export type RenderOptions = {
  /** Declaration order of columns, which drives `ordinal_position` (attnum). */
  columnOrder: 'declared' | 'reversed'
  /** Index into the `udt_name` variant list for each column type. */
  typeVariant: number
  /** Index into the default-expression variant list. */
  defaultVariant: number
  /** Salt appended to every auto-generated constraint / index name. */
  constraintSalt: string
  /** Emit `ASC` / `DESC` / `NULLS LAST` noise inside `pg_get_indexdef` output. */
  indexDirections: boolean
  /** Pad default expressions with surrounding whitespace. */
  paddedDefaults: boolean
}

export const defaultRenderOptions: RenderOptions = {
  columnOrder: 'declared',
  typeVariant: 0,
  defaultVariant: 0,
  constraintSalt: '',
  indexDirections: false,
  paddedDefaults: false,
}

export const renderOptionsArb: fc.Arbitrary<RenderOptions> = fc.record({
  columnOrder: fc.constantFrom<RenderOptions['columnOrder']>('declared', 'reversed'),
  typeVariant: fc.nat({ max: 5 }),
  defaultVariant: fc.nat({ max: 5 }),
  constraintSalt: fc.constantFrom('', '_a', '_zz9'),
  indexDirections: fc.boolean(),
  paddedDefaults: fc.boolean(),
})

function pick<T>(values: readonly T[], index: number, fallback: T): T {
  if (values.length === 0) return fallback
  return values[index % values.length] ?? fallback
}

function udtNameFor(type: string, variant: number): string {
  const variants = UDT_VARIANTS[type]
  if (variants === undefined) return type // enum / user-defined type
  return pick(variants, variant, type)
}

function dataTypeFor(type: string): string {
  if (UDT_VARIANTS[type] === undefined) return 'USER-DEFINED'
  if (type === 'integer[]') return 'ARRAY'
  return type
}

function defaultExpressionFor(canonical: string, options: RenderOptions): string {
  const entry = DEFAULT_VARIANTS.find((d) => d.canonical === canonical)
  const spelling =
    entry === undefined ? canonical : pick(entry.variants, options.defaultVariant, canonical)
  return options.paddedDefaults ? `  ${spelling}  ` : spelling
}

function declarationOrder(table: ModelTable, options: RenderOptions): ModelColumn[] {
  return options.columnOrder === 'reversed' ? [...table.columns].reverse() : [...table.columns]
}

function indexMemberText(column: string, position: number, options: RenderOptions): string {
  if (!options.indexDirections) return column
  if (position % 3 === 1) return `${column} DESC NULLS FIRST`
  if (position % 3 === 2) return `${column} ASC`
  return column
}

/**
 * Render a model into the raw `CatalogRows` that `information_schema` /
 * `pg_catalog` would return, applying the requested spelling noise. FK
 * `conkey`/`confkey` attnums are derived from the rendered `ordinal_position`s,
 * so a different declaration order genuinely produces different attnums.
 */
export function renderCatalogRows(
  model: SchemaModel,
  options: RenderOptions = defaultRenderOptions,
): CatalogRows {
  const ordinalsByTable = new Map<string, Map<string, number>>()
  for (const table of model.tables) {
    const ordinals = new Map<string, number>()
    declarationOrder(table, options).forEach((column, index) => {
      ordinals.set(column.name, index + 1)
    })
    ordinalsByTable.set(table.name, ordinals)
  }

  const tables: TableRow[] = model.tables.map((t) => ({ table_name: t.name }))

  const columns: ColumnRow[] = []
  const primaryKeys: PkRow[] = []
  const uniques: UniqueRow[] = []
  const foreignKeys: FkRow[] = []
  const indexes: IndexRow[] = []

  for (const table of model.tables) {
    const ordinals = ordinalsByTable.get(table.name) ?? new Map<string, number>()

    for (const column of declarationOrder(table, options)) {
      columns.push({
        table_name: table.name,
        column_name: column.name,
        data_type: dataTypeFor(column.type),
        udt_name: udtNameFor(column.type, options.typeVariant),
        is_nullable: column.nullable ? 'YES' : 'NO',
        column_default:
          column.default === null ? null : defaultExpressionFor(column.default, options),
        ordinal_position: ordinals.get(column.name) ?? 1,
      })
    }

    if (table.primaryKey !== null) {
      table.primaryKey.forEach((columnName, position) => {
        primaryKeys.push({
          table_name: table.name,
          constraint_type: 'PRIMARY KEY',
          constraint_name: `${table.name}_pkey${options.constraintSalt}`,
          column_name: columnName,
          ordinal_position: position + 1,
        })
      })
    }

    table.uniques.forEach((columnNames, i) => {
      columnNames.forEach((columnName, position) => {
        uniques.push({
          table_name: table.name,
          constraint_type: 'UNIQUE',
          constraint_name: `${table.name}_u${i}${options.constraintSalt}`,
          column_name: columnName,
          ordinal_position: position + 1,
        })
      })
    })

    table.foreignKeys.forEach((fk, i) => {
      const refOrdinals = ordinalsByTable.get(fk.refTable) ?? new Map<string, number>()
      foreignKeys.push({
        conname: `${table.name}_fk${i}${options.constraintSalt}`,
        table_name: table.name,
        ref_table: fk.refTable,
        confdeltype: ACTION_CODE[fk.onDelete],
        confupdtype: ACTION_CODE[fk.onUpdate],
        conkey: fk.columns.map((c) => ordinals.get(c) ?? 1),
        confkey: fk.refColumns.map((c) => refOrdinals.get(c) ?? 1),
      })
    })

    table.indexes.forEach((index, i) => {
      const indexName = `${table.name}_i${i}${options.constraintSalt}`
      // Emit members in the model's (sorted) order reversed when direction
      // noise is on, proving the fingerprinter re-sorts index members.
      const members = options.indexDirections ? [...index.columns].reverse() : index.columns
      const memberText = members
        .map((c, position) => indexMemberText(c, position, options))
        .join(', ')
      const where = index.predicate === null ? '' : ` WHERE ${index.predicate}`
      indexes.push({
        table_name: table.name,
        index_name: indexName,
        indisunique: index.unique,
        method: index.method,
        def:
          `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${indexName} ` +
          `ON public.${table.name} USING ${index.method} (${memberText})${where}`,
        predicate: index.predicate,
      })
    })
  }

  const enums: EnumRow[] = []
  for (const e of model.enums) {
    e.labels.forEach((label, position) => {
      enums.push({ typname: e.name, enumlabel: label, enumsortorder: position + 1 })
    })
  }

  return { tables, columns, primaryKeys, uniques, foreignKeys, indexes, enums }
}

// ─────────────────────────────────────────────────────────
// Seeded permutation of every emitted row array (Property 1).
// ─────────────────────────────────────────────────────────

/** Deterministic Fisher-Yates shuffle driven by a 32-bit LCG. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  let state = seed >>> 0 || 0x9e3779b9
  for (let i = out.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    const j = state % (i + 1)
    const a = out[i]
    const b = out[j]
    if (a === undefined || b === undefined) continue
    out[i] = b
    out[j] = a
  }
  return out
}

/** Permute every row array of a `CatalogRows` set without altering any row. */
export function permuteCatalogRows(rows: CatalogRows, seed: number): CatalogRows {
  return {
    tables: shuffle(rows.tables, seed + 1),
    columns: shuffle(rows.columns, seed + 2),
    primaryKeys: shuffle(rows.primaryKeys, seed + 3),
    uniques: shuffle(rows.uniques, seed + 4),
    foreignKeys: shuffle(rows.foreignKeys, seed + 5),
    indexes: shuffle(rows.indexes, seed + 6),
    enums: shuffle(rows.enums, seed + 7),
  }
}

// ─────────────────────────────────────────────────────────
// Model -> SchemaFingerprint (an INDEPENDENT construction path, not via
// `Fingerprinter.build`). Applies the same documented normalization rules.
// ─────────────────────────────────────────────────────────

function byString(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function modelToFingerprint(model: SchemaModel): SchemaFingerprint {
  const tables: TableFp[] = model.tables
    .map<TableFp>((table) => ({
      name: table.name,
      columns: table.columns
        .map<ColumnFp>((c) => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          default: c.default,
        }))
        .sort((a, b) => byString(a.name, b.name)),
      primaryKey: table.primaryKey === null ? null : [...table.primaryKey],
      uniques: table.uniques
        .map((columns) => ({ name: null, columns: [...columns].sort() }))
        .sort((a, b) => byString(a.columns.join(','), b.columns.join(','))),
      foreignKeys: table.foreignKeys
        .map<FkFp>((fk) => ({
          columns: [...fk.columns],
          refTable: fk.refTable,
          refColumns: [...fk.refColumns],
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
        }))
        .sort((a, b) =>
          byString(
            `${a.columns.join(',')}|${a.refTable}|${a.refColumns.join(',')}`,
            `${b.columns.join(',')}|${b.refTable}|${b.refColumns.join(',')}`,
          ),
        ),
      indexes: table.indexes
        .map<IndexFp>((i) => ({
          columns: [...i.columns].sort(),
          unique: i.unique,
          predicate: i.predicate,
          method: i.method,
        }))
        .sort((a, b) => byString(indexKey(a), indexKey(b))),
    }))
    .sort((a, b) => byString(a.name, b.name))

  return {
    enums: model.enums
      .map((e) => ({ name: e.name, labels: [...e.labels] }))
      .sort((a, b) => byString(a.name, b.name)),
    tables,
    version: 1,
  }
}

// ─────────────────────────────────────────────────────────
// modelSignature — the Property 2 ORACLE. Decides structural identity of two
// models WITHOUT touching `Fingerprinter.serialize`, so the property compares
// two genuinely independent notions of equality.
// ─────────────────────────────────────────────────────────

export function modelSignature(model: SchemaModel): string {
  const enums = model.enums
    .map((e) => `E:${e.name}(${e.labels.join('>')})`)
    .sort(byString)
    .join(';')

  const tables = model.tables
    .map((table) => {
      const columns = table.columns
        .map((c) => `C:${c.name}:${c.type}:${c.nullable ? 'null' : 'notnull'}:${c.default ?? '-'}`)
        .sort(byString)
        .join(',')
      const pk = table.primaryKey === null ? '-' : table.primaryKey.join('>')
      const uniques = table.uniques
        .map((cols) => [...cols].sort().join('+'))
        .sort(byString)
        .join(',')
      const indexes = table.indexes.map(indexKey).sort(byString).join(',')
      const fks = table.foreignKeys
        .map((fk) => `${fkKey(fk)}|${fk.onDelete}|${fk.onUpdate}`)
        .sort(byString)
        .join(',')
      return `T:${table.name}[${columns}][pk=${pk}][u=${uniques}][i=${indexes}][f=${fks}]`
    })
    .sort(byString)
    .join(';')

  return `v1|${enums}|${tables}`
}

// ─────────────────────────────────────────────────────────
// Structural mutations — used to build (canonical, branch) pairs whose diff
// exercises missing / extra / divergent classification.
// ─────────────────────────────────────────────────────────

export type MutationKind =
  | 'none'
  | 'drop_table'
  | 'drop_column'
  | 'add_column'
  | 'flip_nullable'
  | 'change_type'
  | 'change_default'
  | 'drop_unique'
  | 'add_unique'
  | 'duplicate_unique'
  | 'drop_index'
  | 'flip_index_unique'
  | 'change_index_predicate'
  | 'drop_fk'
  | 'change_fk_action'
  | 'drop_enum'
  | 'add_enum_label'
  | 'reverse_pk'

const MUTATION_KINDS: readonly MutationKind[] = [
  'none',
  'drop_table',
  'drop_column',
  'add_column',
  'flip_nullable',
  'change_type',
  'change_default',
  'drop_unique',
  'add_unique',
  'duplicate_unique',
  'drop_index',
  'flip_index_unique',
  'change_index_predicate',
  'drop_fk',
  'change_fk_action',
  'drop_enum',
  'add_enum_label',
  'reverse_pk',
]

export type MutationSpec = { kind: MutationKind; table: number; item: number }

export const mutationArb: fc.Arbitrary<MutationSpec> = fc.record({
  kind: fc.constantFrom(...MUTATION_KINDS),
  table: fc.nat({ max: 8 }),
  item: fc.nat({ max: 8 }),
})

function replaceTable(model: SchemaModel, index: number, next: ModelTable): SchemaModel {
  return {
    enums: model.enums,
    tables: model.tables.map((t, i) => (i === index ? next : t)),
  }
}

/**
 * Apply one structural mutation, then re-sanitize. A mutation may be a no-op
 * (e.g. `drop_index` on a table with no indexes) — the properties that use this
 * never assume the model changed; they compare against `modelSignature`.
 */
export function applyMutation(model: SchemaModel, spec: MutationSpec): SchemaModel {
  if (spec.kind === 'none' || model.tables.length === 0) return sanitizeModel(model)

  const tableIndex = spec.table % model.tables.length
  const table = model.tables[tableIndex]
  if (table === undefined) return sanitizeModel(model)

  switch (spec.kind) {
    case 'drop_table':
      return sanitizeModel({
        enums: model.enums,
        tables: model.tables.filter((_, i) => i !== tableIndex),
      })

    case 'drop_column': {
      const droppable = table.columns.filter((c) => c.name !== PK_COLUMN)
      const victim = droppable[spec.item % Math.max(droppable.length, 1)]
      if (victim === undefined) return sanitizeModel(model)
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          columns: table.columns.filter((c) => c.name !== victim.name),
        }),
      )
    }

    case 'add_column':
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          columns: [
            ...table.columns,
            { name: `f_added${spec.item}`, type: 'text', nullable: true, default: null },
          ],
        }),
      )

    case 'flip_nullable': {
      const target = table.columns[spec.item % table.columns.length]
      if (target === undefined) return sanitizeModel(model)
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          columns: table.columns.map((c) =>
            c.name === target.name ? { ...c, nullable: !c.nullable } : c,
          ),
        }),
      )
    }

    case 'change_type': {
      const target = table.columns[spec.item % table.columns.length]
      if (target === undefined) return sanitizeModel(model)
      const nextType =
        CANONICAL_TYPES[spec.item % CANONICAL_TYPES.length] === target.type
          ? 'numeric'
          : (CANONICAL_TYPES[spec.item % CANONICAL_TYPES.length] ?? 'numeric')
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          columns: table.columns.map((c) =>
            c.name === target.name ? { ...c, type: nextType } : c,
          ),
        }),
      )
    }

    case 'change_default': {
      const target = table.columns[spec.item % table.columns.length]
      if (target === undefined) return sanitizeModel(model)
      const nextDefault =
        target.default === null
          ? (DEFAULT_VARIANTS[spec.item % DEFAULT_VARIANTS.length]?.canonical ?? 'now()')
          : null
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          columns: table.columns.map((c) =>
            c.name === target.name ? { ...c, default: nextDefault } : c,
          ),
        }),
      )
    }

    case 'drop_unique':
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          uniques: table.uniques.filter(
            (_, i) => i !== spec.item % Math.max(table.uniques.length, 1),
          ),
        }),
      )

    case 'add_unique': {
      const target = table.columns[spec.item % table.columns.length]
      if (target === undefined) return sanitizeModel(model)
      return sanitizeModel(
        replaceTable(model, tableIndex, { ...table, uniques: [...table.uniques, [target.name]] }),
      )
    }

    case 'duplicate_unique': {
      // Postgres permits two UNIQUE constraints over the same columns; this
      // exercises the differ's multiset accounting for same-identity objects.
      const existing = table.uniques[spec.item % Math.max(table.uniques.length, 1)]
      if (existing === undefined) return sanitizeModel(model)
      return {
        enums: model.enums,
        tables: model.tables.map((t, i) =>
          i === tableIndex ? { ...t, uniques: [...t.uniques, [...existing]] } : t,
        ),
      }
    }

    case 'drop_index':
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          indexes: table.indexes.filter(
            (_, i) => i !== spec.item % Math.max(table.indexes.length, 1),
          ),
        }),
      )

    case 'flip_index_unique':
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          indexes: table.indexes.map((idx, i) =>
            i === spec.item % Math.max(table.indexes.length, 1)
              ? { ...idx, unique: !idx.unique }
              : idx,
          ),
        }),
      )

    case 'change_index_predicate':
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          indexes: table.indexes.map((idx, i) =>
            i === spec.item % Math.max(table.indexes.length, 1)
              ? {
                  ...idx,
                  predicate: idx.predicate === null ? `(${PK_COLUMN} IS NOT NULL)` : null,
                }
              : idx,
          ),
        }),
      )

    case 'drop_fk':
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          foreignKeys: table.foreignKeys.filter(
            (_, i) => i !== spec.item % Math.max(table.foreignKeys.length, 1),
          ),
        }),
      )

    case 'change_fk_action':
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          foreignKeys: table.foreignKeys.map((fk, i) =>
            i === spec.item % Math.max(table.foreignKeys.length, 1)
              ? {
                  ...fk,
                  onDelete:
                    fk.onDelete === 'cascade' ? 'restrict' : ('cascade' as ReferentialAction),
                }
              : fk,
          ),
        }),
      )

    case 'drop_enum':
      return sanitizeModel({
        enums: model.enums.filter((_, i) => i !== spec.item % Math.max(model.enums.length, 1)),
        tables: model.tables,
      })

    case 'add_enum_label':
      return sanitizeModel({
        enums: model.enums.map((e, i) =>
          i === spec.item % Math.max(model.enums.length, 1)
            ? { ...e, labels: [...e.labels, `zz${spec.item}`] }
            : e,
        ),
        tables: model.tables,
      })

    case 'reverse_pk':
      return sanitizeModel(
        replaceTable(model, tableIndex, {
          ...table,
          primaryKey: table.primaryKey === null ? null : [...table.primaryKey].reverse(),
        }),
      )

    default:
      return sanitizeModel(model)
  }
}

/** A (canonical, branch) model pair: identical, noise-varied, or mutated. */
export const modelPairArb: fc.Arbitrary<{ canonical: SchemaModel; branch: SchemaModel }> = fc
  .record({
    base: schemaModelArb,
    mutations: fc.array(mutationArb, { minLength: 0, maxLength: 3 }),
  })
  .map(({ base, mutations }) => ({
    canonical: base,
    branch: mutations.reduce<SchemaModel>((model, spec) => applyMutation(model, spec), base),
  }))

/** Fingerprint pairs derived from `modelPairArb` (used by the diff property). */
export const fingerprintPairArb = modelPairArb.map(({ canonical, branch }) => ({
  canonical: modelToFingerprint(canonical),
  branch: modelToFingerprint(branch),
}))
