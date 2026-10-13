// Faux Supabase local (auth + PostgREST + quelques RPC) pour jouer les parcours HarooLife
// sans compte réel : un compte super_admin rattaché à la coopérative COOMARA-Kpalimé
// (120 membres, 40 parcelles, cartes, regroupements). Aucune donnée réelle.
//   node e2e/fixtures/mock-supabase.mjs   (port 54329)
import http from 'node:http'
const PORT = 54329
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
const REALTIME_ACCOUNTS = new Set([
  'a1a1a1a1-0000-4000-8000-000000000001',
  'b2b2b2b2-0000-4000-8000-000000000002',
  'c3c3c3c3-0000-4000-8000-000000000003',
])
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

const TABLES = {
  profiles: PROFILES,
  cooperatives: COOPS,
  cooperative_stats: COOPS,
  regions: [{ id: 'r2', name: 'Kara' }],
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
      if (p === '/auth/v1/user') {
        // Realtime chat accounts (fictional, see realtime/pglite.ts): answer with the token's
        // subject, so two browsers are two different people for the Socket.IO relay.
        const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '')
        let sub = null
        try {
          sub = JSON.parse(Buffer.from(bearer.split('.')[1] ?? '', 'base64url').toString()).sub
        } catch {}
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
        return send(200, session())
      }
      if (p.startsWith('/auth/v1/')) return send(200, {})
      if (p === '/rest/v1/rpc/haroolife_world') return send(200, WORLD)
      if (p === '/rest/v1/rpc/haroolife_set_home') return send(200, null)
      if (p === '/rest/v1/rpc/haroolife_say') return send(200, 'm3')
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
