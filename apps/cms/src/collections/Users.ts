/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Users
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS admin users collection backing the admin UI
 *                authentication and req.user access-control checks.
 *
 * Responsibilities :
 * - Define CMS admin user schema (email + name)
 * - Enable Payload's built-in auth (login, sessions)
 *
 * Features / Functionality :
 * - Email-based authentication for CMS admin panel
 * - Name field for display purposes
 *
 * Tech Stack   : Payload CMS v3
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload
 *
 * Notes        :
 * - Separate from Better Auth user table (web app auth)
 * - Powers the req.user checks in all access control helpers
 ************************************************************/
import type { CollectionConfig } from 'payload'

/**
 * Payload admin users — the authentication collection backing the admin UI
 * and the `req.user` checks used by the access-control helpers.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
    group: 'People',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
  ],
}
