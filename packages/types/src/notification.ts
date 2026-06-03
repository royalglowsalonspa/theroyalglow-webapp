/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : notification (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for Web Push subscriptions and
 *                notification read-marking.
 *
 * Responsibilities :
 * - Validate push subscription registration (endpoint + keys)
 * - Validate mark-as-read requests (specific IDs or all)
 *
 * Features / Functionality :
 * - pushSubscribeSchema — browser PushManager subscription data
 * - markReadSchema — batch or full mark-read
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : None
 ************************************************************/
import { z } from 'zod'

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>

// Mark notifications read. Omit `ids` to mark all of the caller's notifications read.
export const markReadSchema = z.object({
  ids: z.array(z.string().min(1)).optional(),
})
export type MarkReadInput = z.infer<typeof markReadSchema>
