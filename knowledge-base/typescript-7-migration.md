# TypeScript 7 migration

**Status:** Review-ready; not deployed
**Baseline commit:** `e499ca03db833913d620084735cfb1e128b7568b`
**Measured migration commit:** `ed6876c3d55c58474321ad4b0e67bcc448524e04`
**Compiler:** `typescript@7.0.2`
**Compatibility API:** `@typescript/typescript6@6.0.2`, isolated to one AST-based CI utility

This document records the migration from TypeScript 5.9.3 to TypeScript 7's native
Go compiler. It is the implementation decision record, benchmark report, validation
record, and rollback runbook. It does not authorize deployment or database operations.

## Goals and constraints

- Move every application and shared package to one exact TypeScript 7 version.
- Keep existing strictness, module behavior, type safety, architecture, and runtime output.
- Keep Next.js, Payload, Bun, Turborepo, and application dependencies at their current versions.
- Preserve `next build` type checking; never use `typescript.ignoreBuildErrors`.
- Retain old Compiler API code only where repository inspection proves it is required.
- Validate every leaf compiler config, all four application builds, generated types, tests,
  lint, dependency checks, and CI path routing.
- Compare uncached wall time, process-tree CPU time, and peak memory on the same host
  before and after the compiler change.
- Do not deploy, migrate a database, seed data, or call live integrations.

## Compatibility findings

| Surface | Finding | Result |
| --- | --- | --- |
| TypeScript package | `typescript@7.0.2` is the stable npm `latest` release. Its `tsc` command invokes the native compiler. | Pinned exactly in root and all ten workspaces. |
| Compiler API | TypeScript 7.0 exports version metadata but no JavaScript AST/compiler API. | `@typescript/typescript6@6.0.2` retained only for `scripts/admin-design/path-allowlist.mjs`. |
| Next.js 16.3.5 | Installed Next code supports TypeScript 7 through `experimental.useTypeScriptCli`; default API mode rejects TypeScript 7. | CLI mode enabled in web, admin, and CMS; all three production builds pass. |
| Payload 3.90.2 | No TypeScript peer constraint or direct compiler dependency blocks 7.0. The generated CSS side-effect imports were a possible TS7-default risk. | CMS typecheck, type generation, and production build pass without a declaration workaround. |
| Turborepo | Ten workspace tasks invoke `tsc --noEmit`; no project references or declaration emit exist. | Existing `tsc` commands retained; preview-only `tsgo` not installed. |
| Bundlers/tests | Next/Turbopack, tsup/esbuild, Vite/Vitest, and Playwright transpile independently from `tsc`. | Each surface validated separately; test success is not treated as compiler proof. |
| Editor | TypeScript 7 uses an LSP-based language service instead of the old `tsserver` API surface. | No legacy `typescript.tsdk` override added; Kiro/VS Code owns TypeScript 7 language-server activation. |

## Decisions

### One production compiler

The standard `typescript` package remains the compiler dependency and owns `tsc`.
Root and all ten workspaces pin exact version `7.0.2`. `packages/db` and
`packages/types` now declare the compiler used by their own scripts instead of depending
implicitly on root hoisting. Exact pins prevent compiler/platform-package drift across
Bun workspace installs and CI. The nightly `@typescript/native-preview` package is not installed.

### One isolated legacy API consumer

Repository inspection found one maintained import of `typescript` as a library:
`scripts/admin-design/path-allowlist.mjs`. It parses and prints AST nodes so formatting-only
changes do not fail a protected-path CI gate. Falling back to byte comparison would change
gate behavior and create false failures.

The utility now imports `@typescript/typescript6` explicitly. No build or typecheck command
uses its `tsc6` binary. The compatibility package is pinned at 6.0.2; its locked internal
`@typescript/old` dependency currently resolves TypeScript 6.0.3. The parser/printer was
exercised directly after installation. Remove this sidecar when the utility moves to a future
TypeScript 7 API or an API-independent parser, after equivalent canonicalization coverage exists.

### Explicit TypeScript 7 semantics

The root config retains strict mode, ES2022 target, ESNext modules, bundler resolution,
isolated modules, exact optional properties, unchecked indexed access, and existing
`skipLibCheck`. It now makes these TypeScript 7 defaults explicit:

- `noUncheckedSideEffectImports: true`
- `types: []` at the shared base, with Node globals opted in only by projects that use them

No check is disabled and no deprecation is hidden. `rootDir` remains explicit for shared and
emitting projects. Next applications do not emit through `tsc`, so their project-root default
is intentional. The standalone synthetic config now mirrors the repository's strictness flags.

### Next.js uses the native CLI

All three Next configs set `experimental.useTypeScriptCli: true`, an installed and typed
Next 16.3.5 option. `next build` now runs project-local native `tsc` instead of loading the
removed JavaScript Compiler API. Existing `withSentryConfig` and `withPayload` wrappers remain.
Successful TS7 builds prove the API-only path was not used because that path rejects 7.0.

### Upstream parallelism remains adaptive

