# Optimization Rules — Design System Skill

> **TL;DR:** Rules for making documentation agent-friendly and token-efficient. Apply during content creation, updates, and reviews. Key patterns: TL;DR sections for long files, action-oriented headers, semantic chunking, three-layer architecture for instructions, conciseness challenge on all prose, and fenced code blocks with language tags. See Pattern Application Tables for the full checklist.

## Purpose

Standardize quality and consistency across all project documentation. Guide agents in making content agent-friendly and token-efficient.

**Apply when:**
- Creating new documentation files
- Updating existing skill content
- Reviewing documentation for agent-friendliness

**Do not apply when:**
- Writing user-facing product documentation (different audience)
- Creating marketing materials (different tone/structure)

**Stop conditions:**
- Pattern applied consistently across all relevant files
- Verification checks pass for each pattern

---

## Content Type Decision Framework

Before creating or updating documentation, determine the appropriate content type and structure:

```
Is this content primarily instructional (how-to)?
├─ YES → Use three-layer architecture
│   ├─ Layer 1: Executive summary (what/why/when)
│   ├─ Layer 2: Core instructions (step-by-step)
│   └─ Layer 3: Reference details (examples, edge cases)
│
└─ NO → Is it reference material (specifications, definitions)?
    ├─ YES → Use flat structure with quick reference tables
    │
    └─ NO → Is it mixed (instructions + reference)?
        └─ YES → Use explicit delimiters
            ├─ ## Instructions (actionable content)
            ├─ ---
            └─ ## Reference (background, sources)
```

### Content Type Guidelines

**Instructional Content** (how-to guides, procedures):
- Use three-layer architecture
- Include XML phase boundaries for complex workflows
- Add commitment language for critical steps
- Provide progressive disclosure (summary → details)

**Reference Content** (specifications, definitions):
- Use tables for dense information
- Front-load most-used information
- Include quick reference sections
- Minimize narrative prose

**Mixed Content** (instructions + reference):
- Use `---` delimiter to separate sections
- Instructions first, reference second
- Cross-reference between sections

---

## Content Architecture Patterns

### Three-Layer Architecture (Token-Aware Content Layering)

Enables progressive disclosure — agents can stop reading when they have enough context.

**When to Apply:** Instructional content (how-to guides, procedures, workflows)

```markdown
## [Task Name]

**Layer 1: Executive Summary** (50-100 words)
- What this accomplishes
- Why it matters
- When to use it

**Layer 2: Core Instructions** (200-500 words)
1. Step 1 with specific action
2. Step 2 with specific action
3. Step 3 with specific action

**Layer 3: Reference Details** (as needed)
- Examples
- Edge cases
- Troubleshooting
```

Token Savings: 30-50% (agents can stop at Layer 2 if instructions are clear)

### Conciseness Challenge Questions

Apply to every sentence during review:
1. Can I delete this word? (Remove filler: "really", "very", "actually", "basically")
2. Can I use a shorter word? ("utilize" → "use", "implement" → "add", "facilitate" → "help")
3. Can I combine sentences?
4. Can I use a list instead?
5. Is this sentence necessary?

Example:
```
❌ Before (32 words):
"In order to successfully complete the installation process, you will need to
carefully follow each of the steps that are outlined below in the exact order
that they are presented."

✅ After (8 words):
"Follow these steps in order to install:"
```

Token Savings: 15-40% through systematic word reduction

### XML Phase Boundaries for Complex Workflows

Provides clear visual separation between workflow phases, improving agent parsing.

**When to Apply:** Multi-phase workflows with 3+ distinct stages

```markdown
<phase name="discovery">
## Phase 1: Discovery
**Goal**: Understand requirements
**Steps**: 1. Ask clarifying questions 2. Document assumptions 3. Confirm scope
**Output**: Requirements document
</phase>

<phase name="implementation">
## Phase 2: Implementation
**Goal**: Build the solution
**Steps**: 1. Create file structure 2. Generate content 3. Apply formatting
**Output**: Complete documentation
</phase>
```

