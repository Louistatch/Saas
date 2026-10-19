/**
 * Cascade région → préfecture → canton (hooks/cascading-locations-core.ts).
 *
 * Régression : /dashboard/marketplace appelait le hook avec des tableaux écrits
 * en ligne (`levels: [...]`, `prefetchLevels: [...]`). Le hook dépendait de
 * l'identité de ces tableaux : chaque rendu relançait la lecture de `regions`
 * et `prefectures` (~19 500 requêtes en 4 minutes) et « Nouvelle fiche »
 * plantait sur « Maximum update depth exceeded ».
 *
 * Ces tests montent le vrai hook avec React (react-dom/client, sur un faux
 * conteneur DOM minimal) et une lecture simulée qui compte les requêtes.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { act, createElement, useReducer } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import {
  type CascadingLocationSelection,
  EMPTY_SELECTION,
  type LocationFetcher,
  type LocationRow,
  type UseCascadingLocationsOptions,
  type UseCascadingLocationsResult,
  deriveOptions,
  levelListKey,
  parseLevelListKey,
  parseRequestPlanKey,
  pendingLevel,
  planRequests,
  requestPlanKey,
  resetChildrenOf,
  useCascadingLocationsWith,
} from '../hooks/cascading-locations-core'

// ── Données ─────────────────────────────────────────────────────────────────
const R_KARA = 'r-kara'
const R_SAV = 'r-savanes'
const P_KOZAH = 'p-kozah'
const P_BINAH = 'p-binah'
const P_TONE = 'p-tone'
const TABLES: Record<string, LocationRow[]> = {
  regions: [
    { id: R_KARA, name: 'Kara' },
    { id: R_SAV, name: 'Savanes' },
  ],
  prefectures: [
    { id: P_BINAH, name: 'Binah', region_id: R_KARA },
    { id: P_KOZAH, name: 'Kozah', region_id: R_KARA },
    { id: P_TONE, name: 'Tône', region_id: R_SAV },
  ],
  communes: [{ id: 'm-kozah1', name: 'Kozah 1', prefecture_id: P_KOZAH }],
  cantons: [
    { id: 'c-lama', name: 'Lama', prefecture_id: P_KOZAH },
    { id: 'c-pya', name: 'Pya', prefecture_id: P_KOZAH },
    { id: 'c-pagouda', name: 'Pagouda', prefecture_id: P_BINAH },
    { id: 'c-dapaong', name: 'Dapaong', prefecture_id: P_TONE },
  ],
  villages: [{ id: 'v-1', name: 'Lama-Kara', canton_id: 'c-lama' }],
}

/** Au-delà, on considère que le hook boucle : la lecture ne répond plus. */
const RUNAWAY = 200

function fakeFetcher() {
  const calls: string[] = []
  const fetcher: LocationFetcher = ({ table, parent }) => {
    calls.push(parent ? `${table}?${parent.column}=${parent.id}` : table)
    if (calls.length > RUNAWAY) return new Promise<LocationRow[]>(() => {})
    const rows = TABLES[table] ?? []
    return Promise.resolve(parent ? rows.filter((r) => r[parent.column] === parent.id) : rows)
  }
  const count = (table: string) =>
    calls.filter((c) => c === table || c.startsWith(`${table}?`)).length
  return { fetcher, calls, count }
}

// ── Montage React minimal (pas de jsdom dans le dépôt) ──────────────────────
const g = globalThis as Record<string, unknown>
let savedWindow: unknown
before(() => {
  savedWindow = g.window
  g.IS_REACT_ACT_ENVIRONMENT = true
})
after(() => {
  g.window = savedWindow
})

function fakeContainer(): Element {
  const noop = () => {}
  const doc: Record<string, unknown> = { addEventListener: noop, removeEventListener: noop }
  const el: Record<string, unknown> = {
    nodeType: 1,
    nodeName: 'DIV',
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: doc,
    textContent: '',
    addEventListener: noop,
    removeEventListener: noop,
  }
  const win = { document: doc, HTMLIFrameElement: class {}, event: undefined }
  Object.assign(doc, { documentElement: el, body: el, activeElement: el, defaultView: win })
  g.window = win
  return el as unknown as Element
}

interface Mounted {
  hook: () => UseCascadingLocationsResult
  renders: () => number
  /** Force `times` rendus du composant appelant (nouveaux tableaux en ligne à chaque fois). */
  rerender: (times: number) => Promise<void>
  run: (fn: (h: UseCascadingLocationsResult) => void) => Promise<void>
  unmount: () => Promise<void>
}

