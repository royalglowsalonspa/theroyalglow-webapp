# Requirements Document

## Introduction

Phase 0 foundation scaffolding for the Royal Glow Salon & Spa monorepo. This spec covers the complete project structure setup using Turborepo + Bun workspaces, including the Next.js 16 web application, shared packages (db, business, types, errors, logger), tooling configuration (Biome, Husky, TypeScript strict), design token integration (Tailwind CSS v4 + shadcn/ui), and environment variable validation. The goal is a fully buildable, lintable, type-safe monorepo skeleton that all subsequent phases build upon.

## Glossary

- **Monorepo**: A single Git repository containing multiple applications and shared packages managed by Turborepo and Bun workspaces
- **Turborepo**: A build system for JavaScript/TypeScript monorepos that provides task pipeline orchestration, caching, and dependency-aware execution
- **Bun_Workspaces**: Bun's native workspace feature that resolves inter-package dependencies within the monorepo via the `workspaces` field in root `package.json`
- **App_Router**: Next.js routing paradigm where file-system routes live under `app/` and support React Server Components, layouts, and async params/searchParams
- **Design_Tokens**: Named CSS custom properties (colors, fonts, radii, shadows, spacing) defined in Tailwind CSS v4 `@theme` block, sourced from the DESIGN.md specification
- **Biome**: A fast all-in-one linter and formatter for JavaScript/TypeScript that replaces ESLint and Prettier
- **Ultracite**: A Biome configuration preset providing strict, opinionated rules for TypeScript projects
- **Husky**: A Git hooks manager that runs scripts (lint-staged) on pre-commit
- **lint_staged**: A tool that runs linters only on staged Git files, used with Husky for pre-commit quality gates
- **t3_env**: The `@t3-oss/env-nextjs` library that validates environment variables at build time using Zod schemas, failing the build if any required variable is missing or malformed
- **Drizzle_ORM**: A TypeScript-first ORM that generates SQL migrations and provides type-safe query builders, compatible with edge runtimes (no binary dependencies)
- **Neon_Client**: The `@neondatabase/serverless` driver for connecting to Neon PostgreSQL over HTTP or WebSocket from edge environments
- **AppError**: A custom Error subclass in `packages/errors/` carrying structured fields (code, statusCode, isOperational, retryable, details) for consistent error handling
- **Error_Codes_Registry**: A centralized `const` object in `packages/errors/codes.ts` mapping all machine-readable error code strings used across the application
- **Structured_Logger**: A JSON-formatted logger in `packages/logger/` that outputs machine-parseable log lines with level, message, service, environment, timestamp, and data fields
- **shadcn_ui**: A component library built on Radix UI primitives, installed as source files into the project (not an npm dependency), configured via `components.json`
- **Paise**: The smallest unit of Indian Rupee (1 INR = 100 paise); all monetary values are stored and computed as integers in paise to avoid floating-point errors
- **Indian_Date_Format**: DD/MM/YYYY date representation using `Intl.DateTimeFormat('en-IN')`
- **Indian_Numbering**: Currency formatting with lakh/crore grouping (e.g., ₹1,00,000.00) using `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`

## Requirements

### Requirement 1: Root Monorepo Configuration

**User Story:** As a developer, I want a properly configured monorepo root with Bun workspaces and Turborepo pipeline, so that all apps and packages resolve dependencies correctly and build/lint/test tasks execute in the correct order.

#### Acceptance Criteria

1. THE Monorepo SHALL have a root `package.json` with `"workspaces"` field listing `["apps/*", "packages/*", "docs"]`
2. THE Monorepo SHALL use Bun as the package manager with a `bun.lockb` lockfile
3. THE Monorepo SHALL have a `turbo.json` defining task pipelines for `build`, `dev`, `lint`, `typecheck`, and `test`
4. WHEN the `build` pipeline is executed, THE Turborepo SHALL resolve package dependencies so that `packages/*` build before `apps/*`
5. WHEN the `dev` pipeline is executed, THE Turborepo SHALL run all app dev servers in parallel with persistent mode enabled
6. THE Monorepo SHALL set `"type": "module"` in the root `package.json` to enforce ESM across all packages
7. THE Monorepo SHALL include root-level scripts for `build`, `dev`, `lint`, `typecheck`, `test`, and `clean` that delegate to Turborepo

### Requirement 2: Next.js Web Application Setup

**User Story:** As a developer, I want the `apps/web/` application scaffolded with Next.js 16.2.6 using App Router, so that I have a working development server with correct TypeScript configuration and route structure.

#### Acceptance Criteria

