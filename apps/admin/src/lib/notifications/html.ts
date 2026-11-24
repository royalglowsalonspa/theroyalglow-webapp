/************************************************************
 * Module Name  : notifications/html (admin)
 * Scope        : Notifications — safe HTML for emails
 *
 * Description  : Escaping for text placed in email HTML, and a check that a
 *                stored link is a plain https URL before it becomes an href.
 *                Notification text carries names typed by customers and staff
 *                (a lead's name, a branch name), so it is never trusted as HTML.
 ************************************************************/

/** Text safe to place inside an HTML element or a quoted attribute. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** The URL when it is a valid https URL, otherwise null. */
export function httpsUrlOrNull(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
