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

// Resolve the API base to whatever origin is actually serving the page. In the
// browser this is window.location.origin, so the same build works on
// localhost, an ngrok tunnel (real-device testing), and production without any
// env juggling — the One Tap credential always posts back to the right origin.
// On the server we fall back to the configured public URL.
const baseURL =
  typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    oneTapClient({
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
      // Don't silently auto-pick an account; let the user confirm in the prompt.
      autoSelect: false,
      context: 'signin',
      // FedCM is left enabled (the browser default). It powers the native
      // bottom-sheet One Tap on Android/mobile Chrome — the best experience for
      // our mobile-first audience — and modern Chrome enforces it regardless.
      promptOptions: {
        // A few gentle attempts so the prompt reliably surfaces on mobile,
        // then we fall back to the explicit Google button.
        maxAttempts: 3,
      },
    }),
  ],
})

export const { useSession, signIn, signOut, oneTap } = authClient
