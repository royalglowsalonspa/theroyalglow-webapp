import Link from 'next/link'

/**
 * Props for {@link LegacyBanner}.
 *
 * Both fields are plain serializable strings so the banner can be rendered by a
 * server component (`DocsShell`, task 8.1) without any client boundary. The
 * shell decides *whether* to render the banner (only for non-latest versions,
 * Req 8.5) and computes `latestHref` server-side via `equivalentPath(relSlug,
 * latest)` + an existence check; this component is purely presentational and
 * renders the banner UI given those props.
 */
export type LegacyBannerProps = {
  /**
   * The label of the Legacy_Version currently being viewed, e.g. `'v2'`
   * (Req 8.1). Shown in the notice so the Reader can identify which version
   * they are on.
   */
  versionLabel: string
  /**
   * Absolute or root-relative href to the equivalent page in the
   * Latest_Version, or the Latest_Version landing page when no equivalent
   * exists (Req 8.2, 8.3). Computed server-side by `DocsShell`.
   */
  latestHref: string
}

/**
 * Legacy_Banner — a presentational notice shown while a Reader views a
 * Legacy_Version (Req 8.1–8.3).
 *
 * Renders a clear notice that the documentation being viewed is **not** the
 * latest and identifies the version label (Req 8.1), plus a keyboard-focusable
 * link to the equivalent latest page — or the latest landing page when no
 * equivalent exists (Req 8.2, 8.3), as already resolved into `latestHref` by
 * the parent shell.
 *
 * It is a **server component** (no client interactivity) styled with the RGSS
 * Design_Tokens (`fd-*` token classes) for AA contrast in both themes. The
 * global focus-ring and `prefers-reduced-motion` rules in `app/global.css`
 * cover keyboard focus visibility and reduced-motion compliance, so no
 * per-component handling is required.
 *
 * Visibility (render iff non-latest, Req 8.5) and persistence across legacy
 * pages (Req 8.4) are the responsibility of `DocsShell`, which conditionally
 * mounts this banner.
 */
export function LegacyBanner({ versionLabel, latestHref }: LegacyBannerProps) {
  return (
    <aside
      aria-label="Legacy documentation notice"
      className="mb-6 flex flex-col gap-2 rounded-[var(--radius)] border border-fd-border bg-fd-accent px-4 py-3 text-fd-foreground sm:flex-row sm:items-center sm:justify-between"
      role="note"
    >
      <p className="m-0 text-fd-foreground text-sm">
        <svg
          aria-hidden="true"
          className="mr-2 inline-block align-text-bottom"
          fill="none"
          height="18"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="18"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" x2="12" y1="9" y2="13" />
          <line x1="12" x2="12.01" y1="17" y2="17" />
        </svg>
        You are viewing the <strong className="font-semibold">{versionLabel}</strong> documentation,
        which is <strong className="font-semibold">not the latest version</strong>.
      </p>
      <Link
        className="shrink-0 font-medium text-fd-primary underline underline-offset-2 hover:no-underline"
        href={latestHref}
      >
        Go to the latest documentation
      </Link>
    </aside>
  )
}
