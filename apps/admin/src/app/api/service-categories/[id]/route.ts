/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 22-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : PATCH /api/service-categories/[id] — retired (410 Gone)
 * Scope        : API — Admin service category management (retired)
 *
 * Description  : Category edits (rename, reorder, change type, activate /
 *                deactivate) moved to Payload CMS, which syncs to
 *                public.service_category. This route now answers 410 Gone and
 *                points the operator at the CMS document.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/errors
 *
 * Notes        : No GET existed here, so nothing read-only is lost. Categories are
 *                still never hard-deleted (FK RESTRICT from services) — deactivate
 *                them in the CMS instead.
 ************************************************************/

import { gone } from '@rgss/errors'
import { withErrorHandler } from '@/lib/api/error-handler'

// Payload CMS is the authoring surface for the service catalogue.
const CMS_CATEGORIES_URL = 'https://cms.theroyalglow.in/admin/collections/service_category'

// PATCH /api/service-categories/[id] — RETIRED. Edit the category in Payload CMS.
export const PATCH = withErrorHandler(async () => {
  throw gone(
    `Service management moved to CMS. Edit service categories in Payload CMS at ${CMS_CATEGORIES_URL}`,
  )
})
