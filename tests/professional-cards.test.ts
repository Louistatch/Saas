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

// ── Phase 2 ──────────────────────────────────────────────────────────────────

import {
  CARD_STATUS_LABEL,
  DOCUMENT_MAX_BYTES,
  canHolderEditDocuments,
  cardPrefixFor,
  decideDocumentAccess,
  decideRegistrationFaitiere,
  documentStoragePath,
  formatValidUntil,
  isValidFaitiere,
  normalizeProfession,
  professionLabel,
  qualificationFor,
  validateDocumentUpload,
  validatedByLine,
} from '../lib/professionals/core'
import { harooSignupSchema, professionalRegisterSchema } from '../lib/professionals/schemas'

const FAITIERE = '11111111-1111-4111-8111-111111111111'

test('isValidFaitiere : niveau faitiere, non supprimée', () => {
  assert.equal(isValidFaitiere({ id: FAITIERE, level: 'faitiere', deleted_at: null }), true)
  assert.equal(isValidFaitiere({ id: FAITIERE, level: 'union' }), false)
  assert.equal(isValidFaitiere({ id: FAITIERE, level: 'cooperative' }), false)
  assert.equal(
    isValidFaitiere({ id: FAITIERE, level: 'faitiere', deleted_at: '2026-01-01T00:00:00Z' }),
    false,
  )
  assert.equal(isValidFaitiere(null), false)
})

test('decideRegistrationFaitiere : OO limité à ses mandats, super_admin libre', () => {
  assert.equal(
    decideRegistrationFaitiere({
      role: 'none',
      requestedFaitiereId: 'f1',
      mandatedFaitiereIds: ['f1'],
    }),
    true,
  )
  assert.equal(
    decideRegistrationFaitiere({
      role: 'none',
      requestedFaitiereId: 'f2',
      mandatedFaitiereIds: ['f1'],
    }),
    false,
  )
  assert.equal(
    decideRegistrationFaitiere({
      role: 'super_admin',
      requestedFaitiereId: 'f2',
      mandatedFaitiereIds: [],
    }),
    true,
  )
})

test('professions : libellés, qualification (si vérifié seulement), préfixes', () => {
  assert.equal(normalizeProfession(null), 'agronome')
  assert.equal(normalizeProfession('inconnu'), 'agronome')
  assert.equal(normalizeProfession('TECHNICIEN'), 'technicien')
  assert.equal(professionLabel('AGRONOME', null), 'Ingénieur agronome')
  assert.equal(professionLabel('AGRONOME', 'technicien'), 'Technicien agricole')
  assert.equal(professionLabel('AGRONOME', 'conseiller'), 'Conseiller agricole')
  assert.equal(professionLabel('OUVRIER', 'technicien'), 'Ouvrier agricole')
  assert.equal(qualificationFor('AGRONOME', 'agronome', true), 'Agronome certifié')
  assert.equal(qualificationFor('AGRONOME', 'technicien', true), 'Technicien agricole certifié')
  assert.equal(qualificationFor('AGRONOME', 'conseiller', true), 'Conseiller agricole certifié')
  assert.equal(qualificationFor('AGRONOME', 'technicien', false), null)
  assert.equal(qualificationFor('OUVRIER', null, true), null)
  assert.equal(cardPrefixFor('AGRONOME', null), 'AGR')
  assert.equal(cardPrefixFor('AGRONOME', 'technicien'), 'TEC')
  assert.equal(cardPrefixFor('AGRONOME', 'conseiller'), 'CON')
  assert.equal(cardPrefixFor('OUVRIER'), 'OUV')
})

test('charge utile publique : profession et qualification du technicien', () => {
  const payload = buildProfessionalPublicPayload(
    {
      cardType: 'AGRONOME',
      card: {
        card_number: 'TEC-123456',
        status: 'active',
        expiry_date: '2028-10-07',
        created_at: null,
      },
      profile: {
        first_name: 'A',
        last_name: 'B',
        photo_url: null,
        badge_valide: true,
        statut_validation: 'VALIDE',
        profession: 'technicien',
      },
      faitiereName: 'F',
    },
    TODAY,
  )
  assert.equal(payload.professional.profession, 'technicien')
  assert.equal(payload.professional.profession_label, 'Technicien agricole')
  assert.equal(payload.professional.qualification, 'Technicien agricole certifié')
})

test('carte : statut imprimé, validité, mention de faîtière', () => {
  assert.deepEqual(CARD_STATUS_LABEL, {
    ACTIVE: 'ACTIF',
    SUSPENDED: 'SUSPENDU',
    REVOKED: 'RÉVOQUÉ',
    EXPIRED: 'EXPIRÉ',
  })
  assert.equal(
    CARD_STATUS_LABEL[computeCardStatus({ status: 'active', expiry_date: '2026-01-01' }, TODAY)],
    'EXPIRÉ',
  )
  assert.equal(formatValidUntil('2028-10-07'), 'Valide jusqu’au 07/10/2028')
  assert.equal(formatValidUntil(null), null)
  assert.equal(validatedByLine(true, 'FUCEC'), 'Membre validé par la faîtière FUCEC')
  assert.equal(validatedByLine(false, 'FUCEC'), null)
  assert.equal(validatedByLine(true, null), null)
})

