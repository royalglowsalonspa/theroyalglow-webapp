# Claude Code development guide

@AGENTS.md

## Instruction loading

The import above loads the repository's maintained development instructions.
Claude Code also discovers each app's `CLAUDE.md` when working in that directory;
those files import the app-specific rules. Before editing across app boundaries,
read the affected apps' instructions explicitly rather than assuming every nested
file is already in context.

Keep shared rules in `AGENTS.md`. This file provides Claude's entrypoint and task
orientation without maintaining a second copy of the same development policy.

## Find the right application

| Work | Entry point |
| --- | --- |
| Customer pages, booking UX, customer APIs | [Web guide](apps/web/CLAUDE.md) |
| Operations, staff access, administrative APIs, jobs | [Admin guide](apps/admin/CLAUDE.md) |
| Content, media, service authoring, Payload schema | [CMS guide](apps/cms/CLAUDE.md) |
| Invoice PDF requests, rendering, object storage | [Invoicing guide](apps/invoicing/CLAUDE.md) |

For shared behavior, trace the caller into `packages/types`, `packages/business`,
and `packages/db` before choosing where to edit. Use the commands and validation
boundaries in the imported guide; a documentation task does not need a live service.

## References and handoff

Use [README.md](README.md) for contributor setup and
[knowledge-base/INDEX.md](knowledge-base/INDEX.md) to select task-specific references.
Read only relevant long-form guides rather than importing the entire knowledge base.
When handing work back, state the change, checks actually run, remaining limits,
and whether anything was committed or deployed. Keep credentials and live customer
data out of instructions, examples, and remembered project notes.
