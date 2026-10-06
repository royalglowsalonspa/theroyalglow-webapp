# Maintained ancestor file finder

`@rgss/findup-sync` replaces the transitive `findup-sync@4` dependency of
Payload's `find-node-modules` package through a version-scoped root override.
It is an owned CommonJS implementation with its own package identity.

The implementation is adapted from [findup-sync 4.0.0](https://github.com/gulpjs/findup-sync/blob/v4.0.0/index.js).
That implementation's `micromatch.matcher` already delegates directly to
Picomatch. This package calls maintained Picomatch 4 directly, removing the
unused recursive brace compiler and expander brought in by Micromatch. It
also walks ancestor directories iteratively. The original MIT attribution
is retained in [LICENSE](LICENSE).

The callable API accepts a string or array of patterns and an options object.
It checks each ancestor in order, then each pattern in order. Literal paths
retain `detect-file` behavior (including `nocase`); glob patterns retain
basename/full-path matching and directory-entry ordering. The `cwd` option
retains `resolve-dir` tilde/global-module expansion. Other matcher options
are passed to Picomatch. Missing and unreadable directories are skipped.

The upstream Payload storage package currently declares the finder without
importing it. This implementation still preserves the finder functionality
for consumers. Tests exercise filesystem behavior, the original installed
`find-node-modules` consumer, and hostile nested patterns.

Run `bunx vitest run --project findup-sync` from the repository root.
`bun run --filter=@rgss/findup-sync typecheck` checks the CommonJS source,
declarations, and tests under the repository's strict TypeScript settings.
The platform release process owns this package's version alongside the other
workspaces. Keep the override and tests reviewed when changing it.
