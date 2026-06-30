# Error Recovery Procedures

> **TL;DR:** Recovery procedures for 6 known error conditions: theme structure issues, glossary drift, broken cross-references, optimization violations, build output inconsistency, and file write desync.

---

## Error 1: Theme Structure Issue Detected

**Problem:** Default theme file has missing or malformed variables

**Recovery:**
1. Compare against the shadCN New York variable reference
2. Fix missing or malformed variables
3. Verify all standard shadCN contract variables are present with light and dark values
4. Update `changes.md` with the fix

---

## Error 2: Glossary Drift Detected

**Problem:** Term usage in a file differs from glossary definition

**Recovery:**
1. Create a conflict entry in `todos.md`
2. Do NOT auto-resolve — user must decide correct definition
3. Document affected files and specific terms
4. Resolve through TODO workflow

---

## Error 3: Broken Cross-References

**Problem:** Links to other documents or sections not working

**Recovery:**
1. Search for broken link pattern in all files
2. Update to correct path/anchor format
3. Verify link works
4. Check for similar broken links throughout documentation

---

## Error 4: Optimization Rules Violations Detected

**Problem:** Content does not follow `optimization.md` patterns

**Recovery:**
1. Review `optimization.md` for applicable patterns
2. Apply high-impact patterns to affected files (TL;DR, structured metadata, semantic chunking)
3. Apply medium-impact patterns to procedural content (delimiters, output schemas, stop conditions)
4. Verify optimization compliance
5. Update version (patch bump) and document in `changes.md`

---

## Error 5: Build Output Inconsistency

**Problem:** Build output in `/dist/kiro` doesn't match `/src` content

**Recovery:**
1. Re-run build flow from step 1 (validate `/src`)
2. Compare output against source
3. Document the inconsistency and resolution in `changes.md`

---

## Error 6: File Write Desync Detected

**Problem:** Editor buffer and disk state have diverged — file content doesn't match what the agent intended to write.

**Symptoms:**
- A string replacement fails unexpectedly on content the agent just wrote
- File content when read back doesn't match what was just written
- User reports corrupted or missing content in a file the agent recently edited

**Recovery:**
1. Read the suspected file back from disk and compare against intended content
2. If mismatch confirmed → STOP, alert the user, identify the affected file and the specific discrepancy
3. Do NOT continue writing to other files until the desync is resolved
4. Ask the user to save all open editor buffers, then retry the write
5. After retry, read the file back again to confirm the fix
6. Document the incident in `changes.md` if content was lost or corrupted