async function mount(fetcher: LocationFetcher, makeOpts: () => UseCascadingLocationsOptions) {
  let latest: UseCascadingLocationsResult | null = null
  let renders = 0
  let bump: () => void = () => {}
  function Caller() {
    renders++
    const [, force] = useReducer((n: number) => n + 1, 0)
    bump = force
    // Options recréées à chaque rendu, comme dans la page faîtière.
    latest = useCascadingLocationsWith(fetcher, makeOpts())
    return null
  }
  const root: Root = createRoot(fakeContainer())
  await act(async () => {
    root.render(createElement(Caller))
  })
  const m: Mounted = {
    hook: () => {
      assert.ok(latest)
      return latest
    },
    renders: () => renders,
    rerender: async (times) => {
      for (let i = 0; i < times; i++) {
        await act(async () => {
          bump()
        })
      }
    },
    run: async (fn) => {
      await act(async () => {
        fn(m.hook())
      })
    },
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
    },
  }
  return m
}

const names = (opts: { name: string }[]) => opts.map((o) => o.name)

// ── Le cas de la page faîtière ──────────────────────────────────────────────
test('faîtière : tableaux en ligne, une seule lecture de regions et prefectures', async () => {
  const f = fakeFetcher()
  const m = await mount(f.fetcher, () => ({
    levels: ['region_id', 'prefecture_id', 'canton_id'],
    mode: 'prefetch-filter',
    prefetchLevels: ['region_id', 'prefecture_id'],
  }))

  assert.equal(f.count('regions'), 1)
  assert.equal(f.count('prefectures'), 1)
  assert.equal(f.count('cantons'), 0, 'aucun canton lu sans préfecture choisie')
  assert.ok(m.renders() < 10, `rendus au montage : ${m.renders()}`)
  assert.deepEqual(names(m.hook().options.region_id), ['Kara', 'Savanes'])
  assert.deepEqual(names(m.hook().options.prefecture_id), ['Binah', 'Kozah', 'Tône'])

  // 50 rendus de la page (frappe dans le formulaire, ouverture du dialogue…)
  await m.rerender(50)
  assert.equal(f.calls.length, 2, `lectures après 50 rendus : ${f.calls.join(', ')}`)

  // Région puis préfecture : les cantons sont lus une fois, pour Kozah.
  await m.run((h) => h.setLevel('region_id', R_KARA))
  assert.deepEqual(names(m.hook().options.prefecture_id), ['Binah', 'Kozah'])
  await m.run((h) => h.setLevel('prefecture_id', P_KOZAH))
  assert.deepEqual(names(m.hook().options.canton_id), ['Lama', 'Pya'])
  assert.equal(m.hook().loadingLevel, null)
  await m.rerender(20)
  assert.deepEqual(f.calls, ['regions', 'prefectures', 'cantons?prefecture_id=p-kozah'])

  // Changer de région vide préfecture et canton, sans nouvelle lecture.
  await m.run((h) => h.setLevel('region_id', R_SAV))
  assert.deepEqual(m.hook().selection, { ...EMPTY_SELECTION, region_id: R_SAV })
  assert.deepEqual(names(m.hook().options.prefecture_id), ['Tône'])
  assert.deepEqual(m.hook().options.canton_id, [])
  assert.equal(f.calls.length, 3)

  // Retour sur Kozah : cantons déjà lus, rien n'est relu.
  await m.run((h) => h.setSelection({ region_id: R_KARA, prefecture_id: P_KOZAH }))
  assert.deepEqual(names(m.hook().options.canton_id), ['Lama', 'Pya'])
  assert.equal(f.calls.length, 3)

  // Réinitialisation du formulaire (resetForm) : sélection vide, pas de lecture.
  await m.run((h) => h.setSelection({ region_id: '', prefecture_id: '', canton_id: '' }))
  assert.deepEqual(m.hook().selection, EMPTY_SELECTION)
  assert.deepEqual(names(m.hook().options.prefecture_id), ['Binah', 'Kozah', 'Tône'])
  assert.equal(f.calls.length, 3)
  await m.unmount()
})

test('levels transmis à l’appelant : même identité d’un rendu à l’autre', async () => {
  const f = fakeFetcher()
  const m = await mount(f.fetcher, () => ({ levels: ['region_id', 'prefecture_id'] }))
  const first = m.hook().levels
  const firstOptions = m.hook().options
  await m.rerender(5)
  assert.equal(m.hook().levels, first)
  assert.equal(m.hook().options, firstOptions, 'options inchangées sans nouvelle donnée')
  await m.unmount()
})

