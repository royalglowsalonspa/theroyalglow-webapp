import { ApiCheck, AssertionBuilder, Frequency } from 'checkly/constructs'

// Check 5 (observability.md Layer 5): API health + response < 500ms.
// Validates overall system health every 5 minutes by hitting the Phase 9
// /api/health endpoint (which probes database, redis, and r2). Asserts a 200
// status and a fast response — `degradedResponseTime` flags a slow-but-up
// state and `maxResponseTime` fails the check past the SLA. Target is
// configurable via CHECKLY_TARGET_URL.
const baseURL = process.env.CHECKLY_TARGET_URL ?? 'https://theroyalglow.in'

new ApiCheck('rgss-health', {
  name: 'API health responds < 500ms',
  frequency: Frequency.EVERY_5M,
  // Degraded at 500ms (the documented SLA), hard-fail past 1s.
  degradedResponseTime: 500,
  maxResponseTime: 1000,
  request: {
    method: 'GET',
    url: `${baseURL}/api/health`,
    followRedirects: true,
    skipSSL: false,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.responseTime().lessThan(500),
    ],
  },
})
