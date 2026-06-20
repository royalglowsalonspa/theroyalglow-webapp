/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ui/index
 * Scope        : Shared UI Package
 *
 * Description  : Barrel export for the @rgss/ui package — the single source
 *                of truth for shadcn/ui primitives, the cn() helper, and the
 *                Tailwind v4 design-token theme consumed by apps/web and
 *                apps/admin.
 *
 * Responsibilities :
 * - Re-export the shared cn() class-name helper
 * - Re-export shadcn/ui primitives as they are added under
 *   ./components/ui (e.g. export * from './components/ui/button')
 *
 * Features / Functionality :
 * - Single import path for shared UI utilities
 *
 * Tech Stack   : TypeScript, React, Tailwind CSS v4
 * Layer        : Shared Package (UI)
 *
 * Dependencies : ./lib/utils
 *
 * Notes        : Design-token theme lives in ./styles/theme.css and is
 *                imported by each app's global stylesheet (not re-exported
 *                from this TS barrel). shadcn/ui primitives are added under
 *                src/components/ui and re-exported here as they land.
 ************************************************************/

export { cn } from './lib/utils'
