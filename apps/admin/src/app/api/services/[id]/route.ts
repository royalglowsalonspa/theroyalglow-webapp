/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 22-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : PATCH /api/services/[id] — retired (410 Gone)
 * Scope        : API — Admin service management (retired)
 *
 * Description  : Service edits (including activate/deactivate) moved to Payload
 *                CMS, which syncs to public.service. This route now answers 410
 *                Gone and points the operator at the CMS document.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/errors
 *
 * Notes        : No GET existed here, so nothing read-only is lost. Services are
 *                still never hard-deleted — retire them via isActive=false in the
 *                CMS so historical invoice/booking snapshots stay intact.
 ************************************************************/

import { gone } from '@rgss/errors'
import { withErrorHandler } from '@/lib/api/error-handler'

// Payload CMS is the authoring surface for the service catalogue.
const CMS_SERVICES_URL = 'https://cms.theroyalglow.in/admin/collections/service'

// PATCH /api/services/[id] — RETIRED. Edit the service in Payload CMS instead.
export const PATCH = withErrorHandler(async () => {
  throw gone(`Service management moved to CMS. Edit services in Payload CMS at ${CMS_SERVICES_URL}`)
})
