const REDESIGN_SPEC = '.kiro/specs/admin-portal-redesign/'
const REDESIGN_REF = /(?:^|[/-])admin-(?:(?:portal-)?redesign|design-system)(?:$|[/-])/
const FEATURE_REF = /^(?:feat|codex)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/

/** Preserve the strict boundary unless a pull request declares a matching feature spec. */
export function classifyAdminChange(headRef, changedFiles, isPresent) {
  const ref = headRef ?? ''
  if (REDESIGN_REF.test(ref) || changedFiles.some((p) => p.startsWith(REDESIGN_SPEC))) {
    return 'redesign'
  }

  const match = FEATURE_REF.exec(ref)
  if (!match) return 'unspecified'
  const specRoot = `.kiro/specs/${match[1]}`
  const documented = ['requirements.md', 'design.md'].every((name) => {
    const path = `${specRoot}/${name}`
    return changedFiles.includes(path) && isPresent(path)
  })
  return documented ? 'feature' : 'unspecified'
}
