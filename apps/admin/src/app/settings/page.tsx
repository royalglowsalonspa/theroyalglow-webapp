/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Settings Page
 * Scope        : Admin Portal — System settings
 *
 * Description  : Server page for the admin Settings module. Renders the
 *                SettingsForm which loads and edits business hours, GST, and
 *                booking rules via /api/settings.
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), SettingsForm
 *
 * Notes        : Manager+ (edge middleware + API requireRole).
 ************************************************************/

import type { Metadata } from 'next'
import { SettingsForm } from './settings-form'

export const metadata: Metadata = {
  title: 'Settings',
}

export default function SettingsPage() {
  return <SettingsForm />
}
