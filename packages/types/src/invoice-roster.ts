import { z } from 'zod'

export const INVOICE_STAFF_ROSTER_MAX_BYTES = 64 * 1024
const branchId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)
export const invoiceStaffRosterEmail = z
  .email()
  .max(254)
  .regex(/^[a-z0-9.+_-]+@gmail\.com$/)
const assignment = z.strictObject({
  branchId,
  email: invoiceStaffRosterEmail,
  role: z.enum(['owner', 'manager']),
})

export const invoiceStaffRosterSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('staff.roster'),
    source: z.string().min(1).max(32),
    revision: z.int().positive(),
    branches: z.array(branchId).max(200),
    assignments: z.array(assignment).max(400),
  })
  .superRefine(({ branches, assignments }, ctx) => {
    const branchIds = new Set(branches)
    if (branchIds.size !== branches.length) {
      ctx.addIssue({ code: 'custom', path: ['branches'], message: 'Duplicate branch' })
    }
    const roles = new Set<string>()
    const staffEmails = new Set<string>()
    for (const [index, staff] of assignments.entries()) {
      const role = `${staff.branchId}:${staff.role}`
      const email = `${staff.branchId}:${staff.email}`
      if (!branchIds.has(staff.branchId) || roles.has(role) || staffEmails.has(email)) {
        ctx.addIssue({
          code: 'custom',
          path: ['assignments', index],
          message: 'Duplicate assignment or unknown branch',
        })
      }
      roles.add(role)
      staffEmails.add(email)
    }
  })

export type InvoiceStaffRoster = z.infer<typeof invoiceStaffRosterSchema>
