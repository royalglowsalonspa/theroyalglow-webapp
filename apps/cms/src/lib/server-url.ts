/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-08-2026 & Updated - 29-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : server-url
 * Scope        : CMS Configuration
 *
 * Description  : Resolves Payload's `serverURL` and reports, at boot, when the
 *                trusted origin required by Payload 3.90+ is missing.
 *
 * Tech Stack   : TypeScript
 * Layer        : CMS (Configuration)
 *
 * Dependencies : None
 *
 * Notes        : Extracted from payload.config.ts so the behaviour can be
 *                tested without booting Payload.
 ************************************************************/

/**
 * Payload 3.90+ treats `serverURL` as the TRUSTED ORIGIN for external file
 * fetches and for deciding when to strip cookie/authorization headers. An empty
 * value silently removes that control, and the `csrf`/`cors` lists in
 * payload.config.ts only carry the WEB app origin — never the CMS's own — so
 * nothing else establishes it.
 *
 * infra/render/render.yaml DECLARES PAYLOAD_PUBLIC_SERVER_URL (it is a public origin, not a
 * secret), so the warning should never fire in the Render deploy. It is kept
 * because Render's precedence between a blueprint `value:` and a pre-existing
 * dashboard entry is not something this repo can prove — a boot log line makes
 * the outcome observable instead of assumed.
 *
 * Deliberately a warning rather than a throw: refusing to boot would convert a
 * defence-in-depth gap into an outage of a currently healthy service.
 */
/**
 * Declared explicitly rather than as `Pick<NodeJS.ProcessEnv, ...>`: `ProcessEnv`
 * carries an index signature, so `Pick` turns both keys into REQUIRED properties
 * and every caller — including `process.env` itself — fails to typecheck under
 * this repo's `exactOptionalPropertyTypes`.
 */
export type ServerURLEnv = {
  PAYLOAD_PUBLIC_SERVER_URL?: string | undefined
  NODE_ENV?: string | undefined
}

export function resolveServerURL(
  env: ServerURLEnv = process.env,
  warn: (message: string) => void = console.warn,
): string {
  const configured = env.PAYLOAD_PUBLIC_SERVER_URL ?? ''
  if (configured === '' && env.NODE_ENV === 'production') {
    warn(
      '[payload] PAYLOAD_PUBLIC_SERVER_URL is empty in production. serverURL is the ' +
        'trusted origin Payload 3.90+ checks for external file fetches and same-origin ' +
        'header stripping; set it (infra/render/render.yaml declares it) to restore that control.',
    )
  }
  return configured
}
