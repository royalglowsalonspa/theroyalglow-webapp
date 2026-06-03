/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : published
 * Scope        : CMS Access Control
 *
 * Description  : Access control helpers for Payload CMS collections,
 *                gating anonymous reads and admin writes.
 *
 * Responsibilities :
 * - Allow authenticated users full read access
 * - Restrict anonymous reads to published documents
 * - Gate write operations to authenticated Payload admins
 *
 * Features / Functionality :
 * - anyoneReadsPublished — status filter for anonymous
 * - anyoneReads — unrestricted public read
 * - adminsWrite — require authenticated user for mutations
 *
 * Tech Stack   : Payload CMS v3
 * Layer        : CMS (Access)
 *
 * Dependencies : payload (types)
 *
 * Notes        :
 * - Used by Blog (status-gated) and all other collections (world-readable)
 ************************************************************/
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