### Specific Prohibition Examples (NEVER Phrases)

Explicit negative examples prevent common mistakes more effectively than abstract rules.

**When to Apply:** Critical procedures where mistakes have high cost

```markdown
**NEVER**:
- ❌ "NEVER use generic headings like 'Setup' — be specific: 'Setup (Python Environment)'"
- ❌ "NEVER skip validation commands in procedural content"

**ALWAYS**:
- ✅ "ALWAYS include TL;DR sections for files >2,000 words"
- ✅ "ALWAYS use specific, task-oriented headings"
```

### Commitment Language for Critical Steps

Emphatic language signals importance and increases agent compliance.

**When to Apply:** Steps that must not be skipped or where errors are costly

Emphatic Markers:
- **CRITICAL**: For must-do steps
- **REQUIRED**: For non-optional actions
- **STOP**: For hard checkpoints
- **WARNING**: For potential errors
- **IMPORTANT**: For key considerations

### Progressive Disclosure (Summary → Details)

Allows agents to get quick answers without reading full content.

**When to Apply:** Long sections (>500 words) with detailed information

```markdown
## [Topic Name]

**TL;DR**: [1-2 sentence summary]

**Full Details**: [Detailed content below]

[Detailed content...]
```

Token Savings: 40-60% when agents only need summary

---

## Pattern Application Tables

### High-Impact Patterns (Apply to All Files)

| Pattern | Token Savings | When to Apply | How to Verify |
|---------|---------------|---------------|---------------|
| Executive Summary (TL;DR) | 40-60% | Files >2,000 words | Check for TL;DR section at top |
| Structured Metadata | 30-40% | All documentation files | Verify file description exists |
| Action-Oriented Headers | 20-30% | All section headers | Headers start with verbs or questions |
| Semantic Chunking | 30-50% | All content | Each H2/H3 is self-contained |
| Markdown Hierarchy | 20-30% | All content | Headings + lists for structure |
| Fenced Code Blocks | 10-20% | All code examples | Language tags present |
| Numbered Procedures | 15-25% | Step-by-step instructions | Use 1. 2. 3. format |
| Token-Aware Layering | 30-50% | Instructional content | Three layers present |
| Conciseness Challenge | 15-40% | All content (during review) | Apply 5 challenge questions |
| Progressive Disclosure | 40-60% | Long sections (>500 words) | Summary before details |

### Medium-Impact Patterns (Apply to Procedural Content)

| Pattern | Benefit | When to Apply | How to Verify |
|---------|---------|---------------|---------------|
| Instruction/Reference Separation | 30-40% savings | Mixed content types | `---` delimiter present |
| Output Format Schemas | 20-30% savings | Procedural content | Fenced blocks with schemas |
| Stop Conditions | 10-15% savings | All procedures | Early section with clear conditions |
| Commitment Language | Better compliance | Critical steps | CRITICAL/REQUIRED/STOP markers |
| Specific Prohibitions (NEVER) | Better compliance | Critical procedures | NEVER/ALWAYS examples present |
| XML Phase Boundaries | Better parsing | Multi-phase workflows (3+ stages) | `<phase>` tags present |
| Visual Diagrams | Better comprehension | Complex structures | ASCII diagrams present |

### Context-Specific Patterns (Apply When Relevant)

| Pattern | Use Case | When to Apply | How to Verify |
|---------|----------|---------------|---------------|
| Canonical Heading Skeleton | New file creation | Starting new documentation | Follows standard template |
| Document ID Wrappers | Multi-doc retrieval | Long-context scenarios | XML/structured format used |
| Constraint Ordering | Long-context optimization | Files >10,000 words | Constraints early, question late |

---

## Corroborated Best Practices

These recommendations are supported by multiple authoritative sources.

### 1. Use Markdown Headings + Lists for Hierarchy
- Rules: `- Must / - Must not / - Prefer`
- Procedures: `1. 2. 3.`
- Headings: `# / ## / ###` for sections

