import 'server-only'
import { emailAddress } from '@/lib/email/resend'
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

/**
 * Reçu de cotisation au membre payeur. À n'appeler que si
 * claimPaymentForSettlement a renvoyé `claimed: true` avec un statut success :
 * c'est cette garde qui empêche tout double envoi. Le membre n'a pas de compte
 * lié : on écrit à l'adresse déclarée sur sa fiche, s'il en a une.
 */
export async function emailPaymentReceipt(supabase: SupabaseClient, paymentId: string) {
  try {
    const { data: pay } = await supabase
      .from('payments')
      .select('amount_fcfa, currency, reference, member_id, cotisation_id')
      .eq('id', paymentId)
      .maybeSingle()
    if (!pay?.member_id) return
    const { data: member } = await supabase
      .from('members')
      .select('email, first_name')
      .eq('id', pay.member_id)
      .maybeSingle()
    await emailAddress(member?.email, 'Reçu de paiement de cotisation', {
      title: 'Paiement confirmé',
      lines: [
        `Bonjour ${member?.first_name ?? ''},`.replace(' ,', ','),
        `Nous confirmons la réception de votre paiement de ${Number(pay.amount_fcfa).toLocaleString('fr-FR')} ${pay.currency}.`,
        `Objet : ${pay.cotisation_id ? 'cotisation à votre coopérative' : 'paiement à votre coopérative'}`,
        `Référence : ${pay.reference ?? paymentId}`,
        'Merci pour votre confiance.',
      ],
    })
  } catch {
    // Jamais bloquant.
  }
}
