/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : validate-offer (hooks)
 * Scope        : CMS Collections — Offer save validation (offers.md)
 *
 * Description  : Collection `beforeValidate` hook for Offer: checks the card
 *                and its checkout rule before anything is written, including
 *                the linked services against the app's catalogue, in the
 *                save's own transaction.
 *
 * Responsibilities :
 * - The card shown on the website needs its image
 * - A rule needs its type's value, its services and both dates in order
 * - Linked services: known, active, with an active category, salon only
 * - While SERVICE_SYNC_ENABLED is off, refuse a save that has or had a rule
 *   (the counter wouldn't get it, design §5); card-only saves go ahead
 *
 * Tech Stack   : Payload CMS v3, Drizzle ORM, TypeScript
 * Layer        : CMS (Hooks — validation)
 *
 * Dependencies : payload, drizzle-orm, ../lib/offer-rule, ../lib/sync-db
 *
 * Notes        : A collection hook, not field `validate`s: the rules span
 *                several fields and the services need a database read, which
 *                should run on save only. Payload maps each error's path to
 *                its field in the admin form.
 ************************************************************/

import { eq, inArray } from 'drizzle-orm'
import type { CollectionBeforeValidateHook } from 'payload'
import { ValidationError } from 'payload'
import {
  type FieldError,
  linkedServiceErrors,
  linkedServiceIds,
  mergeOfferData,
  offerRuleErrors,
  ruleTypeOf,
} from '../lib/offer-rule'
import { isSyncEnabled, service, serviceCategory, txDb } from '../lib/sync-db'

export const SYNC_OFF_MESSAGE =
  "Checkout rules can't be saved while catalogue sync is off (SERVICE_SYNC_ENABLED=false): the counter wouldn't get the change. Turn sync back on, or save the offer without a rule."

export const validateOffer: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const merged = mergeOfferData(data, originalDoc)
  const errors: FieldError[] = offerRuleErrors(merged)
  const type = ruleTypeOf(merged.rule)
  const hadRule = ruleTypeOf(mergeOfferData(undefined, originalDoc).rule) !== 'none'

  if (!isSyncEnabled() && (type !== 'none' || hadRule)) {
    errors.push({ path: 'rule.type', message: SYNC_OFF_MESSAGE })
  }

  const ids = type === 'none' ? [] : linkedServiceIds(merged.rule)
  if (ids.length > 0 && !errors.some((error) => error.path === 'rule.services')) {
    const db = await txDb(req)
    const rows = await db
      .select({
        id: service.id,
        name: service.name,
        isActive: service.isActive,
        serviceType: serviceCategory.serviceType,
        categoryActive: serviceCategory.isActive,
      })
      .from(service)
      .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
      .where(inArray(service.id, ids))
    errors.push(...linkedServiceErrors(ids, rows))
  }

  if (errors.length > 0) {
    throw new ValidationError({ collection: 'offer', errors })
  }
  return data
}
