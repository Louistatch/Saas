/**
 * Supabase Admin Client (service_role)
 *
 * Used ONLY in server-side contexts where RLS must be bypassed:
 * - Webhook handlers (no user session)
 * - Background jobs / cron
 * - Admin operations that need full table access
 *
 * NEVER import this in client components or expose the service_role key.
 */
import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Accept both naming conventions (SUPABASE_SERVICE_ROLE_KEY is canonical; legacy envs may use SUPABASE_SERVICE_KEY)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable',
    )
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