### 2. Separate Instructions from Reference with Explicit Delimiters
```markdown
## Instructions
...

---

## Reference
...
```

### 3. Use Consistent Structure Within Files
Predictable structure improves agent navigation. Use Markdown headings with consistent hierarchy throughout each file.

### 4. Standardize Output Formats with Fenced Blocks
```markdown
## Output format
```json
{ "summary": "", "assumptions": [], "steps": [] }
```
```

### 5. Make Multi-Step Flows Explicit with Trigger/Instruction Pairs
```markdown
Trigger: User provides inputs
Instruction: Validate inputs and summarize assumptions

Trigger: Inputs validated
Instruction: Generate the artifact using the output schema
```

### 6. Put Stop Conditions Early and Unambiguous
Add "When to use" / "When NOT to use" / "Stop conditions" sections at the beginning of procedural content.

---

## Retrieval-Friendly Markdown

### Chunk by Semantic Headings
- Each H2/H3 should be self-contained
- Use task-named headings (not generic "Troubleshooting")
- Avoid scattering procedures across distant sections

### Keep Sections Screen-Sized
If a section won't fit on a screen, split into subheadings.

---

## Code Structure Rules

- All files must be Markdown (.md)
- Consistent heading hierarchy (H1 → H2 → H3)
- Fenced code blocks with language tags
- Numbered lists for procedures (1. 2. 3.)
- Bullet lists for non-sequential items
- One blank line before each heading

## Naming Conventions

- File names: lowercase, hyphen-separated (e.g., `design-guidelines.md`)
- Component files: match shadCN component name (e.g., `button.md`, `alert-dialog.md`)
- Theme files: match theme name (e.g., `devops.md`, `secops.md`)
- Section headings: sentence case, task-oriented where possible

## Reusability and Modularity Rules

- All content must support import into other skills
- All content must support independent/standalone usage
- Avoid cross-file dependencies where possible
- When dependencies exist, declare them explicitly
- Each section should be self-contained and independently understandable

---

## Required Sections (Canonical Skeleton)

Every major documentation file should include:
- **Summary** (TL;DR for files >2,000 words)
- **Purpose/Overview**
- **Procedure** (for how-to content)
- **Output format** (for procedural content)
- **Examples**
- **Edge cases & failure handling**
- **References/Related Documents**

Verify each new file against this skeleton before publishing.

---

## Formatting Standards

- ≤10 bullets per list (split into subheadings if needed)
- One blank line before each heading
- Fenced code blocks with language tags
- Consistent delimiter convention (`---` for major sections)
- XML tags for phase boundaries in complex workflows (`<phase name="...">`)
- Emphatic language for critical steps (CRITICAL, REQUIRED, STOP, WARNING, IMPORTANT)

---

## Validation Command Categories

See `workflows.md` → Workflows 1, 2, 7 for validation check procedures with IDs and pass/fail criteria.

- Workflow 1 (Content Quality): During `/src` file updates — replaces Category A
- Workflow 2 (Project Structure): During root file maintenance — replaces Category B
- Workflow 7 (Cross-Cutting Consistency): Pre-release QA — replaces Category C

---

## Writing Standards

- Front-load the most important information
- Use tables for dense specifications
- Provide concrete examples over abstract descriptions
- Be specific: "36px height" over "medium size"
- Link to glossary for terminology consistency
- Test that agents can use the content effectively

---

## Quality Checklist (Apply Before Publishing)

- [ ] Every H2/H3 section is self-contained
- [ ] Task-named headings (not generic)
- [ ] Numbered lists for procedures
- [ ] Fenced blocks for all code/schemas
- [ ] Explicit delimiters between instruction and reference
- [ ] Stop conditions clearly stated
- [ ] Output formats in fenced blocks
- [ ] Cross-references use relative links
- [ ] Optimization patterns applied
- [ ] Validation checks passed (see `workflows.md` → Trigger Summary)
