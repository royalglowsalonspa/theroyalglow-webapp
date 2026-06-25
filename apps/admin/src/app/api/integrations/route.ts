import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getIntegrationStatuses } from '@/lib/integrations/health'

export const GET = withErrorHandler(async () => {
  await requireRole('developer')
  const integrations = await getIntegrationStatuses()
  return apiSuccess({ integrations })
})
