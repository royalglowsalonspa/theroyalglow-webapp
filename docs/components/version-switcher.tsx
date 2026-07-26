'use client'

import { useRouter } from 'next/navigation'
import { useId } from 'react'
import type { VersionId } from '@/lib/versions'

/**
 * A single documentation version as the Version_Switcher consumes it.
 *
 * This is the **serializable** projection of the registry's `VersionMeta` — it
 * deliberately carries no fumadocs loader `source` (that is server-only). The
 * server shell (DocsShell, task 8.1) maps `getSwitcherOrder(versionsMeta)` to
 * this shape before passing it to the client.
 */
export type SwitcherVersion = {
  /** `'latest'` for the Latest_Version, else `v{N}` for a Legacy_Version. */
  id: VersionId
  /** Human-facing label, e.g. `'Latest'`, `'v2'`. */
  label: string
  /** The integer version number for legacy versions; `null` for latest. */
  versionNumber: number | null
  /** URL base path: `'/docs'` for latest, `'/docs/v{N}'` for legacy. */
  basePath: string
  /** `true` only for the Latest_Version. */
  isLatest: boolean
}

/**
 * Props for {@link VersionSwitcher}. Every field is plain JSON-serializable
 * data so the component can be a client island mounted in the server-rendered
 * `DocsLayout` `sidebar.banner`. No fumadocs loader / `Source` instance crosses
 * the server→client boundary.
 */
export type VersionSwitcherProps = {
  /**
   * Every documentation version, **already ordered most-recent-first**
   * (Latest first). The server produces this with
   * `getSwitcherOrder(versionsMeta)` mapped to {@link SwitcherVersion}; the
   * client renders the list verbatim and does not re-sort (Req 7.2).
   */
  versions: SwitcherVersion[]
  /** The id of the version currently being viewed (marked selected, Req 7.1). */
  activeVersionId: VersionId
  /**
   * Precomputed navigation target for the CURRENT page, per version id.
   *
   * The server computes this with `pageExistsIn` + `equivalentPath` for the
   * page being rendered: each entry is the equivalent page in that version when
   * it exists, otherwise that version's landing page (`basePath`). Selecting a
   * version pushes `targetHrefByVersionId[id]`, falling back to the version's
   * `basePath` if (defensively) absent (Req 7.3, 7.4, 12.6). Keeping the
   * existence check on the server keeps this client component free of loader
   * I/O.
   */
  targetHrefByVersionId: Record<string, string>
}

/**
 * The Version_Switcher: a labelled dropdown, mounted in the `DocsLayout`
 * `sidebar.banner`, for moving between documentation versions (Req 7).
 *
 * Implemented as a native `<select>` — the most robust control for keyboard
 * operation and assistive technology (focus, type-ahead, arrow keys, Enter all
 * work natively, Req 7.5) — styled with the RGSS Design_Tokens / fumadocs
 * `--color-fd-*` classes. The active version is the select's `value`, so it is
 * rendered as the visually selected entry (Req 7.1). On change, the client
 * navigates to the precomputed target for the selected version via
 * `router.push` (equivalent page, or that version's landing page — Req 7.3,
 * 7.4, 12.6).
 */
export function VersionSwitcher({
  versions,
  activeVersionId,
  targetHrefByVersionId,
}: VersionSwitcherProps) {
  const router = useRouter()
  const labelId = useId()

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const selectedId = event.target.value
    if (selectedId === activeVersionId) {
      return
    }
    const fallback = versions.find((version) => version.id === selectedId)?.basePath
    const target = targetHrefByVersionId[selectedId] ?? fallback
    if (target !== undefined) {
      router.push(target)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-fd-muted-foreground text-xs font-medium" id={labelId}>
        Documentation version
      </span>
      <select
        aria-label="Select documentation version"
        aria-labelledby={labelId}
        className="w-full cursor-pointer rounded-full border border-fd-border bg-fd-secondary px-3 py-1.5 text-sm font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
        onChange={handleChange}
        value={activeVersionId}
      >
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {version.label}
          </option>
        ))}
      </select>
    </div>
  )
}
