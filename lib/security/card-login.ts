import 'server-only'
import { randomUUID } from 'node:crypto'
import { deliverSms } from '@/lib/notifications/delivery'
import { normalizedCardNumber } from '@/lib/security/card-number'
import {
  CODE_TTL_SECONDS,
  codeMatches,
  generateCode,
  hashCode,
  hashIp,
  isCardAuthConfigured,
  signCardSession,
} from '@/lib/security/card-session'
import { normalizePhone } from '@/lib/security/phone'
import { createClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'

/**
 * Connexion par carte — émission et vérification des codes SMS.
 *
 * Tout passe par le client de service : la table `card_login_challenges` n'a
 * aucune politique RLS, elle est volontairement fermée à anon et authenticated.
 *
 * Les bornes ci-dessous sont comptées en base, pas en mémoire : sur des
 * fonctions serverless le limiteur en mémoire est propre à chaque instance, donc
 * un attaquant qui change d'instance repart de zéro.
 */

const log = createLogger('auth:card-login')

const RESEND_COOLDOWN_SECONDS = 60
const MAX_REQUESTS_PER_CARD_PER_HOUR = 5
const MAX_REQUESTS_PER_IP_PER_HOUR = 10
const MAX_ATTEMPTS_PER_CHALLENGE = 5
/**
 * Total d'essais tous codes confondus. Sans lui, redemander un code remettrait
 * le compteur à zéro et l'espace de 10^6 serait vite parcouru. À 10 essais par
 * heure et par carte, deviner un code de six chiffres a une chance sur 10^5.
 */
const MAX_ATTEMPTS_PER_CARD_PER_HOUR = 10
const HOUR_MS = 60 * 60 * 1000

interface ChallengeRow {
  id: string
  member_id: string
  code_hash: string
  attempts: number
  consumed_at: string | null
  expires_at: string
  created_at: string
}

export type RequestResult =
  | { ok: true; resendAfterSeconds: number }
  | {
      ok: false
      reason: 'not_configured' | 'invalid_card' | 'no_phone' | 'rate_limited' | 'sms_failed'
      retryAfterSeconds?: number
    }

export type VerifyResult =
  | { ok: true; token: string; expiresAt: Date; memberId: string }
  | {
      ok: false
      reason: 'not_configured' | 'invalid' | 'expired' | 'locked' | 'wrong_code'
      attemptsLeft?: number
    }

const hourAgo = () => new Date(Date.now() - HOUR_MS).toISOString()

/** Carte de membre active et non expirée, avec le téléphone du membre. */
async function loadEligibleCard(cardNumber: string) {
  const supabase = createClient()
  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id, cooperative_id, expiry_date, card_type')
    .eq('card_number', cardNumber)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle<{
      member_id: string | null
      cooperative_id: string | null
      expiry_date: string | null
      card_type: string
    }>()

  // Les cartes Haroo (ouvrier, acheteur, agronome) ont un autre espace privé.
  // La connexion par carte ne vaut que pour la carte de membre.
  if (!card?.member_id || card.card_type !== 'FAITIERE') return null
  if (card.expiry_date && card.expiry_date < new Date().toISOString().slice(0, 10)) return null

  const { data: member } = await supabase
    .from('members')
    .select('phone')
    .eq('id', card.member_id)
    .is('deleted_at', null)
    .maybeSingle<{ phone: string | null }>()
  if (!member) return null

  return { memberId: card.member_id, phone: normalizePhone(member.phone) }
}

export async function requestCardLoginCode(
  rawCardNumber: string,
  ip: string,
): Promise<RequestResult> {
  if (!isCardAuthConfigured()) return { ok: false, reason: 'not_configured' }

  const cardNumber = normalizedCardNumber(rawCardNumber)
  if (!cardNumber) return { ok: false, reason: 'invalid_card' }

  const card = await loadEligibleCard(cardNumber)
  if (!card) return { ok: false, reason: 'invalid_card' }
  if (!card.phone) return { ok: false, reason: 'no_phone' }

  const supabase = createClient()
  const ipHash = hashIp(ip)

  // ── Bornes de débit ─────────────────────────────────────────────────────
  const { data: recentForCard } = await supabase
    .from('card_login_challenges')
    .select('created_at')
    .eq('card_number', cardNumber)
    .gte('created_at', hourAgo())
    .order('created_at', { ascending: false })
    .returns<{ created_at: string }[]>()

  const last = recentForCard?.[0]
  if (last) {
    const sinceLast = (Date.now() - Date.parse(last.created_at)) / 1000
    if (sinceLast < RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        reason: 'rate_limited',
        retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - sinceLast),
      }
    }
  }
  if ((recentForCard?.length ?? 0) >= MAX_REQUESTS_PER_CARD_PER_HOUR) {
    const oldest = recentForCard?.[recentForCard.length - 1]
    const wait = oldest ? HOUR_MS / 1000 - (Date.now() - Date.parse(oldest.created_at)) / 1000 : 600
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: Math.ceil(Math.max(wait, 60)) }
  }

  const { count: fromThisIp } = await supabase
    .from('card_login_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', hourAgo())
  if ((fromThisIp ?? 0) >= MAX_REQUESTS_PER_IP_PER_HOUR) {
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: 600 }
  }

  // Un seul code valable à la fois : un nouveau code annule les précédents.
  await supabase
    .from('card_login_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('card_number', cardNumber)
    .is('consumed_at', null)

  // ── Émission ────────────────────────────────────────────────────────────
  const id = randomUUID()
  const code = generateCode()
  const { error: insertError } = await supabase.from('card_login_challenges').insert({
    id,
    card_number: cardNumber,
    member_id: card.memberId,
    code_hash: hashCode(id, code),
    ip_hash: ipHash,
    expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
  })
  if (insertError) {
    log.error('Challenge insert failed', { code: insertError.code })
    return { ok: false, reason: 'sms_failed' }
  }

  const sms = await deliverSms(
    card.phone,
    `FaîtiereHub : votre code de connexion est ${code}. Valable ${CODE_TTL_SECONDS / 60} min. Ne le donnez à personne.`,
  )
  if (!sms.ok) {
    // Un SMS jamais parti ne doit pas consommer le quota de l'utilisateur.
    await supabase.from('card_login_challenges').delete().eq('id', id)
    // Ni le code ni le numéro ne sont journalisés : seulement la cause.
    log.warn('SMS not delivered', { reason: sms.error })
    return { ok: false, reason: 'sms_failed' }
  }

  await supabase
    .from('card_login_challenges')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', id)

  // Purge au passage : pas de tâche planifiée à maintenir pour ça.
  void supabase
    .from('card_login_challenges')
    .delete()
    .lt('created_at', new Date(Date.now() - 7 * 24 * HOUR_MS).toISOString())
    .then(() => undefined)

  return { ok: true, resendAfterSeconds: RESEND_COOLDOWN_SECONDS }
}