// ── Le cas du sélecteur de localité (mode 'query', 5 niveaux) ──────────────
test('sélecteur de localité : initialSelection en ligne, une lecture par niveau', async () => {
  const f = fakeFetcher()
  const m = await mount(f.fetcher, () => ({
    levels: ['region_id', 'prefecture_id', 'commune_id', 'canton_id', 'village_id'],
    initialSelection: {
      region_id: R_KARA,
      prefecture_id: P_KOZAH,
      commune_id: '',
      canton_id: 'c-lama',
      village_id: '',
    },
  }))
  await m.rerender(30)
  assert.deepEqual([...f.calls].sort(), [
    'cantons?prefecture_id=p-kozah',
    'communes?prefecture_id=p-kozah',
    'prefectures?region_id=r-kara',
    'regions',
    'villages?canton_id=c-lama',
  ])
  assert.deepEqual(names(m.hook().options.village_id), ['Lama-Kara'])

  // Même sélection renvoyée par le parent (synchronisation `value`) : l'état
  // garde son identité (React peut rendre une fois avant d'abandonner).
  const before = m.renders()
  const selection = m.hook().selection
  await m.run((h) => h.setSelection({ region_id: R_KARA, prefecture_id: P_KOZAH }))
  assert.equal(m.hook().selection, selection)
  assert.ok(m.renders() - before <= 1)
  assert.equal(f.calls.length, 5)
  await m.unmount()
})

test('réponses dans le désordre : la préfecture choisie en dernier l’emporte', async () => {
  const pending = new Map<string, (rows: LocationRow[]) => void>()
  const fetcher: LocationFetcher = ({ table, parent }) => {
    if (!parent) return Promise.resolve(TABLES[table])
    return new Promise((resolve) => {
      pending.set(parent.id, () =>
        resolve(TABLES[table].filter((r) => r[parent.column] === parent.id)),
      )
    })
  }
  const m = await mount(fetcher, () => ({
    levels: ['region_id', 'prefecture_id', 'canton_id'],
    mode: 'prefetch-filter',
  }))
  await m.run((h) => h.setSelection({ region_id: R_KARA, prefecture_id: P_BINAH }))
  assert.equal(m.hook().loadingLevel, 'canton_id')
  await m.run((h) => h.setLevel('prefecture_id', P_KOZAH))
  await m.run(() => pending.get(P_KOZAH)?.([]))
  await m.run(() => pending.get(P_BINAH)?.([]))
  assert.deepEqual(names(m.hook().options.canton_id), ['Lama', 'Pya'])
  assert.equal(m.hook().loadingLevel, null)
  await m.unmount()
})

test('lecture en échec : liste vide, relue au choix suivant, sans boucle', async () => {
  let fail = true
  const calls: string[] = []
  const fetcher: LocationFetcher = ({ table, parent }) => {
    calls.push(parent ? `${table}?${parent.id}` : table)
    if (table === 'cantons' && fail) return Promise.reject(new Error('réseau'))
    const rows = TABLES[table]
    return Promise.resolve(parent ? rows.filter((r) => r[parent.column] === parent.id) : rows)
  }
  const m = await mount(fetcher, () => ({ mode: 'prefetch-filter' }))
  await m.run((h) => h.setSelection({ region_id: R_KARA, prefecture_id: P_KOZAH }))
  await m.rerender(10)
  assert.deepEqual(m.hook().options.canton_id, [])
  assert.equal(m.hook().loadingLevel, null)
  assert.equal(calls.filter((c) => c.startsWith('cantons')).length, 1)
  fail = false
  await m.run((h) => h.setLevel('prefecture_id', P_BINAH))
  await m.run((h) => h.setLevel('prefecture_id', P_KOZAH))
  assert.deepEqual(names(m.hook().options.canton_id), ['Lama', 'Pya'])
  await m.unmount()
})

