import { dash } from '@better-auth/infra'
import { account, session, user, verification } from '@rgss/db/schema'
import type { BetterAuthOptions } from 'better-auth'
import { oneTap } from 'better-auth/plugins'

export const authDatabaseSchema = { user, session, account, verification }

/** Schema-affecting options shared by the server and the database-free upgrade gate. */
export function createAuthSchemaOptions(google: { clientId: string; clientSecret: string }) {
  return {
    user: {
      additionalFields: {
        // Server-controlled: clients must never assign their own RBAC role.
        role: { type: 'string', required: false, input: false, defaultValue: 'customer' },
      },
    },
    socialProviders: { google },
    plugins: [dash(), oneTap()],
  } satisfies BetterAuthOptions
}
