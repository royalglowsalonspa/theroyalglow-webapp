/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : ui/slide-over-panel (compatibility shim)
 * Scope        : Admin — Right-edge detail panel (re-export)
 *
 * Description  : Backwards-compatibility shim. The hand-rolled SlideOverPanel
 *                was refactored to compose the shadcn `Sheet` and now lives in
 *                `./detail-sheet` as `DetailSheet`. This module re-exports it
 *                under the original `SlideOverPanel` / `SlideOverPanelProps`
 *                names so existing import sites keep working unchanged.
 *
 * Tech Stack   : TypeScript, React
 * Layer        : Presentation (re-export shim)
 *
 * Dependencies : ./detail-sheet
 *
 * Notes        : Prefer importing `DetailSheet` directly in new code.
 ************************************************************/

export type { DetailSheetProps as SlideOverPanelProps } from './detail-sheet'
export { DetailSheet as SlideOverPanel } from './detail-sheet'
