/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : richtext
 * Scope        : CMS Integration — Rich Text
 *
 * Description  : Serialises Payload Lexical rich-text JSON into safe HTML.
 *                Only emits whitelisted tags with escaped text content.
 *
 * Responsibilities :
 * - Parse Lexical JSON nodes into sanitised HTML string
 * - Escape all text content to prevent XSS
 * - Validate link hrefs (allow only http/s, mailto, tel, relative)
 * - Provide plain-text extraction for meta descriptions
 *
 * Features / Functionality :
 * - lexicalToHtml() — Lexical root → sanitised HTML string
 * - lexicalToPlainText() — Lexical root → plain text (truncated)
 * - Inline formatting (bold, italic, underline) via bitmask
 *
 * Tech Stack   : TypeScript
 * Layer        : Data Fetching
 *
 * Dependencies : None
 *
 * Notes        : Output is safe for dangerouslySetInnerHTML (pre-sanitised)
 ************************************************************/

// Serialises Payload's Lexical rich-text JSON into a SAFE subset of HTML.
//
// Lexical content is authored by trusted admins, but the output of
// `lexicalToHtml` is fed to `dangerouslySetInnerHTML` (Task 5), so we honour
// the project's "no `dangerouslySetInnerHTML` without sanitisation" rule:
//   - all text content is HTML-escaped
//   - only a whitelist of tags is emitted (p, h2-h4, strong, em, u, a, ul, ol,
//     li, br)
//   - link hrefs are escaped AND scheme-validated (no `javascript:` etc.)
//   - there is NO arbitrary raw-HTML passthrough of node content
// Invalid/empty input yields `''` rather than throwing.

const DEFAULT_PLAIN_TEXT_MAX_LEN = 200

// Lexical text-format bitmask (subset we render).
const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2
const FORMAT_UNDERLINE = 8

const ALLOWED_HEADING_TAGS = new Set(['h2', 'h3', 'h4'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Escape text so it cannot break out into markup. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Validate + escape a link href. Allows http(s), mailto, tel, and site-relative
 * paths; anything else (e.g. `javascript:`) is rejected → empty string.
 */
function safeHref(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return ''
  }
  const isAbsolute = /^(https?:|mailto:|tel:)/i.test(trimmed)
  const isRelative = trimmed.startsWith('/') || trimmed.startsWith('#')
  if (!(isAbsolute || isRelative)) {
    return ''
  }
  return escapeHtml(trimmed)
}

/** Find the children array of a Lexical node, if any. */
function childrenOf(node: Record<string, unknown>): unknown[] {
  return Array.isArray(node.children) ? node.children : []
}

/** Resolve the root node whether passed `{ root }` or the root node directly. */
function resolveRoot(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input)) {
    return null
  }
  if (isRecord(input.root)) {
    return input.root
  }
  return input
}

/** Wrap escaped text with inline formatting based on the Lexical bitmask. */
function applyInlineFormat(escaped: string, format: unknown): string {
  if (typeof format !== 'number' || escaped === '') {
    return escaped
  }
  let html = escaped
  if ((format & FORMAT_BOLD) !== 0) {
    html = `<strong>${html}</strong>`
  }
  if ((format & FORMAT_ITALIC) !== 0) {
    html = `<em>${html}</em>`
  }
  if ((format & FORMAT_UNDERLINE) !== 0) {
    html = `<u>${html}</u>`
  }
  return html
}

function serialiseChildren(children: unknown[]): string {
  return children.map((child) => serialiseNode(child)).join('')
}

function serialiseLink(node: Record<string, unknown>): string {
  // Payload's Lexical link stores the URL under `fields.url`; some payloads use
  // a top-level `url`. Try both.
  const fields = isRecord(node.fields) ? node.fields : undefined
  const rawUrl = asString(fields?.url ?? node.url)
  const href = safeHref(rawUrl)
  const inner = serialiseChildren(childrenOf(node))
  if (href === '') {
    return inner
  }
  return `<a href="${href}" rel="noopener noreferrer">${inner}</a>`
}

function serialiseHeading(node: Record<string, unknown>): string {
  const tag = asString(node.tag).toLowerCase()
  const safeTag = ALLOWED_HEADING_TAGS.has(tag) ? tag : 'h2'
  const inner = serialiseChildren(childrenOf(node))
  return `<${safeTag}>${inner}</${safeTag}>`
}

function serialiseList(node: Record<string, unknown>): string {
  const tag = asString(node.tag).toLowerCase() === 'ol' ? 'ol' : 'ul'
  const inner = serialiseChildren(childrenOf(node))
  return `<${tag}>${inner}</${tag}>`
}

function serialiseNode(node: unknown): string {
  if (!isRecord(node)) {
    return ''
  }

  const type = asString(node.type)

  switch (type) {
    case 'text':
      return applyInlineFormat(escapeHtml(asString(node.text)), node.format)
    case 'linebreak':
      return '<br />'
    case 'paragraph': {
      const inner = serialiseChildren(childrenOf(node))
      return inner === '' ? '' : `<p>${inner}</p>`
    }
    case 'heading':
      return serialiseHeading(node)
    case 'list':
      return serialiseList(node)
    case 'listitem':
      return `<li>${serialiseChildren(childrenOf(node))}</li>`
    case 'link':
    case 'autolink':
      return serialiseLink(node)
    default:
      // Unknown node: render any children but never the node's own markup.
      return serialiseChildren(childrenOf(node))
  }
}

/** Serialise a Lexical root node to sanitised HTML for <RichText/>. */
export function lexicalToHtml(root: unknown): string {
  const resolved = resolveRoot(root)
  if (resolved === null) {
    return ''
  }
  return serialiseChildren(childrenOf(resolved))
}

function collectText(node: unknown, parts: string[]): void {
  if (!isRecord(node)) {
    return
  }
  if (asString(node.type) === 'text') {
    parts.push(asString(node.text))
    return
  }
  for (const child of childrenOf(node)) {
    collectText(child, parts)
  }
}

/** Plain-text excerpt (for meta-description fallback), truncated to maxLen. */
export function lexicalToPlainText(
  root: unknown,
  maxLen: number = DEFAULT_PLAIN_TEXT_MAX_LEN,
): string {
  const resolved = resolveRoot(root)
  if (resolved === null) {
    return ''
  }

  const parts: string[] = []
  for (const child of childrenOf(resolved)) {
    collectText(child, parts)
  }

  const collapsed = parts.join(' ').replace(/\s+/g, ' ').trim()
  if (collapsed === '') {
    return ''
  }
  if (maxLen <= 0 || collapsed.length <= maxLen) {
    return collapsed
  }
  return `${collapsed.slice(0, maxLen).trimEnd()}…`
}
