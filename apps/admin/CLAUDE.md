# Claude Code: admin app

The root `CLAUDE.md` supplies repository-wide context. Import the scoped admin
instructions below so Claude and other agents use the same maintained rules.

@AGENTS.md

## Working context

This folder owns the salon operations application, administrative APIs, and
background jobs. Its URLs are rooted at the admin origin; the Payload CMS admin
interface is a separate application. Shared sign-in does not replace route-level
authorization or customer/staff ownership checks.

## Start with the changed behavior

- Page or navigation behavior: inspect `src/app`, `src/lib/rbac.ts`, and the shell.
- Protected API: inspect `src/lib/api/session.ts` and the neighboring handler.
- Background work: inspect the route and `src/lib/jobs` before invoking a job.
- Presentation: inspect shared brand tokens and the admin semantic mappings.

Read [README.md](README.md) for local setup, the role/route map, jobs,
configuration, and deployment. For implementation work, start at the relevant
page/handler and trace its shared package dependencies before changing behavior.

## Validation and reporting

Use the focused checks in the imported guide. Distinguish unit tests from role
fixtures, live provider checks, and jobs that can modify records or send messages.
Describe both the server permission boundary and user-visible result in the final
handoff. Maintain common rules in `AGENTS.md` so both agent entrypoints stay aligned.
