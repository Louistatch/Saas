import 'server-only'
/**
 * Où envoyer une personne juste après la confirmation de son adresse (lien reçu par e-mail).
 *
 * Les deux routes de confirmation (`/auth/confirm`, `/auth/callback`) envoyaient tout le monde
 * sur /dashboard : un candidat Opérateur, dont le compte n'a ni organisation ni profil Haroo,
 * y voyait un tableau de bord vide « comme si rien n'était », et ne trouvait son espace qu'à la
 * connexion suivante (la page de connexion, elle, interrogeait son dossier). Ici on lit la même
 * chose que la page de connexion : `profiles` pour les deux couches, `partner_memberships` pour
 * le dossier Opérateur. `profiles` fait foi ; les claims du JWT ne sont pas consultés.
 */
import { accountHomeUrl } from '@/lib/account/journey'
import type { SupabaseClient } from '@supabase/supabase-js'

type Client = SupabaseClient
type ProfileRow = { role: string; haroo_type: string | null }

export async function hasOperatorFile(supabase: Client, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('partner_memberships')
    .select('partner_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle<{ partner_id: string }>()
  return Boolean(data)
}

/** Chemin (sans origine ni paramètres) de l'espace du compte `userId` ; `/compte` sans profil. */
export async function confirmedHomePath(supabase: Client, userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, haroo_type')
    .eq('id', userId)
    .maybeSingle<ProfileRow>()
  if (!profile) return '/compte'
  const operator = await hasOperatorFile(supabase, userId)
  return accountHomeUrl(
    { role: profile.role as never, harooType: profile.haroo_type as never },
    { operator },
  )
}
