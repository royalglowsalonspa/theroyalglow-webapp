import { setupServer } from 'msw/node'

// Shared MSW server for the web test project. Tests register per-case handlers
// with `server.use(...)`; the default handler set is empty so any unmocked
// outbound request fails loudly (surfacing accidental real network calls).
export const server = setupServer()
