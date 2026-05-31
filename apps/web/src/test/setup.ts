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
