# Implementation Plan: Monorepo Scaffolding (Phase 0)

## Overview

Scaffold the complete Royal Glow Salon & Spa monorepo foundation using Turborepo + Bun workspaces. This plan follows strict dependency ordering: root config → leaf packages (types, logger) → dependent packages (errors, business, db) → apps (web, cms, docs) → tooling (Husky, env validation) → final verification. Each task produces specific files and ends with a passing typecheck/lint/build gate.

## Tasks

- [x] 1. Initialize root monorepo configuration
  - [x] 1.1 Create root `package.json` with Bun workspaces, ESM, and Turborepo scripts
    - Create `package.json` with `"name": "rgss-solutions"`, `"private": true`, `"type": "module"`, `"workspaces": ["apps/*", "packages/*", "docs"]`
    - Add root scripts: `build`, `dev`, `lint`, `typecheck`, `test`, `clean`, `prepare` (all delegating to Turborepo)
    - Add devDependencies: `turbo`, `typescript`, `@biomejs/biome`, `husky`, `lint-staged`
    - Add `lint-staged` config for `*.{ts,tsx,json,css}` → `biome check --write`
    - _Requirements: 1.1, 1.2, 1.6, 1.7_

  - [x] 1.2 Create `turbo.json` with task pipeline definitions
    - Define `build` task with `dependsOn: ["^build"]` and outputs `[".next/**", "dist/**"]`
    - Define `dev` task with `persistent: true`, `cache: false`, `dependsOn: ["^build"]`
    - Define `lint`, `typecheck`, `test` tasks with `dependsOn: ["^build"]`
    - Define `clean` task with `cache: false`
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 1.3 Create root `tsconfig.json` with strict TypeScript base configuration
    - Set `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noEmit: true`
    - Set `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "bundler"`
    - Set `esModuleInterop: true`, `skipLibCheck: true`, `forceConsistentCasingInFileNames: true`, `resolveJsonModule: true`, `isolatedModules: true`, `verbatimModuleSyntax: true`
    - Exclude `node_modules`, `dist`, `.next`
    - _Requirements: 8.1, 8.5_

  - [x] 1.4 Create `biome.json` with Ultracite-compatible lint and format rules
    - Enable import sorting, space indent (2), line width 100
    - Set single quotes, no semicolons, trailing commas
    - Enable `noExplicitAny: "error"`, `noUnusedVariables: "error"`, `noUnusedImports: "error"`, `useConst: "error"`, `noNonNullAssertion: "warn"`
    - Ignore `node_modules`, `.next`, `dist`, `migrations`, `*.gen.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [x] 1.5 Create `.gitignore` with monorepo exclusions
    - Ignore `node_modules/`, `.next/`, `dist/`, `.env.local`, `.env*.local`, `bun.lockb` (optional), `.turbo/`, `*.tsbuildinfo`
    - _Requirements: 7.7_

- [x] 2. Checkpoint - Verify root configuration
  - Run `bun install` to generate `bun.lockb` and verify workspace resolution. Ensure all tests pass, ask the user if questions arise.

- [x] 3. Create `packages/types/` — shared Zod schemas
  - [x] 3.1 Scaffold `packages/types/` package structure
    - Create `packages/types/package.json` with `"name": "@rgss/types"`, dependency on `zod`, and `"exports"` pointing to `./src/index.ts`
    - Create `packages/types/tsconfig.json` extending root config
    - Create `packages/types/src/index.ts` barrel file re-exporting from `./api`
    - _Requirements: 10.1, 10.4, 15.1_

  - [x] 3.2 Implement API response Zod schemas in `packages/types/src/api.ts`
    - Implement `apiSuccessSchema<T>` generic factory with `success: z.literal(true)`, `data: T`, optional `meta` (page, totalPages, totalCount)
    - Implement `apiErrorResponseSchema` with `success: z.literal(false)`, `error` object containing `code`, `message`, `statusCode`, `requestId`, optional `details`, optional `retryable`
    - Export TypeScript types `ApiSuccessResponse<T>` and `ApiErrorResponse` inferred from schemas
    - _Requirements: 10.2, 10.3_

  - [ ] 3.3 Write property test for API response schemas
    - **Property 1: API Response Schema Validation Round-Trip**
    - **Validates: Requirements 10.2, 10.3**
    - Create `packages/types/src/__tests__/api.property.test.ts` using `vitest` + `fast-check`
    - Test that any valid data wrapped in success shape passes validation, and invalid shapes are rejected
    - Test that valid error objects pass error schema, and objects missing required fields are rejected

- [x] 4. Create `packages/logger/` — structured JSON logger
  - [x] 4.1 Scaffold `packages/logger/` package and implement logger
    - Create `packages/logger/package.json` with `"name": "@rgss/logger"`, zero internal dependencies
    - Create `packages/logger/tsconfig.json` extending root config
    - Create `packages/logger/src/index.ts` exporting `createLogger(config: { service: string, environment: string })`
    - Logger instance provides `debug`, `info`, `warn`, `error`, `fatal` methods
    - Each method outputs JSON with `level`, `message`, `service`, `environment`, `timestamp` (ISO 8601 UTC), optional `data`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 15.5_

  - [ ] 4.2 Write property test for structured logger
    - **Property 5: Structured Logger JSON Output**
    - **Validates: Requirements 13.2, 13.3, 13.4**
    - Create `packages/logger/src/__tests__/logger.property.test.ts` using `vitest` + `fast-check`
    - Test that for any valid config and log call, output is JSON-parseable with correct fields

- [x] 5. Create `packages/errors/` — AppError class and codes registry
  - [x] 5.1 Scaffold `packages/errors/` package structure
    - Create `packages/errors/package.json` with `"name": "@rgss/errors"`, dependency on `@rgss/types`
    - Create `packages/errors/tsconfig.json` extending root config
    - Create `packages/errors/src/index.ts` barrel file re-exporting from `./app-error` and `./codes`
    - _Requirements: 11.1, 11.5, 15.2_

  - [x] 5.2 Implement error codes registry in `packages/errors/src/codes.ts`
    - Export `ERROR_CODES` const object with all generic codes: `VALIDATION_ERROR`, `INTERNAL_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `METHOD_NOT_ALLOWED`, `TIMEOUT`, `UPSTREAM_ERROR`, `SERVICE_UNAVAILABLE`
    - Export `ErrorCode` type derived from the const object values
    - _Requirements: 11.3_

  - [x] 5.3 Implement `AppError` class in `packages/errors/src/app-error.ts`
    - Create `AppError` extending `Error` with properties: `code`, `statusCode`, `isOperational` (default true), `retryable` (default false), `details`
    - Set `name = 'AppError'` and support `cause` via `Error` constructor options
    - Export factory functions: `notFound()`, `forbidden()`, `badRequest()`, `conflict()`, `serviceUnavailable()`
    - _Requirements: 11.2, 11.4_

  - [ ] 5.4 Write property test for AppError construction
    - **Property 2: AppError Construction Invariants**
    - **Validates: Requirements 11.2, 11.4**
    - Create `packages/errors/src/__tests__/app-error.property.test.ts` using `vitest` + `fast-check`
    - Test instanceof, name, field preservation, defaults, and factory function outputs

