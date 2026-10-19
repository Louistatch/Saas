/**
 * Arbre de coopératives, cartes et titulaires pour les tests de gratuité
 * membres (lib/fiches/member-scope.ts), posés dans le faux Supabase de
 * tests/fiches-fake-db.ts. Plus une panne de lecture ciblée par table, et deux
 * façons de brancher requirePrivateCard : doublure qui dit QUI présente la
 * carte (session de carte ou compte), ou vrai module (cookies et getUser simulés).
 *
 *   Faîtière Alpha ─┬─ Union Alpha ── Coop Alpha 1
 *                   └─ Coop Alpha 2
 *   Faîtière Bêta ──── Coop Bêta 1
 */
import path from 'node:path'
import type { Row, StubState } from './fiches-fake-db'

export const TREE = {
  FAITIERE_A: '0fa00000-0000-4000-8000-00000000000a',
  UNION_A: '0fa00000-0000-4000-8000-0000000000a1',
  COOP_A1: '0fa00000-0000-4000-8000-000000000a11',
  COOP_A2: '0fa00000-0000-4000-8000-0000000000a2',
  FAITIERE_B: '0fb00000-0000-4000-8000-00000000000b',
  COOP_B1: '0fb00000-0000-4000-8000-0000000000b1',
} as const

export function seedTree(state: StubState) {
  const coop = (id: string, name: string, level: string, parent_id: string | null) => ({
    id,
    name,
    level,
    parent_id,
    deleted_at: null,
  })
  state.store
    .rows('cooperatives')
    .push(
      coop(TREE.FAITIERE_A, 'Faîtière Alpha', 'faitiere', null),
      coop(TREE.UNION_A, 'Union Alpha', 'union', TREE.FAITIERE_A),
      coop(TREE.COOP_A1, 'Coop Alpha 1', 'cooperative', TREE.UNION_A),
      coop(TREE.COOP_A2, 'Coop Alpha 2', 'cooperative', TREE.FAITIERE_A),
      coop(TREE.FAITIERE_B, 'Faîtière Bêta', 'faitiere', null),
      coop(TREE.COOP_B1, 'Coop Bêta 1', 'cooperative', TREE.FAITIERE_B),
    )
}

export interface CardSpec {
  number?: string
  cardType?: 'FAITIERE' | 'OUVRIER' | 'ACHETEUR' | 'AGRONOME'
  cooperativeId: string | null
  /** Défaut : un membre pour une carte FAITIERE, aucun pour une carte Haroo. */
  memberId?: string | null
  status?: string
  expiry?: string | null
  revokedAt?: string | null
  suspendedAt?: string | null
  memberStatus?: string
  memberDeletedAt?: string | null
  /** Coopérative du membre ; défaut : celle de la carte. */
  memberCooperativeId?: string | null
  memberEmail?: string | null
  /** Qui présente la carte (doublure) ; défaut : session de carte du titulaire. */
  caller?: CallerStub
}

/** Ce que la doublure de requirePrivateCard dit de celui qui présente la carte. */
export interface CallerStub {
  via: 'card' | 'account'
  user: { id: string; email: string | null; emailConfirmed: boolean } | null
}

export const SMS_SESSION: CallerStub = { via: 'card', user: null }
export const MEMBER_EMAIL = 'awa@coop.tg'

/** Compte connecté qui peut lire la carte (doublure) ; e-mail confirmé par défaut. */
export function accountCaller(
  id: string,
  email: string | null = MEMBER_EMAIL,
  emailConfirmed = true,
): CallerStub {
  return { via: 'account', user: { id, email, emailConfirmed } }
}

/** Qui présente la carte au prochain appel de la doublure. */
export const cardCaller: { current: CallerStub } = { current: SMS_SESSION }

/**
 * Pose la carte (et son titulaire) en base, et fait passer le contrôle
 * requirePrivateCard (doublé) avec cette carte. Renvoie le numéro.
 */
