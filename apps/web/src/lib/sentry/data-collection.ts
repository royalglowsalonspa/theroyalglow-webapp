// Preserve the restrictive `sendDefaultPii: false` baseline removed in Sentry v11.
// Keep request identity, bodies, GenAI content, database data, and queue payloads out
// of error events while retaining Sentry's filtered header/query-parameter metadata.
const PII_DENY_PATTERNS = ['forwarded', '-ip', 'remote-', 'via', '-user']

export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: PII_DENY_PATTERNS },
    response: { deny: PII_DENY_PATTERNS },
  },
  httpBodies: [],
  urlQueryParams: { deny: PII_DENY_PATTERNS },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
}
