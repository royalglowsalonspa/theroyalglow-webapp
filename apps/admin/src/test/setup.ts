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

// jsdom implements neither ResizeObserver nor matchMedia, both of which are
// touched by redesigned primitives during render (recharts ResponsiveContainer
// in ChartCard observes its container; reduced-motion consumers read
// matchMedia). Provide inert polyfills so component renders settle cleanly.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

