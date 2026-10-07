import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type CardIssueStore,
  type DecisionDeps,
  type IssueStoreProfile,
  buildProfessionalPublicPayload,
  computeCardStatus,
  decideCanValidate,
  issueCardWith,
  resolveProfessionalDecision,
} from '../lib/professionals/core'
import { VERIFY_TOKEN_PATTERN, generateVerifyToken } from '../lib/professionals/verify-token'

const TODAY = new Date('2026-10-07T12:00:00Z')

test('generateVerifyToken : 32 caractères base64url, uniques', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 1000; i++) {
    const t = generateVerifyToken()
    assert.equal(t.length, 32)
    assert.match(t, /^[A-Za-z0-9_-]+$/)
    assert.match(t, VERIFY_TOKEN_PATTERN)
    seen.add(t)
  }
  assert.equal(seen.size, 1000)
})

test('computeCardStatus : active / suspendue / révoquée / expirée', () => {
  const base = { status: 'active', expiry_date: '2027-01-01' }
  assert.equal(computeCardStatus(base, TODAY), 'ACTIVE')
  assert.equal(computeCardStatus({ ...base, expiry_date: '2026-10-07' }, TODAY), 'ACTIVE')
  assert.equal(computeCardStatus({ ...base, expiry_date: '2026-10-06' }, TODAY), 'EXPIRED')
  assert.equal(computeCardStatus({ ...base, status: 'expired' }, TODAY), 'EXPIRED')
  assert.equal(computeCardStatus({ ...base, status: 'suspended' }, TODAY), 'SUSPENDED')
  assert.equal(computeCardStatus({ ...base, status: 'revoked' }, TODAY), 'REVOKED')
  assert.equal(computeCardStatus({ ...base, revoked_at: '2026-01-01T00:00:00Z' }, TODAY), 'REVOKED')
  // Priorités : révoquée > suspendue > expirée.
  assert.equal(
    computeCardStatus({ status: 'suspended', expiry_date: '2020-01-01' }, TODAY),
    'SUSPENDED',
  )
  assert.equal(
    computeCardStatus({ status: 'revoked', expiry_date: '2020-01-01' }, TODAY),
    'REVOKED',
  )
  assert.equal(computeCardStatus({ status: 'active', expiry_date: null }, TODAY), 'ACTIVE')
})

test('charge utile publique : liste blanche, sans téléphone ni notes', () => {
  const payload = buildProfessionalPublicPayload(
    {
      cardType: 'AGRONOME',
      card: {
        card_number: 'AGR-123456',
        status: 'active',
        expiry_date: '2028-01-01',
        created_at: '2026-01-01T10:00:00Z',
      },
      profile: {
        first_name: 'Ama',
        last_name: 'Koffi',
        photo_url: null,
        badge_valide: true,
        statut_validation: 'VALIDE',
        // Champs sensibles passés par erreur : ne doivent jamais ressortir.
        ...({ phone: '+22890000000', note_moyenne: 4.5, nombre_missions: 3 } as object),
      } as Parameters<typeof buildProfessionalPublicPayload>[0]['profile'],
      faitiereName: 'FENOMAT',
    },
    TODAY,
  )
  const json = JSON.stringify(payload)
  for (const forbidden of ['phone', '22890000000', 'note_moyenne', 'nombre_missions', 'missions']) {
    assert.ok(!json.includes(forbidden), `fuite : ${forbidden}`)
  }
  assert.equal(payload.valid, true)
  assert.equal(payload.professional.verified, true)
  assert.equal(payload.professional.qualification, 'Agronome certifié')
  assert.equal(payload.professional.faitiere_name, 'FENOMAT')
  assert.equal(payload.card.public_status, 'ACTIVE')
  assert.deepEqual(payload.agronome, payload.professional)

  const unverified = buildProfessionalPublicPayload(
    {
      cardType: 'AGRONOME',
      card: { card_number: 'AGR-1', status: 'suspended', expiry_date: null, created_at: null },
      profile: {
        first_name: 'A',
        last_name: 'B',
        photo_url: null,
        badge_valide: true,
        statut_validation: 'EN_ATTENTE',
      },
      faitiereName: null,
    },
    TODAY,
  )
  assert.equal(unverified.valid, false)
  assert.equal(unverified.professional.verified, false)
  assert.equal(unverified.professional.qualification, null)
  assert.equal(unverified.card.public_status, 'SUSPENDED')
})

test('decideCanValidate : matrice de décision', () => {
  const F = 'faitiere-1'
  assert.equal(
    decideCanValidate({ role: 'super_admin', faitiereId: null, mandatedFaitiereIds: [] }),
    true,
  )
  assert.equal(
    decideCanValidate({ role: 'super_admin', faitiereId: F, mandatedFaitiereIds: [] }),
    true,
  )
  assert.equal(decideCanValidate({ role: 'member', faitiereId: F, mandatedFaitiereIds: [F] }), true)
  assert.equal(
    decideCanValidate({ role: 'none', faitiereId: F, mandatedFaitiereIds: ['autre'] }),
    false,
  )
  assert.equal(
    decideCanValidate({ role: 'member', faitiereId: null, mandatedFaitiereIds: [F] }),
    false,
  )
  assert.equal(
    decideCanValidate({ role: 'cooperative_admin', faitiereId: F, mandatedFaitiereIds: [] }),
    false,
  )
  assert.equal(decideCanValidate({ role: null, faitiereId: F, mandatedFaitiereIds: [] }), false)
})