export async function verifyCardLoginCode(
  rawCardNumber: string,
  rawCode: string,
): Promise<VerifyResult> {
  if (!isCardAuthConfigured()) return { ok: false, reason: 'not_configured' }

  const cardNumber = normalizedCardNumber(rawCardNumber)
  const code = rawCode.trim()
  if (!cardNumber || !/^\d{6}$/.test(code)) return { ok: false, reason: 'invalid' }

  const supabase = createClient()

  const { data: recent } = await supabase
    .from('card_login_challenges')
    .select('id, member_id, code_hash, attempts, consumed_at, expires_at, created_at')
    .eq('card_number', cardNumber)
    .gte('created_at', hourAgo())
    .order('created_at', { ascending: false })
    .returns<ChallengeRow[]>()

  const rows = recent ?? []
  const totalAttempts = rows.reduce((sum, r) => sum + r.attempts, 0)
  if (totalAttempts >= MAX_ATTEMPTS_PER_CARD_PER_HOUR) return { ok: false, reason: 'locked' }

  const active = rows.find((r) => !r.consumed_at && Date.parse(r.expires_at) > Date.now())
  if (!active) return { ok: false, reason: 'expired' }
  if (active.attempts >= MAX_ATTEMPTS_PER_CHALLENGE) return { ok: false, reason: 'locked' }

  // On COMPTE l'essai avant de comparer, jamais après : deux requêtes
  // simultanées ne peuvent pas ainsi tester chacune un code en n'en payant
  // qu'un. La condition `attempts = <valeur lue>` rend l'incrément exclusif.
  //
  // Perdre cette course ne veut PAS dire « trop d'essais » : un producteur qui
  // touche deux fois le bouton ferait lire à la seconde requête un faux
  // « verrouillé ». On relit donc l'état et on retente ; seul le plafond réel
  // (MAX_ATTEMPTS_PER_CHALLENGE) ou un code déjà consommé arrête la boucle.
  let current: ChallengeRow = active
  let counted: { attempts: number } | null = null
  for (let tries = 0; tries < 4 && !counted; tries++) {
    if (tries > 0) {
      const { data: fresh } = await supabase
        .from('card_login_challenges')
        .select('id, member_id, code_hash, attempts, consumed_at, expires_at, created_at')
        .eq('id', active.id)
        .maybeSingle<ChallengeRow>()
      if (!fresh || fresh.consumed_at || Date.parse(fresh.expires_at) <= Date.now()) {
        return { ok: false, reason: 'expired' }
      }
      if (fresh.attempts >= MAX_ATTEMPTS_PER_CHALLENGE) return { ok: false, reason: 'locked' }
      current = fresh
    }
    const { data } = await supabase
      .from('card_login_challenges')
      .update({ attempts: current.attempts + 1 })
      .eq('id', current.id)
      .eq('attempts', current.attempts)
      .is('consumed_at', null)
      .select('attempts')
      .maybeSingle<{ attempts: number }>()
    counted = data
  }
  if (!counted) return { ok: false, reason: 'locked' }

  if (!codeMatches(active.id, code, active.code_hash)) {
    return {
      ok: false,
      reason: 'wrong_code',
      attemptsLeft: Math.max(MAX_ATTEMPTS_PER_CHALLENGE - counted.attempts, 0),
    }
  }

  // Usage unique : seul celui qui fait passer consumed_at de NULL à une date
  // gagne. Un rejeu concurrent du même code échoue ici.
  const { data: consumed } = await supabase
    .from('card_login_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', active.id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (!consumed) return { ok: false, reason: 'expired' }

  // La carte a pu être révoquée ou réattribuée pendant les dix minutes.
  const card = await loadEligibleCard(cardNumber)
  if (!card || card.memberId !== active.member_id) return { ok: false, reason: 'invalid' }

  const { token, expiresAt } = signCardSession({ cardNumber, memberId: card.memberId })
  return { ok: true, token, expiresAt, memberId: card.memberId }
}
