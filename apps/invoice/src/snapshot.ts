import { invoiceIssueEventSchema } from '@rgss/types'
import { type InvoiceRecord, snapshotHash } from './contracts'

export async function loadSnapshot(files: R2Bucket, invoice: InvoiceRecord) {
  const object = await files.get(invoice.snapshot_key)
  if (!object) throw new Error('Invoice snapshot missing')
  const source = await object.text()
  if ((await snapshotHash(source)) !== invoice.snapshot_hash) {
    throw new Error('Invoice snapshot checksum does not match the register')
  }
  const snapshot = invoiceIssueEventSchema.parse(JSON.parse(source))
  if (snapshot.invoiceId !== invoice.id || snapshot.branchId !== invoice.branch_id) {
    throw new Error('Invoice snapshot does not match the register')
  }
  return snapshot
}
