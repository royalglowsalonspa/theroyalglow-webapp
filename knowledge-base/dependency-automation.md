# Dependency automation

Renovate proposes dependency changes against `dev`. Its repository configuration
is [`.github/renovate.json`](../.github/renovate.json); CI validates this policy as
well as the installed packages. Dependency proposals still need review, passing
checks and the normal [promotion workflow](branch-promotions.md).

## Routine updates and major migrations

Routine updates have two batches:

| Batch | Coverage |
| --- | --- |
| Platform dependencies | Bun/npm libraries across the root, every app and shared package, including production and development dependencies |
| Tooling and infrastructure | GitHub Actions, the active invoicing Dockerfile's base images, and Bun runtime version declarations |

Routine scan requests are scheduled for **Monday, Wednesday and Friday at
00:00 UTC** (05:30 IST) by
[`.github/workflows/renovate-schedule.yml`](../.github/workflows/renovate-schedule.yml).
The workflow asks the existing Mend GitHub App to run using the generated
Dependency updates dashboard's manual-run checkbox. It uses the repository's
short-lived `GITHUB_TOKEN` with issue-edit permission; no second Renovate runner
or additional bot credential is needed. The request changes only that checkbox,
retaining dependency approvals and rebase selections. A pending request is
idempotent. The workflow waits up to 15 minutes for the same dashboard's flag
to clear with Renovate recorded as its editor; missing acknowledgement or API
errors fail visibly. Acknowledgement proves the request was consumed. Check the
Mend job results for scan completion and dependency-update failures.

