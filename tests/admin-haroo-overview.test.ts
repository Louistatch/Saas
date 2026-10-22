import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type OverviewInput, type ProfileRow, summarizeHaroo } from '../lib/admin/haroo-overview'

const NOW = new Date('2026-10-22T08:00:00Z')
const FAITIERE = 'f0000000-0000-4000-8000-000000000001'

function row(user: string, extra: Partial<ProfileRow> = {}): ProfileRow {
  return {
    user_id: user,
    first_name: 'Prénom',
    last_name: user.toUpperCase(),
    card_number: null,
    created_at: '2026-10-01T10:00:00Z',
    ...extra,
  }
}

function input(over: Partial<OverviewInput> = {}): OverviewInput {
  return {
    ouvriers: [row('o1'), row('o2', { disponible: false }), row('o3')],
    acheteurs: [row('a1', { type_acheteur: 'GROSSISTE' }), row('a2')],
    agronomes: [
      row('g1', {
        first_name: 'Kodjo',
        last_name: 'AGBEKO',
        statut_validation: 'VALIDE',
        card_number: 'AGR-304345',
        faitiere_id: FAITIERE,
        created_at: '2026-10-04T10:00:00Z',
      }),
      row('g2', { statut_validation: 'VALIDE' }),
      row('g3', { statut_validation: 'EN_ATTENTE' }),
      row('g4', { statut_validation: 'REJETE', faitiere_id: FAITIERE }),
    ],
    demoUserIds: new Set(['o3', 'a2', 'g3']),
    cards: [
      {
        card_number: 'AGR-304345',
        status: 'active',
        expiry_date: '2028-10-11',
        revoked_at: null,
        created_at: '2026-10-11T09:00:00Z',
      },
    ],
    faitieres: new Map([[FAITIERE, 'FENOMAT']]),
    missions: [
      { statut: 'DEMANDE', accepted_at: null, created_at: '2026-10-20T10:00:00Z' },
      {
        statut: 'EN_COURS',
        accepted_at: '2026-06-12T10:00:00Z',
        created_at: '2026-06-11T10:00:00Z',
      },
    ],
    jobsOpen: 2,
    presalesOpen: 2,
    announcements: [{ type: 'prevente' }],
    now: NOW,
    ...over,
  }
}

test('counts each kind, demo accounts apart, and the agronome validation queue', () => {
  const o = summarizeHaroo(input())
  assert.deepEqual(o.totals, {
    ouvrier: { all: 3, demo: 1 },
    acheteur: { all: 2, demo: 1 },
    agronome: { all: 4, demo: 1 },
  })
  assert.deepEqual(o.agronomes, { pending: 1, validated: 2, rejected: 1 })
})

test('names who holds a card, its status, issue date and faîtière', () => {
  const o = summarizeHaroo(input())
  assert.equal(o.cards.issued, 1)
  assert.equal(o.cards.ACTIVE, 1)
  assert.equal(o.holders.length, 1)
  const [holder] = o.holders
  assert.equal(holder.name, 'Kodjo AGBEKO')
  assert.equal(holder.kind, 'agronome')
  assert.deepEqual(holder.card, {
    number: 'AGR-304345',
    status: 'ACTIVE',
    issuedAt: '2026-10-11T09:00:00Z',
  })
  assert.equal(holder.faitiere, 'FENOMAT')
})

test('an expired or revoked card is reported as such, not as active', () => {
  const o = summarizeHaroo(
    input({
      cards: [
        {
          card_number: 'AGR-304345',
          status: 'active',
          expiry_date: '2026-10-01',
          revoked_at: null,
          created_at: '2024-10-01T09:00:00Z',
        },
      ],
    }),
  )
  assert.equal(o.cards.ACTIVE, 0)
  assert.equal(o.cards.EXPIRED, 1)
  assert.equal(o.holders[0].card?.status, 'EXPIRED')
})

test('lists real accounts first, then card holders, then the most recent', () => {
  const o = summarizeHaroo(input())
  assert.equal(o.people.length, 9)
  assert.equal(o.people[0].name, 'Kodjo AGBEKO')
  const firstDemo = o.people.findIndex((p) => p.demo)
  assert.ok(
    o.people.slice(firstDemo).every((p) => p.demo),
    'demo accounts come last',
  )
  assert.equal(o.people.find((p) => p.name.endsWith('O2'))?.status, 'Indisponible')
  assert.equal(o.people.find((p) => p.name.endsWith('A1'))?.status, 'Grossiste')
  assert.equal(o.people.find((p) => p.name.endsWith('G4'))?.status, 'Dossier rejeté')
  assert.equal(o.people.find((p) => p.name.endsWith('A2'))?.status, 'Type non précisé')
})

test('never exposes a phone number or an e-mail', () => {
  const o = summarizeHaroo(input())
  const text = JSON.stringify(o)
  assert.ok(!/phone|email|téléphone/i.test(text))
})

test('activity: missions, stalled ones, open offers and active announcements', () => {
  const o = summarizeHaroo(input())
  assert.deepEqual(o.activity.missions, { requested: 1, inProgress: 1, done: 0, stalled: 1 })
  assert.equal(o.activity.jobsOpen, 2)
  assert.equal(o.activity.presalesOpen, 2)
  assert.deepEqual(o.activity.announcements, { job: 0, prevente: 1, mission: 0, other: 0 })
})

test('alerts point to what needs an action', () => {
  const o = summarizeHaroo(input())
  assert.deepEqual(
    o.alerts.map((a) => a.key),
    ['pending', 'no-card', 'stalled'],
  )
  assert.equal(o.alerts[0].text, '1 dossier d’agronome attend votre validation.')
  assert.equal(o.alerts[1].text, '1 agronome validé n’a pas encore de carte.')
  assert.equal(o.alerts[2].text, '1 mission est « en cours » depuis plus de 30 jours.')
})

test('nothing registered: zeros, no alert, no crash', () => {
  const o = summarizeHaroo(
    input({
      ouvriers: [],
      acheteurs: [],
      agronomes: [],
      cards: [],
      missions: [],
      jobsOpen: 0,
      presalesOpen: 0,
      announcements: [],
    }),
  )
  assert.equal(o.people.length, 0)
  assert.equal(o.cards.issued, 0)
  assert.deepEqual(o.alerts, [])
})