test('émission : préfixe TEC- pour un technicien validé', async () => {
  let prefix = ''
  const store: CardIssueStore = {
    getProfile: async () => ({
      id: 'p',
      user_id: 'u',
      first_name: 'A',
      card_number: null,
      statut_validation: 'VALIDE',
      profession: 'technicien',
    }),
    newCardNumber: async (p) => {
      prefix = p
      return `${p}-123456`
    },
    newVerifyToken: () => 't',
    insertCard: async () => ({ id: 'c' }),
    linkProfile: async () => ({}),
    deleteCard: async () => {},
  }
  const r = await issueCardWith(store, 'AGRONOME', 'p', TODAY)
  assert.equal(prefix, 'TEC')
  assert.ok(r.ok && r.card_number === 'TEC-123456')
})

test('justificatifs : règle d’accès (titulaire, super_admin, OO mandaté)', () => {
  const base = { ownerUserId: 'owner', faitiereId: 'f1', mandatedFaitiereIds: [] as string[] }
  assert.equal(decideDocumentAccess({ ...base, callerId: 'owner', role: 'none' }), true)
  assert.equal(decideDocumentAccess({ ...base, callerId: 'x', role: 'super_admin' }), true)
  assert.equal(decideDocumentAccess({ ...base, callerId: 'x', role: 'none' }), false)
  assert.equal(
    decideDocumentAccess({ ...base, callerId: 'oo', role: 'none', mandatedFaitiereIds: ['f1'] }),
    true,
  )
  assert.equal(
    decideDocumentAccess({ ...base, callerId: 'oo', role: 'none', mandatedFaitiereIds: ['f2'] }),
    false,
  )
  // Dossier sans faîtière : aucun OO.
  assert.equal(
    decideDocumentAccess({
      ...base,
      faitiereId: null,
      callerId: 'oo',
      role: 'cooperative_admin',
      mandatedFaitiereIds: ['f1'],
    }),
    false,
  )
  assert.equal(decideDocumentAccess({ ...base, callerId: null, role: 'super_admin' }), false)
  assert.equal(canHolderEditDocuments('EN_ATTENTE'), true)
  assert.equal(canHolderEditDocuments('REJETE'), true)
  assert.equal(canHolderEditDocuments('VALIDE'), false)
})

test('justificatifs : format, taille, chemin sous <user_id>/', () => {
  assert.deepEqual(validateDocumentUpload({ mime: 'application/pdf', size: 1000 }), {
    ok: true,
    ext: 'pdf',
  })
  assert.equal(validateDocumentUpload({ mime: 'image/gif', size: 1000 }).ok, false)
  assert.equal(
    validateDocumentUpload({ mime: 'image/png', size: DOCUMENT_MAX_BYTES + 1 }).ok,
    false,
  )
  assert.equal(validateDocumentUpload({ mime: 'image/png', size: 0 }).ok, false)
  assert.equal(documentStoragePath('u1', 'diplome', 'pdf', 'ab'), 'u1/diplome-ab.pdf')
})

test('schéma d’inscription : faîtière obligatoire pour le conseil agricole', () => {
  const base = {
    firstName: 'Kossi',
    lastName: 'Amegah',
    phone: '+228 90 00 00 00',
    email: 'K@Example.tg',
    password: 'motdepasse1',
  }
  assert.equal(harooSignupSchema.safeParse({ ...base, profileType: 'OUVRIER' }).success, true)
  const noFaitiere = harooSignupSchema.safeParse({ ...base, profileType: 'AGRONOME' })
  assert.equal(noFaitiere.success, false)
  assert.ok(!noFaitiere.success && noFaitiere.error.issues.some((i) => i.path[0] === 'faitiereId'))
  const ok = harooSignupSchema.safeParse({
    ...base,
    profileType: 'AGRONOME',
    profession: 'conseiller',
    faitiereId: FAITIERE,
    specialisations: ['Irrigation'],
  })
  assert.ok(ok.success && ok.data.email === 'k@example.tg' && ok.data.profession === 'conseiller')
  assert.equal(
    harooSignupSchema.safeParse({ ...base, profileType: 'AGRONOME', faitiereId: 'pas-un-uuid' })
      .success,
    false,
  )
  assert.equal(
    harooSignupSchema.safeParse({
      ...base,
      profileType: 'AGRONOME',
      faitiereId: FAITIERE,
      profession: 'medecin',
    }).success,
    false,
  )
  assert.equal(
    harooSignupSchema.safeParse({ ...base, profileType: 'ACHETEUR', profession: 'technicien' })
      .success,
    false,
  )
  assert.equal(
    professionalRegisterSchema.safeParse({
      profession: 'technicien',
      faitiereId: FAITIERE,
      firstName: 'Ama',
      lastName: 'Kodjo',
      phone: '90000000',
      email: 'ama@example.tg',
    }).success,
    true,
  )
})
