/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Settings Page
 * Scope        : Admin Portal — Branch booking settings and invoicing
 *
 * Description  : Server page for the admin Settings module. Renders the
 *                SettingsForm, which loads and edits the active branch's
 *                business hours and booking rules (as numbered revisions) and
 *                the invoicing switch every branch shares, via /api/settings.
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), SettingsForm
 *
 * Notes        : Developer only (edge middleware + API requireBranchRole).
 *                GST rates are per branch on /settings/tax.
 ************************************************************/

import type { Metadata } from 'next'
import { SettingsForm } from './settings-form'

export const metadata: Metadata = {
  title: 'Settings',
}

export default function SettingsPage() {
  return <SettingsForm />
}
