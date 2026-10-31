/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET|PUT /api/settings (admin)
 * Scope        : API — Admin settings (multi-branch R1.1, R6.3)
 *
 * Description  : The active branch's booking settings (business hours and
 *                booking rules, as numbered revisions) and the settings every
 *                branch shares: the invoicing switch and the cross-branch
 *                settlement share and value per gem. GET returns the branch's
 *                current revision, its recent history and the shared
 *                settings; PUT saves one section ({ section, value }).
 *
 * Responsibilities :
 * - GET → { branch: BranchSettingsView, history, invoicing, settlement }
 *   (Developer); settlement is null when the stored value can't be read
 * - PUT businessHours | bookingRules { branchId, expectedRevision, value }:
 *   save the branch's next revision; 409 BRANCH_CONTEXT_CHANGED after a branch
 *   switch, 409 SETTINGS_CHANGED when someone saved since the page loaded
 * - PUT invoicing { value }: the shared switch (TX-08)
 * - PUT settlement { value }: the share and value per gem (R10, ST-05)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/db/queries, @rgss/errors,
 *                @rgss/types
 *
 * Notes        : Developer only at the active branch
 *                (requireBranchRole('developer')), including through direct
 *                API calls. Revisions are never edited: a save adds the next
 *                one and bookings keep the revision that decided them.
 *                Managers see the hours they schedule against in
 *                GET /api/schedule instead.
 ************************************************************/

import {
  getBranchSettingsForAdmin,
  getInvoicingSetting,
  getSettlementSetting,
  SETTING_KEYS,
  saveBranchSettingsSection,
  upsertSetting,
} from '@rgss/db/queries'
import { AppError, badRequest, ERROR_CODES, notFound } from '@rgss/errors'
import { type SettlementSetting, settingsUpdateSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

async function branchSettingsOrThrow(branchId: string) {
  const settings = await getBranchSettingsForAdmin(branchId)
  if (!settings) {
    throw notFound('Branch not found.')
  }
  return settings
}

/**
 * The settlement settings, or null when the stored value can't be read: the
 * Developer then saves them again here. Entries refuse to record meanwhile.
 */
async function settlementOrNull(): Promise<SettlementSetting | null> {
  try {
    return await getSettlementSetting()
  } catch (error) {
    if (error instanceof AppError && error.code === ERROR_CODES.SETTLEMENT_SETTINGS_INVALID) {
      return null
    }
    throw error
  }
}

// GET /api/settings — the active branch's settings and the shared invoicing
// and settlement settings.
export const GET = withErrorHandler(async () => {
  const ctx = await requireBranchRole('developer')

  const [settings, invoicing, settlement] = await Promise.all([
    branchSettingsOrThrow(ctx.branch.id),
    getInvoicingSetting(),
    settlementOrNull(),
  ])
  return apiSuccess({
    branch: settings.current,
    history: settings.history,
    invoicing,
    settlement,
  })
})

// PUT /api/settings — save one section.
export const PUT = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('developer')
  const { session } = ctx

  const body = await req.json().catch(() => null)
  const parsed = settingsUpdateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  const input = parsed.data

  if (input.section === 'invoicing') {
    const saved = await upsertSetting(SETTING_KEYS.invoicing, input.value, session.user.id)
    await audit(req, session, {
      action: 'update',
      entityType: 'system_setting',
      entityId: SETTING_KEYS.invoicing,
      newValues: input.value,
    })
    return apiSuccess({ section: input.section, invoicing: saved.value })
  }

  if (input.section === 'settlement') {
    // Later entries use the new share and value per gem; every entry keeps
    // the ones it was recorded with (ST-05).
    const previous = await settlementOrNull()
    const saved = await upsertSetting(SETTING_KEYS.settlement, input.value, session.user.id)
    await audit(req, session, {
      action: 'update',
      entityType: 'system_setting',
      entityId: SETTING_KEYS.settlement,
      oldValues: previous,
      newValues: input.value,
    })
    return apiSuccess({ section: input.section, settlement: saved.value })
  }

  // The page names the branch it was rendered for: a tab left open across a
  // switch gets 409 instead of saving the other branch's settings.
  assertRenderedBranch(ctx, input.branchId)
  const branchId = ctx.branch.id

  const result = await saveBranchSettingsSection(
    input.section === 'businessHours'
      ? {
          section: 'businessHours',
          value: input.value,
          branchId,
          expectedRevision: input.expectedRevision,
          actorId: session.user.id,
        }
      : {
          section: 'bookingRules',
          value: input.value,
          branchId,
          expectedRevision: input.expectedRevision,
          actorId: session.user.id,
        },
  )
  if (!result.ok) {
    if (result.reason === 'missing') {
      throw notFound('Branch not found.')
    }
    throw new AppError({
      code: ERROR_CODES.SETTINGS_CHANGED,
      message: `Someone saved ${ctx.branch.name}'s settings after you opened this page. Reload to see them, then make your change again.`,
      statusCode: 409,
    })
  }

  await audit(req, session, {
    action: 'update',
    entityType: 'branch_setting',
    entityId: `${branchId}:${result.revision}`,
    branchId,
    newValues: { section: input.section, revision: result.revision, value: input.value },
  })

  const settings = await branchSettingsOrThrow(branchId)
  return apiSuccess({ section: input.section, branch: settings.current, history: settings.history })
})
