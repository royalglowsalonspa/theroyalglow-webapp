/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Faq
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS collection for FAQ entries, serving as the
 *                preferred source over the static fallback list.
 *
 * Responsibilities :
 * - Define FAQ schema (question, answer, category, order)
 * - Provide world-readable access, admin-only writes
 *
 * Features / Functionality :
 * - Categorised FAQs (Booking, Pricing, Services, Policies)
 * - Ordering field for display control
 * - Drives FAQPage JSON-LD on /faq
 *
 * Tech Stack   : Payload CMS v3
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, ../access/published
 *
 * Notes        :
 * - Web app uses CMS FAQs first, static fallback if CMS unavailable
 ************************************************************/
import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'

/** CMS-managed FAQ entries — the preferred source over the static FAQS list. */
export const Faq: CollectionConfig = {
  slug: 'faq',
  hooks: revalidateHooks('faq'),
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  admin: {
    useAsTitle: 'question',
    defaultColumns: ['question', 'category', 'order'],
    group: 'Content',
  },
  fields: [
    {
      name: 'question',
      type: 'text',
      required: true,
    },
    {
      name: 'answer',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Answer-first phrasing per the SEO guidelines.',
      },
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Booking', value: 'booking' },
        { label: 'Pricing', value: 'pricing' },
        { label: 'Services', value: 'services' },
        { label: 'Policies', value: 'policies' },
      ],
    },
    {
      name: 'order',
      type: 'number',
    },
  ],
}
