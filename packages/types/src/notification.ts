import { z } from 'zod'

// A Web Push subscription as produced by the browser PushManager.
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