TypeScript 7 defaults to four checker workers per compiler invocation. Turborepo may run
several workspace compilers concurrently, so hard-coding more workers could oversubscribe CI
and developer laptops. The upstream default remains. Measured aggregate wall time, CPU time,
and peak memory all improved without tuning, so a repository-specific checker count would add
complexity without evidence of a better cross-machine result.

### Every leaf config is checked

Normal workspace type checking previously omitted:

- `packages/db/tsconfig.drift-check.json`
- `tests/synthetic/tsconfig.json`

`bun run typecheck` now runs ten workspace checks and both specialist configs. This exposed
one latent unsound predicate in a drift property test: `value is string` widened a
`'a' | 'b' | 'c' | null` source. It now narrows null soundly with
`Exclude<typeof value, null>`. No suppression or production behavior change was needed.

CI path filters now treat root `tsconfig.json` changes as affecting web, admin, CMS, and
invoicing, so a compiler-config-only pull request cannot skip application builds.

## Reproducible benchmarks

Harnesses:

- `scripts/benchmarks/typescript-performance.ps1`
- `scripts/benchmarks/compare-typescript-performance.ps1`

Raw and derived reports:

- `knowledge-base/benchmarks/typescript-7/before.windows-x64.json`
- `knowledge-base/benchmarks/typescript-7/after.windows-x64.json`
- `knowledge-base/benchmarks/typescript-7/before-build.windows-x64.json`
- `knowledge-base/benchmarks/typescript-7/after-build.windows-x64.json`
- `knowledge-base/benchmarks/typescript-7/comparison.windows-x64.json`

Host: Windows 11, Intel i5-8300H, 8 logical processors, 15.81 GB RAM, Bun 1.4.2,
Node 24.21.0, and Turborepo 2.11.2 on both sides. Baseline and migrated inputs were
separate clean worktrees at the commits above. Each report records its Git tree plus SHA-256
hashes for `bun.lock`, `package.json`, and `tsconfig.json`. Typechecks disable incremental
state and bypass Turbo cache. Builds begin from a clean worktree and delete each application's
generated output before measurement; their final tree is dirty only because Next rewrites
`next-env.d.ts` to production paths.

The harness samples the complete process tree every 100 ms. Typecheck figures are medians of
three runs. Build figures are one cold run and therefore directional. The workspace aggregate
runs the same ten Turborepo workspace tasks on both revisions; the two newly gated specialist
configs are validated separately and deliberately excluded from the performance workload.

Reproduce with two clean checkouts or worktrees:

```powershell
git worktree add --detach <before-worktree> e499ca03db833913d620084735cfb1e128b7568b
git worktree add --detach <after-worktree> ed6876c3d55c58474321ad4b0e67bcc448524e04
bun --cwd <before-worktree> install --frozen-lockfile
bun --cwd <after-worktree> install --frozen-lockfile
& .\scripts\benchmarks\typescript-performance.ps1 -Label before -Suite typecheck -TypecheckIterations 3 -RepositoryRoot <before-worktree> -RequireClean
& .\scripts\benchmarks\typescript-performance.ps1 -Label before -Suite build -BuildIterations 1 -RepositoryRoot <before-worktree> -RequireClean -OutputPath knowledge-base\benchmarks\typescript-7\before-build.windows-x64.json
& .\scripts\benchmarks\typescript-performance.ps1 -Label after -Suite typecheck -TypecheckIterations 3 -RepositoryRoot <after-worktree> -RequireClean
& .\scripts\benchmarks\typescript-performance.ps1 -Label after -Suite build -BuildIterations 1 -RepositoryRoot <after-worktree> -RequireClean -OutputPath knowledge-base\benchmarks\typescript-7\after-build.windows-x64.json
& .\scripts\benchmarks\compare-typescript-performance.ps1
```

Restore each worktree's generated `next-env.d.ts` files before running its build suite if that
worktree previously built Next. `-RequireClean` rejects unidentified benchmark inputs.

### Typecheck results

| Scenario | TS 5.9.3 | TS 7.0.2 | Speedup | Wall change | CPU change | Peak RSS change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Workspace aggregate | 83.334 s | 28.935 s | **2.88x** | **-65.28%** | **-61.27%** | **-8.71%** |
| Web | 51.947 s | 13.236 s | **3.92x** | **-74.52%** | -48.39% | +10.12% |
| Admin | 57.678 s | 17.382 s | **3.32x** | **-69.86%** | -43.06% | +23.32% |
| CMS | 29.837 s | 7.267 s | **4.11x** | **-75.64%** | -55.21% | -8.62% |
| Invoicing | 11.283 s | 2.874 s | **3.93x** | **-74.53%** | -69.76% | -33.87% |

Isolated web/admin process-tree RSS includes multiple native workers and rose despite strong
wall/CPU reductions. Compiler-reported memory fell 6.32% for web, 0.44% for admin, 19.75%
for CMS, and 41.32% for invoicing. The real ten-workspace aggregate reduced peak RSS 8.71%
and total CPU work 61.27%.

### Cold application builds

