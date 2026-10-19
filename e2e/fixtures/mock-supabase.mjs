import { readFileSync } from 'node:fs'
// Faux Supabase local (auth + PostgREST + quelques RPC) pour jouer les parcours HarooLife
// sans compte réel : un compte super_admin rattaché à la coopérative COOMARA-Kpalimé
// (120 membres, 40 parcelles, cartes, regroupements). Aucune donnée réelle.
//   node e2e/fixtures/mock-supabase.mjs   (port 54329)
import http from 'node:http'
const PORT = Number(process.env.HAROOLIFE_SUPABASE_PORT || 54329)
const UID = '11111111-1111-4111-8111-111111111111'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
let refreshCount = 0
const token = () =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', email: 'admin@test.local', exp: 4102444800, app_metadata: { role: 'super_admin' }, n: refreshCount })}.c2ln`
const user = {
  id: UID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@test.local',
  app_metadata: { role: 'super_admin' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
}
const session = () => ({
  access_token: token(),
  refresh_token: 'r' + refreshCount,
  token_type: 'bearer',
  expires_in: 600,
  expires_at: Math.floor(Date.now() / 1000) + 120,
  user,
})
const AD_CAMPAIGNS = []
// « Jouer en visiteur » (signInAnonymously): one anonymous account, the relay's LOCAL_VISITOR.
const VISITOR = 'd4d4d4d4-0000-4000-8000-000000000004'
const visitorUser = {
  ...user,
  id: VISITOR,
  email: '',
  is_anonymous: true,
  app_metadata: { provider: 'anonymous', providers: [] },
  user_metadata: { first_name: 'Visiteur' },
}
const visitorSession = () => ({
  access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: VISITOR, role: 'authenticated', aud: 'authenticated', is_anonymous: true, exp: 4102444800, n: refreshCount })}.c2ln`,
  refresh_token: 'r-visitor',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: visitorUser,
})
const REALTIME_ACCOUNTS = new Set([
  'a1a1a1a1-0000-4000-8000-000000000001',
  'b2b2b2b2-0000-4000-8000-000000000002',
  'c3c3c3c3-0000-4000-8000-000000000003',
  VISITOR,
])
const REALTIME_BY_REFRESH = {
  'r-ama': 'a1a1a1a1-0000-4000-8000-000000000001',
  'r-kofi': 'b2b2b2b2-0000-4000-8000-000000000002',
  'r-yawa': 'c3c3c3c3-0000-4000-8000-000000000003',
}
const C1 = 'c1000000-0000-4000-8000-000000000001'
const C2 = 'c2000000-0000-4000-8000-000000000002'
const C3 = 'c3000000-0000-4000-8000-000000000003'
const U1 = 'c4000000-0000-4000-8000-000000000004'
const COOPS = [
  {
    id: C1,
    name: 'COOMARA-Kpalimé',
    level: 'cooperative',
    parent_id: U1,
    description: null,
    logo_url: null,
    primary_color: '#16a34a',
    faitiere_name: 'FENOMAT',
    created_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: U1,
    name: 'Union des coopératives de Kloto',
    level: 'union',
    parent_id: C2,
    description: null,
    logo_url: null,
    primary_color: '#16a34a',
    faitiere_name: 'FENOMAT',
    created_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: C2,
    name: 'FENOMAT',
    level: 'faitiere',
    parent_id: null,
    description: null,
    logo_url: null,
    primary_color: '#16a34a',
    faitiere_name: 'FENOMAT',
    created_at: '2026-01-02T00:00:00Z',
    deleted_at: null,
  },
  {
    id: C3,
    name: 'Scoops nintchè',
    level: 'cooperative',
    parent_id: null,
    description: null,
    logo_url: null,
    primary_color: '#16a34a',
    faitiere_name: 'REJEPPAT',
    created_at: '2026-10-11T10:40:57Z',
    deleted_at: null,
  },
]
const PROFILE = {
  id: UID,
  email: 'admin@test.local',
  first_name: 'Admin',
  last_name: 'Super',
  role: 'super_admin',
  haroo_type: null,
  cooperative_id: C1,
  deleted_at: null,
}

const CANTON = (n, name, residents) => ({
  id: `ca000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  name,
  residents,
})
const CANTONS = [
  { id: CANTON(1).id, name: 'Lama-Kara', prefecture_id: 'p2' },
  { id: CANTON(5).id, name: 'Kpalimé', prefecture_id: 'p5' },
]
const FIRST = ['Abalo', 'Afi', 'Kossi', 'Ama', 'Yao', 'Essi', 'Edem', 'Sena', 'Koffi', 'Dédé']
const LAST = ['Kodjo', 'Mensah', 'Agbo', 'Lawson', 'Tchalla', 'Amegan']
const MEMBERS = Array.from({ length: 120 }, (_, i) => ({
  id: `m${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`,
  cooperative_id: C1,
  first_name: FIRST[i % FIRST.length],
  last_name: LAST[i % LAST.length],
  email: i < 2 ? `m${i}@test.local` : `membre${i}@example.org`,
  status: i % 9 === 0 ? 'pending' : 'active',
  canton: 'Kpalimé',
  canton_id: CANTON(5).id,
  cantons: { name: 'Kpalimé' },
  deleted_at: null,
}))
const CARDS = MEMBERS.filter((_, i) => i % 2 === 0).map((m, i) => ({
  id: `k${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`,
  member_id: m.id,
  cooperative_id: C1,
  card_number: `FH-${1000 + i}`,
  card_type: 'FAITIERE',
  status: i % 10 === 0 ? 'suspended' : 'active',
  expiry_date: '2027-12-31',
  revoked_at: null,
  deleted_at: null,
}))
const CROPS = ['Maïs', 'Soja', 'Manioc', 'Riz']
const PARCELS = Array.from({ length: 40 }, (_, i) => ({
  id: `b${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`,
  cooperative_id: C1,
  member_id: MEMBERS[i % 30].id,
  culture_principale: CROPS[i % CROPS.length],
  culture_name: CROPS[i % CROPS.length],
  superficie_ha: [0.5, 1, 1.5, 2][i % 4],
  gps_coordinates: null,
}))
const G1 = 'a1000000-0000-4000-8000-000000000001'
const G2 = 'a2000000-0000-4000-8000-000000000002'
const GROUPS = [
  {
    id: G1,
    kind: 'team',
    title: 'Équipe récolte de maïs',
    activity: 'recolte',
    beneficiary: null,
    cooperative_id: C1,
    canton_id: CANTON(5).id,
    cantons: { name: 'Kpalimé' },
    starts_on: '2026-10-20',
    ends_on: '2026-10-22',
    target: 8,
    expires_at: '2026-10-19T00:00:00Z',
    cancelled_at: null,
    owner_id: 'u2',
    created_at: '2026-10-10T00:00:00Z',
  },
  {
    id: G2,
    kind: 'work',
    title: 'Regroupement maïs 15 ha',
    activity: 'semis',
    beneficiary: null,
    cooperative_id: C1,
    canton_id: CANTON(5).id,
    cantons: { name: 'Kpalimé' },
    starts_on: '2026-10-25',
    ends_on: '2026-10-30',
    target: 15,
    expires_at: '2026-10-24T00:00:00Z',
    cancelled_at: null,
    owner_id: 'u3',
    created_at: '2026-10-11T00:00:00Z',
  },
]
// Snapshots so a test run can put the board back (POST /__reset): Playwright projects share
// this process and the commands of one run must not leak into the next.
const GROUPS_INITIAL = GROUPS.map((g) => ({ ...g }))
let PARTS = [
  { group_id: G1, user_id: 'u5', parcel_id: null, amount: 1, left_at: null },
  { group_id: G1, user_id: 'u6', parcel_id: null, amount: 1, left_at: null },
  { group_id: G1, user_id: 'u7', parcel_id: null, amount: 1, left_at: null },
  { group_id: G2, user_id: 'u3', parcel_id: PARCELS[3].id, amount: 6, left_at: null },
  { group_id: G2, user_id: 'u8', parcel_id: PARCELS[5].id, amount: 6.5, left_at: null },
]
const PARTS_INITIAL = PARTS.map((p) => ({ ...p }))
const ANNOUNCEMENTS = [1, 2, 3].map((i) => ({
  id: `n${i}`,
  cooperative_id: C1,
  status: 'active',
  type: i === 1 ? 'prevente' : i === 2 ? 'job' : 'autre',
  title: i === 1 ? 'Soja de Kpalimé, 800 kg' : `Annonce ${i}`,
  culture: i === 1 ? 'Soja' : null,
  quantity_kg: i === 1 ? 800 : null,
  price_per_kg_fcfa: i === 1 ? 450 : null,
  location_canton: 'Kpalimé',
  contact_phone: '+228 90 11 22 33',
  created_at: '2026-10-01T00:00:00Z',
}))
const RESIDENTS = [
  { user_id: 'u-m0', visible: true },
  { user_id: 'u-m1', visible: true },
  { user_id: 'u-x', visible: false },
]
const PROFILES = [
  PROFILE,
  { id: 'u-m0', email: 'm0@test.local' },
  { id: 'u-m1', email: 'm1@test.local' },
  { id: 'u-x', email: 'x@test.local' },
  // The realtime chat's fictional players (see realtime/pglite.ts): every account has a profile,
  // or the app signs it out as a zombie session. Kofi reads his messages from his dashboard.
  ...[
    ['a1a1a1a1-0000-4000-8000-000000000001', 'Ama'],
    ['c3c3c3c3-0000-4000-8000-000000000003', 'Yawa'],
  ].map(([id, first]) => ({
    id,
    email: `${first.toLowerCase()}@test.local`,
    first_name: first,
    last_name: 'Test',
    role: 'member',
    haroo_type: null,
    cooperative_id: C1,
    deleted_at: null,
  })),
  {
    id: 'd4d4d4d4-0000-4000-8000-000000000004',
    email: null,
    first_name: 'Visiteur',
    last_name: null,
    role: 'none',
    haroo_type: null,
    cooperative_id: null,
    deleted_at: null,
  },
  {
    id: 'b2b2b2b2-0000-4000-8000-000000000002',
    email: 'kofi@test.local',
    first_name: 'Kofi',
    last_name: 'Test',
    role: 'cooperative_admin',
    haroo_type: null,
    cooperative_id: C1,
    deleted_at: null,
  },
]
// Mes parcelles (compte membre m0 par e-mail ? non : l'admin n'a pas de parcelle ; le pilote en prête 3 pour le jeu)
const MY_PARCELS = [...PARCELS.slice(0, 3), PARCELS[7]].map((p) => ({
  id: p.id,
  culture: p.culture_principale,
  area: p.superficie_ha,
}))
const boardGroups = () =>
  GROUPS.map((g) => {
    const mine = PARTS.filter((p) => p.group_id === g.id && !p.left_at)
    const total = mine.reduce((s, p) => s + p.amount, 0)
    return {
      id: g.id,
      kind: g.kind,
      title: g.title,
      activity: g.activity,
      beneficiary: g.beneficiary,
      starts_on: g.starts_on,
      ends_on: g.ends_on,
      target: g.target,
      expires_at: g.expires_at,
      total,
      people: mine.length,
      is_owner: false,
      joined: mine.some((p) => p.user_id === UID),
      state: g.cancelled_at ? 'cancelled' : total >= g.target ? 'ready' : 'open',
    }
  })
