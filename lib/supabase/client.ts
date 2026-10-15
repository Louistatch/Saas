import { createBrowserClient } from '@supabase/ssr'
import { type SupabaseClient, processLock } from '@supabase/supabase-js'

let browserClient: SupabaseClient | null = null

/**
 * Returns a singleton Supabase browser client.
 * 
 * IMPORTANT: We use a module-level singleton (not per-component) so that:
 * - The auth state is shared across ALL components (login form, AuthProvider, etc.)
 * - signInWithPassword in one place triggers onAuthStateChange in another
 * - Cookies are synchronized across all consumers
 */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // In the browser the vars MUST be present — throw so misconfiguration is obvious.
    if (typeof window !== 'undefined') {
      throw new Error('Missing Supabase environment variables')
    }
    // During SSR / static-generation (e.g. local build without .env.local) the
    // NEXT_PUBLIC_* vars are absent. Return a lightweight placeholder; no Supabase
    // methods are ever called server-side (they live inside useEffect / event handlers).
    // In production, Vercel bakes these vars in at build time so this branch is never hit.
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder',
    )
  }

  // Verrou en mémoire (processLock) au lieu de navigator.locks : sur mobile,
  // un onglet ou une appli PWA mis en arrière-plan peut garder le verrou
  // inter-onglets indéfiniment, et getUser() reste alors suspendu sans même
  // appeler le réseau → « Chargement… » infini (observé au retour du lien
  // de confirmation e-mail). Les cookies restent la source partagée.
  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: { lock: processLock },
  })
  return browserClient
}