| Scenario | TS 5.9.3 | TS 7.0.2 | Speedup | Wall change | CPU change | Peak RSS change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Web | 136.183 s | 99.503 s | 1.37x | -26.93% | -13.46% | +0.58% |
| Admin | 135.293 s | 122.114 s | 1.11x | -9.74% | -4.17% | -1.13% |
| CMS | 116.694 s | 121.497 s | 0.96x | +4.12% | +2.47% | +2.58% |
| Invoicing | 3.372 s | 2.601 s | 1.30x | -22.86% | -19.80% | -4.97% |

Next build results include bundling, route generation, and framework work, so the native
checker is only part of each measurement. Web and admin improved; CMS stayed effectively
flat within a one-run directional benchmark. The invoicing bundle uses tsup/esbuild rather
than `tsc`, so its change is not attributable to TypeScript 7.

## Validation record

Completed on 28 September 2026:

| Gate | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Pass; no lock changes. |
| `bunx tsc --version` | `Version 7.0.2`. |
| `bun run lint` | Pass across all linted workspaces. |
| `bun run typecheck` | Pass: ten workspaces plus drift and synthetic configs. |
| Static repository guards | Pass: auth dependencies, dependency overrides, changelog MDX, app cutover, admin tokens/paths, emoji policy, release versions, and MCP generation tests. |
| `bun run test:coverage` | Pass on exact rerun: 176/176 files and 1407/1407 tests. First run had one 5-second load timeout; focused rerun passed in 1.04 seconds. |
| Web production build | Pass with TypeScript 7 CLI mode. |
| Admin production build | Pass with TypeScript 7 CLI mode. |
| CMS `generate:types` | Pass; generated Payload types/import map unchanged. |
| CMS production build | Pass with TypeScript 7 CLI mode. |
| Invoicing `tsup` build | Pass. |
| Browser test discovery | Pass: web 6, admin 34, CMS 4 tests discovered. |
| `bun audit` | Pass: no vulnerabilities across 1373 packages. |
| Snyk SAST | No migration-diff finding. Two high findings are pre-existing false positives on the public `rgss_auth_context` session-storage key. |
| CI workflow | YAML parses; all four path filters include root `tsconfig.json`; admin static gates install the locked TS6 sidecar. `actionlint` was unavailable locally. |
| Benchmark scripts | Both PowerShell harnesses executed successfully and generated committed JSON. |

## Known limits

- Full web/admin/CMS browser tests were discovered but not executed. Admin requires session
  fixtures; CMS tests write catalogue data; web booking coverage may use configured services.
  Run them only against verified disposable test infrastructure.
- Live integration suites were not run. Repository guidance marks them opt-in because they
  create Neon branches or write through Payload.
- No SST deploy, Render deploy, Cloud Run deploy, database operation, seed, notification, or
  production smoke test was performed.
- `actionlint` was not installed. The modified workflow passed YAML parsing and focused path
  review; GitHub remains the authoritative expression/action-schema validator.
- Snyk Secrets was unavailable for the active organization. Snyk SCA refused the untrusted
  workspace, and repository policy forbids granting that trust autonomously; `bun audit` remained
  the blocking dependency gate.
- Build benchmarks use one cold run each. Treat those deltas as directional; compiler-only
  medians provide the reliable comparison.
- TypeScript 7.0 has no stable programmatic API. The TS6 sidecar remains required until the
  path-allowlist canonicalizer is migrated and equivalence is verified.

## Rollback runbook

Rollback is source-only and does not involve data:

1. Revert the migration commit on `dev` before promotion. If already promoted, revert the
   identical commit through the normal `dev → test → pprd → prod` flow; do not rewrite history.
2. Restore `typescript` to `5.9.3` in root and all ten workspace manifests, and regenerate
   `bun.lock` with Bun 1.4.2. Keep manifests and lockfile in one rollback commit.
3. Remove `@typescript/typescript6`; restore `scripts/admin-design/path-allowlist.mjs` to import
   `typescript` directly.
4. Remove `experimental.useTypeScriptCli` from web, admin, and CMS Next configs.
5. Restore pre-migration root/specialist compiler settings only when reverting the entire
   migration. Keeping broader tooling coverage is safe if it still passes under 5.9.3.
6. Delete generated `.next`, `dist`, Turbo cache, and `*.tsbuildinfo` artifacts. Run a frozen
   install, full typecheck, coverage suite, and all four production builds before promotion.

No schema, API contract, runtime data, environment variable, or infrastructure change is part
of this migration. No database or deployment rollback is required.

## Sources

- [Microsoft: Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [TypeScript 6.x to 7.0 migration guide](https://gist.github.com/nafiskabbo/01ccb4970515413076f3759486c39755)
- [Next.js TypeScript 7 compatibility discussion](https://github.com/vercel/next.js/discussions/95633)
- [Payload issue for TypeScript 6/7 side-effect import checking](https://github.com/payloadcms/payload/issues/16346)
- Installed Next 16.3.5 sources and typings under each app's `node_modules/next/dist/`

External source content was rephrased for compliance with licensing restrictions.
