# Branch promotions and CI recovery

## Current branch policy

Feature and dependency work enters `dev` through a pull request. Mergify manages
those PRs. The `test`, `pprd`, and `prod` branches receive the exact same commits
through `.github/workflows/promote.yml`; environment promotion PRs are not used.
Fast-forward promotion preserves commit SHAs, messages, and ancestry. Branches may
temporarily point to different releases while validation is in progress.

Run **Promote validated commit** in GitHub Actions, select the **dev** branch and
the final target (`test`, `pprd`, or `prod`). The workflow captures `github.sha`,
runs full CI and CodeQL, runs integration checks, advances `test`, runs load and
security checks, advances `pprd`, and requires explicit `approve_production` confirmation from `katbose` at dispatch before advancing `prod`. Earlier targets stop sooner.

Every update verifies the immediately preceding branch still points at the tested
SHA and the destination is its ancestor. Divergence fails; there is no force push,
merge commit, reset, or rebase. If the source moves, start a new validation run.
Concurrent promotion runs are serialized and do not cancel an active release.

Workflow pushes use `GITHUB_TOKEN`, so GitHub does not trigger push workflows.
The production job explicitly dispatches Deploy AWS with the exact validated SHA
and dispatches Release Please. Branch advancement and successful deployment are
separate results; inspect the deployment run before claiming the release is live.
External branch-connected services must also be checked after promotion.

Release Please opens version/changelog PRs against `dev`. Publication runs after
promotion on `prod`, and only while both refs match the run SHA. No release commit
is created directly on `prod`. This avoids a reverse-sync merge and preserves the
fast-forward invariant.

## Validation prerequisites

Production approval is currently an explicit dispatch checkbox restricted to `katbose`.
GitHub rejected environment-reviewer configuration with HTTP 403 because the
current login lacks repository admin rights. An administrator can add an
environment reviewer gate later; no such gate is claimed to be active.
Importable environment rulesets are under `.github/rulesets`; their stable CI,
CodeQL, integration, and load/security checks must exist before activation.
Environment rulesets forbid deletion and non-fast-forward updates, and do not
require promotion PRs. The `dev` PR policy remains separate.

Integration and Playwright need `DATABASE_URL_TEST`; live load and ZAP checks need
`PPRD_URL`. As of the 2026-09-09 audit those secrets were absent, so these jobs
explicitly skip. An aggregate success with a preflight skip is not evidence of
live integration or load validation. Database migration workflows remain separate.

## CI root causes reviewed on 2026-09-09

| PRs | Finding | Resolution |
| --- | --- | --- |
| #216, #218–#223 | Separate Vitest runner/provider upgrades mixed versions 4 and 5 across workspaces. Failures included missing snapshot state, `coverageFilesDirectory is required`, and coverage payload type mismatches. | Integrate the coupled upgrades together; pin runner and coverage provider to 5.0.0 and group future Vitest updates across workspaces. |
| #216, #220 | Vitest 5 no longer inherits `jest.Matchers`; `toHaveNoViolations` became a TypeScript error. | Declare the matcher using `vitest.Matchers`, keeping the existing runtime accessibility assertions. |
| #214 | Sentry 10.73.0 imports a bundler plugin that calls `fileURLToPath` on a non-file URL during test collection. | Retain Sentry 10.70.0, exclude the demonstrated broken release, and keep the other compatible updates. |
| #215, #217, #219, #221 | Their reviewed checks had no independent implementation failure beyond the dependency audit. | Validate the updates in the combined dependency tree, including the Checkly major upgrade. |
| #224 and current dev | Audit included baseline-browser-mapping and two joi advisories as well as Payload. | Regenerate the lockfile and upgrade joi to 18.2.5. Only the approved Payload finding remains. |

The original PR branch commits are retained in the integration history. Their
initial red checks are historical evidence; validation of the final combined tree
is required before it enters `dev` and is promoted.

## Narrow Payload exception

The sole maintainer explicitly accepted GHSA-jg8r-5jh2-v2xj on `payload@3.88.0`
on 2026-09-09. `Users.access.unlock` explicitly restricts unlock access and its
regression tests run in the normal suite. GitHub's advisory listed no patched
version at the time of review.

`scripts/ci/audit.ts` accepts only this package, exact installed version, advisory
URL, and vulnerable range. It prints the finding as a warning and fails on other
advisories, malformed reports, or audit execution errors. This is an accepted
exception, not a clean upstream audit. Remove it when adopting a patched release.

References: [Vitest 5 migration](https://main.vitest.dev/guide/migration/),
[Payload advisory](https://github.com/advisories/GHSA-jg8r-5jh2-v2xj),
[GitHub workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
