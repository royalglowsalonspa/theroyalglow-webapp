# Workflows

> **TL;DR:** Deterministic validation workflows with check IDs, triggers, pass/fail criteria, and remediation. Primary enforcement: post-change-sequence. Safety net: pre-commit-gate. Build: build-power. Sync: manual-sync. Optimization: optimization-audit.

---

## Tactical Execution Rules

### 1. Scope-Gate Every Check
Each check has implicit scope conditions. Evaluate scope before running.

### 2. Fail-Fast Ordering
Within each workflow, checks are ordered cheapest-first.

### 3. Batch-Read Changed Files Once
At the start of the post-change sequence, read all changed files in a single batch.

---

## Workflow 1: Content Quality (`content-quality`)

Trigger: On every `/src` file create or edit

| Check ID | Description | Pass Criteria | Remediation |
|----------|-------------|---------------|-------------|
| CQ-01 | TL;DR present | Files >2,000 words have TL;DR | Add TL;DR section |
| CQ-03 | Fenced code blocks balanced | Every opening has closing; language tags present | Fix code blocks |
| CQ-02 | Action-oriented headers | All H2/H3 start with verbs or are task-named | Rename headers |
| CQ-04 | Procedures use numbered lists | Step-by-step instructions use 1. 2. 3. format | Convert to numbered lists |
| CQ-05 | Semantic chunking | Each H2/H3 is self-contained and screen-sized | Split oversized sections |
| CQ-08 | Conciseness | No filler words; shorter words preferred | Apply conciseness challenge |

## Workflow 2: Project Structure (`project-structure`)

Trigger: On every root file create or edit

| Check ID | Description | Pass Criteria | Remediation |
|----------|-------------|---------------|-------------|
| PS-04 | File naming conventions | Lowercase, hyphen-separated `.md` files | Rename files |
| PS-03 | Content separation enforced | No skill content in root files; no operational content in `/src` | Move misplaced content |
| PS-05 | Fenced code blocks | Every opening code fence has a language tag. Exempt: nested code examples in `optimization.md` | Add language tags |

## Workflow 3: Component Integrity (`component-integrity`)

Trigger: On every `/src/design-system/components/*.md` file create or edit

| Check ID | Description | Pass Criteria | Remediation |
|----------|-------------|---------------|-------------|
| CI-01 | No hardcoded colors | No hex, rgb, rgba, hsl, oklch values in component prose | Move to theme file |
| CI-02 | No global content duplication | No WCAG ref, theme boilerplate in individual files | Remove; reference `design-system.md` |
| CI-03 | Component Index current | `design-system.md` index includes row for every component file | Add missing rows |

## Workflow 4: Theme Integrity (`theme-integrity`)

Trigger: On every `/src/themes/*.md` file edit

| Check ID | Description | Pass Criteria | Remediation |
|----------|-------------|---------------|-------------|
| TI-02 | Variable completeness | Every CSS variable has both light and dark values | Populate or add TODO |
| TI-03 | shadCN variable alignment | Variable keys match official shadCN CSS variable names | Correct from `ui.shadcn.com` |

## Workflow 5: TODO System Integrity (`todo-integrity`)

Trigger: On every commit

| Check ID | Description | Pass Criteria | Remediation |
|----------|-------------|---------------|-------------|
| TD-03 | Classification | Every entry has description | Add description |
| TD-04 | No stale resolved entries | No resolved entries remain | Remove resolved entries |
| TD-02 | TODO auto-removal | Overwritten TODOs have corresponding entry removed/updated | Update `todos.md` |

**TD-02 Auto-Removal Procedure:** When a section that previously contained a TODO is overwritten with content:
1. If the new content contains no TODO → remove the corresponding entry from `todos.md`
2. If the new content contains a different TODO → replace the entry in `todos.md`
3. If the section is partially filled but still has gaps → update the `todos.md` entry

This rule applies on every file edit.

| TD-01 | No partial sections | Every section fully populated or has TODO marker | Complete or mark TODO |

## Workflow 6: Changelog Integrity (`changelog-integrity`)

Trigger: On every commit

| Check ID | Description | Pass Criteria | Remediation |
|----------|-------------|---------------|-------------|
| CL-01 | Entry exists for changes | Every commit has entry with date, type, description | Add missing entry |

### Changelog Compression Procedure

**When to run:** When `changes.md` exceeds ~200 lines, or when explicitly requested.

**Format:**

| Tier | Time Threshold | Format | Minimum |
|------|---------------|--------|---------|
| Full detail | Same day | Standard entry (Change type, Description, Impact) | 5 entries |
| Compressed | Same week (not today) | `## YYYY-MM-DD — Title (Type)` one-liner | 5 entries |
| Pruned | Older than current week | `- YYYY-MM-DD — Title` list item | 5 entries |
| Removed | Older than one month | Deleted (git history only) | — |

