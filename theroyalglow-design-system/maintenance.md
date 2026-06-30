# Maintenance

> **TL;DR:** Day-to-day lifecycle and operational procedures. Covers pre-maintenance checklist, content update workflow, changelog management, version management, validation checks, and common maintenance tasks. Build system is in `build.md`. Error recovery is in `error-recovery.md`. Always apply optimization patterns before any maintenance task.

## Purpose

Define lifecycle and operational procedures for this design system skill project.

---

## Pre-Maintenance Checklist

**CRITICAL:** Before starting any maintenance workflow, ensure content follows optimization patterns from `optimization.md`.

Required actions before any maintenance:
- [ ] Review `optimization.md` for applicable patterns
- [ ] Apply high-impact patterns to all content being modified
- [ ] Apply medium-impact patterns to procedural content
- [ ] Verify optimization compliance before proceeding

---

## Agent Instructions: Apply Optimization During Content Work

**REQUIRED:** When creating or editing any content file, apply optimization patterns inline.

### On Every File Create or Edit

1. Check word count. If >2,000 words → add TL;DR
2. Verify all section headers are action-oriented or task-named
3. Ensure each H2/H3 section is self-contained and screen-sized
4. Use numbered lists for procedures, bullet lists for non-sequential items
5. Add language tags to all fenced code blocks
6. Apply conciseness challenge
7. Front-load important information in each section

### On Procedural Content

8. Add instruction/reference delimiter (`---`) if file mixes instructions and reference
9. Add stop conditions early in the file
10. Use commitment language (CRITICAL, REQUIRED, STOP) for must-not-skip steps

---

## File Management Rules

- All files must be Markdown (.md)
- Consistent heading structure across all files
- No speculative content — only verified information

## File Lifecycle Rules

- New files follow the project structure defined in `index.md`
- Skill content goes in `/src`, operational content at root
- Build outputs go to `/dist/kiro`
- `changes.md` must be updated for every structural change
- All changes must be logged in `changes.md`

## Changelog Management

See `workflows.md` → Workflow 6 (`changelog-integrity`) for the full changelog compression procedure and formats.

---

## Validation Checks

See `workflows.md` → Trigger Summary for which workflows to run after changes.

## Dependency Update Procedures

- shadCN component library availability must be verified on fresh sessions
- Tailwind availability must be verified before builds
- If either is unavailable → STOP and alert user

---

## Version Management

### Semantic Versioning Guide

- **Major (x.0.0):** Breaking changes, major restructuring
- **Minor (1.x.0):** New content, significant additions, new files
- **Patch (1.0.x):** Fixes, clarifications, minor updates

### Version Update Steps

1. Determine appropriate version number
2. Update `changes.md` with version entry
3. Verify version is consistent across all references
4. Commit changes

---

## Content Update Workflow

### Before Making Changes
- [ ] Identify which files need updates
- [ ] Check current version number

### Making Changes
- [ ] Make changes in appropriate location (`/src` for skill, root for operational)
- [ ] Apply optimization patterns from `optimization.md`
- [ ] Update cross-references to other documents
- [ ] Verify markdown formatting is correct

### Post-Change
- [ ] Run the post-change sequence (`post-change-sequence`) from `workflows.md` — covers all validation, changelog, TODO audit, and README checks
- [ ] Commit and push

---

## Common Maintenance Tasks

| Task | Version Change | Key Steps |
|------|---------------|-----------|
| Add component file | Minor | Create in `/src/design-system/components/` → update `design-system.md` |
| Update theme variables | Minor | Update theme file → update `changes.md` |
| Add glossary terms | Patch | Update `glossary.md` → verify consistency |
| Fix typo/clarification | Patch | Edit file → update `changes.md` |
| Update operational file | Patch | Edit root file → verify structure |

---

## Build & Release

Build system and Kiro Power formatting rules are documented in `build.md`.

---

## Error Recovery

All error recovery procedures are documented in `error-recovery.md`.

---

## Project Status Tracking

- `project-status.md` should be updated after each set of changes
- Commit after each update cycle
