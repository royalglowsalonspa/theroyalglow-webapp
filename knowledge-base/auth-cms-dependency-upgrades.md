# Better Auth and Payload dependency upgrades

This is the current upgrade procedure for the authentication and CMS packages.
Versions live in manifests and `bun.lock`; do not copy the versions below into
future upgrade checks. Updates must pass the installed-library contracts and
the applicable release-specific migration review before promotion.

## September 2026 correction

PR #239 updated Better Auth to 1.7.5 while the root override forced its internal
core to 1.7.3. Both Next.js builds and the schema-test import failed because
`createWithSpan` was absent from the old core. The override was the cause; the
provider/account identity schema was already corrected by migration 0003.

The core override is removed. Better Auth now selects its own exact internal
packages. The global Zod override is also removed: it forced 4.5.2 below Better
Auth's requested range and over Payload MCP's supported 3.x dependency. Each
consumer now receives its declared compatible version, with the lockfile and
strict audit retaining reproducibility and security checks.

Payload and its six direct companion packages move together to 3.90.1. Its
3.90.0 security changes add `resetPasswordRequestedAt` to password-enabled auth
collections. The forward CMS migration adds that nullable timestamp to
`cms.users` and the storage plugin's new nullable `_objectkey` column to
`cms.media`; generated types and the migration snapshot accompany both changes.
Existing media prefixes and stored files are preserved.

The old Payload 3.88.0 advisory exception and custom audit wrapper are deleted.
CI runs plain `bun audit`; findings and audit errors fail the job. The explicit
`Users.access.unlock: () => false` remains application policy. The new upstream
default permits members of the admin auth collection to unlock accounts, which
is broader than this project's policy. Password reset and trusted recovery are
separate operations; retaining the denial does not suppress an audit finding.

## Better Auth review

1. Update both web and admin together, including `@better-auth/infra`. Dependabot
   groups the family separately from unrelated production updates. Infra has its
   own version series; its version need not equal the core library's version.
2. Keep direct auth versions exact and identical across the two apps. Do not
   force internal core/adapters through root overrides. Check the actual
   consumer-relative dependency graph with `bun run check:auth-dependencies`.
3. Read the current changelog and relevant upgrade guide. The schema contract
   uses each app's actual schema-affecting options and installed library metadata,
   then checks Drizzle columns and the current committed snapshot. A changed
   plugin set must be reviewed as a potential schema change.
4. Generate and review forward Drizzle migrations when the contract changes;
   preserve applied history. Do not generate migrations directly against a live
   shared database merely to make a dependency PR pass.
5. Verify OAuth callback/session behavior and both application builds. Retain
   server-controlled roles, shared cookie settings, explicit origins, and lazy
   database construction. A green build does not verify the real Google redirect.

The 1.7 guide's applicable login-client changes were reviewed for Google OAuth
and One Tap. Account identity stays `(providerId, accountId)`; the old issuer
column remains nullable legacy storage. Google supplies the One Tap client ID.
The apps use a fixed base URL and the official Drizzle adapter; they do not run
an OAuth authorization server, Better Auth MCP server, SCIM, SAML, Expo, Electron,
device authorization, anonymous linking, or two-factor/passwordless plugins.
Those optional guides do not justify installing new plugins or adding their tables.
See [the 1.7.3 cleanup record](better-auth-1.7.3-cleanup.md) for the earlier DDL.

## Payload review

1. Update all direct `payload` and `@payloadcms/*` packages to the same exact
   version. Read minor-release notes too: security releases may require DDL.
2. Generate types and migrations with the existing CMS tools and inert local
   configuration. The storage plugin uses `alwaysInsertFields: true` so its
   database shape stays the same when R2 credentials are absent. Disabling
   storage must not remove the fields required by production.
3. Review generated SQL, snapshot, and migration index together. For this update
   the intended changes are the nullable password-reset timestamp and storage
   object key; existing media, catalogue, and user records must remain intact.
4. Check collection access, account recovery, MCP capabilities, storage uploads,
   and custom editor integrations. Keep MCP read-only and the auth collection
   excluded. The current editor uses built-in Lexical features and server-side
   S3 uploads; the custom-editor and client-upload changes do not apply.
5. Run the CMS contract/access tests and production build. The CMS compatibility
   checks run in normal unit CI, and `cms-ci` compiles the production bundle.

## Validation and rollout

From the repository root:

```sh
bun install --frozen-lockfile
bun run check:auth-dependencies
bun audit
bun run lint
bun run typecheck
bun run test:coverage
bun run --filter=@rgss/web build
bun run --filter=@rgss/admin build
bun run --filter=@rgss/cms build
```

Use the existing build-time placeholders for CI; never copy live credentials into
tests. Live integration suites are separate and require disposable infrastructure.

Commit the migration before applying it. For each environment, apply the CMS
migration through the CMS migration workflow using its direct database connection
before serving the new CMS runtime; Render also runs migrations before startup.
Verify the migration ledger and the actual login/reset/editor flows. Promote the
same validated commit through `dev → test → pprd → prod` using the existing
promotion workflow. Source changes and passing CI do not establish live rollout.

Dependabot lockfile sync using `GITHUB_TOKEN` can leave the updated commit's
workflows awaiting maintainer approval. Review and approve those runs; rerunning
an older commit does not validate the new one. The optional scoped
`LOCKFILE_SYNC_TOKEN` supports automatic triggering; do not weaken approval or
required-check policies to bypass a pending run.

These checks catch dependency, schema, and integration regressions early. They
cannot automatically adapt application semantics to every future breaking change;
each upstream upgrade still needs review of the applicable guide.

Sources: [Better Auth changelog](https://better-auth.com/changelog),
[Better Auth 1.7 guide](https://better-auth.com/docs/guides/1-7-upgrade-guide),
[Payload 3.90.0](https://github.com/payloadcms/payload/releases/tag/v3.90.0),
[Payload 3.90.1](https://github.com/payloadcms/payload/releases/tag/v3.90.1),
[GitHub pull request triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request).
