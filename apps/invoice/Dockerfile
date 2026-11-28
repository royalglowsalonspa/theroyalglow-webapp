# syntax=docker/dockerfile:1
#
# Build approach (Bun monorepo + workspace deps → single bundled service)
# ----------------------------------------------------------------------
# This service depends on workspace packages (@rgss/types, @rgss/business,
# @rgss/errors, @rgss/logger) whose package.json `exports` point at raw TS
# source. Rather than ship the whole monorepo, we BUNDLE the service together
# with those @rgss/* packages into a single ESM file (tsup, platform=node,
# format=esm, target=node22). See tsup.config.ts:
#   - noExternal: /^@rgss\//   → workspace deps are INLINED into dist/node/index.js
#   - external:   runtime npm dependencies stay un-bundled and resolve from
#                 the invoicing workspace's locked production install.
#
# Stages:
#   1. builder  — full monorepo context + Bun; build only the Node renderer.
#   2. deps      — use the same lockfile for the filtered production install.
#   3. runtime   — keep the workspace and root module directories at their
#                 relative paths. Binds to $PORT, serves /healthz.
# ----------------------------------------------------------------------

# Use the Bun version declared in the repository's packageManager field.
FROM oven/bun:1.4.5 AS workspace
WORKDIR /repo
COPY . .

# ---------- Stage 1: builder (bundle the service) ----------
FROM workspace AS builder
RUN bun install --frozen-lockfile
RUN bun run --filter=@rgss/invoice build:node

# ---------- Stage 2: locked production dependencies ----------
FROM workspace AS deps
RUN bun install --frozen-lockfile --production --ignore-scripts --filter=@rgss/invoice

# ---------- Stage 3: runtime ----------
FROM node:26.12.1-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/invoice

# Bun's workspace dependency links refer to the root .bun store by relative path.
COPY --from=deps /repo/node_modules /app/node_modules
COPY --from=deps /repo/apps/invoice/node_modules ./node_modules
COPY --from=deps /repo/apps/invoice/package.json ./package.json
COPY --from=builder /repo/apps/invoice/dist/node ./dist/node

# Cloud Run injects PORT; the app binds to it. 8080 is the documented default.
EXPOSE 8080
CMD ["node", "dist/node/index.js"]
