/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : msw-server
 * Scope        : Testing Infrastructure
 *
 * Description  : Shared MSW server instance for the web test project. Tests
 *                register per-case handlers; default set is empty.
 *
 * Responsibilities :
 * - Provide a shared setupServer() instance for all tests
 * - Fail loudly on any unmocked outbound requests
 *
 * Features / Functionality :
 * - Empty default handler set (no unintended real network calls)
 * - server.use() for per-test handler registration
 *
 * Tech Stack   : TypeScript, MSW
 * Layer        : Testing
 *
 * Dependencies : msw/node
 *
 * Notes        : None
 ************************************************************/

import { setupServer } from 'msw/node'

// Shared MSW server for the web test project. Tests register per-case handlers
// with `server.use(...)`; the default handler set is empty so any unmocked
// outbound request fails loudly (surfacing accidental real network calls).
export const server = setupServer()
