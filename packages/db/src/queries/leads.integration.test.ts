import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { branch } from '../schema/branch'
import { lead } from '../schema/lead'
import { auditLog } from '../schema/system'
import { isLiveDbAvailable, queryRow } from '../test/live-db'
import { addLeadNote, getLeadById, getLeadNotes, moveLead, updateLead } from './leads'

const run = randomUUID().slice(0, 8)
const source = `lead_it_${run}_source`
const destination = `lead_it_${run}_destination`
const shutdown = `lead_it_${run}_shutdown`
const openLead = `lead_it_${run}_open`
const bookedLead = `lead_it_${run}_booked`
const rollbackLead = `lead_it_${run}_rollback`
const branchIds = [source, destination, shutdown]
const leadIds = [openLead, bookedLead, rollbackLead]
const destinationName = 'Lead IT branch B'
let ownerId: string

describe.skipIf(!isLiveDbAvailable())('lead moves on disposable Postgres', () => {
  beforeAll(async () => {
    const owner = await queryRow<{ id: string }>(
      sql`select owner_user_id as id from branch limit 1`,
    )
    if (!owner) throw new Error('The disposable database needs an existing branch Owner.')
    ownerId = owner.id
    const number = 30_000 + Math.floor(Math.random() * 15_000)
    const fixture = {
      addressLine1: 'Test only',
      pincode: '560035',
      phone: '9999999999',
      ownerUserId: ownerId,
    }
    const makeBranch = (
      id: string,
      offset: number,
      name: string,
      status: (typeof branch.$inferSelect)['status'],
    ) => ({
      ...fixture,
      id,
      name,
      status,
      number: number + offset,
      code: `LIT${run}${offset}`,
      invoicePrefix: `B${(number + offset).toString(36).toUpperCase()}`,
    })
    await db.batch([
      db
        .insert(branch)
        .values([
          makeBranch(source, 0, 'Lead IT branch A', 'operational'),
          makeBranch(destination, 1, destinationName, 'opens_soon'),
          makeBranch(shutdown, 2, 'Lead IT closed branch', 'shutdown'),
        ]),
      db.insert(lead).values(
        leadIds.map((id): typeof lead.$inferInsert => ({
          id,
          branchId: source,
          name: 'Test lead',
          phone: '+919999999999',
          assignedTo: ownerId,
          status: id === bookedLead ? 'booked' : 'follow_up',
        })),
      ),
    ])
  })

  afterAll(async () => {
    await db.batch([
      db
        .delete(auditLog)
        .where(and(eq(auditLog.entityType, 'lead'), inArray(auditLog.entityId, leadIds))),
      db.delete(lead).where(inArray(lead.id, leadIds)),
      db.delete(branch).where(inArray(branch.id, branchIds)),
    ])
  })

  it('moves an open lead once and carries its notes without retaining source access', async () => {
    const note = await addLeadNote(
      openLead,
      source,
      ownerId,
      'Customer requested a different branch',
    )
    expect(note).not.toBeNull()
    const input = { id: openLead, branchId: source, toBranchId: destination, actorId: ownerId }

    const attempts = await Promise.all([moveLead(input), moveLead(input)])

    expect(attempts).toEqual(
      expect.arrayContaining([
        { ok: true, destination: { id: destination, name: destinationName } },
        { ok: false, reason: 'not_found' },
      ]),
    )
    expect(await getLeadById(openLead, source)).toBeNull()
    expect(await getLeadById(openLead, destination)).toMatchObject({ assignedTo: null })
    expect(await getLeadNotes(openLead, source)).toEqual([])
    expect(await getLeadNotes(openLead, destination)).toMatchObject([{ id: note?.id }])
    expect(await addLeadNote(openLead, source, ownerId, 'Stale source tab')).toBeNull()
    expect(await updateLead(openLead, source, 'follow_up', { status: 'booked' })).toBeNull()

    const records = await db.select().from(auditLog).where(eq(auditLog.entityId, openLead))
    expect(records).toMatchObject([
      {
        actorId: ownerId,
        action: 'update',
        branchId: source,
        oldValues: { branchId: source },
        newValues: { branchId: destination, assignedTo: null },
      },
    ])
  })

  it('refuses a move to the same, missing or shut-down branch and refuses a booked lead', async () => {
    for (const toBranchId of [source, `${source}_unknown`, shutdown]) {
      expect(
        await moveLead({ id: rollbackLead, branchId: source, toBranchId, actorId: ownerId }),
      ).toEqual({ ok: false, reason: 'destination_unavailable' })
    }
    expect(
      await moveLead({
        id: bookedLead,
        branchId: source,
        toBranchId: destination,
        actorId: ownerId,
      }),
    ).toEqual({ ok: false, reason: 'status_conflict' })
    expect(await getLeadById(bookedLead, source)).toMatchObject({ assignedTo: ownerId })
  })

  it('rolls back the assignment and branch changes if the audit cannot be written', async () => {
    await expect(
      moveLead({
        id: rollbackLead,
        branchId: source,
        toBranchId: destination,
        actorId: `${source}_missing_actor`,
      }),
    ).rejects.toThrow()

    expect(await getLeadById(rollbackLead, source)).toMatchObject({ assignedTo: ownerId })
    expect(await getLeadById(rollbackLead, destination)).toBeNull()
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, rollbackLead))).toEqual([])
  })
})
