import { type Page, type Route, expect, test } from '@playwright/test'

// Consoles PAYG contre le mock Supabase (session, middleware) et des réponses /api/payg/* et
// /api/institution/* simulées dans le navigateur, au format des vraies routes. Les règles
// financières (débit unique, refus sans crédit, isolation) sont prouvées en SQL par
// tests/payg-sql.test.mjs ; ici on vérifie que les écrans les respectent et les disent.

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-4111-8111-111111111111'
const user = {
  id: UID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@test.local',
  app_metadata: { role: 'super_admin' },
  user_metadata: {},
}
const tok = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.c2ln`
const session = {
  access_token: tok,
  refresh_token: 'r0',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
}

const FENOMAT = 'f0000000-0000-4000-8000-000000000001'
const COOP_A = 'ca000000-0000-4000-8000-00000000000a'
const COOP_B = 'cb000000-0000-4000-8000-00000000000b'
const PACKS = [
  { code: 'credit_pack_20', credits: 20, price_fcfa: 5000 },
  { code: 'credit_pack_40', credits: 40, price_fcfa: 10000 },
  { code: 'credit_pack_100', credits: 100, price_fcfa: 25000 },
]

type Role = 'owner' | 'manager' | 'agent'

interface World {
  role: Role
  balance: number
  welcome: number
  certified: boolean
  issueKeys: string[]
  failNextIssue: boolean
  checkout: Record<string, unknown>[]
  trainingCheckout: Record<string, unknown>[]
  issued: string[]
}

function caps(role: Role) {
  const manager = role !== 'agent'
  return {
    issueCards: true,
    printCards: true,
    seeWallet: true,
    recharge: manager,
    seeLedger: manager,
    manageAgents: manager,
    exportReports: manager,
    orderFaitierehubPrint: manager,
  }
}

function me(w: World) {
  return {
    user_id: UID,
    is_super_admin: false,
    memberships: [
      {
        partner_id: FENOMAT,
        display_name: 'FENOMAT',
        kind: 'institutional',
        role: w.role,
        status: 'active',
      },
    ],
    current: {
      partner_id: FENOMAT,
      partner_code: 'IN-FENO',
      display_name: 'FENOMAT',
      kind: 'institutional',
      status: 'active',
      role: w.role,
      capabilities: caps(w.role),
      other_partners: [],
    },
    wallet: { credit_balance: w.balance, welcome_credits: w.welcome, welcome_granted: true },
    cooperatives:
      w.role === 'agent'
        ? [
            {
              id: COOP_A,
              name: 'Coopérative Agou-Gare',
              scopes: ['cards.manage', 'cards.print', 'members.read'],
              freeRemaining: 0,
            },
          ]
        : [
            {
              id: COOP_A,
              name: 'Coopérative Agou-Gare',
              scopes: ['cards.manage', 'cards.print', 'members.read'],
              freeRemaining: 0,
            },
            {
              id: COOP_B,
              name: 'Coopérative Kpélé',
              scopes: ['cards.manage', 'cards.print', 'members.read'],
              freeRemaining: 3,
            },
          ],
    pricing: {
      commission_fcfa: 250,
      packs: PACKS,
      training_fcfa: 15000,
      card_prices: [
        { format: 'plastified', label: 'Plastifiée', priceFcfa: 1200 },
        { format: 'pvc', label: 'PVC', priceFcfa: 2500 },
      ],
    },
    training: {
      id: 'aaaaaaaa-0000-4000-8000-0000000000aa',
      user_id: UID,
      partner_id: FENOMAT,
      total_fcfa: 15000,
      installment_fcfa: 3000,
      paid_fcfa: 6000,
      payer: 'self',
      status: 'partial',
    },
    certification: {
      partner_id: FENOMAT,
      training_completed_at: '2026-10-01T10:00:00Z',
      exam_passed_at: w.certified ? '2026-10-05T10:00:00Z' : null,
      certified_at: w.certified ? '2026-10-06T10:00:00Z' : null,
    },
  }
}

const MEMBERS = [
  ['m1', 'Ama', 'Kossiwa'],
  ['m2', 'Kodjo', 'Agbeko'],
  ['m3', 'Afi', 'Mensah'],
].map(([id, first, last]) => ({
  id: `${id}000000-0000-4000-8000-000000000000`.slice(0, 36),
  first_name: first,
  last_name: last,
  village: 'Agou-Gare',
  has_photo: false,
  status: 'active',
  card: null,
}))

const AGENTS = Array.from({ length: 10 }, (_, i) => ({
  user_id: `a${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`,
  name: `Agent ${i + 1} FENOMAT`,
  email: `agent${i + 1}@fenomat.test`,
  role: 'agent',
  status: 'active',
  joined_at: '2026-10-10T08:00:00Z',
  cooperatives:
    i < 2 ? [{ id: COOP_A, name: 'Coopérative Agou-Gare', scopes: ['cards.manage'] }] : [],
  training: {
    id: `t${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`,
    user_id: `a${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`,
    total_fcfa: 15000,
    paid_fcfa: i < 4 ? 15000 : 3000 * (i % 5),
    payer: i < 5 ? 'institution' : 'self',
    status: i < 4 ? 'paid' : 'partial',
  },
  certification: {
    training_completed_at: '2026-10-12T08:00:00Z',
    exam_passed_at: i < 4 ? '2026-10-13T08:00:00Z' : null,
    certified_at: i < 4 ? '2026-10-14T08:00:00Z' : null,
  },
  cards_issued: i < 4 ? 3 : 0,
  last_activity_at: i < 4 ? '2026-10-20T08:00:00Z' : null,
}))

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function stubPayg(page: Page, w: World) {
  await page.route('**/api/payg/me**', (r) => json(r, me(w)))
  await page.route('**/api/payg/cooperatives/*/members**', (r) =>
    json(r, {
      cooperative: { id: COOP_A, name: 'Coopérative Agou-Gare' },
      members: MEMBERS.filter((m) => !w.issued.includes(m.id)),
      total: 3,
      page: 0,
      page_size: 50,
    }),
  )
  await page.route('**/api/payg/cards/issue', async (r) => {
    const body = r.request().postDataJSON()
    w.issueKeys.push(body.idempotency_key)
    if (w.failNextIssue) {
      w.failNextIssue = false
      return r.abort('connectionreset')
    }
    if (w.issued.includes(body.member_id))
      return json(r, {
        outcome: 'already_issued',
        message: 'Cette carte a déjà été émise (aucun nouveau débit).',
      })
    if (body.mode === 'commercial' && w.balance < 1)
      return json(r, { error: 'Crédits épuisés' }, 402)
    if (body.mode === 'commercial') {
      w.balance -= 1
      if (w.welcome > 0) w.welcome -= 1
    }
    w.issued.push(body.member_id)
    return json(r, {
      outcome: 'issued',
      card_number: 'FH-TG-2026-000123',
      credit_balance: w.balance,
      message: 'Carte émise.',
    })
  })
  await page.route(/\/api\/payg\/cards\?/, (r) => json(r, { cards: [] }))
  await page.route('**/api/payg/ledger**', (r) => json(r, { entries: [] }))
  await page.route('**/api/payg/rectifications**', (r) => json(r, { requests: [] }))
  await page.route('**/api/payg/print-orders**', (r) => json(r, { orders: [] }))
  await page.route('**/api/payg/credits/checkout', (r) => {
    w.checkout.push(r.request().postDataJSON())
    return json(r, { payment_url: 'http://127.0.0.1:3000/__fedapay-test', reference: 'intent-1' })
  })
  await page.route('**/api/payg/training/checkout', (r) => {
    w.trainingCheckout.push(r.request().postDataJSON())
    return json(r, { payment_url: 'http://127.0.0.1:3000/__fedapay-test', reference: 'intent-2' })
  })
  await page.route('**/__fedapay-test', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<h1>Page FedaPay (test)</h1>' }),
  )
  await page.route(/\/api\/payg\/training\?/, (r) =>
    json(r, {
      own: null,
      accounts: AGENTS.map((a) => ({
        ...a.training,
        installment_fcfa: 3000,
        name: a.name,
        certified_at: a.certification.certified_at,
      })),
    }),
  )
  await page.route(/\/api\/institution\/agents\?/, (r) =>
    json(r, {
      agents: AGENTS,
      invitations: [
        {
          id: 'inv1',
          email: 'nouvel.agent@fenomat.test',
          full_name: 'Nouvel Agent',
          membership_role: 'agent',
          expires_at: '2099-01-01T00:00:00Z',
          created_at: '2026-10-20T08:00:00Z',
        },
      ],
    }),
  )
  await page.route('**/api/institution/agents', (r) =>
    json(r, {
      invitation_id: 'inv2',
      link: 'http://127.0.0.1:3000/invitation/tok-abc',
      expires_at: '2099-01-01',
    }),
  )
  await page.route('**/api/institution/activity**', (r) =>
    json(r, {
      activity: [
        {
          id: 'e1',
          at: '2026-10-20T09:00:00Z',
          action: 'card.issued',
          label: 'Carte émise',
          actor: 'Agent 1 FENOMAT',
          cooperative: 'Coopérative Agou-Gare',
          details: {},
        },
      ],
    }),
  )
}

function world(over: Partial<World> = {}): World {
  return {
    role: 'agent',
    balance: 10,
    welcome: 10,
    certified: true,
    issueKeys: [],
    failNextIssue: false,
    checkout: [],
    trainingCheckout: [],
    issued: [],
    ...over,
  }
}

async function noHorizontalScroll(page: Page) {
  const ok = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  )
  expect(ok, 'pas de défilement horizontal').toBe(true)
}

const shot = (page: Page, name: string) =>
  process.env.PAYG_SHOTS
    ? page.screenshot({
        path: `${process.env.PAYG_SHOTS}/${test.info().project.name}-${name}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    : Promise.resolve()

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: 'sb-127-auth-token', value: `base64-${b64(session)}`, domain: '127.0.0.1', path: '/' },
  ])
})

