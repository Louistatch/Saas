import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Confirmation de l'adresse e-mail à l'inscription.
 *
 * DÉSACTIVÉE par défaut : tant que REQUIRE_EMAIL_CONFIRMATION ≠ 'true', les
 * comptes sont créés déjà confirmés (comportement historique). On ne l'active
 * qu'une fois le SMTP de Supabase relié à Resend ET un e-mail de test reçu —
 * sinon plus personne ne pourrait se connecter.
 *
 * Le lien envoyé suit le modèle « Confirm signup » de Supabase, réglé sur
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
 * (route app/auth/confirm) : vérification côté serveur, sans dépendre du
 * navigateur qui a fait l'inscription.
 */
export function isEmailConfirmationRequired(): boolean {
  return process.env.REQUIRE_EMAIL_CONFIRMATION === 'true'
}

/** Demande à Supabase d'envoyer (via le SMTP configuré) l'e-mail de confirmation. */
export async function sendConfirmationEmail(email: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return false
  const supabase = createSupabaseClient(url, anon, { auth: { persistSession: false } })
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  return !error
}
