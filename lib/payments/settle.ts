import 'server-only'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

type PaymentUpdate = Database['public']['Tables']['payments']['Update']
export type SettlementOutcome =
  | { claimed: true }
  | { claimed: false; reason: 'already_settled' }
  | { claimed: false; reason: 'error'; message: string }

/** Payment, cotisation and notification outbox commit together; only service_role can execute. */
export async function claimPaymentForSettlement(
  supabase: SupabaseClient,
  paymentId: string,
  patch: PaymentUpdate,
): Promise<SettlementOutcome> {
  const { data, error } = await supabase.rpc('settle_payment_atomic', {
    p_payment_id: paymentId,
    p_patch: patch,
  })
  if (error) return { claimed: false, reason: 'error', message: error.message }
  if (data?.claimed === true) return { claimed: true }
  if (data?.claimed === false) return { claimed: false, reason: 'already_settled' }
  return { claimed: false, reason: 'error', message: 'Invalid settlement response' }
}
