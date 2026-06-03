/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : setup
 * Scope        : Testing Infrastructure
 *
 * Description  : Vitest global setup file for the web app. Configures MSW
 *                lifecycle and testing-library/jest-dom matchers.
 *
 * Responsibilities :
 * - Start MSW server before all tests with onUnhandledRequest: 'error'
 * - Reset handlers after each test
 * - Close MSW server after all tests
 * - Register jest-dom matchers for Vitest
 *
 * Features / Functionality :
 * - MSW lifecycle (listen → reset → close)
 * - Unhandled request enforcement (fails test on real network calls)
 * - jest-dom matchers (toBeInTheDocument, toHaveClass, etc.)
 *
 * Tech Stack   : TypeScript, Vitest, MSW, @testing-library/jest-dom
 * Layer        : Testing
 *
 * Dependencies : @testing-library/jest-dom/vitest, vitest, ./msw-server
 *
 * Notes        : Lives inside apps/web so imports resolve from apps/web/node_modules
 ************************************************************/

import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw-server'

// MSW lifecycle for the web test project. `onUnhandledRequest: 'error'` makes
// any un-mocked outbound HTTP call fail the test, so accidental real network
// access is caught immediately.
//
// This setup file lives inside `apps/web` (not at the repo root) so its
// imports — `@testing-library/jest-dom` and `msw` — resolve from
// `apps/web/node_modules`, where the test tooling is declared.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
