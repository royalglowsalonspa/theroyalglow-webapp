import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Prefer unpooled (direct) connection for migrations, fall back to pooled
    // biome-ignore lint/style/noNonNullAssertion: Required at migration time
    url: (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)!,
  },
})
