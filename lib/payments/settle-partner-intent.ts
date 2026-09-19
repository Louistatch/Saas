import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

type PartnerPaymentIntentUpdate = Database['public']['Tables']['partner_payment_intents']['Update']

/**
 * Même piège, même correction que lib/payments/settle.ts pour `payments` —
 * voir ce fichier pour le raisonnement complet sur la course entre deux
 * livraisons du callback CinetPay. Dupliqué plutôt que généralisé : les deux
 * tables ne partagent ni schéma ni RLS, et un helper générique paramétré par
 * nom de table serait plus difficile à auditer que deux fonctions courtes.
 */
const CLAIMABLE_STATUSES = ['pending', 'processing'] as const

export type PartnerIntentSettlementOutcome =
  | { claimed: true }
  | { claimed: false; reason: 'already_settled' }
  | { claimed: false; reason: 'error'; message: string }

export async function claimPartnerIntentForSettlement(
  supabase: SupabaseClient<Database>,
  intentId: string,
  patch: PartnerPaymentIntentUpdate,
): Promise<PartnerIntentSettlementOutcome> {
  const { data, error } = await supabase
    .from('partner_payment_intents')
    .update(patch)
    .eq('id', intentId)
    .in('status', CLAIMABLE_STATUSES)
    .select('id')

  if (error) {
    return { claimed: false, reason: 'error', message: error.message }
  }
  if (!data || data.length === 0) {
    return { claimed: false, reason: 'already_settled' }
  }
  return { claimed: true }
}
