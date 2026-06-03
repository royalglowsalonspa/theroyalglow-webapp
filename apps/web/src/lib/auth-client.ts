/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : auth-client
 * Scope        : Authentication
 *
 * Description  : Client-side Better Auth instance for React components.
 *                Provides hooks and methods for session management and OAuth.
 *
 * Responsibilities :
 * - Initialise the Better Auth client with the app base URL
 * - Export session hooks and auth methods for client components
 *
 * Features / Functionality :
 * - useSession hook for reactive session state
 * - signIn / signOut methods for Google OAuth flow
 *
 * Tech Stack   : TypeScript, Better Auth, React
 * Layer        : Frontend
 *
 * Dependencies : better-auth/react
 *
 * Notes        : None
 ************************************************************/

import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})

export const { useSession, signIn, signOut } = authClient