const BOARD = () => ({
  access: { can_team: false, can_work: true, can_recruit: false },
  pilot: {
    canton: 'Kpalimé',
    cooperative: 'COOMARA-Kpalimé',
    team_target: 8,
    area_target: 15,
    area_max: 16,
    formation_hours: 48,
  },
  groups: boardGroups(),
  parcels: MY_PARCELS,
})

const WORLD = {
  me: {
    roles: ['faitiere', 'producteur'],
    display_name: 'Admin S.',
    pagne: 2,
    visible: true,
    home: {
      canton_id: CANTON(1).id,
      canton: 'Lama-Kara',
      prefecture: 'Kozah',
      region: 'Kara',
      region_code: 'KAR',
    },
    suggested_canton: null,
  },
  territory: [
    {
      id: 'r1',
      name: 'Savanes',
      code: 'SAV',
      residents: 1,
      prefectures: [
        {
          id: 'p1',
          name: 'Tône',
          residents: 1,
          cantons: [CANTON(11, 'Dapaong', 1), CANTON(12, 'Namoundjoga', 0)],
        },
      ],
    },
    {
      id: 'r2',
      name: 'Kara',
      code: 'KAR',
      residents: 4,
      prefectures: [
        {
          id: 'p2',
          name: 'Kozah',
          residents: 4,
          cantons: [CANTON(1, 'Lama-Kara', 3), CANTON(2, 'Pya', 1)],
        },
        { id: 'p3', name: 'Binah', residents: 0, cantons: [CANTON(3, 'Pagouda', 0)] },
      ],
    },
    {
      id: 'r3',
      name: 'Centrale',
      code: 'CEN',
      residents: 0,
      prefectures: [
        { id: 'p4', name: 'Tchaoudjo', residents: 0, cantons: [CANTON(4, 'Sokodé', 0)] },
      ],
    },
    {
      id: 'r4',
      name: 'Plateaux',
      code: 'PLA',
      residents: 2,
      prefectures: [{ id: 'p5', name: 'Kloto', residents: 2, cantons: [CANTON(5, 'Kpalimé', 2)] }],
    },
    {
      id: 'r5',
      name: 'Maritime',
      code: 'MAR',
      residents: 1,
      prefectures: [{ id: 'p6', name: 'Golfe', residents: 1, cantons: [CANTON(6, 'Baguida', 1)] }],
    },
  ],
  here: {
    canton: {
      canton_id: CANTON(1).id,
      canton: 'Lama-Kara',
      prefecture: 'Kozah',
      region: 'Kara',
      region_code: 'KAR',
    },
    residents: [
      { display_name: 'Admin S.', pagne: 2, roles: ['faitiere', 'producteur'], is_me: true },
      { display_name: 'Kossi', pagne: 3, roles: ['ouvrier'], is_me: false },
      { display_name: 'Abalo K.', pagne: 1, roles: ['producteur'], is_me: false },
      { display_name: 'Essi', pagne: 7, roles: ['agronome'], is_me: false },
      { display_name: 'Mawuli', pagne: 4, roles: ['acheteur'], is_me: false },
      { display_name: 'Opérateur Kara', pagne: 1, roles: ['operateur'], is_me: false },
    ],
    cooperatives: [{ id: 'c1', name: 'Espoir de Kpèlèwouaï', level: 'cooperative', members: 5 }],
    messages: [
      {
        id: 'm1',
        display_name: 'Kossi',
        pagne: 3,
        body: 'Qui est libre demain pour la récolte ?',
        created_at: new Date(Date.now() - 120000).toISOString(),
        is_me: false,
      },
      {
        id: 'm2',
        display_name: 'Admin S.',
        pagne: 2,
        body: 'Bonjour la famille 👋',
        created_at: new Date(Date.now() - 60000).toISOString(),
        is_me: true,
      },
    ],
    groups: [
      {
        id: 'g1',
        kind: 'team',
        title: 'Équipe récolte de maïs',
        activity: 'recolte',
        starts_on: '2026-10-16',
        ends_on: '2026-10-18',
        target: 8,
        people: 3,
        total: 3,
        expires_at: '2026-10-13T00:00:00Z',
        is_owner: false,
      },
      {
        id: 'g2',
        kind: 'work',
        title: 'Désherbage parcelles Nord',
        activity: 'desherbage',
        starts_on: '2026-10-20',
        ends_on: '2026-10-21',
        target: 10,
        people: 2,
        total: 4.5,
        expires_at: '2026-10-13T00:00:00Z',
        is_owner: true,
      },
    ],
  },
}
const MARKET = [
  // Lomé (Maritime): the survey's undated reference prices (« Mon champ » shows them as
  // indicative) and a price of three months ago (the year's dearest month for maize).
  {
    region_id: 'r1',
    price: 330,
    unit: 'kg',
    market_name: null,
    observed_at: null,
    cultures: { name: 'Igname', icon: null },
  },
  {
    region_id: 'r1',
    price: 700,
    unit: 'kg',
    market_name: null,
    observed_at: null,
    cultures: { name: 'Tomate', icon: null },
  },
  {
    region_id: 'r1',
    price: 231,
    unit: 'kg',
    market_name: 'Lomé',
    observed_at: new Date(Date.now() - 92 * 24 * 3600 * 1000).toISOString(),
    cultures: { name: 'Mais', icon: '🌽' },
  },
  // Lomé (Maritime), with the culture names of the real survey (« Mon champ » sells at these).
  {
    region_id: 'r1',
    price: 143,
    unit: 'kg',
    market_name: 'Lomé',
    observed_at: new Date().toISOString(),
    cultures: { name: 'Mais', icon: '🌽' },
  },
  {
    region_id: 'r1',
    price: 505,
    unit: 'kg',
    market_name: 'Lomé',
    observed_at: new Date().toISOString(),
    cultures: { name: 'Haricot', icon: '🫘' },
  },
  {
    region_id: 'r2',
    price: 132,
    unit: 'kg',
    market_name: 'Kara',
    observed_at: new Date().toISOString(),
    cultures: { name: 'Maïs', icon: '🌽' },
  },
  {
    region_id: 'r2',
    price: 450,
    unit: 'kg',
    market_name: 'Kara',
    observed_at: new Date().toISOString(),
    cultures: { name: 'Soja', icon: '🫘' },
  },
]
const PRESALES = [
  {
    id: 's1',
    culture: 'Maïs',
    quantite_estimee: 12,
    prix_par_tonne: 180000,
    canton_id: CANTON(5).id,
    statut: 'DISPONIBLE',
    cantons: { name: 'Kpalimé' },
    created_at: '2026-10-02T00:00:00Z',
    description: 'Maïs blanc, récolte de novembre',
    created_by: 'u3',
    date_recolte_prevue: '2026-11-20',
  },
  {
    id: 's2',
    culture: 'Soja',
    quantite_estimee: 5,
    prix_par_tonne: 420000,
    canton_id: CANTON(1).id,
    statut: 'DISPONIBLE',
    cantons: { name: 'Lama-Kara' },
    created_at: '2026-10-03T00:00:00Z',
    description: 'Soja bio',
    created_by: 'u4',
    date_recolte_prevue: '2026-12-05',
  },
  {
    id: 's3',
    culture: 'Maïs',
    quantite_estimee: 2,
    prix_par_tonne: 170000,
    canton_id: CANTON(1).id,
    statut: 'VENDUE',
    cantons: { name: 'Lama-Kara' },
    created_at: '2026-10-04T00:00:00Z',
    description: 'Déjà vendu',
    created_by: 'u4',
    date_recolte_prevue: '2026-10-01',
  },
]

