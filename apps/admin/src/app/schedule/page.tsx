/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Schedule Page
 * Scope        : Admin Portal — Schedule Management
 *
 * Description  : Server page for the weekly staff schedule grid.
 *                Sets metadata and renders the ScheduleGrid component.
 *
 * Responsibilities :
 * - Define page-level metadata (title: "Schedule")
 * - Render the ScheduleGrid component as page content
 * - Serve as the route entry point for /schedule
 *
 * Features / Functionality :
 * - Next.js metadata API for tab title
 * - Delegates weekly schedule management to ScheduleGrid
 * - Clean separation of server metadata from client interactivity
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), ScheduleGrid component
 *
 * Notes        :
 * - Server Component — schedule interactivity lives in ScheduleGrid
 ************************************************************/

import type { Metadata } from 'next'
import { ScheduleGrid } from './schedule-grid'

export const metadata: Metadata = {
  title: 'Schedule',
}

export default function SchedulePage() {
  return <ScheduleGrid />
}
