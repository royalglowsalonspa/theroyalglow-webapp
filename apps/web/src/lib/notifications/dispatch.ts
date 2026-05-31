// Single seam between persisting a `notification` row and actually delivering
// it via Web Push / email. For Phase 5 this is intentionally a no-op: the
// caller has already persisted the notification record, and the real provider
// integrations (web-push + Resend) are deferred to Phase 6.
//
// We read provider config straight from `process.env` (NOT from `@/env`) on
// purpose: `env.ts` types these keys as required and would fail build-time
// validation when they are absent. Reading `process.env` directly behind a
// truthy guard lets the app build and run with no provider keys configured.
//
// This function never throws — delivery is best-effort and must not affect the
// caller, which has already committed the notification record.

type DispatchableNotification = {
  id: string
  userId: string
  type: string
  channel: string
  title: string
  body: string
}

export async function dispatchNotification(
  notification: DispatchableNotification,
): Promise<void> {
  const { id, type, channel } = notification

  // Read provider keys directly from `process.env` (guarded) so this seam never
  // triggers `env.ts` build-time validation when the keys are absent.
  const hasWebPush = Boolean(process.env.WEB_PUSH_PRIVATE_KEY)
  const hasResend = Boolean(process.env.RESEND_API_KEY)

  if (!hasWebPush && !hasResend) {
    console.info('[dispatchNotification] skipped (no provider keys configured)', {
      id,
      type,
      channel,
    })
    return
  }

  // Provider keys are present, but actual delivery is still deferred for now:
  // the notification row is persisted and the bell/feed surface it immediately.
  // TODO (Phase 6): implement web-push + Resend send here.
  console.info('[dispatchNotification] provider keys present; delivery deferred to Phase 6', {
    id,
    type,
    channel,
  })
}
