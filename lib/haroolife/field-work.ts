'use client'

/**
 * Field work between players (game money only): the real Haroo workers a player can ask, the
 * proposals, the answers. Everything goes through the database functions of
 * supabase/migrations/20261022_120000_haroolife_field_work.sql; the rules of the game side live in
 * lib/haroolife/city/workers.ts.
 */
import type { FieldOffer, FieldWorker } from './city/workers'

export interface MyOffers {
  /** What this player proposed (the last 7 days). */
  hired: FieldOffer[]
  /** What is proposed to this player, as a worker, waiting for an answer. */
  asked: FieldOffer[]
}

async function client() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

/** The database's own messages are written for players; anything else is said plainly. */
const KNOWN =
  /Connexion|jours de travail|Champ invalide|plus disponible|attend déjà|Assez de propositions|sauvegardée|Solde insuffisant|introuvable|n’attend plus|déjà répondue/

const UNAVAILABLE = 'Impossible pour l’instant : vérifie ta connexion.'

/** A call whose answer is used only when it has the expected shape. */
async function call<T>(
  fn: string,
  args: Record<string, unknown> | undefined,
  valid: (data: unknown) => boolean,
): Promise<T | { error: string }> {
  const { data, error } = await (await client()).rpc(fn, args)
  if (error) return { error: KNOWN.test(error.message) ? error.message : UNAVAILABLE }
  return valid(data) ? (data as T) : { error: UNAVAILABLE }
}

const isOffer = (d: unknown) =>
  !!d &&
  typeof d === 'object' &&
  typeof (d as FieldOffer).id === 'string' &&
  typeof (d as FieldOffer).status === 'string'
const isMine = (d: unknown) =>
  !!d &&
  typeof d === 'object' &&
  Array.isArray((d as MyOffers).hired) &&
  Array.isArray((d as MyOffers).asked)

export const isError = (v: unknown): v is { error: string } =>
  !!v && typeof v === 'object' && 'error' in v

/** Up to 8 available workers, those of the region first. */
export const fieldWorkers = (region: string) =>
  call<FieldWorker[]>('haroolife_field_workers', { p_region: region }, Array.isArray)

export const offerWork = (worker: string, days: number, crop: string, locality: string) =>
  call<FieldOffer>(
    'haroolife_field_offer',
    { p_worker: worker, p_days: days, p_crop: crop, p_locality: locality },
    isOffer,
  )

export const myOffers = () => call<MyOffers>('haroolife_field_offers_mine', undefined, isMine)

export const answerOffer = (offer: string, accept: boolean) =>
  call<FieldOffer>('haroolife_field_answer', { p_offer: offer, p_accept: accept }, isOffer)

export const cancelOffer = (offer: string) =>
  call<FieldOffer>('haroolife_field_cancel', { p_offer: offer }, isOffer)

/** The answer was applied to the game: it will not be applied again on another visit. */
export const markSeen = (offer: string) =>
  call<boolean>('haroolife_field_seen', { p_offer: offer }, () => true)