GitHub and Mend can queue the request and scan, so the cron expresses the intended
request time rather than a guarantee that a scan starts at the exact second.
Renovate's repository-level `schedule` does not trigger jobs. Its UTC eligibility
window covers the full Monday, Wednesday and Friday to accommodate queued jobs
and hosted background scans; routine branches are not updated outside those
days. A one-hour midnight window could miss an otherwise valid queued request.
See [hosted job scheduling](https://docs.renovatebot.com/mend-hosted/job-scheduling/)
and [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Releases, including the Bun runtime, wait three days plus Renovate's default
30-minute buffer before eligibility. Renovate requires release timestamps for
its proposed updates; updates without them remain pending in the dashboard for
investigation. At most two ordinary Renovate PRs may be open at once; an approved
major uses this same budget. Separate recurring lockfile-maintenance PRs are
disabled to avoid a third routine batch; dependency updates still regenerate the
committed shared `bun.lock`.

Root [`bunfig.toml`](../bunfig.toml) also enforces a three-day age gate during
new direct and transitive npm resolution. This is necessary because Bun can
resolve a newer version within an updated manifest range than the version
Renovate selected. Renovate's Bun manager currently lacks the single-file
re-extraction used by its secondary age check, so the hosted warning
`Could not re-extract the packageFile after updating it` does not enforce that
check. Do not suppress the warning or remove the native gate. CI checks the
committed Bun configuration and rejects exclusions or workspace overrides that
weaken it. The root explicitly clears globally inherited release-age exclusions.
See [Bun's minimum release age](https://bun.sh/docs/pm/cli/install#minimum-release-age).

The native gate affects new resolution; it does not downgrade existing locked
versions, and frozen installs remain reproducible. After enabling it, regenerate
any existing proposal that already resolved younger versions from the validated
base lockfile. Bun may delay rapidly changing releases longer than three days.
Bun accepts registry versions without publication timestamps, so the native gate
is not proof of timestamp coverage for every transitive package.

Every major remains visible in the **Dependency updates** dashboard and needs
maintainer approval there before Renovate creates its PR. Approval authorizes a
proposal, not a merge. Vitest, Payload/GraphQL, Next/React/types, Better Auth, Hono
and Tailwind majors stay in family groups across workspaces. Bun runtime majors
update every `packageManager` declaration in one migration group. Other majors are
reviewed independently. This replaces blanket major ignores, so newer versions
can be evaluated instead of disappearing from update coverage.

Read the upstream changelogs and peer contracts before approving a framework
migration. A GraphQL major requires a Payload-compatible schema/runtime migration;
a green application build alone is insufficient. Existing auth, CMS/GraphQL,
Vitest and override checks remain blocking, including actual installed-consumer
resolution and the database-free Payload schema regression. No update automerges.

The Bun manager discovers the root project and workspace manifests together.
The npm manager remains available for genuinely separate npm projects; Renovate
excludes manifests already owned by Bun unless another package-manager lockfile
is present. Do not add competing app-specific Bun scans or introduce mixed
lockfiles into this workspace. See [Renovate's Bun manager](https://docs.renovatebot.com/modules/manager/bun/).

## Security and special declarations

Security fixes have a separate budget of two open PRs. Renovate bypasses its
routine schedule, proposal-age delay and dashboard approval, but every fix still
requires review and every CI gate. The bot proposes the lowest fixed version to
limit unrelated upgrade scope. Bun's native age gate remains active during
artifact generation: a fix published less than three days ago can be blocked
until it ages. The hosted Bun manager has no automatic per-security-PR exemption.

For an urgent, reviewed fix, prepare only the necessary manifest/override changes
on the existing security proposal, then generate its lockfile once with
`bun install --lockfile-only --ignore-scripts --minimum-release-age 0`. This is a
manual generation step, never a CI or scheduled-bot flag. Review every changed
locked version against the advisory and upstream changelog, keep `bunfig.toml`
unchanged, and require a frozen install, the strict audit, compatibility checks
and normal CI before merging. The one-off command can affect transitive
resolutions too; unexplained extra upgrades must not be merged.

Keep GitHub's dependency graph and Dependabot alerts enabled: Renovate consumes
those alerts, and `bun audit` remains the
blocking check for the complete installed dependency graph. Alerts without a
compatible fix require migration work; changing bots cannot make them pass.

Root `overrides` are part of the dependency contract. The MCP SDK, Undici and
Sass use `$...` references to maintained direct root dependencies. Native Bun
updates change those declarations and regenerate the shared lockfile. Preserve
the version-qualified `undici@...` and `sass@...` selector keys and the local
`file:packages/findup-sync` package. Do not replace maintained references with
stale numeric pins. A major upgrade to a security-anchor dependency also needs
review of the selector's affected consumers; dashboard approval does not prove
compatibility.

Renovate's normal extractor skips `package@range` keys as invalid npm package
names. A custom-regex-only change would not invoke Bun's artifact generation,
so it cannot guarantee the matching lockfile. The direct declarations and Bun
references avoid that failure rather than relying on another update being
present in the same PR.

The root `packageManager` is the expected Bun runtime. Every workspace repeats
that declaration because Renovate currently extracts runtime constraints per
manifest; a workspace-only update otherwise has no Bun version constraint.
CI requires every declaration to match the root, and native Bun updates keep
them grouped. Do not hardcode a separate Renovate `constraints.bun` pin that
would outlive an approved runtime upgrade.
Review any runtime PR with its lockfile generation and CI results. Render's
`BUN_VERSION` values, unversioned container tags and dependency manifests generated
inside Dockerfile heredocs still need deliberate maintenance; this configuration
does not claim to synchronize them automatically.

## Activation and cutover

1. Merge the validated configuration and policy guard into `dev`, then promote
   that exact commit through `test`, `pprd` and `prod`. GitHub's default branch is
   `prod`, so the configuration must reach it before activating the hosted app.
2. The repository owner installs or grants the
   [Mend Renovate GitHub App](https://github.com/apps/renovate) access to this
   repository. Confirm its permission to read Dependabot alerts. Installation is
   an account-level action; committed configuration alone does not activate it.
3. Keep **Dependency graph** and **Dependabot alerts** enabled. Disable
   **Dependabot security updates** in repository settings; removing
   `.github/dependabot.yml` stops its scheduled version PRs. Do not run both bots'
   version or security PR automation for the same dependencies.
4. Inspect the first Renovate dashboard/extraction result. Confirm proposals
   target `dev`, cover all workspaces, maintain one shared lockfile, retain the
   special override forms and leave majors awaiting approval. Close superseded
   Dependabot PRs after their changes are represented; do not silently merge a
   failed or unsupported upgrade during cutover.

Validate changes to the policy with `bun run check:dependency-policy` and the
focused policy tests. The `renovate-config` CI job also runs the official
`renovate-config-validator --strict --no-global .github/renovate.json` against
every proposed configuration. Its versioned container is maintained in the
tooling batch; validation needs no bot token. The local guard verifies this
repository's maintenance contract; upstream validation verifies the bot schema.
Renovate evaluates every matching package rule in order, with later values taking
precedence, so keep family and active-Docker exceptions after broader rules.
See [configuration options](https://docs.renovatebot.com/configuration-options/)
and [GitHub app onboarding](https://docs.renovatebot.com/getting-started/installing-onboarding/).

## Retained history and release notes

Squash is the default for a new independent PR. When preserving its existing
commits is explicitly required, merge it once into `dev` with a structural
`chore(merge): merge PR #<number>` subject and a plain or empty body. Do not repeat
the PR's Conventional Commit title in that body: Release Please parses it as
another release entry. Source fix/feature commits retain the release meaning.
Promote the resulting commit unchanged; do not rewrite released history or tags
to remove repeated subjects or structural merge records.
