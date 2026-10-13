import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Anonymous, sessionless server client for public, CDN-cached reads (embed, widget, catalogues).
 * The cookie-based client answered with the caller's own RLS view, which the CDN then served to
 * every visitor under `public, s-maxage`: a cached response must only ever be the public view.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Missing Supabase environment variables')
  return createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
