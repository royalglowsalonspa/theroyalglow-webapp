# =============================================================================
# Dockerfile — Payload CMS v3 (apps/cms) for Koyeb free nano deployment
# =============================================================================
# Multi-stage build producing a lean standalone Next.js image (~200 MB).
# Stages: deps → builder → runner.
#
# Build context MUST be the REPO ROOT (not apps/cms/) because Bun workspaces
# hoist deps to root node_modules and Turborepo resolves packages/* from root.
#
# Usage (local test):
#   docker build -t rgss-cms -f apps/cms/Dockerfile .
#   docker run -p 3002:3002 --env-file apps/cms/.env.local rgss-cms
#
# On Koyeb: set Dockerfile path = apps/cms/Dockerfile, build context = /
# =============================================================================

# --- Stage 1: Install deps ---------------------------------------------------
FROM oven/bun:1.3.13-alpine AS deps

WORKDIR /app

# Copy workspace root manifests + lockfile for install
COPY package.json bun.lockb turbo.json ./

# Copy ALL workspace package.json files so Bun resolves workspace:* correctly
COPY apps/cms/package.json ./apps/cms/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/errors/package.json ./packages/errors/
COPY packages/business/package.json ./packages/business/
COPY packages/logger/package.json ./packages/logger/
COPY packages/ui/package.json ./packages/ui/

# Install all deps (frozen lockfile, production + dev for build)
RUN bun install --frozen-lockfile

# --- Stage 2: Build ----------------------------------------------------------
FROM oven/bun:1.3.13-alpine AS builder

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
# apps/cms may or may not have its own node_modules (hoisted workspaces).
# Ensure the path exists in deps stage so COPY doesn't fail.
RUN mkdir -p /app/apps/cms/node_modules
COPY --from=deps /app/packages ./packages

# Copy source code
COPY apps/cms ./apps/cms
COPY packages ./packages
COPY turbo.json package.json ./

# Ensure optional directories exist so COPY in runner stage never fails
# (public may be empty, migrations may not exist yet)
RUN mkdir -p /app/apps/cms/public /app/apps/cms/src/migrations

# Build CMS (next build with standalone output)
# NEXT_PUBLIC_* vars needed at build time must be passed as build args if used.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Payload needs DATABASE_URL at build time for schema introspection / type gen.
# We use a dummy value so the build succeeds; the real value is injected at runtime.
ENV DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy

RUN cd apps/cms && bun run build

# --- Stage 3: Production runner ----------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

# Install bun in runner for migration script (payload migrate uses bun/node)
COPY --from=oven/bun:1.3.13-alpine /usr/local/bin/bun /usr/local/bin/bun

# Security: run as non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (includes server.js + minimal node_modules)
COPY --from=builder /app/apps/cms/.next/standalone ./
# Copy static assets (not included in standalone)
COPY --from=builder /app/apps/cms/.next/static ./apps/cms/.next/static
# Copy public folder (dir guaranteed to exist in builder)
COPY --from=builder /app/apps/cms/public ./apps/cms/public

# Copy Payload migration files (needed for `payload migrate` at startup)
COPY --from=builder /app/apps/cms/src/migrations ./apps/cms/src/migrations
# payload.config is needed by the migrate command at runtime
COPY --from=builder /app/apps/cms/payload.config.ts ./apps/cms/payload.config.ts

# Sharp prebuilt binaries for image processing (Payload media)
# standalone doesn't always bundle platform-specific sharp binaries
RUN cd apps/cms && npm install --os=linux --cpu=x64 sharp@0.35.2 --ignore-scripts 2>/dev/null || true

USER nextjs

EXPOSE 3002

# Start: run Payload migrations (idempotent) then start the standalone server.
# `payload migrate` needs DATABASE_URL at runtime (real Neon connection).
# The standalone server.js is at apps/cms/server.js (monorepo standalone layout).
CMD ["sh", "-c", "cd apps/cms && bun run migrate 2>/dev/null; node server.js"]
