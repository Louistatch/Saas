import { randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { type Socket, io } from 'socket.io-client'
import type { ClientToServer, ServerToClient } from '../../lib/haroolife/realtime/protocol'
import type { RealtimeAuth, createRealtime } from '../../realtime/core'
import { LOCAL_ACCOUNTS, pgliteChat } from '../../realtime/pglite'

export type Client = Socket<ServerToClient, ClientToServer>
export const tokenFor = (sub: string) => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'none' })}.${b64({ sub, exp: 4102444800 })}.x`
}
export const fixtureAuth: RealtimeAuth = {
  async verify(token) {
    const sub = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub
    return Object.values(LOCAL_ACCOUNTS).some((a) => a.id === sub) ? { userId: sub } : null
  },
}
export const fixtureChat = () =>
  pgliteChat([
    'supabase/migrations/20261013_120000_haroolife_realtime_chat.sql',
    'supabase/migrations/20261015_130000_haroolife_chat_dm.sql',
  ])
export const relayUrl = (relay: ReturnType<typeof createRealtime>) =>
  `http://127.0.0.1:${(relay.http.address() as AddressInfo).port}`
export const connect = (url: string, who: keyof typeof LOCAL_ACCOUNTS, focused = false) => {
  const client: Client = io(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: {
      token: tokenFor(LOCAL_ACCOUNTS[who].id),
      subscriptions: focused ? 'focused' : undefined,
    },
  })
  return client
}
export const event = <E extends keyof ServerToClient>(client: Client, name: E, ms = 4000) =>
  new Promise<Parameters<ServerToClient[E]>[0]>((resolve, reject) => {
    const on = (data: Parameters<ServerToClient[E]>[0]) => {
      clearTimeout(timer)
      resolve(data)
    }
    const timer = setTimeout(() => {
      client.off(name, on as never)
      reject(new Error(`Missing ${name}`))
    }, ms)
    client.once(name, on as never)
  })
export const delay = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms))
export const uniquePool = () => `test_${randomBytes(8).toString('hex')}`
