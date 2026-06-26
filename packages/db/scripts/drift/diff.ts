/************************************************************
 * Schema Drift Remediation — pure structural differ.
 *
 * Computes a total, symmetric structural diff between two
 * `SchemaFingerprint`s. Objects are matched by their STRUCTURAL identity
 * key (table name, table+column, FK column/ref shape, unique member list,
 * normalized index def, enum name) — never by auto-generated constraint name.
 *
 * PURE: no I/O.
 *
 * Mirrors design "Component 3: diff", the `SchemaDiff`/`DiffEntry` data
 * models, and "Property 3: Diff totality & symmetry" of
 * `.kiro/specs/schema-drift-remediation/design.md`.
 *
 * _Requirements: 4.1, 4.2, 4.3, 4.4_
 ************************************************************/

import { Fingerprinter } from './fingerprint'
import type {
  ColumnFp,
  DiffEntry,
  DiffKind,
  EnumFp,
  FkFp,
  IndexFp,
  SchemaDiff,
  SchemaFingerprint,
  TableFp,
} from './types'

// ─────────────────────────────────────────────────────────
// Internal item model — an identity-keyed view of one schema object.
//
// `key`    : structural identity (matches across the two fingerprints).
// `object` : human-readable identifier for the `DiffEntry.object` field.
// `table`  : owning table (null for enums).
// `value`  : the compared fingerprint object (placed into the entry).
// `eqTag`  : deterministic structural signature used to decide `divergent`.
// ─────────────────────────────────────────────────────────

type DiffItem = {
  key: string
  object: string
  table: string | null
  value: unknown
  eqTag: string
}

