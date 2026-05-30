export function ok<T>(
  data: T,
  meta?: { page?: number; totalPages?: number; totalCount?: number }
): Response {
  return Response.json({ success: true, data, ...(meta && { meta }) }, { status: 200 })
}

export function created<T>(data: T): Response {
  return Response.json({ success: true, data }, { status: 201 })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}
