'use client'

/**
 * Marché et travail côté navigateur : répondre, inviter, décider, suivre. Tout passe par les
 * fonctions SQL de supabase/migrations/20261023_150000_market_work.sql, qui vérifient le
 * compte, les droits et les limites ; ce module ne fait que les appeler et rendre des messages
 * lisibles.
 */
import type { AnnouncementType } from './work'

export type ResponseStatus = 'envoyee' | 'invitee' | 'retenue' | 'declinee' | 'retiree'

export interface MarketPerson {
  name: string
  kind: 'ouvrier' | 'acheteur' | 'agronome' | 'membre'
  skills: string[]
  note: number | null
  reviews: number
  place: string | null
}

export interface ActivityAnnouncement {
  id: string
  type: AnnouncementType
  title: string
  status: string
  open: boolean
  created_at: string
  expires_at: string | null
  culture: string | null
  quantity_kg: number | null
  price_per_kg_fcfa: number | null
  wage_per_day_fcfa: number | null
  positions: number | null
  starts_on: string | null
  work_days: number | null
  has_contact: boolean
  place: string | null
}

/** Une réponse vue par l'auteur de l'annonce. */
export interface ReceivedResponse {
  id: string
  status: ResponseStatus
  origin: 'reponse' | 'invitation'
  message: string | null
  quantity_kg: number | null
  created_at: string
  decided_at: string | null
  unseen: boolean
  person: MarketPerson
  /** Le numéro du répondant, une fois retenu. */
  phone: string | null
}

/** Une réponse (ou une invitation) vue par celui qui l'a envoyée ou reçue. */
export interface SentResponse {
  id: string
  status: ResponseStatus
  origin: 'reponse' | 'invitation'
  message: string | null
  quantity_kg: number | null
  created_at: string
  decided_at: string | null
  unseen: boolean
  announcement: ActivityAnnouncement
  author: MarketPerson | null
  /** Le numéro de l'auteur, une fois retenu. */
  phone: string | null
}

export interface MyAnnouncement extends ActivityAnnouncement {
  hired: number
  responses: ReceivedResponse[]
}

export interface Activity {
  announcements: MyAnnouncement[]
  sent: SentResponse[]
  unread: number
}

export interface AvailableWorker {
  /** Identifiant du profil ouvrier, pour l'inviter. */
  ref: string
  name: string
  skills: string[]
  note: number | null
  reviews: number
  cantons: string[]
  proximity: 0 | 1 | 2 | 3
}

async function client() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

/** Les messages de la base sont écrits pour les utilisateurs ; le reste est dit simplement. */
const KNOWN =
  /Connexion requise|plus ouverte|par téléphone|votre annonce|trop long|Quantité invalide|Numéro de téléphone invalide|Indiquez un numéro|Vous êtes invité|déjà décliné|Assez de|Seul l’auteur|offre de travail|plus disponible|déjà répondu|introuvable|attend pas votre décision|est close|Ajoutez votre numéro|Impossible de retirer|Décision manquante/

const UNAVAILABLE = 'Impossible pour l’instant : vérifiez votre connexion et réessayez.'

export const isError = (v: unknown): v is { error: string } =>
  !!v && typeof v === 'object' && 'error' in v

async function call<T>(
  fn: string,
  args: Record<string, unknown> | undefined,
  valid: (data: unknown) => boolean,
): Promise<T | { error: string }> {
  try {
    const { data, error } = await (await client()).rpc(fn, args)
    if (error) return { error: KNOWN.test(error.message) ? error.message : UNAVAILABLE }
    return valid(data) ? (data as T) : { error: UNAVAILABLE }
  } catch {
    return { error: UNAVAILABLE }
  }
}

const hasId = (d: unknown) =>
  !!d && typeof d === 'object' && typeof (d as { id?: unknown }).id === 'string'
const isActivity = (d: unknown) =>
  !!d &&
  typeof d === 'object' &&
  Array.isArray((d as Activity).announcements) &&
  Array.isArray((d as Activity).sent)

export const respond = (
  announcement: string,
  input: { message?: string; quantityKg?: number | null; phone?: string },
) =>
  call<SentResponse>(
    'market_respond',
    {
      p_announcement: announcement,
      p_message: input.message?.trim() || null,
      p_quantity_kg: input.quantityKg ?? null,
      p_phone: input.phone?.trim() || null,
    },
    hasId,
  )

export const invite = (announcement: string, worker: string, message?: string) =>
  call<ReceivedResponse>(
    'market_invite',
    { p_announcement: announcement, p_worker: worker, p_message: message?.trim() || null },
    hasId,
  )

export const decide = (response: string, accept: boolean) =>
  call<ReceivedResponse | SentResponse>(
    'market_decide',
    { p_response: response, p_accept: accept },
    hasId,
  )

export const withdraw = (response: string) =>
  call<ReceivedResponse | SentResponse>('market_withdraw', { p_response: response }, hasId)

export const closeAnnouncement = (announcement: string) =>
  call<boolean>('market_close', { p_announcement: announcement }, (d) => typeof d === 'boolean')

export const activity = () => call<Activity>('market_activity', undefined, isActivity)

export const unreadCount = () =>
  call<number>('market_unread', undefined, (d) => typeof d === 'number')

export const markSeen = () => call<number>('market_seen', undefined, (d) => typeof d === 'number')

export const availableWorkers = (zone: {
  cantonId?: string | null
  prefectureId?: string | null
  regionId?: string | null
  skill?: string | null
}) =>
  call<AvailableWorker[]>(
    'market_workers',
    {
      p_canton: zone.cantonId || null,
      p_prefecture: zone.prefectureId || null,
      p_region: zone.regionId || null,
      p_skill: zone.skill?.trim() || null,
    },
    Array.isArray,
  )

/** « Afficher le numéro » : une annonce à la fois, côté serveur, avec une limite. */
export async function revealPhone(
  announcement: string,
): Promise<{ phone: string } | { error: string }> {
  try {
    const res = await fetch(`/api/market/announcements/${announcement}/contact`, {
      cache: 'no-store',
    })
    const body = (await res.json().catch(() => ({}))) as { phone?: string; error?: string }
    if (res.ok && body.phone) return { phone: body.phone }
    return { error: body.error ?? UNAVAILABLE }
  } catch {
    return { error: UNAVAILABLE }
  }
}