function byString(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

// ─────────────────────────────────────────────────────────
// Per-kind item extraction from a fingerprint.
// ─────────────────────────────────────────────────────────

function enumItems(fp: SchemaFingerprint): DiffItem[] {
  return fp.enums.map<DiffItem>((e: EnumFp) => ({
    key: e.name,
    object: e.name,
    table: null,
    value: e,
    eqTag: JSON.stringify({ labels: e.labels }),
  }))
}

function columnItems(fp: SchemaFingerprint): DiffItem[] {
  const items: DiffItem[] = []
  for (const t of fp.tables) {
    for (const c of t.columns as ColumnFp[]) {
      items.push({
        key: `${t.name}.${c.name}`,
        object: c.name,
        table: t.name,
        value: c,
        eqTag: JSON.stringify({
          default: c.default,
          nullable: c.nullable,
          type: c.type,
        }),
      })
    }
  }
  return items
}

function primaryKeyItems(fp: SchemaFingerprint): DiffItem[] {
  const items: DiffItem[] = []
  for (const t of fp.tables as TableFp[]) {
    if (t.primaryKey === null) continue
    items.push({
      key: t.name,
      object: t.primaryKey.join(', '),
      table: t.name,
      value: t.primaryKey,
      // PK column order is significant -> preserve array order in the tag.
      eqTag: JSON.stringify(t.primaryKey),
    })
  }
  return items
}

function uniqueItems(fp: SchemaFingerprint): DiffItem[] {
  const items: DiffItem[] = []
  for (const t of fp.tables) {
    for (const u of t.uniques) {
      const cols = u.columns.join(', ')
      items.push({
        // Identity is the member list (constraint name excluded).
        key: `${t.name}:${cols}`,
        object: cols,
        table: t.name,
        value: { columns: u.columns },
        eqTag: JSON.stringify({ columns: u.columns }),
      })
    }
  }
  return items
}

function foreignKeyItems(fp: SchemaFingerprint): DiffItem[] {
  const items: DiffItem[] = []
  for (const t of fp.tables) {
    for (const f of t.foreignKeys as FkFp[]) {
      const cols = f.columns.join(', ')
      const refCols = f.refColumns.join(', ')
      items.push({
        // Identity is the column/ref shape (constraint name excluded).
        key: `${t.name}:${cols}|${f.refTable}|${refCols}`,
        object: `${cols} -> ${f.refTable}(${refCols})`,
        table: t.name,
        value: f,
        // on-delete / on-update participate in structural equality, so two FKs
        // with the same shape but different actions are `divergent`.
        eqTag: JSON.stringify({ onDelete: f.onDelete, onUpdate: f.onUpdate }),
      })
    }
  }
  return items
}

function indexItems(fp: SchemaFingerprint): DiffItem[] {
  const items: DiffItem[] = []
  for (const t of fp.tables) {
    for (const i of t.indexes as IndexFp[]) {
      const cols = i.columns.join(', ')
      const sig = `${cols}|${i.method}|${i.unique}|${i.predicate ?? ''}`
      items.push({
        // Identity is the normalized index definition.
        key: `${t.name}:${sig}`,
        object: `${cols}${i.unique ? ' (unique)' : ''} [${i.method}]`,
        table: t.name,
        value: i,
        eqTag: sig,
      })
    }
  }
  return items
}

// ─────────────────────────────────────────────────────────
// Generic identity-keyed diff for one object kind.
//
// Guarantees totality: every canonical and every branch item is accounted
// for in exactly one of {matched (no entry), divergent, missing, extra}.
// Exact-equal items are paired first to minimize spurious `divergent`s.
// ─────────────────────────────────────────────────────────

function groupByKey(items: DiffItem[]): Map<string, DiffItem[]> {
  const map = new Map<string, DiffItem[]>()
  for (const item of items) {
    const list = map.get(item.key)
    if (list) list.push(item)
    else map.set(item.key, [item])
  }
  return map
}

function diffKind(kind: DiffKind, canonical: DiffItem[], branch: DiffItem[]): DiffEntry[] {
  const canonicalByKey = groupByKey(canonical)
  const branchByKey = groupByKey(branch)

  const keys = [...new Set([...canonicalByKey.keys(), ...branchByKey.keys()])].sort(byString)

  const entries: DiffEntry[] = []

  for (const key of keys) {
    const cArr = [...(canonicalByKey.get(key) ?? [])]
    const bArr = [...(branchByKey.get(key) ?? [])]

    // 1. Remove exact-equal pairs (identical structure -> no diff entry).
    const bMatched = new Array<boolean>(bArr.length).fill(false)
    const cRest: DiffItem[] = []
    for (const c of cArr) {
      const matchIdx = bArr.findIndex((b, idx) => !bMatched[idx] && b.eqTag === c.eqTag)
      if (matchIdx === -1) cRest.push(c)
      else bMatched[matchIdx] = true
    }
    const bRest = bArr.filter((_, idx) => !bMatched[idx])

    // 2. Pair leftover items as `divergent` (same identity, different structure).
    const pairCount = Math.min(cRest.length, bRest.length)
    for (let i = 0; i < pairCount; i++) {
      const c = cRest[i]
      const b = bRest[i]
      if (!c || !b) continue
      entries.push({
        kind,
        table: c.table,
        object: c.object,
        status: 'divergent',
        canonical: c.value,
        branch: b.value,
      })
    }

    // 3. Remaining canonical items are missing on the branch.
    for (const c of cRest.slice(pairCount)) {
      entries.push({
        kind,
        table: c.table,
        object: c.object,
        status: 'missing_on_branch',
        canonical: c.value,
        branch: null,
      })
    }

    // 4. Remaining branch items are extra on the branch.
    for (const b of bRest.slice(pairCount)) {
      entries.push({
        kind,
        table: b.table,
        object: b.object,
        status: 'extra_on_branch',
        canonical: null,
        branch: b.value,
      })
    }
  }

  return entries
}

// ─────────────────────────────────────────────────────────
// Public surface.
// ─────────────────────────────────────────────────────────

/**
 * Pure structural diff of two fingerprints. `canonical` is the source of
 * truth; `branch` is the audited schema. Each object is classified as
 * `missing_on_branch` (in canonical, absent on branch), `extra_on_branch`
 * (on branch, absent in canonical), or `divergent` (present in both but
 * structurally different). `isIdentical` is true exactly when no objects
 * differ.
 */
function diff(canonical: SchemaFingerprint, branch: SchemaFingerprint): SchemaDiff {
  const objects: DiffEntry[] = [
    ...diffKind('enum', enumItems(canonical), enumItems(branch)),
    ...diffKind('column', columnItems(canonical), columnItems(branch)),
    ...diffKind('primaryKey', primaryKeyItems(canonical), primaryKeyItems(branch)),
    ...diffKind('unique', uniqueItems(canonical), uniqueItems(branch)),
    ...diffKind('foreignKey', foreignKeyItems(canonical), foreignKeyItems(branch)),
    ...diffKind('index', indexItems(canonical), indexItems(branch)),
  ]

  return {
    fromCanonicalHash: Fingerprinter.hash(canonical),
    toBranchHash: Fingerprinter.hash(branch),
    objects,
    isIdentical: objects.length === 0,
  }
}

/** Structural equality via fingerprint hash equality. Symmetric. */
function equal(a: SchemaFingerprint, b: SchemaFingerprint): boolean {
  return Fingerprinter.hash(a) === Fingerprinter.hash(b)
}

export const SchemaDiffer = {
  diff,
  equal,
}
