import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { getServiceBySlug } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params
    const service = await getServiceBySlug(slug)
    if (!service) {
      throw notFound('Service not found.')
    }
    return apiSuccess({ service })
  }
)