test('régions et préfectures en échec : signalées, relues par retry() sans nouveau choix', async () => {
  // Panne plus longue que les nouvelles tentatives du client : les deux
  // listes préchargées échouent, et aucun choix n'est possible (listes vides).
  let down = true
  const calls: string[] = []
  const fetcher: LocationFetcher = ({ table, parent }) => {
    calls.push(parent ? `${table}?${parent.id}` : table)
    if (down) return Promise.reject(new Error('503'))
    const rows = TABLES[table]
    return Promise.resolve(parent ? rows.filter((r) => r[parent.column] === parent.id) : rows)
  }
  const m = await mount(fetcher, () => ({
    levels: ['region_id', 'prefecture_id', 'canton_id'],
    mode: 'prefetch-filter',
    prefetchLevels: ['region_id', 'prefecture_id'],
  }))
  assert.deepEqual(m.hook().options.region_id, [])
  assert.deepEqual(m.hook().failedLevels, ['region_id', 'prefecture_id'])
  // Rendus (ouvrir / fermer la fenêtre) : aucune relecture en boucle.
  await m.rerender(10)
  assert.equal(calls.length, 2)
  const failedBefore = m.hook().failedLevels
  await m.rerender(1)
  assert.equal(m.hook().failedLevels, failedBefore, 'même tableau d’un rendu à l’autre')

  // Réseau revenu : retry() (appelé à l'ouverture de la fenêtre) relit.
  down = false
  await m.run((h) => h.retry())
  assert.deepEqual(names(m.hook().options.region_id), ['Kara', 'Savanes'])
  assert.equal(m.hook().options.prefecture_id.length, 3)
  assert.deepEqual(m.hook().failedLevels, [])
  assert.equal(calls.length, 4)

  // Plus rien en échec : retry() ne relit rien et ne provoque aucun rendu.
  const renders = m.renders()
  await m.run((h) => h.retry())
  await m.run((h) => h.retry())
  assert.equal(calls.length, 4)
  assert.equal(m.renders(), renders)
  await m.unmount()
})

test('retry() pendant une panne : une lecture par appel, jamais en boucle', async () => {
  const calls: string[] = []
  const fetcher: LocationFetcher = ({ table }) => {
    calls.push(table)
    return Promise.reject(new Error('réseau'))
  }
  const m = await mount(fetcher, () => ({ mode: 'prefetch-filter' }))
  assert.equal(calls.length, 2)
  await m.run((h) => h.retry())
  assert.equal(calls.length, 4)
  await m.rerender(10)
  assert.equal(calls.length, 4)
  assert.deepEqual(m.hook().failedLevels, ['region_id', 'prefecture_id'])
  await m.unmount()
})

// ── Fonctions pures ─────────────────────────────────────────────────────────
test('levelListKey : contenu, pas identité ; ordre de la cascade imposé', () => {
  assert.equal(
    levelListKey(['region_id', 'prefecture_id']),
    levelListKey(['region_id', 'prefecture_id']),
  )
  assert.equal(levelListKey(['canton_id', 'region_id', 'canton_id']), 'region_id,canton_id')
  assert.equal(levelListKey(['quartier', 'region_id']), 'region_id')
  assert.deepEqual(parseLevelListKey(''), [])
  assert.deepEqual(parseLevelListKey('region_id,canton_id'), ['region_id', 'canton_id'])
})

test('planRequests : rien à lire pour un enfant sans parent choisi', () => {
  const sel: CascadingLocationSelection = { ...EMPTY_SELECTION, region_id: R_KARA }
  const levels = parseLevelListKey('region_id,prefecture_id,canton_id')
  const plan = planRequests('query', levels, [], sel)
  assert.deepEqual(plan, [
    { level: 'region_id', parentId: '' },
    { level: 'prefecture_id', parentId: R_KARA },
  ])
  assert.deepEqual(parseRequestPlanKey(requestPlanKey(plan)), plan)
  const pre = planRequests('prefetch-filter', levels, ['region_id', 'prefecture_id'], sel)
  assert.equal(requestPlanKey(pre), 'region_id:*|prefecture_id:*')
  assert.equal(pendingLevel(plan, { 'region_id:': [] }), 'prefecture_id')
  assert.equal(pendingLevel(plan, { 'region_id:': [], [`prefecture_id:${R_KARA}`]: [] }), null)
})

test('deriveOptions : filtre les niveaux préchargés, ignore une lecture d’un autre parent', () => {
  const levels = parseLevelListKey('region_id,prefecture_id,canton_id')
  const cache = {
    'region_id:*': TABLES.regions,
    'prefecture_id:*': TABLES.prefectures,
    [`canton_id:${P_BINAH}`]: [{ id: 'c-pagouda', name: 'Pagouda' }],
  }
  const sel = { ...EMPTY_SELECTION, region_id: R_KARA, prefecture_id: P_KOZAH }
  const out = deriveOptions('prefetch-filter', levels, ['region_id', 'prefecture_id'], cache, sel)
  assert.equal(out.region_id, TABLES.regions, 'niveau sans filtre : même tableau')
  assert.deepEqual(names(out.prefecture_id), ['Binah', 'Kozah'])
  assert.deepEqual(out.canton_id, [], 'cantons de Binah non proposés pour Kozah')
  assert.deepEqual(out.village_id, [])
  assert.deepEqual(resetChildrenOf('prefecture_id', { ...sel, canton_id: 'c-lama' }), sel)
})
