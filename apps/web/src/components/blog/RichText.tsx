/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : RichText
 * Scope        : Blog UI
 *
 * Description  : Renders pre-sanitised Lexical article body HTML with
 *                premium typographic styling via descendant selectors.
 *
 * Responsibilities :
 * - Render sanitised HTML from lib/cms/richtext.ts via dangerouslySetInnerHTML
 * - Apply typographic styles to whitelisted tags (p, h2-h4, ul/ol, a, etc.)
 * - Return null for empty HTML content
 *
 * Features / Functionality :
 * - Typography-aware rendering with project design tokens
 * - Heading hierarchy (h2-h4) with display font
 * - Styled links with gold colour and underline
 * - List styling (disc/decimal) with proper spacing
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS
 * Layer        : Frontend
 *
 * Dependencies : None
 *
 * Notes        : HTML is pre-sanitised by lib/cms/richtext.ts (safe for innerHTML)
 ************************************************************/

// Renders the serialised Lexical article body.
//
// The `html` prop is produced by `lib/cms/richtext.ts#lexicalToHtml`, which
// HTML-escapes all text, emits only a whitelisted set of tags, and scheme-
// validates link hrefs. The HTML is therefore PRE-SANITISED at the seam, so
// rendering it via `dangerouslySetInnerHTML` here honours the project's
// "no `dangerouslySetInnerHTML` without sanitisation" rule.
//
// Typography is applied via descendant selectors on the wrapper using the
// project's tokens (font-sans / font-display / warm-gray / deep-gold) so the
// whitelisted tags (p, h2-h4, ul/ol/li, a, strong/em/u) read as premium prose.

type RichTextProps = {
  html: string
}

export function RichText({ html }: RichTextProps) {
  if (html === '') {
    return null
  }

  return (
    <div
      className={[
        'font-sans text-[17px] leading-[1.7] text-warm-gray',
        '[&_p]:mt-5',
        '[&_h2]:font-display [&_h2]:text-cocoa-dark [&_h2]:text-[clamp(26px,3.5vw,34px)] [&_h2]:tracking-[-0.5px] [&_h2]:leading-[1.15] [&_h2]:mt-10',
        '[&_h3]:font-display [&_h3]:text-cocoa-dark [&_h3]:text-[22px] [&_h3]:leading-[1.2] [&_h3]:mt-8',
        '[&_h4]:font-display [&_h4]:text-cocoa-dark [&_h4]:text-lg [&_h4]:mt-6',
        '[&_ul]:mt-5 [&_ul]:pl-6 [&_ul]:list-disc',
        '[&_ol]:mt-5 [&_ol]:pl-6 [&_ol]:list-decimal',
        '[&_li]:mt-2 [&_li]:leading-[1.6]',
        '[&_strong]:text-cocoa-dark [&_strong]:font-semibold',
        '[&_a]:text-gold-ink [&_a]:underline [&_a]:underline-offset-2 [&_a]:transition-colors [&_a]:duration-200 hover:[&_a]:text-cocoa-dark',
      ].join(' ')}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is pre-sanitised by lib/cms/richtext.ts (escaped text, tag whitelist, validated hrefs)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
