import { sql } from 'drizzle-orm'
import { db } from '../index'
import { readServiceDriftSnapshot } from './service-drift-snapshot'

export type {
  OfferDriftRow,
  OfferDriftSnapshot,
  ServiceCategoryDriftRow,
  ServiceDriftRow,
  ServiceDriftSnapshot,
} from './service-drift-snapshot'

export function getServiceDriftSnapshot() {
  return readServiceDriftSnapshot(async (statement) => {
    const { rows } = await db.execute(sql.raw(statement))
    return rows
  })
}
