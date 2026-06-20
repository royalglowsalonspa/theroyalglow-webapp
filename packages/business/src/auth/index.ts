/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : business/auth/index
 * Scope        : Business Logic (pure)
 *
 * Description  : Barrel export for pure auth-config helpers shared by apps/web
 *                and apps/admin (cross-subdomain cookie derivation).
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Notes        : Pure — no I/O, no framework deps.
 ************************************************************/
export {
  type CrossSubdomainAdvanced,
  SHARED_COOKIE_DOMAIN,
  buildCrossSubdomainAdvanced,
  resolveCookieDomain,
} from './cookie-domain'
