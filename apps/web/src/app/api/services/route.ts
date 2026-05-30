import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { getAllServicesGrouped } from '@rgss/db/queries'

export const GET = withErrorHandler(async () => {
  const categories = await getAllServicesGrouped()
  return apiSuccess({ categories })
})
