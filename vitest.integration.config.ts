import { createRootConfig } from './vitest.config'

// DELIBERATE OPT-IN config for the live-infrastructure suites.
//
// The `*.integration.test.*` files are excluded by every project in
// vitest.config.ts, because three of them (packages/db/scripts/drift/__tests__/)
// FORK REAL NEON BRANCHES as soon as DATABASE_URL and NEON_API_KEY are both
// present. That exclusion is unconditional on purpose: an accidental
// `bunx vitest run packages/db/scripts/drift` must collect nothing.
//
// A blanket exclusion would also have broken the one command that is SUPPOSED
// to run them, `bun run test:integration`. This config is the escape hatch —
// it reuses the root projects verbatim (same includes, aliases, setup files)
// with the live-suite exclusion lifted, so the two paths can never drift apart.
// Naming this file explicitly on the command line IS the opt-in: nothing forks a
// branch unless a human typed `--config vitest.integration.config.ts`.
export default createRootConfig({ includeLiveSuites: true })