// Formation Opérateur : contenu réel (lu en production, sans clé de correction) et une
// progression d'exemple pour l'admin de test : 3 leçons validées, la 4 en cours, la 5 avec le
// quiz réussi, le cas pratique 3 corrigé.
const ACADEMY = JSON.parse(readFileSync(new URL('./academy-content.json', import.meta.url), 'utf8'))
const academyLessonIds = ACADEMY.lessons.map((l) => l.id)
const academyQuiz = (n) => ACADEMY.quizzes.find((q) => q.lesson_id === academyLessonIds[n - 1])
const academyAssignment = (n) =>
  ACADEMY.assignments.find((a) => a.lesson_id === academyLessonIds[n - 1])
const ACADEMY_PROGRESS = [1, 2, 3].map((n) => ({
  id: `pp${n}`,
  profile_id: UID,
  module_id: ACADEMY.module.id,
  lesson_id: academyLessonIds[n - 1],
  status: 'completed',
  progress_percent: 100,
  score: 80,
  started_at: `2026-10-0${n}T08:00:00Z`,
  last_viewed_at: `2026-10-0${n}T09:00:00Z`,
  completed_at: `2026-10-0${n}T09:30:00Z`,
  updated_at: `2026-10-0${n}T09:30:00Z`,
}))
ACADEMY_PROGRESS.push(
  {
    id: 'pp4',
    profile_id: UID,
    module_id: ACADEMY.module.id,
    lesson_id: academyLessonIds[3],
    status: 'in_progress',
    progress_percent: 0,
    score: null,
    started_at: '2026-10-08T08:00:00Z',
    last_viewed_at: '2026-10-09T08:00:00Z',
    completed_at: null,
    updated_at: '2026-10-09T08:00:00Z',
  },
  {
    id: 'pp5',
    profile_id: UID,
    module_id: ACADEMY.module.id,
    lesson_id: academyLessonIds[4],
    status: 'in_progress',
    progress_percent: 0,
    score: null,
    started_at: '2026-10-07T08:00:00Z',
    last_viewed_at: '2026-10-07T08:00:00Z',
    completed_at: null,
    updated_at: '2026-10-07T08:00:00Z',
  },
)
const ACADEMY_ATTEMPTS = [1, 2, 3, 5].map((n) => ({
  id: `qa${n}`,
  quiz_id: academyQuiz(n)?.id,
  profile_id: UID,
  score: n === 5 ? 80 : 100,
  passed: true,
  submitted_at: `2026-10-0${n}T09:10:00Z`,
  created_at: `2026-10-0${n}T09:10:00Z`,
}))
const ACADEMY_SUBMISSIONS = [1, 2, 3].map((n) => ({
  id: `as${n}`,
  assignment_id: academyAssignment(n)?.id,
  profile_id: UID,
  status: n === 3 ? 'reviewed' : 'submitted',
  score: n === 3 ? 82 : null,
  feedback: n === 3 ? 'Bon diagnostic. Précisez le rôle du conseil d’administration.' : null,
  reviewed_at: n === 3 ? '2026-10-05T10:00:00Z' : null,
  created_at: `2026-10-0${n}T09:20:00Z`,
}))

