/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : lib/admin/toast
 * Scope        : Admin — Toast helpers
 *
 * Description  : Thin wrappers over Sonner that enforce the redesign's
 *                notification contract: a SUCCESS toast names the completed
 *                action and auto-dismisses after 5 s (polite); an ERROR toast
 *                names the action and the reason and PERSISTS until dismissed
 *                (assertive). Reduced-motion entrance/exit suppression is
 *                handled by the shared reduced-motion base rule in
 *                `@rgss/ui/theme.css`.
 *
 * Responsibilities :
 * - `toast.success(action)` — 5 s auto-dismiss confirmation (Req 16.1, 16.3)
 * - `toast.error(action, reason?)` — persistent failure notice (Req 16.2, 16.4)
 *
 * Tech Stack   : TypeScript, sonner
 * Layer        : Presentation (helper, no I/O, no business logic)
 *
 * Dependencies : sonner
 *
 * Notes        : A task-BLOCKING failure must NOT rely on the toast as its sole
 *                channel — callers should also surface a persistent in-page
 *                inline alert (the `ErrorState` presenter) so the failure
 *                survives toast dismissal (Req 16.9).
 *
 * Requirements : 16.1, 16.2, 16.3, 16.4
 ************************************************************/

import { toast as sonnerToast } from 'sonner'

/** Auto-dismiss window for success toasts (ms). */
const SUCCESS_DURATION_MS = 5000

export const toast = {
  /**
   * Show a success toast naming the completed `action`. Auto-dismisses after
   * 5 s; remains keyboard-dismissable while shown.
   */
  success(action: string): void {
    sonnerToast.success(action, { duration: SUCCESS_DURATION_MS })
  },

  /**
   * Show an error toast naming the failed `action` and, when supplied, the
   * `reason`. Persists until the user dismisses it.
   */
  error(action: string, reason?: string): void {
    sonnerToast.error(reason ? `${action}: ${reason}` : action, {
      duration: Number.POSITIVE_INFINITY,
    })
  },
}
