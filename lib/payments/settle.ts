import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

type PaymentUpdate = Database['public']['Tables']['payments']['Update']

/**
 * États depuis lesquels un paiement peut encore être réglé.
 * `success`, `failed` et `refunded` sont terminaux : on n'y revient pas.
 */
const CLAIMABLE_STATUSES = ['pending', 'processing'] as const

export type SettlementOutcome =
  /** Ce processus a gagné la course : à lui, et à lui seul, d'exécuter les effets de bord. */
  | { claimed: true }
  /** Un autre appel a déjà réglé ce paiement — livraison en double, à ignorer. */
  | { claimed: false; reason: 'already_settled' }
  | { claimed: false; reason: 'error'; message: string }

/**
 * Règle un paiement de façon idempotente, et dit à l'appelant s'il a le droit
 * de déclencher les effets de bord.
 *
 * Le piège que cette fonction existe pour éviter : lire le statut, constater
 * qu'il n'est pas terminal, puis écrire. Entre la lecture et l'écriture, une
 * seconde livraison du même callback passe la même vérification — les deux
 * poursuivent, et le membre reçoit deux SMS. Les fournisseurs de paiement
 * rejouent leurs notifications par conception, et le callback CinetPay n'est
 * même pas authentifié : il suffit de connaître une référence pour le rejouer.
 *
 * La correction consiste à faire de l'UPDATE lui-même le point de
 * sérialisation. La condition de statut vit dans le WHERE, pas dans un `if`
 * applicatif : en READ COMMITTED, la seconde écriture attend le verrou de
 * ligne, réévalue son prédicat sur la version fraîchement validée, n'y trouve
 * plus un statut réclamable et touche zéro ligne. Le nombre de lignes affectées
 * devient ainsi un jeton : un seul appelant l'obtient.
 *
 * Cette garantie ne tient que si les effets de bord restent APRÈS l'appel et
 * conditionnés à `claimed`. Les déplacer avant la réclamation rouvre la faille.
 */
export async function claimPaymentForSettlement(
  supabase: SupabaseClient<Database>,
  paymentId: string,
  patch: PaymentUpdate,
): Promise<SettlementOutcome> {
  const { data, error } = await supabase
    .from('payments')
    .update(patch)
    .eq('id', paymentId)
    .in('status', CLAIMABLE_STATUSES as unknown as string[])
    .select('id')

  if (error) {
    return { claimed: false, reason: 'error', message: error.message }
  }

  // Zéro ligne : le paiement était déjà terminal avant notre écriture.
  if (!data || data.length === 0) {
    return { claimed: false, reason: 'already_settled' }
  }

  return { claimed: true }
}
