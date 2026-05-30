import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

// biome-ignore lint/style/noNonNullAssertion: Required env var validated at app startup
const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql)
