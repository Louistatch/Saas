import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

type CardPrintOrderUpdate = Database['public']['Tables']['card_print_orders']['Update']

/**
 * Même point de sérialisation que lib/payments/settle.ts et
 * lib/payments/settle-partner-intent.ts — voir le premier pour le
 * raisonnement complet. Troisième copie plutôt qu'une généralisation : les
 * trois tables ne partagent ni schéma ni RLS, et une fonction paramétrée
 * par nom de table serait plus difficile à auditer que trois fonctions
 * courtes et identiques dans leur forme.
 */
const CLAIMABLE_STATUSES = ['requested'] as const

export type CardOrderSettlementOutcome =
  | { claimed: true }
  | { claimed: false; reason: 'already_settled' }
  | { claimed: false; reason: 'error'; message: string }

export async function claimCardOrderForSettlement(
  supabase: SupabaseClient<Database>,
  orderId: string,
  patch: CardPrintOrderUpdate,
): Promise<CardOrderSettlementOutcome> {
  const { data, error } = await supabase
    .from('card_print_orders')
    .update(patch)
    .eq('id', orderId)
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
