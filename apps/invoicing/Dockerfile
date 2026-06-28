# syntax=docker/dockerfile:1
#
# Build approach (Bun monorepo + workspace deps → single bundled service)
# ----------------------------------------------------------------------
# This service depends on workspace packages (@rgss/types, @rgss/business,
# @rgss/errors, @rgss/logger) whose package.json `exports` point at raw TS
# source. Rather than ship the whole monorepo, we BUNDLE the service together
# with those @rgss/* packages into a single ESM file (tsup, platform=node,
# format=esm, target=node22). See tsup.config.ts:
#   - noExternal: /^@rgss\//   → workspace deps are INLINED into dist/index.js
#   - external:   the heavy npm deps (@react-pdf/renderer, @aws-sdk/client-s3,
#                 hono, @hono/node-server, @sentry/node, react) stay un-bundled
#                 and are installed as runtime node_modules in the final image.
#
# Stages:
#   1. builder  — full monorepo context + Bun; install, then `bun run build`
#                 (tsup) to emit apps/invoicing/dist/index.js.
#   2. deps      — install ONLY the externalised prod deps against a minimal,
#                 generated package.json (small node_modules, no workspaces).
#   3. runtime   — node:22-slim; copy dist + minimal package.json + prod
#                 node_modules. Binds to $PORT, serves /healthz.
# ----------------------------------------------------------------------

# ---------- Stage 1: builder (bundle the service) ----------
FROM oven/bun:1.3.13 AS builder
WORKDIR /repo

# Copy the whole monorepo so workspace deps resolve, then install.
COPY . .
RUN bun install --frozen-lockfile

# Bundle apps/invoicing (+ inlined @rgss/* deps) into dist/.
RUN bun run --filter=@rgss/invoicing build

# ---------- Stage 2: prod deps (externals only) ----------
# A minimal package.json containing ONLY the externalised runtime deps keeps
# the final node_modules small and free of the monorepo/workspace machinery.
FROM node:22-slim AS deps
WORKDIR /app
RUN cat > package.json <<'JSON'
{
  "name": "@rgss/invoicing-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.700.0",
    "@hono/node-server": "^1.14.0",
    "@react-pdf/renderer": "^4.3.0",
    "@sentry/node": "^8.40.0",
    "hono": "^4.9.0",
    "react": "^19.1.0"
  }
}
JSON
RUN npm install --omit=dev --no-package-lock

# ---------- Stage 3: runtime ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Minimal package.json (type: module) + installed prod deps + bundled service.
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /repo/apps/invoicing/dist ./dist

# Cloud Run injects PORT; the app binds to it. 8080 is the documented default.
EXPOSE 8080
CMD ["node", "dist/index.js"]