test('agent FENOMAT : solde partagé, pas de recharge, émission avec un crédit', async ({
  page,
}) => {
  const w = world({ role: 'agent', balance: 10, welcome: 10 })
  await stubPayg(page, w)
  await page.goto('/operator/console')
  await expect(page.getByRole('heading', { level: 1, name: 'FENOMAT' })).toBeVisible()
  await expect(page.getByTestId('credit-balance')).toContainText('10')
  await expect(page.getByText('Solde partagé par toute l’équipe.')).toBeVisible()
  await expect(
    page.getByText('La recharge est faite par le gérant de votre institution.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /crédits pour/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Institution' })).toHaveCount(0)
  await noHorizontalScroll(page)
  await shot(page, '01-console-agent')

  await page.getByTestId('members').getByRole('button', { name: 'Émettre' }).first().click()
  await expect(page.getByRole('dialog')).toContainText('Ama Kossiwa')
  await shot(page, '02-emission')
  await page.getByRole('button', { name: 'Émettre (1 crédit)' }).click()
  await expect(page.getByRole('dialog')).toContainText('Carte émise.')
  await expect(page.getByRole('dialog')).toContainText('FH-TG-2026-000123')
  await page.getByRole('button', { name: 'Fermer' }).first().click()
  await expect(page.getByTestId('credit-balance')).toContainText('9')
  expect(w.balance).toBe(9)
})

