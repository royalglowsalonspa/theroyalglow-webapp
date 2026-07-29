/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : mappers (hooks)
 * Scope        : CMS Integration — Payload → Drizzle Field Mapping
 *
 * Description  : Pure translation functions converting a Payload document
 *                shape (cms schema, camelCase, select-fields-as-strings) into
 *                the Drizzle row shape written to the public schema by the
 *                service / service_category sync hooks.
 *
 * Responsibilities :
 * - Map Payload service documents → public.service row values
 * - Map Payload service_category documents → public.service_category row values
 * - Coerce Payload select-field strings to the integers Drizzle expects
 * - Normalize relationship fields that may arrive populated or as bare ids
 * - Coalesce undefined → null so Postgres receives real NULLs
 *
 * Features / Functionality :
 * - mapPayloadToPublicService(doc) → PublicServiceRow
 * - mapPayloadToPublicCategory(doc) → PublicServiceCategoryRow
 * - Zero I/O, zero framework deps — fully deterministic and unit-testable
 *
 * Tech Stack   : TypeScript
 * Layer        : CMS (Hooks — pure mapping)
 *
 * Dependencies : none (intentionally dependency-free)
 *
 * Notes        :
 * - `createdAt` is PRESERVED from the Payload document and NEVER regenerated
 *   here (Req 10.x). `updatedAt` is intentionally NOT set by these mappers —
 *   the calling sync hook owns it (`new Date()` on update / conflict-update).
 * - `durationMinutes` string→number coercion is MANDATORY: Payload `select`
 *   values are always strings, Drizzle's column is `integer`. A `NaN` result
 *   means the caller passed a malformed doc; it is deliberately NOT swallowed
 *   so the DB write fails loudly rather than silently storing garbage.
 * - Input types are declared locally rather than imported from Payload's
 *   generated `payload-types.ts`: the generated types model the *editing*
 *   shape (relationship fields are `string | ServiceCategory`, selects are
 *   union literals) and are regenerated on every collection edit, so binding
 *   this seam to them would make the mapper churn. A narrow local interface
 *   keeps the seam explicit and avoids `any` under TypeScript strict.
 ************************************************************/

/** A Payload `relationship` field value: a bare id at depth 0, or a populated doc. */
type PayloadRelationship = string | { id: string } | null | undefined

/** Narrow view of a Payload `service` document — only the fields we map. */
export type PayloadServiceDoc = {
  id: string
  categoryId: PayloadRelationship
  name: string
  slug: string
  description?: string | null
  /** Payload `select` field — ALWAYS a string ('15'|'30'|...|'180'). */
  durationMinutes: string | number
  bufferMinutes?: number | null
  pricePaise: number
  isActive?: boolean | null
  imageUrl?: string | null
  displayOrder?: number | null
  gemsRedeemable?: boolean | null
  gemsRequired?: number | null
  gemsCatalogueOrder?: number | null
  createdAt: Date | string
}

/** Narrow view of a Payload `service_category` document — only the fields we map. */
export type PayloadServiceCategoryDoc = {
  id: string
  name: string
  slug: string
  description?: string | null
  serviceType: 'salon' | 'spa'
  displayOrder?: number | null
  isActive?: boolean | null
  createdAt: Date | string
}

/** Row shape written to `public.service` (no `updatedAt` — the hook owns it). */
export type PublicServiceRow = {
  id: string
  categoryId: string
  name: string
  slug: string
  description: string | null
  durationMinutes: number
  bufferMinutes: number
  pricePaise: number
  isActive: boolean
  imageUrl: string | null
  displayOrder: number
  gemsRedeemable: boolean
  gemsRequired: number | null
  gemsCatalogueOrder: number | null
  createdAt: Date | string
}

/** Row shape written to `public.service_category` (no `updatedAt` — hook owns it). */
export type PublicServiceCategoryRow = {
  id: string
  name: string
  slug: string
  description: string | null
  serviceType: 'salon' | 'spa'
  displayOrder: number
  isActive: boolean
  createdAt: Date | string
}

/**
 * Normalize a Payload relationship value to its bare id.
 *
 * A `relationship` field arrives EITHER as an id string (`depth: 0`) OR as a
 * populated object (`{ id, ... }`) depending on the request's `depth` param —
 * both shapes are valid and both reach the afterChange hook, so both are
 * handled here rather than at the call site.
 */
function relationshipId(value: PayloadRelationship): string {
  return (typeof value === 'object' ? value?.id : value) as string
}

/**
 * Map a Payload `service` document to a `public.service` row.
 *
 * Pure: no I/O, no clock reads, no id generation.
 */
export function mapPayloadToPublicService(doc: PayloadServiceDoc): PublicServiceRow {
  return {
    id: doc.id,
    categoryId: relationshipId(doc.categoryId),
    name: doc.name,
    slug: doc.slug,
    // Nullables: coalesce undefined → null for Postgres compatibility.
    description: doc.description ?? null,
    // MANDATORY coercion — Payload select values are strings, the column is
    // integer. NaN is passed through on purpose so a malformed doc fails the
    // DB write loudly instead of silently storing garbage.
    durationMinutes: Number(doc.durationMinutes),
    bufferMinutes: doc.bufferMinutes ?? 0,
    pricePaise: doc.pricePaise,
    isActive: doc.isActive ?? true,
    imageUrl: doc.imageUrl ?? null,
    displayOrder: doc.displayOrder ?? 0,
    gemsRedeemable: doc.gemsRedeemable ?? false,
    gemsRequired: doc.gemsRequired ?? null,
    gemsCatalogueOrder: doc.gemsCatalogueOrder ?? null,
    // PRESERVED from Payload — never regenerated by the mapper.
    createdAt: doc.createdAt,
  }
}

/**
 * Map a Payload `service_category` document to a `public.service_category` row.
 *
 * Pure: no I/O, no clock reads, no id generation.
 */
export function mapPayloadToPublicCategory(
  doc: PayloadServiceCategoryDoc,
): PublicServiceCategoryRow {
  return {
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    // Nullables: coalesce undefined → null for Postgres compatibility.
    description: doc.description ?? null,
    serviceType: doc.serviceType,
    displayOrder: doc.displayOrder ?? 0,
    isActive: doc.isActive ?? true,
    // PRESERVED from Payload — never regenerated by the mapper.
    createdAt: doc.createdAt,
  }
}
