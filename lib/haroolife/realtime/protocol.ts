/**
 * HarooLife realtime protocol v1 (D4+, M1), shared by the Socket.IO relay and the browser.
 * Types and limits only: no runtime dependency, so the client bundle stays small.
 *
 * A chat message is durable data: the relay stores it in Postgres (haroolife_chat_send) BEFORE
 * broadcasting `chat:new`, acknowledges the sender, and clients catch up by `seq` cursor after a
 * reconnection (`sync:resume`). Socket.IO itself is at-most-once and is never the source of truth.
 */
export const PROTOCOL_VERSION = 1
export const LOCALITIES = ['lome', 'kara'] as const
export type Locality = (typeof LOCALITIES)[number]

/**
 * world:togo · locality:lome · canton:<uuid> · coop:<uuid> · dm:<key>:<key> (a private
 * conversation between two players met in the street, keys sorted; consent rules in Postgres:
 * either side's block closes it, at most 20 new conversations a day).
 */
export type RoomId = string
export const ROOM_PATTERN =
  /^(world:togo|locality:(lome|kara)|canton:[0-9a-f-]{36}|coop:[0-9a-f-]{36}|dm:[0-9a-f]{16}:[0-9a-f]{16})$/
export const KEY_PATTERN = /^[0-9a-f]{16}$/
export const isDm = (room: RoomId) => room.startsWith('dm:')

export const LIMITS = {
  body: 500,
  historyPage: 50,
  /** Client outbox: messages typed offline, sent on reconnection (same clientId: idempotent). */
  outbox: 30,
  /** Movement snapshots per second sent by a client (the relay drops anything faster). */
  poseHz: 8,
  typingEveryMs: 2000,
  ackTimeoutMs: 8000,
  maxPayloadBytes: 16 * 1024,
} as const

export interface Author {
  /** Opaque, stable key: never the account id, phone or e-mail. */
  key: string
  name: string
  pagne: number
}
export interface ChatMessage {
  id: string
  seq: number
  room: RoomId
  body: string
  deleted: boolean
  edited: boolean
  created_at: string
  author: Author
  /** Only present for the sender's own messages (matches its outbox entry). */
  client_id?: string | null
}
export interface Me extends Author {
  can_write: boolean
  /** A visitor (no e-mail yet): reads the rooms, writes once the game is kept with an e-mail. */
  visitor?: boolean
  rooms: RoomId[]
  blocked: string[]
}
/** The other person of a private conversation. */
export type Peer = Author
export interface PresenceEntry extends Author {
  locality: Locality | null
}
export interface Pose {
  x: number
  z: number
  heading: number
  mode: string
  /** Client sequence number, increasing; the relay keeps the latest only. */
  n: number
}
export type Ack<T> = ({ ok: true } & T) | { ok: false; code: ErrorCode; error: string }
export type ErrorCode =
  | 'invalid'
  | 'forbidden'
  | 'rate_limited'
  | 'auth_expired'
  | 'unavailable'
  | 'disabled'

export interface ClientToServer {
  'chat:send': (
    p: { v: 1; room: RoomId; body: string; clientId: string },
    ack: (r: Ack<{ message: ChatMessage }>) => void,
  ) => void
  'chat:history': (
    p: { room: RoomId; before?: number | null; limit?: number },
    ack: (r: Ack<{ messages: ChatMessage[] }>) => void,
  ) => void
  'chat:edit': (
    p: { id: string; body: string },
    ack: (r: Ack<{ message: ChatMessage }>) => void,
  ) => void
  'chat:delete': (p: { id: string }, ack: (r: Ack<{ message: ChatMessage }>) => void) => void
  'chat:report': (p: { id: string; reason: string }, ack: (r: Ack<object>) => void) => void
  'chat:block': (p: { id: string }, ack: (r: Ack<{ key: string }>) => void) => void
  'chat:typing': (p: { room: RoomId }) => void
  /** After a reconnection: everything stored after the last seq seen in each room. */
  'sync:resume': (
    p: { cursors: Record<RoomId, number> },
    ack: (r: Ack<{ messages: Record<RoomId, ChatMessage[]> }>) => void,
  ) => void
  /** Where the player is now (slow state: locality only, never a position). */
  'presence:join': (
    p: { locality: Locality },
    ack: (r: Ack<{ present: PresenceEntry[] }>) => void,
  ) => void
  'player:pose': (p: Pose) => void
  /** Open (or find) the private conversation with a player met in the street, by their key. */
  'dm:open': (p: { key: string }, ack: (r: Ack<{ room: RoomId; peer: Peer }>) => void) => void
  /** Names of the people of my private conversations (room → peer). */
  'dm:peers': (p: object, ack: (r: Ack<{ peers: Record<RoomId, Peer> }>) => void) => void
  /** From a player's sheet: block them (closes any private conversation) or report them. */
  'player:block': (p: { key: string }, ack: (r: Ack<{ key: string }>) => void) => void
  'player:report': (p: { key: string; reason: string }, ack: (r: Ack<object>) => void) => void
}
export interface ServerToClient {
  'chat:new': (m: ChatMessage) => void
  'chat:edit': (m: ChatMessage) => void
  'chat:delete': (m: ChatMessage) => void
  'chat:typing': (p: { room: RoomId; key: string; name: string }) => void
  'presence:join': (p: PresenceEntry) => void
  'presence:leave': (p: { key: string; locality: Locality | null }) => void
  'player:snapshot': (p: { key: string; pose: Pose; t: number }) => void
  'system:error': (p: { code: ErrorCode; error: string }) => void
  'system:hello': (p: { v: number; me: Me }) => void
  /** A private conversation is now open to me (I opened it, or someone met me and did). */
  'dm:opened': (p: { room: RoomId; peer: Peer }) => void
  /** A private conversation was closed (a block, on either side). */
  'dm:closed': (p: { room: RoomId }) => void
}
