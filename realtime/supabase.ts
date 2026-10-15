/**
 * Production adapters: Supabase Auth checks the token; the chat functions run through PostgREST
 * WITH THE PERSON'S TOKEN (auth.uid() = them). No service_role key in the relay.
 */
import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import type { ChatMessage, Me } from '../lib/haroolife/realtime/protocol'
import { type ChatRepository, type RealtimeAuth, RepoError } from './core'

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }

export function supabaseAdapters(
  url: string,
  anonKey: string,
): { auth: RealtimeAuth; chat: ChatRepository } {
  const anon = createClient(url, anonKey, opts)
  // A small cache of per-token clients (tokens live one hour; bounded memory).
  const clients = new Map<string, SupabaseClient>()
  const as = (token: string) => {
    let c = clients.get(token)
    if (!c) {
      c = createClient(url, anonKey, {
        ...opts,
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      clients.set(token, c)
      if (clients.size > 500) clients.delete(clients.keys().next().value as string)
    }
    return c
  }
  async function rpc<T>(token: string, fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error, status } = await as(token).rpc(fn, args)
    if (!error) return data as T
    if (status === 401 || error.code === 'PGRST301' || /jwt/i.test(error.message))
      throw new RepoError('auth_expired', 'Session expirée : reconnexion…')
    if (error.code === '42501') throw new RepoError('forbidden', error.message)
    if (error.code === '22023')
      throw new RepoError(
        /Trop de (nouvelles conversations|messages)/.test(error.message)
          ? 'rate_limited'
          : 'invalid',
        error.message,
      )
    if (error.code === '23514') throw new RepoError('invalid', 'Salon inconnu.')
    throw new RepoError('unavailable', 'Base de données momentanément indisponible.')
  }
  return {
    auth: {
      async verify(token) {
        const { data, error } = await anon.auth.getUser(token)
        return error || !data.user ? null : { userId: data.user.id }
      },
    },
    chat: {
      me: (t) => rpc<Me>(t, 'haroolife_chat_me', {}),
      send: (t, room, body, clientId) =>
        rpc(t, 'haroolife_chat_send', { p_room: room, p_body: body, p_client_id: clientId }),
      history: (t, room, after, before, limit) =>
        rpc<ChatMessage[]>(t, 'haroolife_chat_history', {
          p_room: room,
          p_after: after,
          p_before: before,
          p_limit: limit,
        }),
      edit: (t, id, body) => rpc<ChatMessage>(t, 'haroolife_chat_edit', { p_id: id, p_body: body }),
      remove: (t, id) => rpc<ChatMessage>(t, 'haroolife_chat_delete', { p_id: id }),
      report: async (t, id, reason) => {
        await rpc(t, 'haroolife_chat_report', { p_id: id, p_reason: reason })
      },
      block: (t, id) => rpc<string>(t, 'haroolife_chat_block', { p_message: id }),
      dmOpen: (t, key) => rpc(t, 'haroolife_dm_open', { p_key: key }),
      dmPeers: (t) => rpc(t, 'haroolife_dm_peers', {}),
      blockKey: (t, key) => rpc<string>(t, 'haroolife_chat_block_key', { p_key: key }),
      reportUser: async (t, key, reason) => {
        await rpc(t, 'haroolife_chat_report_user', { p_key: key, p_reason: reason })
      },
    },
  }
}
