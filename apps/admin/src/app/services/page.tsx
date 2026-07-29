/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Services Redirect
 * Scope        : Admin Portal — retired service management route
 *
 * Description  : Service and service-category authoring moved to Payload CMS
 *                (`cms.theroyalglow.in`), which is now the only write path into
 *                `public.service` / `public.service_category`. The admin
 *                management UI (page + ServicesManager) is gone; this route is
 *                kept only so the old bookmark/sidebar link lands somewhere
 *                useful instead of 404ing, redirecting straight to the CMS
 *                collection.
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next/navigation (redirect)
 *
 * Notes        : Still Manager+ — the `['/services', 3]` entry is deliberately
 *                retained in `lib/rbac.ts`'s route table so lower roles cannot
 *                reach this redirect, even though the sidebar nav item is gone.
 *
 * Requirements : 7.1, 7.2, 7.4
 ************************************************************/

import { redirect } from 'next/navigation'

/** Where service/category authoring lives now. */
const CMS_SERVICES_URL = 'https://cms.theroyalglow.in/admin/collections/service'

export default function ServicesRedirect() {
  redirect(CMS_SERVICES_URL)
}
