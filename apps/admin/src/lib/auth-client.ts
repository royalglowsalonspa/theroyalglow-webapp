/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : auth-client (admin)
 * Scope        : Authentication
 *
 * Description  : Client-side Better Auth instance for the admin app. Mirrors
 *                the web auth-client (session hooks, Google OAuth, One Tap),
 *                resolving the API base to the serving origin so the shared
 *                `.theroyalglow.in` session cookie is validated against the
 *                admin host.
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
 * - The admin app never renders its own sign-in page (Req 4.7); these client
 *   helpers exist for session reads and the One Tap continuity flow.
 ************************************************************/

import { oneTapClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// Resolve the API base to whatever origin is actually serving the page. In the
// browser this is window.location.origin, so the same build works on
// localhost and admin.theroyalglow.in without env juggling. On the server we
// fall back to the configured public admin URL.
const baseURL =
  typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001')

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    oneTapClient({
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
      // Don't silently auto-pick an account; let the user confirm in the prompt.
      autoSelect: false,
      context: 'signin',
      // FedCM is left enabled (the browser default). It powers the native
      // bottom-sheet One Tap on Android/mobile Chrome and modern Chrome
      // enforces it regardless.
      promptOptions: {
        // A few gentle attempts so the prompt reliably surfaces on mobile,
        // then we fall back to the explicit Google button.
        maxAttempts: 3,
      },
    }),
  ],
})

export const { useSession, signIn, signOut, oneTap } = authClient
