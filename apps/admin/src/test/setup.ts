/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : setup (admin)
 * Scope        : Testing Infrastructure
 *
 * Description  : Vitest global setup file for the admin app. Registers
 *                @testing-library/jest-dom matchers for component tests.
 *
 * Responsibilities :
 * - Register jest-dom matchers for Vitest (toBeInTheDocument, etc.)
 *
 * Tech Stack   : TypeScript, Vitest, @testing-library/jest-dom
 * Layer        : Testing
 *
 * Dependencies : @testing-library/jest-dom/vitest
 *
 * Notes        : Lives inside apps/admin so the import resolves from
 *                apps/admin/node_modules. Importing this only extends
 *                `expect`; it is safe in both jsdom and node test
 *                environments (e.g. env.test.ts pins `@vitest-environment
 *                node` and still runs cleanly with these matchers loaded).
 ************************************************************/

import '@testing-library/jest-dom/vitest'
