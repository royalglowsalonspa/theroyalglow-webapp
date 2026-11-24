/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Offer
 * Scope        : CMS Collections
 *
 * Description  : An offer: the website card shown on the homepage and
 *                /offers, and an optional checkout rule the counter applies
 *                (multi-branch offers.md, R4.8). The rule is mirrored into
 *                the app's `offer` / `offer_service` tables on save.
 *
 * Responsibilities :
 * - Card: title, description, discount label, image, CTA, category, order
 * - "Show on website" (on by default): off keeps a counter-only rule
 * - Checkout rule: percentage, flat amount or combo price, linked salon
 *   services and terms; the card's dates bound it
 * - Retire with Active; delete is disabled (R4.6)
 * - Every version kept, with who saved it
 *
 * Tech Stack   : Payload CMS v3
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, ../access/published, ../hooks/revalidate,
 *                ../hooks/sync-offer, ../hooks/validate-offer,
 *                ../lib/catalogue-fields
 *
 * Notes        :
 * - Hook order: validate before anything is written; sync before the cache
 *   ping, so a failed sync rolls the save back first.
 * - Amounts are whole paise, like service prices in this CMS.
 * - Offers apply to salon services only, one per customer per IST day at any
 *   branch, and not with gems: the app enforces these at checkout.
 ************************************************************/
import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'
import { syncOfferToPublic } from '../hooks/sync-offer'
import { validateOffer } from '../hooks/validate-offer'
import { editedByField } from '../lib/catalogue-fields'

const revalidate = revalidateHooks('offer')

const RULE_TYPE_OPTIONS = [
  { label: 'No checkout rule (website card only)', value: 'none' },
  { label: 'Percentage off', value: 'percentage' },
  { label: 'Flat amount off', value: 'flat' },
  { label: 'Combo price', value: 'combo_price' },
]

export const Offer: CollectionConfig = {
  slug: 'offer',
  hooks: {
    beforeValidate: [validateOffer],
    afterChange: [syncOfferToPublic, ...revalidate.afterChange],
    afterDelete: revalidate.afterDelete,
  },
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    // Retire an offer with Active instead: past invoices and redemptions name
    // its checkout rule (R4.6).
    delete: () => false,
  },
  versions: {
    // Every version kept, no drafts: a save publishes straight away.
    maxPerDoc: 0,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'discountLabel', 'active', 'showOnWebsite', 'validUntil'],
    description:
      'Offers: the website card, and an optional checkout rule the counter applies. Retire an offer by unticking Active.',
    group: 'Marketing',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Offer Title',
      admin: {
        description: 'E.g. "20% OFF All Facials — This week only!" The counter sees it too.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Short Description',
      admin: {
        description: '1-2 lines shown on the offer card.',
      },
    },
    {
      name: 'discountLabel',
      type: 'text',
      label: 'Discount Label',
      admin: {
        description: 'E.g. "20% OFF", "₹500 off", "Buy 2 Get 1 Free". Shown as a badge.',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'Offer Image',
      admin: {
        description: 'Required while Show on website is ticked.',
      },
    },
    {
      name: 'ctaLabel',
      type: 'text',
      defaultValue: 'Book Now',
      label: 'CTA Button Label',
    },
    {
      name: 'ctaHref',
      type: 'text',
      defaultValue: '/?book=1',
      label: 'CTA Link',
      admin: {
        description: 'Internal path or full URL. Default opens the booking dialog.',
      },
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'All Services', value: 'all' },
        { label: 'Salon', value: 'salon' },
        { label: 'SPA', value: 'spa' },
        { label: 'Bridal', value: 'bridal' },
        { label: 'Nails', value: 'nails' },
        { label: 'Skincare', value: 'skincare' },
      ],
      defaultValue: 'all',
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      required: true,
      label: 'Active',
      admin: {
        description:
          'Untick to retire the offer: the website and the counter stop offering it. Offers are never deleted.',
      },
    },
    {
      name: 'showOnWebsite',
      type: 'checkbox',
      defaultValue: true,
      required: true,
      label: 'Show on website',
      admin: {
        description:
          'Untick for a counter-only discount: the checkout rule still applies, but no website page shows the card.',
      },
    },
    {
      name: 'validFrom',
      type: 'date',
      label: 'Valid From',
      admin: {
        description:
          'Leave blank to show the card immediately. A checkout rule needs it: it applies from this day (IST).',
      },
    },
    {
      name: 'validUntil',
      type: 'date',
      label: 'Valid Until',
      admin: {
        description:
          'Leave blank for a card with no expiry. A checkout rule needs it: it applies until the end of this day (IST).',
      },
    },
    {
      name: 'rule',
      type: 'group',
      label: 'Checkout rule',
      admin: {
        description:
          'What the counter takes off a salon booking. One offer per customer per day at any branch, never with gems.',
      },
      fields: [
        {
          name: 'type',
          type: 'select',
          required: true,
          defaultValue: 'none',
          options: RULE_TYPE_OPTIONS,
          label: 'Rule',
        },
        {
          name: 'percentage',
          type: 'number',
          min: 1,
          max: 100,
          label: 'Percentage off',
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'percentage',
            description: 'A whole number from 1 to 100, taken off the linked services.',
          },
        },
        {
          name: 'amountPaise',
          type: 'number',
          min: 1,
          label: 'Amount off (paise)',
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'flat',
            description:
              'In paise: ₹500.00 is 50000. Taken off the linked services, never more than they cost.',
          },
        },
        {
          name: 'comboPricePaise',
          type: 'number',
          min: 1,
          label: 'Combo price (paise)',
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'combo_price',
            description:
              'In paise: ₹2,999.00 is 299900. The booking must include every linked service; together they cost this.',
          },
        },
        {
          name: 'services',
          type: 'relationship',
          relationTo: 'service',
          hasMany: true,
          label: 'Services',
          admin: {
            condition: (_data, siblingData) =>
              Boolean(siblingData?.type && siblingData.type !== 'none'),
            description: 'Active salon services the rule applies to. A combo needs at least two.',
          },
        },
        {
          name: 'terms',
          type: 'textarea',
          label: 'Terms',
          admin: {
            condition: (_data, siblingData) =>
              Boolean(siblingData?.type && siblingData.type !== 'none'),
            description: 'Shown at the counter, e.g. "Weekdays only".',
          },
        },
      ],
    },
    {
      name: 'order',
      type: 'number',
      label: 'Display Order',
      admin: {
        description: 'Lower numbers appear first.',
      },
    },
    editedByField(),
  ],
}
