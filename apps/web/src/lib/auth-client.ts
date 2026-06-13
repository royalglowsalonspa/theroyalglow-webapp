/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 07-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : auth-client
 * Scope        : Authentication
 *
 * Description  : Client-side Better Auth instance for React components.
 *                Provides hooks and methods for session management, Google
 *                OAuth, and the Google One Tap prompt.
 *
 * Responsibilities :
 * - Initialise the Better Auth client with the app base URL
 * - Register the Google One Tap client plugin
 * - Export session hooks and auth methods for client components
 *
 * Features / Functionality :
 * - useSession hook for reactive session state
 * - signIn / signOut methods for Google OAuth flow
 * - oneTap() to trigger the Google One Tap prompt
 *
 * Tech Stack   : TypeScript, Better Auth, React
 * Layer        : Frontend
 *
 * Dependencies : better-auth/react, better-auth/client/plugins
 *
 * Notes        :
 * - NEXT_PUBLIC_GOOGLE_CLIENT_ID is the public OAuth client ID (not a secret),
 *   required by the browser-side Google Identity Services prompt.
 ************************************************************/

import { oneTapClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  plugins: [
    oneTapClient({
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
      // Don't silently auto-pick an account; let the user confirm in the prompt.
      autoSelect: false,
      // Dismiss when the user taps outside (requires FedCM disabled, below).
      cancelOnTapOutside: true,
      context: 'signin',
      // FedCM's get() aborts noisily ("AbortError: signal is aborted without
      // reason") on re-render/navigation and is flaky with the credential
      // hand-off. The classic GIS prompt is stable here, so opt out of FedCM.
      promptOptions: {
        fedCM: false,
        // One gentle attempt; if dismissed we fall back to the Sign in button.
        maxAttempts: 1,
      },
    }),
  ],
})

export const { useSession, signIn, signOut, oneTap } = authClient