**Procedure:**
1. List all entries in reverse chronological order
2. Apply time-based tier assignments
3. Enforce minimum floors (at least 5 per active tier, promote upward)
4. Rewrite `changes.md`: full detail → compressed → pruned
5. Add the compression itself as a changelog entry

## Workflow 7: Cross-Cutting Consistency (`cross-cutting-consistency`)

Trigger: Pre-release QA; on user request

| Check ID | Description | Pass Criteria | Remediation |
|----------|-------------|---------------|-------------|
| CC-01 | No broken internal links | All cross-references resolve | Fix broken links |
| CC-02 | Terminology consistency | Terms match `glossary.md` definitions | Align or create conflict TODO |

## Workflow 8: Build Validation (`build-validation`)

Trigger: On every build

| Check ID | Description | Pass Criteria | Remediation |
|----------|-------------|---------------|-------------|
| BV-01 | File count match | dist/kiro file count matches src file count | Add missing files |
| BV-02 | Source coverage | Every `/src` file has corresponding dist file | Add missing mappings |
| BV-03 | Content match | Markdown body matches source | Rebuild from source |
| BV-04 | Metadata valid | POWER.md frontmatter fields present and correct | Update metadata |


## Workflow 9: Post-Change Sequence (`post-change-sequence`)

Trigger: After every set of changes, before committing

**Step 0 — Batch-read all changed files once.**

| Step | Action | Workflow Reference | Skip If |
|------|--------|--------------------|---------|
| 1 | Run content quality checks on changed `/src` files | Workflow 1 | No `/src` files changed |
| 2 | Run project structure checks on changed root files | Workflow 2 | No root files changed |
| 3 | Run component integrity checks | Workflow 3 | No component files changed |
| 4 | Run theme integrity checks | Workflow 4 | No theme files changed |
| 5 | Update `changes.md` | Workflow 6 | Already updated |
| 6 | Update `project-status.md` | Direct update | No meaningful status change |
| 7 | Run TODO audit | Workflow 5 | Never skip |
| 8 | Check README staleness | RM-01 | No structural/workflow changes |
| 9 | Commit and push | — | — |

## Workflow 10: Pre-Commit Quality Gate (`pre-commit-gate`)

Trigger: User-triggered via `pre-commit-audit` hook

Verifies the post-change sequence was completed this session. If yes, confirms readiness. If not, runs the missing steps.

## Workflow 11: Bespoke Component Heuristic Violation (`bespoke-heuristic-check`)

Trigger: On every bespoke component creation

When creating a new bespoke component, check against design heuristics. If a violation is detected:
1. STOP — Alert with the specific heuristic ID and violation
2. ASK — "Fix the violation, or provide a justification to proceed?"
3. If justified — Record in the component page under `## Heuristic Violations`
4. If no justification — Do not proceed

## Workflow 12: Manual Sync (`manual-sync`)

Trigger: User-triggered via `manual-sync` hook

**Step 1 — Component API Sync.**
1. Verify ShadCN MCP is available
2. For each component file, query ShadCN MCP and compare
3. Non-breaking changes → update directly
4. Breaking changes → create conflict TODO

**Step 2 — Documentation-of-Record Sync.**
1. Fetch latest documentation from external sources
2. Compare against `build.md`
3. Update with verified changes only
4. Log changes in `changes.md`

**Step 3 — Tech Library Sync.**
For each tech library file, fetch latest docs and compare.

**Step 4 — Report results.**

## Workflow 13: Build Process (`build-power`)

Trigger: User-triggered via `build-power` hook

<phase name="validate">
**Phase 1 — Validate source.**
1. Run Workflow 1 on all `/src` files
2. Run Workflow 3 on all component files
3. Run Workflow 4 on all theme files
4. Run Workflow 7 (Cross-Cutting Consistency)
5. If any check fails → STOP
</phase>

<phase name="sync">
**Phase 2 — Documentation sync.**
1. Run Workflow 12 Steps 1-3
2. If sync detects changes → re-validate
</phase>

<phase name="version">
**Phase 3 — Version.**
1. Ask user: major, minor, or patch
2. Confirm version number
</phase>

<phase name="archive">
**Phase 4 — Archive previous build.**
1. If not first build: zip current dist/kiro output
2. If first build → skip
</phase>

<phase name="generate">
**Phase 5 — Generate Kiro Power output.**
1. Copy `/src` files into dist/kiro following path mapping
2. Run file count verification
3. Generate POWER.md with frontmatter
</phase>

<phase name="validate-build">
**Phase 6 — Build validation.**
Run Workflow 8 (Build Validation) — all 4 checks.
</phase>