test('connexion coupée pendant l’émission : la nouvelle tentative réutilise la même clé', async ({
  page,
}) => {
  const w = world({ role: 'agent', failNextIssue: true })
  await stubPayg(page, w)
  await page.goto('/operator/console')
  await page.getByTestId('members').getByRole('button', { name: 'Émettre' }).first().click()
  await page.getByRole('button', { name: 'Émettre (1 crédit)' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Pas de connexion')
  await page.getByRole('button', { name: 'Émettre (1 crédit)' }).click()
  await expect(page.getByRole('dialog')).toContainText('Carte émise.')
  expect(w.issueKeys).toHaveLength(2)
  expect(w.issueKeys[0]).toBe(w.issueKeys[1])
  expect(w.balance).toBe(9)
})

test('plus de crédit : l’émission commerciale est refusée et le gérant est invité à recharger', async ({
  page,
}) => {
  const w = world({ role: 'agent', balance: 0, welcome: 0 })
  await stubPayg(page, w)
  await page.goto('/operator/console')
  await expect(page.getByTestId('credit-balance')).toContainText('0')
  await expect(page.getByText(/Solde bas : prévenez le gérant/)).toBeVisible()
  await page.getByTestId('members').getByRole('button', { name: 'Émettre' }).first().click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'demandez une recharge au gérant',
  )
  await expect(page.getByRole('button', { name: 'Émettre (1 crédit)' })).toBeDisabled()
  expect(w.issueKeys).toHaveLength(0)
})

test('gérant : recharge de 20 crédits pour 5 000 FCFA via FedaPay', async ({ page }) => {
  const w = world({ role: 'manager', balance: 2, welcome: 0 })
  await stubPayg(page, w)
  await page.goto('/operator/console')
  await expect(page.getByText('Rechargez avant votre prochaine tournée')).toBeVisible()
  await page.getByRole('button', { name: '20 crédits pour 5 000 FCFA' }).click()
  await expect(page.getByRole('dialog')).toContainText('20 crédits pour 5 000 FCFA')
  await page.getByRole('button', { name: 'Payer 5 000 FCFA' }).click()
  await expect(page.getByRole('heading', { name: 'Page FedaPay (test)' })).toBeVisible()
  expect(w.checkout).toEqual([{ partner_id: FENOMAT, pack_code: 'credit_pack_20' }])
})

test('retour de paiement : le message vient du serveur et quitte l’adresse', async ({ page }) => {
  const w = world({ role: 'manager' })
  await stubPayg(page, w)
  await page.goto('/operator/console?payment=success&ref=intent-1')
  await expect(
    page.getByText('Paiement confirmé par FedaPay. Votre solde est à jour.'),
  ).toBeVisible()
  await expect(page).not.toHaveURL(/payment=/)
})

test('formation en tranches : 3 000 FCFA ou le solde, jamais plus que le reste', async ({
  page,
}) => {
  const w = world({ role: 'agent' })
  await stubPayg(page, w)
  await page.goto('/operator/console')
  await page.getByRole('tab', { name: 'Formation' }).click()
  await expect(page.getByText('6 000 FCFA réglés sur 15 000 FCFA')).toBeVisible()
  await expect(page.getByText('Reste à régler : 9 000 FCFA')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Payer le solde (9 000 FCFA)' })).toBeVisible()
  await shot(page, '03-formation-tranches')
  await page.getByRole('button', { name: 'Payer une tranche (3 000 FCFA)' }).click()
  await expect(page.getByRole('heading', { name: 'Page FedaPay (test)' })).toBeVisible()
  expect(w.trainingCheckout[0]).toMatchObject({ amount_fcfa: 3000 })
})

test('console institution : 10 agents, invitation par lien, formation de l’équipe', async ({
  page,
}) => {
  const w = world({ role: 'owner', balance: 10, welcome: 10 })
  await stubPayg(page, w)
  await page.goto('/operator/institution')
  await expect(page.getByRole('heading', { level: 1, name: 'FENOMAT' })).toBeVisible()
  await expect(page.getByTestId('team-summary')).toHaveText('10 membres actifs, 4 certifiés')
  await expect(page.getByTestId('agents').getByRole('listitem')).toHaveCount(10)
  await expect(page.getByText('Nouvel Agent')).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, '04-institution-equipe')

  await page.getByRole('button', { name: 'Inviter un agent' }).click()
  await page.getByLabel('Nom complet').fill('Kafui Amedome')
  await page.getByLabel('E-mail').fill('kafui@fenomat.test')
  await page.getByRole('button', { name: 'Créer l’invitation' }).click()
  await expect(page.getByText('http://127.0.0.1:3000/invitation/tok-abc')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Envoyer par WhatsApp' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'Formation' }).click()
  await expect(page.getByText(/Reste dû pour l’équipe/)).toBeVisible()
  await expect(page.getByText('Payée par l’institution').first()).toBeVisible()
  await shot(page, '05-institution-formation')
})

test('un agent qui ouvre la console institution est renvoyé vers sa console', async ({ page }) => {
  const w = world({ role: 'agent' })
  await stubPayg(page, w)
  await page.goto('/operator/institution')
  await expect(page.getByRole('heading', { name: 'Console de terrain' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ouvrir ma console' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inviter un agent' })).toHaveCount(0)
})

test('tarifs : plus d’abonnement ni de carte à 2 000 FCFA, packs et formation affichés', async ({
  page,
}) => {
  await page.goto('/pricing')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Pas d’abonnement. Une carte, un crédit.',
  )
  const text = await page.locator('main').innerText()
  expect(text).not.toMatch(/99\s?000/)
  expect(text).not.toMatch(/2\s?000 FCFA/)
  await expect(page.getByRole('cell', { name: '5 000 FCFA', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '25 000 FCFA', exact: true })).toBeVisible()
  await expect(
    page.getByText('Ce n’est pas une pièce d’identité officielle.', { exact: false }),
  ).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, '06-tarifs')
})

