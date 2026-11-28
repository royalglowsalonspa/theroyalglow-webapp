import { z } from 'zod'

const tender = z.strictObject({
  method: z.enum(['cash', 'upi', 'card']),
  amountPaise: z.int().positive().max(2_147_483_647),
})

export const splitCheckoutTendersSchema = z
  .tuple([tender, tender])
  .refine(
    ([first, second]) => first.method !== second.method,
    'Choose two different payment methods.',
  )

export type SplitCheckoutTenders = z.infer<typeof splitCheckoutTendersSchema>