export function giveCard(state: StubState, spec: CardSpec): string {
  const cardType = spec.cardType ?? 'FAITIERE'
  const number = spec.number ?? (cardType === 'FAITIERE' ? 'FTG-12345' : 'AGR-123456')
  const memberId =
    spec.memberId !== undefined ? spec.memberId : cardType === 'FAITIERE' ? 'member-1' : null
  state.store.rows('member_cards').push({
    id: `card-${number}`,
    card_number: number,
    card_type: cardType,
    cooperative_id: spec.cooperativeId,
    member_id: memberId,
    status: spec.status ?? 'active',
    expiry_date: spec.expiry ?? '2099-12-31',
    revoked_at: spec.revokedAt ?? null,
    suspended_at: spec.suspendedAt ?? null,
    deleted_at: null,
  })
  if (memberId) {
    state.store.rows('members').push({
      id: memberId,
      cooperative_id:
        spec.memberCooperativeId !== undefined ? spec.memberCooperativeId : spec.cooperativeId,
      email: spec.memberEmail !== undefined ? spec.memberEmail : MEMBER_EMAIL,
      status: spec.memberStatus ?? 'active',
      deleted_at: spec.memberDeletedAt ?? null,
    })
  }
  cardCaller.current = spec.caller ?? SMS_SESSION
  const card: Row = {
    member_id: memberId,
    cooperative_id: spec.cooperativeId,
    expiry_date: spec.expiry ?? '2099-12-31',
  }
  state.privateCard = { ok: true, card }
  return number
}

const CHAIN = ['select', 'eq', 'neq', 'in', 'is', 'not', 'order', 'limit', 'range', 'ilike']

/** Requête dont chaque lecture échoue, comme une panne réseau de PostgREST. */
function failingQuery(message: string): unknown {
  const result = { data: null, error: { message } }
  const q = Promise.resolve(result) as unknown as Record<string, unknown>
  for (const m of CHAIN) q[m] = () => q
  q.maybeSingle = () => Promise.resolve(result)
  q.single = q.maybeSingle
  return q
}

/** Profil d'un compte (lu par le client de service pour vérifier le titulaire). */
export function giveProfile(
  state: StubState,
  id: string,
  over: { role?: string; cooperative_id?: string | null; deleted_at?: string | null } = {},
) {
  state.store.rows('profiles').push({
    id,
    role: 'member',
    cooperative_id: null,
    deleted_at: null,
    ...over,
  })
}

type ModuleLoader = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}

/** Intercepte des modules AVANT les doublures de fiches-fake-db (à appeler après installStubs). */
function interceptModules(replace: (request: string) => unknown | undefined) {
  const Module = require('node:module') as ModuleLoader
  const previous = Module._load
  Module._load = function (this: unknown, request: string, parent: unknown, isMain: boolean) {
    const replaced = replace(request)
    if (replaced !== undefined) return replaced
    return previous.call(this, request, parent, isMain)
  }
}

/**
 * Doublure de requirePrivateCard qui dit aussi QUI présente la carte
 * (`cardCaller.current`), comme le vrai module (`via`, `user`). À installer
 * avant de charger la route.
 */
export function installCardAccessStub(state: StubState) {
  const { NextResponse } = require('next/server') as typeof import('next/server')
  const stub = {
    requirePrivateCard: async () => {
      if (!state.privateCard.ok) {
        return {
          ok: false,
          response: NextResponse.json({ error: 'Connectez-vous' }, { status: 401 }),
        }
      }
      const { via, user } = cardCaller.current
      return {
        ok: true,
        card: state.privateCard.card,
        supabase: state.session,
        userId: user?.id ?? null,
        via,
        user,
      }
    },
  }
  interceptModules((request) => (request === '@/lib/security/card-access' ? stub : undefined))
}

/**
 * Le VRAI requirePrivateCard (lib/security/card-access.ts), branché sur le faux
 * Supabase : `cookies()` de next/headers lit `jar`, le compte connecté est
 * `state.session.authUser`. La session de carte est signée avec CARD_AUTH_SECRET.
 */
export function useRealCardAccess(jar: Map<string, string>) {
  process.env.CARD_AUTH_SECRET ??= 'secret-de-test-assez-long-pour-hmac-0123456789'
  const realPath = path.resolve(__dirname, '../lib/security/card-access.ts')
  const headers = {
    cookies: async () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    }),
  }
  const Module = require('node:module') as ModuleLoader
  interceptModules((request) => {
    if (request === 'next/headers') return headers
    if (request === '@/lib/security/card-access') return Module._load(realPath, null, false)
    return undefined
  })
}

/**
 * Fait échouer toute lecture de `table` par le client de service. Renvoie la
 * fonction qui rétablit le client.
 */
export function failAdminReads(state: StubState, table: string): () => void {
  const client = state.admin as unknown as { from: (t: string) => unknown }
  const real = state.admin.from.bind(state.admin)
  client.from = (t: string) => (t === table ? failingQuery('connection reset') : real(t))
  // Rend la méthode du prototype (FakeClient.from).
  return () => Reflect.deleteProperty(client, 'from')
}
