import type { Access } from 'payload'

/**
 * Read access for status-bearing collections (e.g. `blog`).
 * - Authenticated Payload users see every document (drafts included).
 * - Anonymous requests are constrained to `status === 'published'` via a
 *   query filter, so draft documents are never exposed over the public API.
 */
export const anyoneReadsPublished: Access = ({ req }) => {
  if (req.user) {
    return true
  }

  return {
    status: {
      equals: 'published',
    },
  }
}

/**
 * Read access for non-status collections (gallery, team, banner, faq, media).
 * These are world-readable; create/update/delete are gated by `adminsWrite`.
 */
export const anyoneReads: Access = () => true

/**
 * Write access (create/update/delete): requires an authenticated Payload user.
 */
export const adminsWrite: Access = ({ req }) => Boolean(req.user)
