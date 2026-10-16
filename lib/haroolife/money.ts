'use client'

/**
 * Game money between players (FCFA of the game, never real money). The wallet lives in each
 * player's local save; a transfer goes through the database (haroolife_money_send), and the
 * recipient's game collects it once (haroolife_money_claim). See
 * supabase/migrations/20261015_150000_haroolife_money.sql.
 */
import type { Peer } from './realtime/protocol'

export interface Received {
  id: string
  amount: number
  note: string | null
  at: string
  from: Peer
}

async function client() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

/** Send `amount` to the player with this key; the same clientId never pays twice. */
export async function sendMoney(
  key: string,
  amount: number,
  note: string,
  clientId: string,
): Promise<{ amount: number; to: Peer } | { error: string }> {
  const { data, error } = await (await client()).rpc('haroolife_money_send', {
    p_key: key,
    p_amount: amount,
    p_note: note,
    p_client_id: clientId,
  })
  if (error) {
    const known = /Montant|Plafond|introuvable|non autorisé|maison|Connexion/.exec(error.message)
    return { error: known ? error.message : 'Envoi impossible : vérifie ta connexion.' }
  }
  const r = data as { amount: number; to: Peer; duplicate?: boolean }
  // The recipient's phone is told (lib/push/server.ts), once: a replayed send queued nothing.
  if (!r.duplicate)
    void fetch('/api/push/dispatch', { method: 'POST', keepalive: true }).catch(() => {})
  return { amount: r.amount, to: r.to }
}

/** What others sent since the last time, collected once; null when unavailable. */
export async function claimMoney(): Promise<Received[] | null> {
  const { data, error } = await (await client()).rpc('haroolife_money_claim')
  return error ? null : ((data as Received[]) ?? [])
}
