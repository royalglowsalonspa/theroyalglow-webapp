/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : JsonLd
 * Scope        : SEO UI
 *
 * Description  : Server-only component that embeds Schema.org JSON-LD into the
 *                page via script tags. Escapes < to prevent XSS.
 *
 * Responsibilities :
 * - Serialise JSON-LD objects into script[type=application/ld+json] tags
 * - Escape < characters to prevent script tag injection
 * - Support single or array of JSON-LD objects
 *
 * Features / Functionality :
 * - JsonLd component with data prop (object or object[])
 * - Safe serialisation with < → \u003c escaping
 * - Server-rendered only (no 'use client')
 *
 * Tech Stack   : React, TypeScript
 * Layer        : Frontend
 *
 * Dependencies : None
 *
 * Notes        : Must be server-rendered per seo.md — never inject client-side
 ************************************************************/

/**
 * Server-only component that embeds Schema.org JSON-LD into the page.
 *
 * JSON-LD MUST be server-rendered (per `seo.md`), never injected client-side,
 * so this is a plain server component (no `'use client'`). The serialised
 * output escapes `<` to `\u003c` so a value can never terminate the surrounding
 * `<script>` element. Data comes from typed constants / DB values, not user
 * input, so this is the only escaping required.
 *
 * Pass a single object or an array of objects; each renders its own script tag.
 */

type JsonLdProps = {
  data: object | object[]
}

function serialise(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export function JsonLd({ data }: JsonLdProps) {
  const items = Array.isArray(data) ? data : [data]

  return (
    <>
      {items.map((item, index) => (
        <script
          // biome-ignore lint/suspicious/noArrayIndexKey: static, render-only structured-data scripts
          key={index}
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: required to emit JSON-LD; input is escaped and not user-controlled
          dangerouslySetInnerHTML={{ __html: serialise(item) }}
        />
      ))}
    </>
  )
}