/** Base en mémoire : un profil agronome, des cartes. */
function memoryWorld(opts: { failLink?: boolean } = {}) {
  const profile: IssueStoreProfile & {
    faitiere_id: string | null
    badge_valide: boolean
    rejection_reason: string | null
  } = {
    id: 'p1',
    user_id: 'u1',
    first_name: 'Ama',
    card_number: null,
    statut_validation: 'EN_ATTENTE',
    faitiere_id: 'f1',
    badge_valide: false,
    rejection_reason: null,
  }
  const cards: Array<{ id: string; card_number: string; verify_token: string }> = []
  let seq = 0
  const store: CardIssueStore = {
    getProfile: async (_t, id) => (id === profile.id ? { ...profile } : null),
    newCardNumber: async (prefix) => `${prefix}-${100000 + ++seq}`,
    newVerifyToken: generateVerifyToken,
    insertCard: async (row) => {
      const id = `c${cards.length + 1}`
      cards.push({ id, card_number: row.card_number, verify_token: row.verify_token })
      return { id }
    },
    linkProfile: async (_t, _id, link) => {
      if (opts.failLink) return { error: 'échec' }
      profile.card_number = link.card_number
      return {}
    },
    deleteCard: async (id) => {
      const i = cards.findIndex((c) => c.id === id)
      if (i >= 0) cards.splice(i, 1)
    },
  }
  const notified: string[] = []
  const deps = (allowed: boolean): DecisionDeps => ({
    loadProfile: async (id) =>
      id === profile.id
        ? {
            id,
            user_id: profile.user_id,
            faitiere_id: profile.faitiere_id,
            statut_validation: profile.statut_validation ?? 'EN_ATTENTE',
          }
        : null,
    canValidate: async () => allowed,
    updateProfile: async (_id, patch) => {
      profile.statut_validation = patch.statut_validation
      profile.badge_valide = patch.badge_valide
      profile.rejection_reason = patch.rejection_reason
      return {}
    },
    issueCard: (id) => issueCardWith(store, 'AGRONOME', id, TODAY),
    notifyDecision: (_u, d) => notified.push(`decision:${d}`),
    notifyCardIssued: (r) => notified.push(`card:${r.card_number}`),
  })
  return { profile, cards, store, deps, notified }
}

test('décision VALIDE → carte émise une seule fois (idempotent)', async () => {
  const w = memoryWorld()
  const first = await resolveProfessionalDecision(w.deps(true), {
    profileId: 'p1',
    decision: 'VALIDE',
    actorId: 'admin',
    now: TODAY,
  })
  assert.ok(first.ok)
  assert.equal(first.ok && first.card_created, true)
  assert.equal(w.cards.length, 1)
  assert.match(w.cards[0].verify_token, VERIFY_TOKEN_PATTERN)
  assert.equal(w.profile.card_number, w.cards[0].card_number)

  const second = await resolveProfessionalDecision(w.deps(true), {
    profileId: 'p1',
    decision: 'VALIDE',
    actorId: 'admin',
    now: TODAY,
  })
  assert.ok(second.ok)
  assert.equal(second.ok && second.card_created, false)
  assert.equal(second.ok && second.card_number, w.cards[0].card_number)
  assert.equal(w.cards.length, 1)
  assert.equal(w.notified.filter((n) => n.startsWith('card:')).length, 1)
})

test('décision : refus sans mandat, rejet motivé, rollback de carte', async () => {
  const w = memoryWorld()
  const denied = await resolveProfessionalDecision(w.deps(false), {
    profileId: 'p1',
    decision: 'VALIDE',
    actorId: 'op',
  })
  assert.deepEqual(denied.ok ? null : denied.status, 403)
  assert.equal(w.cards.length, 0)

  const noReason = await resolveProfessionalDecision(w.deps(true), {
    profileId: 'p1',
    decision: 'REJETE',
    reason: '  ',
    actorId: 'op',
  })
  assert.deepEqual(noReason.ok ? null : noReason.status, 400)

  const rejected = await resolveProfessionalDecision(w.deps(true), {
    profileId: 'p1',
    decision: 'REJETE',
    reason: 'Diplôme illisible',
    actorId: 'op',
  })
  assert.ok(rejected.ok)
  assert.equal(w.profile.rejection_reason, 'Diplôme illisible')
  assert.equal(w.profile.badge_valide, false)
  assert.equal(w.cards.length, 0)

  const missing = await resolveProfessionalDecision(w.deps(true), {
    profileId: 'absent',
    decision: 'VALIDE',
    actorId: 'op',
  })
  assert.deepEqual(missing.ok ? null : missing.status, 404)

  // Échec du report sur le profil → la carte est supprimée.
  const broken = memoryWorld({ failLink: true })
  broken.profile.statut_validation = 'VALIDE'
  const issued = await issueCardWith(broken.store, 'AGRONOME', 'p1', TODAY)
  assert.equal(issued.ok, false)
  assert.equal(broken.cards.length, 0)

  // Agronome non validé : pas d'émission.
  const pending = memoryWorld()
  const refused = await issueCardWith(pending.store, 'AGRONOME', 'p1', TODAY)
  assert.equal(refused.ok ? null : refused.reason, 'not_validated')
})