const TABLES = {
  academy_modules: [ACADEMY.module],
  academy_lessons: ACADEMY.lessons,
  academy_lesson_slides: ACADEMY.slides,
  academy_media_assets: ACADEMY.assets ?? [],
  academy_quizzes: ACADEMY.quizzes,
  academy_quiz_questions: ACADEMY.quizzes.flatMap((q) =>
    [1, 2, 3, 4, 5].map((n) => ({
      id: `${q.id}-q${n}`,
      quiz_id: q.id,
      question_type: n === 5 ? 'multiple_choice' : 'single_choice',
      prompt: `Question ${n} du quiz (données d’exercice)`,
      points: 1,
      order_index: n,
      explanation: 'Explication d’exercice.',
    })),
  ),
  academy_quiz_options: ACADEMY.quizzes.flatMap((q) =>
    [1, 2, 3, 4, 5].flatMap((n) =>
      ['A', 'B', 'C', 'D'].map((l, i) => ({
        id: `${q.id}-q${n}-${l}`,
        question_id: `${q.id}-q${n}`,
        label: `Réponse ${l}`,
        is_correct: i === 0 || (n === 5 && i === 1),
        order_index: i + 1,
      })),
    ),
  ),
  academy_assignments: ACADEMY.assignments,
  academy_profile_progress: ACADEMY_PROGRESS,
  academy_quiz_attempts: ACADEMY_ATTEMPTS,
  academy_assignment_submissions: ACADEMY_SUBMISSIONS,
  profiles: PROFILES,
  cooperatives: COOPS,
  cooperative_stats: COOPS,
  regions: [
    { id: 'r2', name: 'Kara' },
    { id: 'r1', name: 'Maritime' },
  ],
  market_prices: MARKET,
  members: MEMBERS,
  member_cards: CARDS,
  parcelles: PARCELS,
  producer_announcements: ANNOUNCEMENTS,
  haroolife_groups: GROUPS,
  haroolife_participations: () => PARTS,
  haroolife_pilot: [
    { singleton: true, enabled: true, area_max: 16, area_target: 15, team_target: 8 },
  ],
  haroolife_residents: RESIDENTS,
  cantons: CANTONS,
  haroo_presales: PRESALES,
  haroo_ouvrier_profiles: [],
  haroo_agronome_profiles: [],
  haroo_acheteur_profiles: [],
}
const log = []
function match(row, k, v) {
  if (v.startsWith('eq.')) return String(row[k]) === v.slice(3)
  if (v.startsWith('neq.')) return String(row[k]) !== v.slice(4)
  if (v.startsWith('in.(')) {
    const set = v
      .slice(4, -1)
      .split(',')
      .map((x) => x.replace(/"/g, ''))
    return set.includes(String(row[k]))
  }
  if (v === 'is.null') return row[k] == null
  if (v === 'is.true') return row[k] === true
  if (v === 'is.false') return row[k] === false
  if (v.startsWith('ilike.')) {
    const pat = v.slice(6).replace(/%/g, '').toLowerCase()
    return String(row[k] ?? '')
      .toLowerCase()
      .includes(pat)
  }
  // Dates and numbers as PostgREST compares them; a missing value never matches.
  if (v.startsWith('gte.')) return row[k] != null && String(row[k]) >= v.slice(4)
  if (v.startsWith('lte.')) return row[k] != null && String(row[k]) <= v.slice(4)
  if (v.startsWith('gt.')) return String(row[k]) > v.slice(3)
  if (v.startsWith('lt.')) return String(row[k]) < v.slice(3)
  return true
}
function filterRows(rows, params) {
  let out = rows
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue
    if (k === 'or') {
      const parts = v
        .slice(1, -1)
        .split(',')
        .map((c) => {
          const i = c.indexOf('.')
          return [c.slice(0, i), c.slice(i + 1)]
        })
      out = out.filter((r) => parts.some(([pk, pv]) => match(r, pk, pv)))
      continue
    }
    out = out.filter((r) => match(r, k, v))
  }
  return out
}
http
  .createServer((req, res) => {
    let body = ''
    req.on('data', (c) => {
      body += c
    })
    req.on('end', () => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
      if (url.pathname === '/__reset' && req.method === 'POST') {
        GROUPS.splice(0, GROUPS.length, ...GROUPS_INITIAL.map((g) => ({ ...g })))
        PARTS = PARTS_INITIAL.map((p) => ({ ...p }))
        AD_CAMPAIGNS.splice(0)
        res.writeHead(204)
        return res.end()
      }
      const send = (status, data, headers = {}) => {
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*',
          'Access-Control-Expose-Headers': 'content-range',
          ...headers,
        })
        res.end(data === undefined ? '' : JSON.stringify(data))
      }
      if (req.method === 'OPTIONS') return send(204)
      const p = url.pathname
      // Supabase's CAPTCHA protection (Turnstile): a token that came with the call is checked as
      // Cloudflare would; the test widget hands out XXXX.DUMMY.TOKEN.XXXX. CAPTCHA runs also
      // against missing tokens when explicitly enabled, just like production. Refreshing an
      // existing session does not require a new human check.
      if (
        req.method === 'POST' &&
        /^\/auth\/v1\/(signup|token|recover|resend|otp)$/.test(p) &&
        url.searchParams.get('grant_type') !== 'refresh_token'
      ) {
        let captcha = null
        try {
          captcha = JSON.parse(body || '{}').gotrue_meta_security?.captcha_token ?? null
        } catch {}
        if (
          (captcha !== null || process.env.HAROOLIFE_REQUIRE_CAPTCHA === '1') &&
          captcha !== 'XXXX.DUMMY.TOKEN.XXXX'
        ) {
          log.push('captcha-refused')
          return send(400, {
            code: 400,
            error_code: 'captcha_failed',
            msg: 'captcha protection: request disallowed (invalid-input-response)',
          })
        }
      }
      if (p === '/auth/v1/user') {
        // Realtime chat accounts (fictional, see realtime/pglite.ts): answer with the token's
        // subject, so two browsers are two different people for the Socket.IO relay.
        const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '')
        let sub = null
        try {
          sub = JSON.parse(Buffer.from(bearer.split('.')[1] ?? '', 'base64url').toString()).sub
        } catch {}
        if (sub === VISITOR) return send(200, visitorUser)
        if (typeof sub === 'string' && REALTIME_ACCOUNTS.has(sub))
          return send(200, {
            ...user,
            id: sub,
            email: `${sub.slice(0, 8)}@test.local`,
            app_metadata: {},
          })
        return send(200, user)
      }
      if (p === '/auth/v1/token') {
        refreshCount++
        log.push('token-refresh')
        // A realtime chat account (refresh token r-<who>) stays the same person, as on Supabase.
        let refresh = ''
        try {
          refresh = JSON.parse(body || '{}').refresh_token ?? ''
        } catch {}
        if (refresh === 'r-visitor') return send(200, visitorSession())
        const sub = REALTIME_BY_REFRESH[refresh]
        if (sub) {
          const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', exp: 4102444800, n: refreshCount })}.c2ln`
          return send(200, {
            access_token: access,
            refresh_token: refresh,
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { ...user, id: sub, email: `${refresh.slice(2)}@test.local`, app_metadata: {} },
          })
        }
        return send(200, session())
      }
      if (p === '/auth/v1/verify') return send(200, session())
      if (p === '/auth/v1/signup') {
        let email = null
        try {
          email = JSON.parse(body || '{}').email ?? null
        } catch {}
        // No e-mail: an anonymous sign-in (« Jouer en visiteur »).
        if (!email) return send(200, visitorSession())
      }
      if (p.startsWith('/auth/v1/')) return send(200, {})
      // Private messages outside the game: run in the local relay's PGlite (the real
      // migrations), as the token's subject, so the dashboard and the game share one database.
      const localRpc =
        /^\/rest\/v1\/rpc\/(haroolife_dm_inbox|haroolife_dm_read|haroolife_chat_history|haroolife_chat_send|haroolife_money_send|haroolife_money_claim|haroolife_save_get|haroolife_save_put|haroolife_chat_report|haroolife_mod_queue|haroolife_mod_act|haroolife_invite_code|haroolife_invite_accept|haroolife_invite_claim|haroolife_username_available|haroolife_take_username|haroolife_my_username|haroolife_board_posts_live|haroolife_board_rent|haroolife_board_report|haroolife_board_mod_queue|haroolife_board_mod_act)$/.exec(
          p,
        )?.[1]
      // The online save follows the realtime chat's fictional players only: every other test
      // signs in as the same admin and must start from its own local game, not the last test's.
      let subject = null
      try {
        subject = JSON.parse(
          Buffer.from(
            (req.headers.authorization ?? '').replace(/^Bearer /, '').split('.')[1] ?? '',
            'base64url',
          ).toString(),
        ).sub
      } catch {}
      if (localRpc?.startsWith('haroolife_save_') && !REALTIME_ACCOUNTS.has(subject))
        return send(404, { message: 'online save not offered to this test account' })
      if (localRpc) {
        fetch(`http://127.0.0.1:${process.env.HAROOLIFE_LOCAL_RPC_PORT ?? 3002}/rpc/${localRpc}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: req.headers.authorization ?? '',
          },
          body: body || '{}',
        })
          .then(async (r) => send(r.status, await r.json()))
          .catch(() => send(404, { message: 'local relay not running' }))
        return
      }
      if (p === '/rest/v1/rpc/haroolife_world') return send(200, WORLD)
      if (p === '/rest/v1/rpc/haroolife_set_home') return send(200, null)
      if (p === '/rest/v1/rpc/haroolife_say') return send(200, 'm3')
      // Billboard admin console (UI only; the real rules are tested on the SQL in PGlite).
      if (p === '/rest/v1/rpc/haroolife_ad_admin_list')
        return send(200, {
          campaigns: AD_CAMPAIGNS,
          stats: [
            { campaign: 'internal-marche', placement: 'lome-avenue', impressions: 12, clicks: 2 },
          ],
        })
      if (p === '/rest/v1/rpc/haroolife_ad_admin_save') {
        const { p: c } = JSON.parse(body || '{}')
        const row = {
          id: `ad${AD_CAMPAIGNS.length + 1}0000-0000-4000-8000-000000000000`.slice(0, 36),
          advertiser: { name: c.advertiser, kind: c.kind },
          creative: c.creative,
          status: 'draft',
          locality: c.locality,
          placements: c.placements,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          weight: c.weight,
          version: 1,
          rightsConfirmed: c.rightsConfirmed,
          contractRef: c.contractRef || null,
          versions: 1,
        }
        AD_CAMPAIGNS.unshift(row)
        return send(200, row)
      }
      if (p === '/rest/v1/rpc/haroolife_ad_admin_move') {
        const { p_id, p_status } = JSON.parse(body || '{}')
        const row = AD_CAMPAIGNS.find((c) => c.id === p_id)
        if (row && p_status === 'approved' && !row.rightsConfirmed)
          return send(400, {
            code: '22023',
            message: 'Confirmez d’abord les droits sur les images et textes',
          })
        if (row)
          Object.assign(row, {
            status: p_status,
            version: row.version + 1,
            versions: row.versions + 1,
          })
        return send(200, row ?? null)
      }
      if (p === '/rest/v1/rpc/get_accessible_cooperative_ids') return send(200, [C1, U1, C2])
      if (p === '/rest/v1/rpc/haroolife_board') return send(200, BOARD())
      if (p === '/rest/v1/rpc/haroolife_command') {
        // Mêmes règles que la base : surface ≤ parcelle, plafond, pas de double engagement.
        let cmd = {}
        try {
          cmd = JSON.parse(body)
        } catch {}
        const { p_action, p_payload } = cmd
        log.push(`command:${p_action}`)
        if (p_action === 'join') {
          const g = GROUPS.find((x) => x.id === p_payload.group_id)
          if (!g) return send(403, { code: '42501', message: 'Groupe inaccessible' })
          const total = PARTS.filter((x) => x.group_id === g.id && !x.left_at).reduce(
            (s, x) => s + x.amount,
            0,
          )
          if (PARTS.some((x) => x.group_id === g.id && x.user_id === UID && !x.left_at))
            return send(409, { code: '22023', message: 'Vous participez déjà à ce groupe' })
          if (g.kind === 'work') {
            const parcel = PARCELS.find((x) => x.id === p_payload.parcel_id)
            const amount = Number(p_payload.amount)
            if (!parcel || !MY_PARCELS.some((x) => x.id === parcel.id))
              return send(403, { code: '42501', message: 'Parcelle inaccessible' })
            if (!(amount > 0) || amount > parcel.superficie_ha)
              return send(409, {
                code: '22023',
                message: 'Surface supérieure à la parcelle ou invalide',
              })
            if (total + amount > 16)
              return send(409, {
                code: '22023',
                message: 'Cette surface dépasserait le maximum du regroupement (16 ha)',
              })
            if (PARTS.some((x) => x.parcel_id === parcel.id && !x.left_at))
              return send(409, {
                code: '22023',
                message: 'Cette parcelle participe déjà sur cette période',
              })
            PARTS.push({
              group_id: g.id,
              user_id: UID,
              parcel_id: parcel.id,
              amount,
              left_at: null,
            })
          } else {
            if (total >= g.target)
              return send(409, { code: '22023', message: 'Le groupe est déjà complet' })
            PARTS.push({ group_id: g.id, user_id: UID, parcel_id: null, amount: 1, left_at: null })
          }
          return send(200, g.id)
        }
        if (p_action === 'leave') {
          PARTS = PARTS.map((x) =>
            x.group_id === p_payload.group_id && x.user_id === UID
              ? { ...x, left_at: new Date().toISOString() }
              : x,
          )
          return send(200, p_payload.group_id)
        }
        if (p_action === 'create') {
          const id = `a9${String(GROUPS.length).padStart(6, '0')}-0000-4000-8000-000000000009`
          GROUPS.push({
            id,
            kind: p_payload.kind,
            title: p_payload.title,
            activity: p_payload.activity,
            beneficiary: p_payload.beneficiary ?? null,
            cooperative_id: C1,
            canton_id: CANTON(5).id,
            cantons: { name: 'Kpalimé' },
            starts_on: p_payload.starts_on,
            ends_on: p_payload.ends_on,
            target: p_payload.kind === 'team' ? 8 : 15,
            expires_at: '2026-12-31T00:00:00Z',
            cancelled_at: null,
            owner_id: UID,
            created_at: new Date().toISOString(),
          })
          // Like the database: the organiser of a pool brings the first pledge.
          if (p_payload.kind === 'work' && p_payload.parcel_id)
            PARTS.push({
              group_id: id,
              user_id: UID,
              parcel_id: p_payload.parcel_id,
              amount: Number(p_payload.amount),
              left_at: null,
            })
          return send(200, id)
        }
        return send(409, { code: '22023', message: 'Commande invalide' })
      }
      if (p.startsWith('/rest/v1/rpc/')) return send(200, [])
      if (p.startsWith('/rest/v1/')) {
        const table = p.slice('/rest/v1/'.length)
        const single = (req.headers.accept || '').includes('vnd.pgrst.object')
        const src = TABLES[table]
        let rows = typeof src === 'function' ? src() : (src ?? [])
        rows = filterRows(rows, url.searchParams)
        const total = rows.length
        const range = /^(\d+)-(\d+)$/.exec(req.headers.range ?? '')
        if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1)
        // postgrest-js .range() and .limit() travel as query parameters.
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = url.searchParams.has('limit')
          ? Number(url.searchParams.get('limit'))
          : rows.length
        if (offset || limit < rows.length) rows = rows.slice(offset, offset + limit)
        const wantCount = String(req.headers.prefer ?? '').includes('count=')
        const headers = {
          'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${wantCount ? total : '*'}`,
        }
        if (req.method === 'HEAD') return send(200, undefined, headers)
        if (req.method !== 'GET') return send(201, single ? (rows[0] ?? {}) : rows, headers)
        if (single)
          return rows.length
            ? send(200, rows[0], headers)
            : send(406, { code: 'PGRST116', message: 'no rows' })
        return send(200, rows, headers)
      }
      if (p === '/__log') return send(200, log)
      send(200, {})
    })
  })
  .listen(PORT, () => console.log('mock supabase on', PORT))
export const SESSION = session
