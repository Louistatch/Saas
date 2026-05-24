import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

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
    throw new Error('Missing Supabase environment variables')
  }

  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  return browserClient
}
