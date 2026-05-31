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
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
  ],
}
