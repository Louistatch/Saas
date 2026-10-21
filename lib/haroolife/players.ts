/**
 * Who is in HarooLife: how many people have the game open right now (visitors included), and the
 * residents a player can write to, connected or not. A private message to someone who is away is
 * kept and read when they come back, in the game or on their dashboard. See
 * supabase/migrations/20261022_130000_haroolife_players.sql.
 */
import { LOCALITIES, type LocalityId, isLocalityId } from './city/locality'

export interface PlayerCounts {
  /** People with the game open in the last 2 minutes, all towns and visitors included. */
  online: number
  /** Residents (players who chose a house). */
  players: number
}

export interface PlayerEntry {
  key: string
  name: string
  username: string | null
  pagne: number
  online: boolean
  /** Only while online. */
  locality: LocalityId | null
  /** Never an exact time. */
  seen: 'now' | 'today' | 'week' | null
}

export interface PlayerList extends PlayerCounts {
  list: PlayerEntry[]
}

const isCounts = (d: unknown): d is PlayerCounts =>
  !!d &&
  typeof d === 'object' &&
  typeof (d as PlayerCounts).online === 'number' &&
  typeof (d as PlayerCounts).players === 'number'

async function client() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

/** The game is open here: counts as online for 2 minutes. Null when unavailable. */
export async function imHere(locality: LocalityId): Promise<PlayerCounts | null> {
  const { data, error } = await (await client()).rpc('haroolife_here', { p_locality: locality })
  return !error && isCounts(data) ? data : null
}

export async function listPlayers(search: string, limit = 30): Promise<PlayerList | null> {
  const { data, error } = await (await client()).rpc('haroolife_players', {
    p_search: search.trim() || null,
    p_limit: limit,
  })
  return !error && isCounts(data) && Array.isArray((data as PlayerList).list)
    ? (data as PlayerList)
    : null
}

/** Without the live relay: the conversation is opened in the database, read on /messages. */
export async function openConversation(key: string): Promise<{ room: string } | { error: string }> {
  const { data, error } = await (await client()).rpc('haroolife_dm_open', { p_key: key })
  if (error) {
    const known = /maison|introuvable|non autorisée|conversations|Connexion/.exec(error.message)
    return { error: known ? error.message : 'Impossible d’ouvrir la conversation pour l’instant.' }
  }
  const room = (data as { room?: unknown } | null)?.room
  return typeof room === 'string'
    ? { room }
    : { error: 'Impossible d’ouvrir la conversation pour l’instant.' }
}

/** « 1 personne en ligne », « 12 personnes en ligne ». */
export const onlineSaid = (n: number) => `${n} personne${n > 1 ? 's' : ''} en ligne`

/** Where or when, in words, for a player of the list. */
export function seenSaid(p: Pick<PlayerEntry, 'online' | 'locality' | 'seen'>): string {
  if (p.online)
    return p.locality && isLocalityId(p.locality)
      ? `En ligne à ${LOCALITIES[p.locality].name}`
      : 'En ligne'
  if (p.seen === 'today') return 'Passé aujourd’hui'
  if (p.seen === 'week') return 'Passé cette semaine'
  return 'Pas vu depuis un moment'
}
