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
  buildCrossSubdomainAdvanced,
  type CrossSubdomainAdvanced,
  resolveCookieDomain,
  SHARED_COOKIE_DOMAIN,
} from './cookie-domain'