<phase name="finalize">
**Phase 7 — Finalize.**
1. Update `changes.md`
2. Update `todos.md`
3. Update `README.md` if needed
4. Update `project-status.md`
5. Report results
6. Prepare commit
</phase>

---

## Workflow 14: Optimization Audit (`optimization-audit`)

Trigger: User-triggered via `optimization-audit` hook; user says "run optimization audit" or similar.
Source: `optimization.md` — all pattern application tables, formatting standards, writing standards, quality checklist.

Scope: All `/src` files and all root `.md` files. Excludes `/dist` (build outputs) and non-markdown files.

**Execution model:** Batch-read files in groups of ~10. Run all checks per file before moving to the next batch. Report results as a summary table at the end.

### High-Impact Checks (All Files)

| Check ID | Description | Pass Criteria | Scope | Remediation |
|----------|-------------|---------------|-------|-------------|
| OA-01 | TL;DR present | Files >2,000 words have a TL;DR section under H1 | All files >2,000 words. Exempt: `changes.md` | Add TL;DR section |
| OA-02 | Action-oriented headers | All H2/H3 start with verbs, questions, or are task-named | All files | Rename headers to be task-specific |
| OA-03 | Semantic chunking | Each H2/H3 section is self-contained and screen-sized (~50 lines max) | All files | Split oversized sections |
| OA-04 | Fenced code blocks | Every opening code fence has a language tag | All files. Exempt: nested code examples in `optimization.md` | Add language tags |
| OA-05 | Numbered procedures | Step-by-step instructions use 1. 2. 3. format, not bullets | Procedural content only | Convert bullet procedures to numbered lists |
| OA-06 | Markdown hierarchy | Consistent heading hierarchy (H1 → H2 → H3). No skipped levels | All files | Fix heading levels |
| OA-07 | Progressive disclosure | Sections >500 words have a summary before the detailed content | All files | Add summary before long sections |
| OA-08 | Conciseness | No filler words. Sentences <25 words where possible | All files. Exempt: self-referential examples in optimization.md | Apply conciseness challenge |

### Medium-Impact Checks (Procedural and Mixed Content)

| Check ID | Description | Pass Criteria | Scope | Remediation |
|----------|-------------|---------------|-------|-------------|
| OA-09 | Instruction/reference delimiter | Mixed-content files use `---` delimiter. Instructions first | Instructional and mixed-content files only. Skip pure reference files | Add delimiter |
| OA-10 | Stop conditions | Procedural files have stop conditions stated early | Procedural files only. Skip governance files, reference files, changelogs | Add stop conditions |
| OA-11 | Commitment language | Critical steps use emphatic markers (CRITICAL, REQUIRED, STOP) | Files with must-not-skip steps | Add emphatic markers |
| OA-12 | XML phase boundaries | Multi-phase workflows with 3+ stages use `<phase>` tags | Workflow files only | Add phase tags |
| OA-13 | List length | No instructional bullet list exceeds 10 items | Instructional lists only. Exempt: API parts, keyboard shortcuts, citations, changelogs, checklists | Split long instructional lists |

### Structural Checks (All Files)

| Check ID | Description | Pass Criteria | Scope | Remediation |
|----------|-------------|---------------|-------|-------------|
| OA-14 | File naming | All files lowercase, hyphen-separated `.md` | All files | Rename non-conforming files |
| OA-15 | Cross-references | Files reference related documents where applicable | All files | Add missing cross-references |
| OA-16 | Tables for dense info | Specifications and dense reference data use tables | Reference content | Convert dense prose to tables |

### Report Format

After running all checks, produce a summary:

```text
Optimization Audit Report
Date: YYYY-MM-DD
Files scanned: N

FAILURES:
| File | Check | Issue | Remediation |
|------|-------|-------|-------------|
| ... | OA-XX | ... | ... |

SUMMARY:
- Total checks run: N
- Passed: N
- Failed: N
- Files with issues: N
```

If all checks pass → report "All files pass optimization audit."

---

## Trigger Summary

| Trigger Event | Workflows | Name |
|---------------|-----------|------|
| `/src` file create or edit | 1, 3 (if component), 4 (if theme) | `content-quality`, `component-integrity`, `theme-integrity` |
| Root file create or edit | 2 | `project-structure` |
| Before every commit | 9 | `post-change-sequence` |
| Pre-commit quality gate (user-triggered) | 10 | `pre-commit-gate` |
| Pre-release QA | 7, 8 | `cross-cutting-consistency`, `build-validation` |
| Manual sync (user-triggered) | 12 | `manual-sync` |
| Build (user-triggered) | 13 (includes 1, 3, 4, 7, 8, 12) | `build-power` |
| Optimization audit (user-triggered) | 14 | `optimization-audit` |
| User request | Any workflow by name | — |
| Bespoke component creation | 11 | `bespoke-heuristic-check` |
