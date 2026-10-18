/** Production: verified identity, then every durable RPC AS the person, never service_role. */
import { createClient } from '@supabase/supabase-js'
import type { ChatMessage, Me } from '../lib/haroolife/realtime/protocol'
import { type ChatRepository, type RealtimeAuth, RepoError } from './core'
import { WorkGate } from './work-gate'

export function supabaseAdapters(
  url: string,
  anonKey: string,
  options: { claims?: boolean; maxRequests?: number; fetch?: typeof fetch } = {},
): { auth: RealtimeAuth; chat: ChatRepository } {
  const gate = new WorkGate(options.maxRequests ?? 64)
  const base = url.replace(/\/$/, '')
  const request: typeof fetch = (input, init) =>
    (options.fetch ?? fetch)(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000),
    })
  const anon = createClient(base, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: request },
  })
  const bounded = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await gate.run(work)
    } catch (e) {
      if (e instanceof RepoError) throw e
      throw new RepoError('unavailable', 'Service momentanément indisponible.')
    }
  }
  // One HTTP request per RPC; no SupabaseClient instance or retained JWT for every connection.
  async function rpc<T>(token: string, fn: string, args: Record<string, unknown>): Promise<T> {
    return bounded(async () => {
      const response = await request(`${base}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      })
      const data = await response.json().catch(() => null)
      if (response.ok) return data as T
      const code = typeof data?.code === 'string' ? data.code : ''
      const message = typeof data?.message === 'string' ? data.message : ''
      if (response.status === 401 || code === 'PGRST301' || /jwt/i.test(message))
        throw new RepoError('auth_expired', 'Session expirée : reconnexion…')
      if (code === '42501') throw new RepoError('forbidden', message)
      if (code === '22023')
        throw new RepoError(
          /Trop de (nouvelles conversations|messages)/.test(message) ? 'rate_limited' : 'invalid',
          message,
        )
      if (code === '23514') throw new RepoError('invalid', 'Salon inconnu.')
      throw new RepoError('unavailable', 'Base de données momentanément indisponible.')
    })
  }
  return {
    auth: {
      verify: (token) =>
        bounded(async () => {
          if (options.claims) {
            // Supabase verifies the signature against cached JWKS (legacy HS256 falls back to Auth).
            // Never derive permissions from claims: chat_me reads profiles/RLS on every connection.
            const result = await anon.auth.getClaims(token).catch(() => null)
            const data = result?.data
            const error = result?.error
            const c = data?.claims
            const aud = c?.aud
            return !error &&
              c &&
              c.iss === `${base}/auth/v1` &&
              (aud === 'authenticated' || (Array.isArray(aud) && aud.includes('authenticated'))) &&
              typeof c.sub === 'string' &&
              typeof c.exp === 'number' &&
              c.exp * 1000 > Date.now()
              ? { userId: c.sub }
              : null
          }
          const { data, error } = await anon.auth.getUser(token)
          return error || !data.user ? null : { userId: data.user.id }
        }),
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