1. THE Web_App SHALL use Next.js version 16.2.6 with the App Router paradigm
2. THE Web_App SHALL have a `next.config.ts` file exporting a typed configuration object
3. THE Web_App SHALL have an `app/` directory with a root `layout.tsx` and `page.tsx` that render without errors
4. THE Web_App SHALL configure `params` and `searchParams` as Promise types in all page components, following Next.js 16 conventions
5. THE Web_App SHALL have a `package.json` with `"name": "@rgss/web"` and scripts for `dev`, `build`, `start`, and `typecheck`
6. THE Web_App SHALL extend the root TypeScript configuration with strict mode enabled and path aliases configured (e.g., `@/` mapping to `src/`)
7. WHEN `bun run dev` is executed in `apps/web/`, THE Web_App SHALL start a development server on port 3000

### Requirement 3: Tailwind CSS v4 with Design Tokens

**User Story:** As a developer, I want Tailwind CSS v4 configured with all Royal Glow design tokens, so that I can use brand colors, fonts, radii, and shadows as utility classes throughout the application.

#### Acceptance Criteria

1. THE Web_App SHALL use Tailwind CSS version 4 with the `@theme` block syntax for token definition
2. THE Web_App SHALL define all brand color tokens: `royal-gold` (#F4E09B), `deep-gold` (#C8A961), `warm-gold` (#F4E09B), `warm-stone` (#D4C5A9), `warm-cream` (#FFF8E7), `golden-mist` (#FFF3D4)
3. THE Web_App SHALL define all neutral color tokens: `canvas-white` (#FFFFFF), `cocoa-dark` (#1A0F0A), `rich-chocolate` (#2D1810), `warm-gray` (#3D2E1F), `dusty-gray` (#8C8C8C), `outline-gray` (#CCCCCC), `cloud-gray` (#F4F5F9)
4. THE Web_App SHALL define functional color tokens: `success` (#3F7D5C), `warning` (#C8A961), `error` (#B5482E)
5. THE Web_App SHALL define accent color token: `accent-pink` (#F8C8D8)
6. THE Web_App SHALL define font family tokens: `--font-display` (Cabinet Grotesk, weight 900), `--font-sans` (Clash Grotesk, weight 400), `--font-ui` (Plus Jakarta Sans, weight 700)
7. THE Web_App SHALL define radius tokens: `--radius-cards` (6px), `--radius-buttons` (8px), `--radius-pill` (9999px)
8. THE Web_App SHALL define shadow tokens: `--shadow-card-hover` and `--shadow-elevated` matching the DESIGN.md specification
9. THE Web_App SHALL define the layout token `--container-rg` (1278px) for page max-width
10. WHEN a developer uses `bg-royal-gold` or `text-cocoa-dark` in a component, THE Tailwind_CSS SHALL resolve the class to the correct hex value without additional configuration

### Requirement 4: shadcn/ui Component Library Initialization

**User Story:** As a developer, I want shadcn/ui initialized with Radix primitives and configured for the Royal Glow design system, so that I can add accessible UI components that match the brand.

#### Acceptance Criteria

1. THE Web_App SHALL have a `components.json` configuration file for shadcn/ui with the correct style, RSC support, and Tailwind CSS path
2. THE Web_App SHALL have a `components/ui/` directory ready to receive shadcn/ui component source files
3. THE Web_App SHALL have a `lib/utils.ts` file exporting the `cn()` utility function (clsx + tailwind-merge)
4. THE Web_App SHALL configure shadcn/ui to use the Royal Glow color tokens as CSS variables for its theming system
5. WHEN a shadcn/ui component is added via CLI, THE Web_App SHALL place the component source file in `components/ui/` with correct import paths

### Requirement 5: Biome and Ultracite Linting Configuration

**User Story:** As a developer, I want Biome configured with Ultracite rules at the monorepo root, so that all code is consistently formatted and linted without needing ESLint or Prettier.

#### Acceptance Criteria

1. THE Monorepo SHALL have a root `biome.json` (or `biome.jsonc`) configuration file with Ultracite-compatible rules
2. THE Biome_Config SHALL enforce single quotes, no semicolons, and trailing commas in multi-line expressions
3. THE Biome_Config SHALL enable import sorting
4. THE Biome_Config SHALL enable TypeScript-specific lint rules that disallow `any` types and unused variables
5. WHEN `bun run lint` is executed at the root, THE Biome SHALL check all `.ts` and `.tsx` files across apps and packages
6. THE Biome_Config SHALL exclude `node_modules`, `.next`, `dist`, and generated files from linting

### Requirement 6: Husky and lint-staged Pre-commit Hooks

**User Story:** As a developer, I want pre-commit hooks that automatically format and lint staged files, so that no poorly formatted or linted code enters the repository.

#### Acceptance Criteria

1. THE Monorepo SHALL have Husky installed with a `.husky/pre-commit` hook file
2. WHEN a developer runs `git commit`, THE Husky_Hook SHALL execute lint-staged on all staged files
3. THE lint_staged_Config SHALL run `biome check --write` on staged `.ts`, `.tsx`, `.json`, and `.css` files
4. IF lint-staged detects unfixable errors, THEN THE Pre_Commit_Hook SHALL abort the commit with a non-zero exit code
5. THE Husky_Hook SHALL be installed automatically when a new developer runs `bun install` via the `prepare` script in root `package.json`

### Requirement 7: Environment Variable Validation

**User Story:** As a developer, I want all environment variables validated at build time with descriptive error messages, so that missing or malformed configuration is caught before deployment.

#### Acceptance Criteria

1. THE Web_App SHALL have an `src/env.ts` file using `@t3-oss/env-nextjs` and Zod to validate all environment variables
2. THE env_validation SHALL define server-side variables (45 variables including DATABASE_URL, BETTER_AUTH_SECRET, API keys, webhook secrets) with appropriate Zod schemas (url, string, min-length, startsWith constraints)
3. THE env_validation SHALL define client-side variables (10 variables prefixed with `NEXT_PUBLIC_`) with appropriate Zod schemas
4. IF any required environment variable is missing or fails validation, THEN THE Build_Process SHALL fail immediately with a descriptive error message identifying the invalid variable
5. THE Monorepo SHALL have a root `.env.example` file documenting all 55 variables with placeholder values and descriptions
6. THE Web_App SHALL have an `apps/web/.env.example` file listing web-specific variables
7. THE Monorepo SHALL gitignore all `.env.local` files to prevent secret leakage

### Requirement 8: TypeScript Strict Configuration

**User Story:** As a developer, I want a shared TypeScript configuration with strict mode that all apps and packages extend, so that type safety is enforced consistently across the monorepo.

#### Acceptance Criteria

1. THE Monorepo SHALL have a root `tsconfig.json` with `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`, and `"noEmit": true`
2. THE Web_App SHALL have a `tsconfig.json` that extends the root configuration and adds Next.js-specific compiler options (jsx, module resolution, path aliases)
3. EACH package in `packages/` SHALL have a `tsconfig.json` that extends the root configuration
4. WHEN `bun run typecheck` is executed at the root, THE TypeScript_Compiler SHALL check all apps and packages with zero errors on a clean scaffold
5. THE TypeScript_Config SHALL target ES2022 or later to support modern JavaScript features used by Bun

### Requirement 9: Database Package Setup

**User Story:** As a developer, I want the `packages/db/` package configured with Drizzle ORM and Neon client, so that I have a ready-to-use data access layer with migration tooling.

#### Acceptance Criteria

1. THE DB_Package SHALL have a `package.json` with `"name": "@rgss/db"` and dependencies on `drizzle-orm` and `@neondatabase/serverless`
2. THE DB_Package SHALL have a `drizzle.config.ts` file configured to read `DATABASE_URL_UNPOOLED` for migrations and output migrations to a `migrations/` directory
3. THE DB_Package SHALL have a `src/index.ts` that exports a configured Drizzle client using the pooled Neon connection
4. THE DB_Package SHALL have a `src/schema/` directory with an `index.ts` barrel file ready to export table definitions
5. THE DB_Package SHALL have scripts for `generate` (drizzle-kit generate) and `migrate` (drizzle-kit migrate) in its `package.json`
6. THE DB_Package SHALL only import from `@rgss/types` — it cannot import from `@rgss/business`, framework code, or UI code

### Requirement 10: Types Package Setup

**User Story:** As a developer, I want the `packages/types/` package with base Zod schemas for the API response shape, so that all apps and packages share a single source of truth for data validation and TypeScript types.

#### Acceptance Criteria

1. THE Types_Package SHALL have a `package.json` with `"name": "@rgss/types"` and a dependency on `zod`
2. THE Types_Package SHALL export a base `ApiSuccessResponse<T>` Zod schema with fields: `success` (literal true), `data` (generic), and optional `meta` (page, totalPages, totalCount)
3. THE Types_Package SHALL export a base `ApiErrorResponse` Zod schema with fields: `success` (literal false), `error` object containing `code`, `message`, `statusCode`, `requestId`, optional `details`, and optional `retryable`
4. THE Types_Package SHALL have no dependencies on any other internal package — it is the leaf of the dependency graph

### Requirement 11: Errors Package Setup

**User Story:** As a developer, I want the `packages/errors/` package with an AppError class and error codes registry, so that all error handling across the monorepo uses consistent, structured error objects.

#### Acceptance Criteria

1. THE Errors_Package SHALL have a `package.json` with `"name": "@rgss/errors"`
2. THE Errors_Package SHALL export an `AppError` class extending `Error` with properties: `code` (ErrorCode type), `statusCode` (number), `isOperational` (boolean, default true), `retryable` (boolean, default false), and optional `details`
3. THE Errors_Package SHALL export a `codes.ts` file with a `const` object containing all error code strings (VALIDATION_ERROR, INTERNAL_ERROR, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, METHOD_NOT_ALLOWED, TIMEOUT, UPSTREAM_ERROR, SERVICE_UNAVAILABLE, and all domain-specific codes)
4. THE Errors_Package SHALL export convenience factory functions: `notFound()`, `forbidden()`, `conflict()`, `badRequest()`, `serviceUnavailable()`
5. THE Errors_Package SHALL only import from `@rgss/types` or have no internal imports — it cannot import from `@rgss/db`, `@rgss/business`, or framework code

### Requirement 12: Business Logic Package Setup

**User Story:** As a developer, I want the `packages/business/` package scaffolded with currency and date utility functions, so that all monetary and date formatting follows Indian conventions consistently.

#### Acceptance Criteria

1. THE Business_Package SHALL have a `package.json` with `"name": "@rgss/business"` and dependencies only on `@rgss/types` and `@rgss/errors`
2. THE Business_Package SHALL export a `utils/currency.ts` module with a `formatINR(paise: number): string` function that formats integer paise values into Indian-numbered currency strings (e.g., 100000 → "₹1,000.00")
3. THE Business_Package SHALL export a `utils/date.ts` module with a `formatDateIN(date: Date): string` function that formats dates as DD/MM/YYYY using `Intl.DateTimeFormat('en-IN')`
4. THE Business_Package SHALL not import from `@rgss/db`, any framework library, or any UI library — it contains pure functions only
5. THE currency utility SHALL handle zero, positive integers, and large values (up to 99,99,99,999 paise) correctly using Indian lakh/crore grouping

### Requirement 13: Logger Package Setup

**User Story:** As a developer, I want a structured JSON logger package, so that all application logs are machine-parseable and compatible with BetterStack log ingestion.

#### Acceptance Criteria

1. THE Logger_Package SHALL have a `package.json` with `"name": "@rgss/logger"`
2. THE Logger_Package SHALL export a `createLogger(config: { service: string, environment: string })` function that returns a logger instance
3. THE Logger_Instance SHALL provide methods for `debug`, `info`, `warn`, `error`, and `fatal` log levels
4. WHEN a log method is called, THE Logger_Instance SHALL output a JSON object with fields: `level`, `message`, `service`, `environment`, `timestamp` (ISO 8601 UTC), and optional `data` (structured context)
5. THE Logger_Package SHALL have no dependencies on any other internal package

### Requirement 14: Placeholder Applications

**User Story:** As a developer, I want placeholder directories for `apps/cms/` and `docs/`, so that the monorepo structure is complete and Turborepo resolves all workspace references without errors.

#### Acceptance Criteria

1. THE Monorepo SHALL have an `apps/cms/` directory with a minimal `package.json` containing `"name": "@rgss/cms"` and a placeholder README
2. THE Monorepo SHALL have a `docs/` directory with a minimal `package.json` containing `"name": "@rgss/docs"` and a placeholder README
3. WHEN Turborepo resolves workspaces, THE Monorepo SHALL not produce errors due to missing or misconfigured workspace entries for cms or docs

### Requirement 15: Layer Dependency Enforcement

**User Story:** As a developer, I want the package dependency graph to enforce strict layer rules, so that architectural boundaries are maintained and circular dependencies are prevented.

#### Acceptance Criteria

1. THE Types_Package SHALL have zero internal package dependencies
2. THE Errors_Package SHALL depend only on `@rgss/types` or have zero internal dependencies
3. THE DB_Package SHALL depend only on `@rgss/types`
4. THE Business_Package SHALL depend only on `@rgss/types` and `@rgss/errors`
5. THE Logger_Package SHALL have zero internal package dependencies
6. THE Web_App SHALL be permitted to depend on `@rgss/business`, `@rgss/db`, `@rgss/types`, `@rgss/errors`, and `@rgss/logger`
7. WHEN a package attempts to import from a disallowed dependency, THE TypeScript_Compiler SHALL produce a module resolution error because the dependency is not listed in that package's `package.json`