- [x] 6. Create `packages/business/` — currency and date utilities
  - [x] 6.1 Scaffold `packages/business/` package structure
    - Create `packages/business/package.json` with `"name": "@rgss/business"`, dependencies on `@rgss/types` and `@rgss/errors`
    - Create `packages/business/tsconfig.json` extending root config
    - Create `packages/business/src/index.ts` barrel file
    - _Requirements: 12.1, 12.4, 15.4_

  - [x] 6.2 Implement `formatINR()` in `packages/business/src/utils/currency.ts`
    - Convert paise (integer) to rupees and format with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`
    - Handle zero, positive integers, and large values up to 99,99,99,999 paise with Indian lakh/crore grouping
    - _Requirements: 12.2, 12.5_

  - [x] 6.3 Implement `formatDateIN()` in `packages/business/src/utils/date.ts`
    - Format Date objects as DD/MM/YYYY using `Intl.DateTimeFormat('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })`
    - _Requirements: 12.3_

  - [ ] 6.4 Write property test for Indian currency formatting
    - **Property 3: Indian Currency Formatting**
    - **Validates: Requirements 12.2, 12.5**
    - Create `packages/business/src/__tests__/currency.property.test.ts` using `vitest` + `fast-check`
    - Test that output starts with `₹`, has 2 decimal digits, represents correct value, uses Indian grouping

  - [ ] 6.5 Write property test for Indian date formatting
    - **Property 4: Indian Date Formatting Round-Trip**
    - **Validates: Requirements 12.3**
    - Create `packages/business/src/__tests__/date.property.test.ts` using `vitest` + `fast-check`
    - Test that output matches DD/MM/YYYY pattern with correct day/month/year components

- [x] 7. Create `packages/db/` — Drizzle ORM + Neon client setup
  - [x] 7.1 Scaffold `packages/db/` package with Drizzle and Neon configuration
    - Create `packages/db/package.json` with `"name": "@rgss/db"`, dependencies on `drizzle-orm`, `@neondatabase/serverless`, `@rgss/types`
    - Add devDependency on `drizzle-kit`
    - Add scripts: `generate` (drizzle-kit generate), `migrate` (drizzle-kit migrate)
    - Create `packages/db/tsconfig.json` extending root config
    - Create `packages/db/drizzle.config.ts` reading `DATABASE_URL_UNPOOLED`, outputting to `./migrations`
    - Create `packages/db/src/index.ts` exporting configured Drizzle client using pooled Neon connection
    - Create `packages/db/src/schema/index.ts` barrel file (empty, ready for table exports)
    - Create `packages/db/migrations/` directory with `.gitkeep`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 15.3_

- [x] 8. Checkpoint - Verify all packages build and typecheck
  - Run `bun run typecheck` from root. All packages should resolve dependencies correctly with zero type errors. Ensure all tests pass, ask the user if questions arise.

- [x] 9. Set up `apps/web/` — Next.js 16.2.6 application
  - [x] 9.1 Scaffold `apps/web/` with Next.js 16.2.6 and package configuration
    - Create `apps/web/package.json` with `"name": "@rgss/web"`, Next.js 16.2.6, React 19, scripts for `dev`, `build`, `start`, `typecheck`, `lint`
    - Add dependencies on `@rgss/business`, `@rgss/db`, `@rgss/types`, `@rgss/errors`, `@rgss/logger`
    - Add dependencies: `tailwindcss`, `@tailwindcss/postcss`, `clsx`, `tailwind-merge`, `zod`, `@t3-oss/env-nextjs`
    - Create `apps/web/next.config.ts` with typed configuration (transpilePackages for internal packages)
    - Create `apps/web/tsconfig.json` extending root with Next.js options, path alias `@/` → `./src/`
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7, 15.6_

  - [x] 9.2 Create Tailwind CSS v4 globals with Royal Glow design tokens
    - Create `apps/web/src/styles/globals.css` with `@import "tailwindcss"` and `@theme` block
    - Define all brand colors, neutrals, functional colors, accent colors as CSS custom properties
    - Define font families (`--font-display`, `--font-sans`, `--font-ui`), radii, shadows, container width
    - Add `@layer base` with shadcn/ui CSS variable mappings (--background, --foreground, --primary, etc.)
    - Add focus-visible styles, prefers-reduced-motion media query
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [x] 9.3 Create root layout and placeholder page
    - Create `apps/web/src/app/layout.tsx` with metadata, font imports, globals.css import
    - Create `apps/web/src/app/page.tsx` as a simple placeholder (Server Component)
    - Ensure `params` and `searchParams` follow Next.js 16 Promise-based conventions
    - _Requirements: 2.3, 2.4_

  - [x] 9.4 Configure shadcn/ui with `components.json` and `cn()` utility
    - Create `apps/web/components.json` with `style: "new-york"`, `rsc: true`, correct aliases and Tailwind CSS path
    - Create `apps/web/src/lib/utils.ts` exporting `cn()` function (clsx + tailwind-merge)
    - Create `apps/web/src/components/ui/` directory with `.gitkeep`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 10. Set up placeholder applications (cms, docs)
  - [x] 10.1 Create `apps/cms/` and `docs/` placeholder packages
    - Create `apps/cms/package.json` with `"name": "@rgss/cms"` and minimal scripts
    - Create `apps/cms/README.md` documenting this is a Phase 8 placeholder for Payload CMS
    - Create `docs/package.json` with `"name": "@rgss/docs"` and minimal scripts
    - Create `docs/README.md` documenting this is a Phase 10 placeholder for Fumadocs
    - _Requirements: 14.1, 14.2, 14.3_

- [x] 11. Set up environment variable validation
  - [x] 11.1 Create `apps/web/src/env.ts` with t3-env + Zod validation
    - Define server-side variables (DATABASE_URL, BETTER_AUTH_SECRET, API keys, webhook secrets) with appropriate Zod schemas
    - Define client-side variables (NEXT_PUBLIC_* prefixed) with appropriate Zod schemas
    - Ensure build fails with descriptive error if any required variable is missing or malformed
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 11.2 Create `.env.example` files documenting all variables
    - Create root `.env.example` with all 55 variables documented with placeholder values and descriptions
    - Create `apps/web/.env.example` with web-specific variables
    - _Requirements: 7.5, 7.6_

- [x] 12. Set up Husky + lint-staged pre-commit hooks
  - [x] 12.1 Configure Husky and lint-staged for pre-commit quality gate
    - Initialize Husky with `bunx husky init`
    - Create `.husky/pre-commit` hook that runs `bunx lint-staged`
    - Verify `prepare` script in root `package.json` runs `husky`
    - lint-staged config runs `biome check --write` on staged `.ts`, `.tsx`, `.json`, `.css` files
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 13. Final checkpoint - Full build verification
  - Run `bun install`, `bun run typecheck`, `bun run lint`, and `bun run build` from root. All must pass with zero errors. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The dependency order ensures no package references an unbuilt dependency: types/logger (leaves) → errors → business → db → web
- All packages use `"type": "module"` and TypeScript strict mode
- Vitest + fast-check are added as devDependencies in packages that have property tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["3.1", "4.1"] },
    { "id": 2, "tasks": ["3.2", "4.2"] },
    { "id": 3, "tasks": ["3.3", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3"] },
    { "id": 5, "tasks": ["5.4", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 7, "tasks": ["6.4", "6.5"] },
    { "id": 8, "tasks": ["9.1"] },
    { "id": 9, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 10, "tasks": ["9.4", "11.1"] },
    { "id": 11, "tasks": ["11.2", "12.1"] }
  ]
}
```
