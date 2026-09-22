# Claude Code: customer web app

@AGENTS.md

This is the Claude Code entry point for `apps/web`. The import above loads this
app's instructions; the root `CLAUDE.md` supplies shared repository guidance.
Keep behavioral rules in `AGENTS.md` so agents follow one maintained contract.

## Start a web task

- Read [README.md](README.md) for setup, feature boundaries, integrations, and
  troubleshooting. Check the relevant route, component, and tests before editing.
- Use the root-relative commands in `AGENTS.md`. Select the `web` Vitest project
  for isolated tests; browser tests and live integrations have different setup.
- Keep customer journeys here. Staff operations, signed jobs, content authoring,
  and PDF rendering belong to their respective apps.

## Read context for the change

| Work area | Starting references |
| --- | --- |
| Sign-in and onboarding | [Auth configuration](src/lib/auth-server.ts), [onboarding guards](src/lib/onboarding-guard.ts), [authentication guide](../../knowledge-base/authentication.md) |
| Booking and pricing | [Booking handler](src/app/api/bookings/route.ts), [booking dialog guide](../../knowledge-base/pages/booking-dialog.md) |
| Content and service catalogue | [CMS readers](src/lib/cms/client.ts), [catalogue ownership](../../knowledge-base/service-catalogue-management.md) |
| Rendering and discoverability | [Root layout](src/app/layout.tsx), [SEO guide](../../knowledge-base/seo.md) |

Load only the references relevant to the task. Current source and configuration
take precedence over historical descriptions in the knowledge base.

## Finish the change

Check session/ownership boundaries, server-calculated booking values, and the
affected CMS or shared-package contract. Report the behavior changed, checks
actually run, and any remaining limits. Keep README feature boundaries current;
rendered fallback content or an HTTP 200 alone does not prove an integration works.
