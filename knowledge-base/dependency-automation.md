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

New routine updates are scheduled on Mondays from 08:00 to 11:00 IST. Releases
wait three days, plus Renovate's default 30-minute buffer, before eligibility.
Release timestamps are required; updates without them remain pending in the
dashboard for investigation. At most two ordinary Renovate PRs may be open at once; an approved major uses this same budget. Existing proposals may be
refreshed outside the weekly creation window when necessary. Separate recurring
lockfile-maintenance PRs are disabled to avoid a third routine batch; dependency
updates still regenerate the committed shared `bun.lock`.

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

Security fixes have a separate budget of two open PRs. They
bypass the routine schedule, release-age delay and dashboard approval, but still
require review and every CI gate. The bot proposes the lowest fixed version to
limit unrelated upgrade scope. Keep GitHub's dependency graph and Dependabot
alerts enabled: Renovate consumes those alerts, and `bun audit` remains the
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
