# Dependency CI review — October 2026

Reviewed on 2026-10-06. This change combines the production updates from [PR #281](https://github.com/royalglowsalonspa/theroyalglow-webapp/pull/281) and development updates from [PR #280](https://github.com/royalglowsalonspa/theroyalglow-webapp/pull/280). Vitest 5.0.3 supersedes the 5.0.2 update in [PR #273](https://github.com/royalglowsalonspa/theroyalglow-webapp/pull/273).

## Original failures and evidence

| PR | Failed check | Evidence and cause |
| --- | --- | --- |
| #281 | Lint/typecheck dependency guard | [Job 111645229367](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/37273458661/job/111645229367): root overrides retained sharp 0.35.4, hono 4.13.9 and @hono/node-server 2.1.1 while workspace declarations requested 0.35.5, 4.13.12 and 2.1.3. Bun honored the overrides. |
| #281 | Unit coverage | [Job 111645229313](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/37273458661/job/111645229313): 1,405 tests passed and two failed. One repeated the override inconsistency; the other expected database initialization without DATABASE_URL to throw. Neon 1.2.0 changed connection configuration/validation timing, exposing reliance on the driver's old behavior. |
| #281 | Dependency audit | [Job 111645229421](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/37273458661/job/111645229421): 34 advisories, including 16 high, 14 moderate and four low. Direct upgrades alone did not repair old root pins and all transitive resolutions. |
| #281 | Security scan | [Job 111645228927](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/37273458694/job/111645228927): eight high findings. |
| #280 | Dependency audit | [Job 111644837531](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/37273332499/job/111644837531): 21 advisories, including eight high, nine moderate and four low. Vulnerable brace-expansion, braces, DOMPurify, fast-uri, http-cache-semantics, ip-address and undici versions already existed in the base commit. |
| #280 | Coverage upload | [Job 111644837608](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/37273332499/job/111644837608): all 176 files and 1,407 tests passed. Codecov then failed downloading its executable from cli.codecov.io with a TLS handshake error; signature verification consequently had no downloaded signature to check. |
| #280 | Security scan | [Job 111644838261](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/37273332537/job/111644838261): eight high findings. The scanner and vulnerability database download succeeded. |
| #273 | Dependency audit | [Job 109769912085](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/36678929625/job/109769912085): 19 advisories, including seven high, nine moderate and three low. |
| #273 | Security scan | [Job 109769912037](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/36678929701/job/109769912037): six high findings. |
| #273 | Additional compatibility defect | [Unit job 109769912187](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/36678929625/job/109769912187) passed 1,407 tests but warned about unsupported mixed versions: Vitest 5.0.2 with coverage-v8 5.0.1. This warning was not the failing check. |

The common base was commit `039715835661fbe66f9236055d0b69fa385f403e`. PR heads inspected were #281 `f82174e3b24c7c95c21e80c3789a1981b3d94d3a`, #280 `e3dc01f6bc2b2aeec58ad8fbbbf69ce57be9f4ef`, and #273 `9ebbc4fc3cbaec947b0317e396159ad664219fbf`.

The umbrella CI failures follow these underlying failures. Skipped deployed-environment load/ZAP checks do not establish successful live testing.

## Fixes

- Remove redundant root overrides for sharp, hono and @hono/node-server so workspace dependency declarations control their upgrades. Strengthen the override compatibility guard with semver-aware checks.
- Validate DATABASE_URL explicitly when the lazy database client is first used. Importing the package remains safe without database configuration; actual database use fails with the repository's own clear configuration error.
- Keep every Vitest runner and coverage provider at 5.0.3. A new dependency guard checks declarations and installed versions, preventing unsupported mixed versions even when tests happen to pass.
- Download Codecov CLI 11.3.1 from its [official GitHub release](https://github.com/codecov/codecov-cli/releases/tag/v11.3.1), verify SHA256 `ca1d64196d2d34771084afe76ea657d581bf628e31d993ff8e52ea09cc88a56d`, then pass the verified executable to the Codecov action. Upload errors remain fatal. This removes the failing executable-download host without disabling integrity verification.
- Add `--hide-unstaged` to the lint-staged hook to preserve unrelated working changes under its new staging behavior.
- Refresh security resolutions: DOMPurify 3.4.16, brace-expansion 5.0.12, fast-uri 3.1.8 and ip-address 10.7.3; update compatible transitive fast-copy 3.1, http-cache-semantics 4.3, proxy-addr 2.0.8 and source-map-js 1.2.2 resolutions.
- Replace the global undici override with `undici@>=7.0.0 <7.29.1: ^7.29.1`. This upgrades Payload's vulnerable 7.x dependency without forcing jsdom's 8.x dependency backward. Installed resolution checks found Payload using 7.30.0 and jsdom using 8.11.2.
- Regenerate the lockfile with the repository's Bun 1.4.2. No audit exclusions, advisory suppressions, weakened test expectations or reduced thresholds were added.

Codecov's original Dependabot log also showed no upload token. That is separate from the observed pre-authentication TLS failure. Actual upload authentication must be verified in GitHub Actions; this work does not change secrets or token permissions.

## Production upgrade changelogs

These are the 17 dependency names in #281. Versions describe that PR's intended update; the committed lockfile is authoritative for final transitive resolutions.

| Dependency | Upgrade | Primary upstream notes and repository implication |
| --- | --- | --- |
| @better-auth/infra | 0.4.11 → 0.4.13 | The [upstream history linked by Dependabot](https://github.com/better-auth/infrastructure/commits/HEAD/packages/infra) returned 404 through the connector and was unavailable through browsing. Release-specific changes are **unverified**; no migration claim is inferred. |
| @neondatabase/serverless | 1.1.0 → 1.2.0 | [Changelog](https://github.com/neondatabase/serverless/blob/v1.2.0/CHANGELOG.md): supports individual connection parameters and deferred functions, and stops JSR publication. The application must enforce its DATABASE_URL requirement itself. |
| @sentry/nextjs | 11.0.0 → 11.2.0 | [11.1.0](https://github.com/getsentry/sentry-javascript/releases/tag/11.1.0) fixes Next.js navigation/basePath and Turbopack loader behavior; [11.2.0](https://github.com/getsentry/sentry-javascript/releases/tag/11.2.0) includes instrumentation and runtime fixes. |
| @upstash/qstash | 2.11.3 → 2.12.0 | [Release](https://github.com/upstash/qstash-js/releases/tag/v2.12.0): replaces crypto-js with Web Crypto through uncrypto, changes bulk cancellation support and adds retry/failure logging. Existing signed-job behavior remains subject to application tests. |
| better-auth | 1.7.6 → 1.7.7 | [Release](https://github.com/better-auth/better-auth/releases/tag/v1.7.7): security fixes for Magic Link account takeover and OAuth Proxy/state handling, plus sign-up restrictions and response fixes. Coordinate auth-serving nodes during rollout; see below. |
| drizzle-orm | 0.45.2 → 0.45.3 | [Release](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.3): adds a Netlify DB driver. No application schema migration is introduced by this dependency-only change. |
| lucide-react | 1.48.0 → 1.49.0 | [Release](https://github.com/lucide-icons/lucide/releases/tag/1.49.0): new icons and optional @types/react peer metadata; no icon replacement is required. |
| motion | 13.4.3 → 13.5.0 | [Changelog](https://github.com/motiondivision/motion/blob/v13.5.0/CHANGELOG.md): fixes AnimatePresence transitions/reentry and layout interruptions; offset scroll animations use the main thread in 13.5.0. Existing visual behavior merits browser verification before rollout. |
| next | 16.3.6 → 16.3.8 | [16.3.8](https://github.com/vercel/next.js/releases/tag/v16.3.8) repairs image-optimization SSRF, metadata access, several caching disclosures/poisoning cases and development MCP exposure. Retain this security update. |
| resend | 6.29.0 → 6.32.0 | [6.30.0](https://github.com/resend/resend-node/releases/tag/v6.30.0), [6.31.0](https://github.com/resend/resend-node/releases/tag/v6.31.0), [6.32.0](https://github.com/resend/resend-node/releases/tag/v6.32.0): usage resource, topic webhooks, request cancellation/options and batch-header fixes. No outbound email was used as a smoke test. |
| sharp | 0.35.4 → 0.35.5 | [Release](https://github.com/lovell/sharp/releases/tag/v0.35.5): libvips update, array bounds checks, improved image/gain-map operations and TypeScript corrections. Remove the obsolete override so this version can install. |
| @aws-sdk/client-s3 | 3.1140.0 → 3.1145.0 | [Package changelog](https://github.com/aws/aws-sdk-js-v3/blob/v3.1145.0/clients/client-s3/CHANGELOG.md): adds an optional IntelligentTieringReferenceDate inventory field in 3.1144.0; the other increments are package version bumps. No change to the application's object-upload contract is identified. |
| @hono/node-server | 2.1.1 → 2.1.3 | [2.1.2](https://github.com/honojs/node-server/releases/tag/v2.1.2) fixes headers/types; [2.1.3](https://github.com/honojs/node-server/releases/tag/v2.1.3) fixes double-decoding bypasses in serveStatic and rejects remaining percent escapes by default. |
| @sentry/node | 11.0.0 → 11.2.0 | [Release](https://github.com/getsentry/sentry-javascript/releases/tag/11.2.0): adds Hono instrumentation and default consecutive-error deduplication. #281 changes the lockfile resolution while the invoicing manifest's ^11.0.0 range already permits 11.2.0. |
| hono | 4.13.9 → 4.13.12 | [4.13.10](https://github.com/honojs/hono/releases/tag/v4.13.10) deprecates bundled runtime adapters for future v5; [4.13.11](https://github.com/honojs/hono/releases/tag/v4.13.11) fixes static-path decoding; [4.13.12](https://github.com/honojs/hono/releases/tag/v4.13.12) repairs bundled types, headers and middleware returns. No v5 migration is required here. |
| posthog-js | 1.434.13 → 1.435.6 | [Browser changelog](https://github.com/PostHog/posthog-js/blob/main/packages/browser/CHANGELOG.md): consent/persistence and cross-subdomain identity fixes, replay robustness, survey updates and an additional campaign identifier. Review concerns apply to the stated version interval, not later entries on the moving main branch. |
| posthog-node | 5.53.0 → 5.55.0 | [Node changelog](https://github.com/PostHog/posthog-js/blob/main/packages/node/CHANGELOG.md): feature-flag evaluation metadata, compatible cache payload handling and optional disabling of automatic polling while preserving initialization/manual refresh. |

Better Auth's release requires servers participating in the same cookie-backed OAuth/SAML flow to upgrade together; pending sign-in flows may need restarting. All OAuth Proxy participants must likewise be upgraded together when that plugin is used. For Magic Link configurations, previously issued links must be replaced. The release states no database migration is required. Web and admin share authentication, so deploy their auth dependency change together rather than assuming independent rolling versions can exchange old state.

Sentry's new deduplication can reduce consecutive duplicate error events, and Hono auto-instrumentation can change tracing output. These are upstream behavior changes, not demonstrated CI regressions.

## Development upgrade changelogs

| Dependency | Upgrade | Primary upstream notes and implication |
| --- | --- | --- |
| @biomejs/biome | 2.5.14 → 2.5.15 | [Release](https://github.com/biomejs/biome/releases/tag/%40biomejs%2Fbiome%402.5.15): parser/formatter/lint correctness fixes and nursery rules. Repository lint passes with existing warnings. |
| @vitest/coverage-v8 | 5.0.1 → 5.0.3 | [Vitest 5.0.3](https://github.com/vitest-dev/vitest/releases/tag/v5.0.3): keep exact runner/provider versions synchronized; #273 had left this provider at 5.0.1. |
| lint-staged | 17.5.1 → 17.6.0 | [Release](https://github.com/lint-staged/lint-staged/releases/tag/v17.6.0): tasks can stage all tracked files they modify, including initially unstaged files. The hook now uses upstream's --hide-unstaged option. |
| turbo | 2.11.4 → 2.11.6 | [2.11.5](https://github.com/vercel/turborepo/releases/tag/v2.11.5) and [2.11.6](https://github.com/vercel/turborepo/releases/tag/v2.11.6): task hashing/lockfile/cache fixes and upstream security maintenance. |
| vitest | 5.0.1 → 5.0.3 | [5.0.2](https://github.com/vitest-dev/vitest/releases/tag/v5.0.2) and [5.0.3](https://github.com/vitest-dev/vitest/releases/tag/v5.0.3): runner, matcher, cache/pool and jsdom Blob fixes. No announced breaking migration explains #280 or #273's failed security checks. |
| @types/node | 26.6.2 → 26.6.4 | [Upstream history](https://github.com/DefinitelyTyped/DefinitelyTyped/commits/master/types/node) was inspected; an exact npm-version-to-commit mapping remains **unverified**. Repository typechecks pass. |
| wait-on | 9.1.0 → 9.5.1 | [9.2.0](https://github.com/jeffbski/wait-on/releases/tag/v9.2.0) through [9.5.1](https://github.com/jeffbski/wait-on/releases/tag/v9.5.1): socket cleanup, malformed-resource validation, TypeScript definitions, command/status-code features and dependency security refresh. |

## Validation and complete security remediation

Completed locally against the combined fixes:

- Bun 1.4.2 frozen-lockfile installation.
- Final full coverage suite: **178 files, 1,444 tests passed**, using four workers locally.
- Final focused dependency-guard/database tests: **three files, 36 tests passed**, including later override regression cases beyond the earlier full-suite run.
- Root lint passed with existing warnings; workspace and tooling typechecks passed.
- Production builds passed for **web, admin, CMS and invoicing**.
- Authentication, Vitest, dependency-override and release consistency checks passed.
- CI YAML parsed; the official Codecov GitHub executable was downloaded and its SHA256 independently verified.

The first repair still failed on [braces 3.0.3 stack-exhaustion denial of service, GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). No published patched braces release was available. The complete repair removes both dependency chains that installed it:

- Upgrade Sass 1.77.4 to 1.105.1 through a version-scoped override. Its maintained Chokidar 5 dependency has no braces dependency. Remove the old Immutable 4 override so Sass can use its required Immutable 5. [Sass changelog](https://github.com/sass/dart-sass/blob/1.105.1/CHANGELOG.md). Node 20.19 or newer is required. The CMS production build passes; its only custom SCSS file is empty, while Payload provides precompiled styles.
- Replace `findup-sync@4` with the owned [`@rgss/findup-sync`](../packages/findup-sync/README.md) CommonJS package. The original implementation used Micromatch only for `matcher`, which already delegates to Picomatch. Calling maintained Picomatch directly removes the unused vulnerable brace AST compiler/expander. Preserve literal detection, glob matching, pattern order, directory ordering and cwd expansion, and make ancestor traversal iterative. The original MIT license is retained, and the package keeps its own identity and platform version.

The replacement has 16 behavior and installed-consumer regression tests, including hostile nested patterns and input-length bounds. The root unit suite collects them, strict TypeScript checks its JavaScript and declaration API, and release-please updates its version with the other workspaces. The root override is restricted to findup-sync's 4.x consumer requirements.

After this remediation, strict `bun audit` reports **no vulnerabilities** across 1,323 packages, and `bun why braces` reports no matching package in the lockfile. No advisory suppression, severity exception or scanner configuration change is used. `tsup` already resolves Chokidar 4; no bundler migration is necessary.

The earlier repair's remote CI passed 1,428 tests, all four app jobs, lint/types, compatibility/drift guards, Lighthouse and Codecov upload. Fresh remote CI must validate the complete remediation on each PR's updated SHA. Deployed services and production rollout remain unverified.

## Follow-up: October 7 dependency PR failures

PRs #283–#290 and release PR #257 all inherited a new strict audit failure:
MCP SDK 1.30.0, forced by the root override, is affected by
[GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h), added to
GitHub's advisory database on October 6. This is a newly available advisory against
an unchanged base dependency, not evidence that every individual upgrade broke.
[PR #284 audit job](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/37585819369/job/112675565944)
records the affected Payload MCP dependency chain.

The MCP SDK is now a direct root dependency at `^1.32.1`; its root override uses
`$@modelcontextprotocol/sdk` to reuse that declaration. Dependabot can update the
ordinary dependency instead of leaving an untracked exact override frozen.
1.31.0 fixes issuer binding, but
[1.32.0](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/1.32.0)
also fixes experimental-task session isolation and client redirect handling.
The committed SDK resolves to 1.32.1. CMS uses server APIs through Payload and
mcp-handler; it does not use the affected OAuth client providers, task store,
or SDK bearer-auth middleware. No CMS capabilities or credentials changed.
The override guard now resolves references and rejects missing references and
installed versions below the referenced security floor. Package metadata lookup
also supports packages that expose subpaths without an importable root, retaining
consumer-specific peer resolution.

PRs #286 and #289 also failed after their MSW 3 upgrade: `onUnhandledRequest`
was removed, and the catalogue retry test observed three requests instead of two.
The [official migration guide](https://mswjs.io/docs/migrations/2.x-to-3.x/)
requires `onUnhandledFrame` and designated HTTP/utility imports. All web test
imports were migrated. The catalogue loading test used a never-resolving handler
and ended before interception, allowing its request to reach the following test's
handler. The old full file reproduced the failure; running the retry case alone
passed. The replacement waits for interception, asserts the loading state, then
releases and awaits the response before teardown. The exact two-attempt retry
assertion remains intact. No catalogue application behavior was changed.

Dependabot scanned both `/` and app/package globs even though its Bun updater
already [discovers root workspaces](https://github.com/dependabot/dependabot-core/blob/b4b31b9e409bbf7665e2fb9756bee5092cefc723/bun/lib/dependabot/bun/file_fetcher.rb#L79).
Root Motion #285 and MSW #286 already update both app manifests and the shared
lockfile; app PRs #287–#290 duplicated those upgrades. Bun now has one root scan.
The obsolete automatic lockfile writeback workflow was removed: the original
Dependabot commits already regenerate `bun.lock`, and CI retains frozen installs.
A new policy guard rejects overlapping scans, undiscovered workspaces, split
coupled groups, and filters hiding referenced security dependencies.

Other reviewed upgrades are compatible with existing APIs:

- [Motion 14](https://motion.dev/docs/react-upgrade-guide#14-0) has no public React
  breaking changes; both apps use public `motion/react` APIs.
- [Turbo 2.11.7](https://github.com/vercel/turborepo/releases/tag/v2.11.7) repairs
  environment propagation/cache behavior; existing tasks need no migration.
- [Sentry 11.3](https://github.com/getsentry/sentry-javascript/releases/tag/11.3.0)
  and [11.4](https://github.com/getsentry/sentry-javascript/releases/tag/11.4.0)
  require no configuration migration here. Existing privacy settings remain.
- [Lucide 1.51](https://github.com/lucide-icons/lucide/releases/tag/1.51.0), TanStack
  Table 9.2.5 and Better Auth Infra 0.4.14 require no used-API migration.

Local combined validation: frozen Bun 1.4.2 install, strict audit with no
vulnerabilities (1,319 packages), all dependency guards, lint with existing
warnings, all workspace/tooling types, release consistency, and full coverage:
**180 files / 1,465 tests passed**. Eight focused MSW suites passed 68 tests.
Production builds passed for web, admin, CMS and invoicing. Remote validation results are recorded in the associated PR.
No advisory exclusions, reduced thresholds, disabled checks or permission changes
were introduced. Future advisories and breaking upstream releases still require
review; the guards deliberately fail when a genuine problem is discovered.