test('invitation publique : institution affichée, adresse masquée, création de compte', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  await page.route('**/api/invitations/tok-abc', (r) =>
    r.request().method() === 'GET'
      ? json(r, {
          institution: 'FENOMAT',
          full_name: 'Kafui Amedome',
          email: 'ka•••@fenomat.test',
          role: 'agent',
          accepted: false,
          expired: false,
        })
      : json(r, {
          ok: true,
          created: true,
          verify_email: false,
          certification_elsewhere: false,
          redirect_to: '/operator/console',
        }),
  )
  await page.goto('/invitation/tok-abc')
  await expect(page.getByRole('heading', { name: 'Rejoindre FENOMAT' })).toBeVisible()
  await expect(page.getByText('ka•••@fenomat.test')).toBeVisible()
  await expect(page.getByLabel('Prénom')).toHaveValue('Kafui')
  await noHorizontalScroll(page)
  await shot(page, '07-invitation')
  await page.getByLabel('Mot de passe (8 caractères minimum)').fill('motdepasse-1')
  await page.getByRole('button', { name: 'Créer mon compte et rejoindre' }).click()
  await expect(page.getByRole('heading', { name: 'Compte créé' })).toBeVisible()
})

test('super-admin : indicateurs lus dans les grands livres, taux de recharge', async ({ page }) => {
  await page.route('**/api/admin/payg', (r) =>
    json(r, {
      overview: {
        operators: { individual_active: 3, institutional_active: 2, candidates: 4 },
        agents_by_institution: [
          { partner_id: FENOMAT, name: 'FENOMAT', agents: 10 },
          { partner_id: 'm0000000-0000-4000-8000-000000000002', name: 'MAPTO', agents: 4 },
        ],
        credits: {
          purchased: 140,
          purchased_fcfa: 35000,
          welcome_granted: 50,
          consumed: 61,
          consumed_welcome: 30,
          consumed_purchased: 31,
          outstanding: 129,
        },
        commissions_earned_fcfa: 7750,
        training: { paid: 6, partial: 5, unpaid: 3, collected_fcfa: 117000, due_fcfa: 93000 },
        recharge: { active_operators: 5, first: 4, second: 2 },
        by_region: [{ region: 'Plateaux', cards: 40 }],
        by_organization: [{ cooperative: 'Coopérative Agou-Gare', operator: 'FENOMAT', cards: 25 }],
      },
      operators: [
        {
          id: FENOMAT,
          partner_code: 'IN-FENO',
          display_name: 'FENOMAT',
          operator_kind: 'institutional',
          status: 'active',
          credit_balance: 12,
          welcome_credits: 0,
        },
      ],
      training: [],
      print_orders: [],
      rectifications: [],
      ledger: [],
      mandates: [],
    }),
  )
  await page.goto('/admin/payg')
  await expect(page.getByRole('heading', { name: 'Crédits opérateurs' })).toBeVisible()
  await expect(page.getByText('80 %', { exact: true })).toBeVisible()
  await expect(page.getByText('50 %', { exact: true })).toBeVisible()
  await expect(page.getByText('7 750 FCFA', { exact: true })).toBeVisible()
  await expect(page.getByText('FENOMAT 10, MAPTO 4')).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, '08-super-admin')
})
