/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : customer-tags
 * Scope        : Seed Data — Customer Tags
 *
 * Description  : Customer tag seed data for CRM segmentation including VIP,
 *                frequency, activity, and behavioral risk classifications.
 *
 * Responsibilities :
 * - Define VIP and frequency-based customer tags
 * - Define behavioral tags (No-Show Risk, Inactive)
 * - Define lifecycle tags (SPA Member, Bridal, Referred)
 * - Assign colors for visual tag chips in admin UI
 *
 * Features / Functionality :
 * - Deterministic IDs (tag_*) for assignment references
 * - URL-safe slugs for tag-based customer filtering
 * - Color codes for visual distinction in CRM views
 * - Descriptions for admin tooltip/hover context
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : None
 *
 * Notes        : Some tags are auto-assigned by background jobs based on
 *                customer behavior (e.g., No-Show Risk after 4+ no-shows).
 ************************************************************/

export const customerTags = [
  {
    id: 'tag_vip',
    name: 'VIP',
    slug: 'vip',
    color: '#FFD700',
    description: 'High-value repeat customer',
  },
  {
    id: 'tag_frequent',
    name: 'Frequent Visitor',
    slug: 'frequent-visitor',
    color: '#4CAF50',
    description: '10+ completed bookings',
  },
  {
    id: 'tag_inactive',
    name: 'Inactive 60d+',
    slug: 'inactive-60d',
    color: '#FF5722',
    description: 'No visit in last 60 days',
  },
  {
    id: 'tag_bridal',
    name: 'Bridal',
    slug: 'bridal',
    color: '#E91E63',
    description: 'Bridal package customer',
  },
  {
    id: 'tag_noshow_risk',
    name: 'No-Show Risk',
    slug: 'noshow-risk',
    color: '#F44336',
    description: '4+ no-shows — requires approval',
  },
  {
    id: 'tag_spa_member',
    name: 'SPA Member',
    slug: 'spa-member',
    color: '#9C27B0',
    description: 'Has active SPA membership',
  },
  {
    id: 'tag_referred',
    name: 'Referred',
    slug: 'referred',
    color: '#2196F3',
    description: 'Came via customer referral',
  },
]
