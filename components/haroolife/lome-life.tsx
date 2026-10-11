'use client'

import {
  type Action,
  type Career,
  LIFE_LOCATIONS,
  type LifeState,
  SALARIES,
  advanceLifeHour,
  buildInLome,
  decodeLomeLife,
  demolishInLome,
  directTo,
  initialLomeLife,
  interact,
  jobVenue,
  selectJob,
} from '@/lib/haroolife/lome-life-engine'
import { type BuildType, CATALOG } from '@/lib/haroolife/townsmen-engine'
import {
  BriefcaseBusiness,
  Coffee,
  Footprints,
  Heart,
  MapPinned,
  Pause,
  Play,
  RotateCcw,
  Sun,
  Users,
  Wallet,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

const STORAGE = 'haroolife.lome-life.v1'
const World3D = dynamic(() => import('./city-world-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-emerald-100 text-emerald-950">
      Initialisation du quartier PlayCanvas 3D…
    </div>
  ),
})
const money = (v: number) => new Intl.NumberFormat('fr-FR').format(v) + ' FCFA'
const ACTIONS: { id: Action; label: string }[] = [
  { id: 'enter', label: 'Entrer' },
  { id: 'leave', label: 'Sortir' },
  { id: 'work', label: 'Faire mon service' },
  { id: 'buy-meal', label: 'Acheter un repas (650 FCFA)' },
  { id: 'eat', label: 'Manger' },
  { id: 'sleep', label: 'Dormir' },
  { id: 'wash', label: 'Se laver' },
  { id: 'socialize', label: 'Discuter' },
]
const TOOLBAR: BuildType[] = ['road', 'house', 'market', 'bakery', 'farm', 'well', 'park', 'mill']
const meter = (val: number, shade: string) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
    <div className={'h-full rounded-full ' + shade} style={{ width: val + '%' }} />
  </div>
)
export function LomeLife() {
  const [life, setLife] = useState<LifeState>(initialLomeLife)
  const [loaded, setLoaded] = useState(false)
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<'walk' | 'build' | 'demolish'>('walk')
  const [building, setBuilding] = useState<BuildType>('house')
  const [selection, setSelection] = useState<{ x: number; y: number } | null>(null)
  const [showGuide, setShowGuide] = useState(true)

  useEffect(() => {
    try {
      const c = document.createElement('canvas')
      setWebgl(Boolean(c.getContext('webgl2')))
      const saved = localStorage.getItem(STORAGE)
      if (saved) {
        const v = decodeLomeLife(JSON.parse(saved))
        if (v) setLife(v)
      }
    } catch {
      setWebgl(false)
    }
    setLoaded(true)
  }, [])
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(STORAGE, JSON.stringify(life))
    } catch {
      /* nonessential local save */
    }
  }, [life, loaded])
  useEffect(() => {
    if (!running || !loaded) return
    const interval = window.setInterval(() => setLife((old) => advanceLifeHour(old)), 1200)
    return () => window.clearInterval(interval)
  }, [running, loaded])
  useEffect(() => {
    const pause = () => {
      if (document.visibilityState === 'hidden') setRunning(false)
    }
    document.addEventListener('visibilitychange', pause)
    return () => document.removeEventListener('visibilitychange', pause)
  }, [])

  const needs = life.needs
  const activeBuilding = useMemo(
    () =>
      selection
        ? life.city.buildings.find((b) => b.x === selection.x && b.y === selection.y)
        : null,
    [selection, life.city.buildings],
  )
  const workPlace = jobVenue(life.job)
  function clickTile(x: number, y: number) {
    setSelection({ x, y })
    if (mode === 'walk') setLife((v) => directTo(v, { x, y }))
    if (mode === 'build') setLife((v) => buildInLome(v, x, y, building))
    if (mode === 'demolish') setLife((v) => demolishInLome(v, x, y))
  }
  function act(id: Action) {
    setLife((v) => interact(v, id))
  }
  function go(place: (typeof LIFE_LOCATIONS)[number]) {
    setMode('walk')
    setSelection({ x: place.x, y: place.y })
    setLife((v) => directTo(v, { x: place.x, y: place.y }))
  }
  function restart() {
    if (!window.confirm('Recommencer uniquement le scénario fictif de Lomé ?')) return
    setRunning(false)
    setLife(initialLomeLife())
    setMode('walk')
    setSelection(null)
  }

  return (
    <main className="min-h-screen bg-[#eaf0e5] text-[#172d27]">
      <header className="bg-[#10372b] px-3 py-3 text-white sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/haroolife/territoire"
              className="text-xs text-emerald-200 underline underline-offset-4"
            >
              HarooLife / Ville
            </Link>
            <h1 className="text-2xl font-black sm:text-3xl">
              LOMÉ LIFE <span className="text-emerald-300">3D</span>
            </h1>
            <p className="text-xs text-emerald-100">
              Vivre, travailler, commercer et construire dans un quartier fictif de Lomé.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-lg bg-white/10 px-3 py-2 font-bold">
              Jour {life.day} · {String(life.hour).padStart(2, '0')} h
            </span>
            <button
              type="button"
              onClick={() => setRunning((v) => !v)}
              aria-label={running ? 'Mettre en pause' : 'Reprendre le temps'}
              className="rounded-xl border border-white/25 p-3"
            >
              {running ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <button
              type="button"
              onClick={() => setLife((v) => advanceLifeHour(v))}
              className="rounded-lg bg-emerald-300 px-3 py-2 font-bold text-emerald-950"
            >
              +1 h
            </button>
            <button
              type="button"
              onClick={restart}
              aria-label="Recommencer ce scénario"
              className="rounded-xl border border-white/25 p-3"
            >
              <RotateCcw size={19} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-3 px-3 py-3 sm:px-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <Wallet className="mb-1 h-4 w-4 text-emerald-600" />
            <p className="text-xs text-slate-500">Mon argent</p>
            <p className="text-lg font-black">{money(life.wallet)}</p>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <BriefcaseBusiness className="mb-1 h-4 w-4 text-emerald-600" />
            <p className="text-xs text-slate-500">Mon emploi</p>
            <p className="text-sm font-black capitalize">{life.job}</p>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <Sun className="mb-1 h-4 w-4 text-amber-600" />
            <p className="text-xs text-slate-500">Faim</p>
            <p className="font-bold">{needs.hunger}%</p>
            {meter(needs.hunger, 'bg-amber-500')}
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <Coffee className="mb-1 h-4 w-4 text-emerald-600" />
            <p className="text-xs text-slate-500">Énergie</p>
            <p className="font-bold">{needs.energy}%</p>
            {meter(needs.energy, 'bg-emerald-600')}
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <Heart className="mb-1 h-4 w-4 text-pink-600" />
            <p className="text-xs text-slate-500">Hygiène</p>
            <p className="font-bold">{needs.hygiene}%</p>
            {meter(needs.hygiene, 'bg-blue-600')}
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <Users className="mb-1 h-4 w-4 text-pink-600" />
            <p className="text-xs text-slate-500">Sociabilité</p>
            <p className="font-bold">{needs.social}%</p>
            {meter(needs.social, 'bg-pink-500')}
          </div>
        </div>

        {showGuide && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
            <span>
              <strong>Mission :</strong> visite le marché → achète et mange → rejoins ton travail →
              gagne des FCFA → construis une nouvelle maison. Touchez un bâtiment pour vous y
              rendre.
            </span>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="font-semibold underline"
            >
              Masquer
            </button>
          </div>
        )}

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 space-y-3">
            <div className="overflow-hidden rounded-2xl border-4 border-[#b9d1bd] bg-white shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f5f5e8] px-3 py-2">
                <div className="flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-emerald-700" />
                  <strong>Quartier de Lomé</strong>
                </div>
                <div className="flex gap-1">
                  {(
                    [
                      { id: 'walk', label: 'Se déplacer' },
                      { id: 'build', label: 'Construire' },
                      { id: 'demolish', label: 'Démolir' },
                    ] as const
                  ).map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      aria-pressed={mode === item.id}
                      onClick={() => setMode(item.id)}
                      className={
                        mode === item.id
                          ? 'rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white'
                          : 'rounded-lg bg-white px-3 py-2 text-xs font-bold hover:bg-emerald-50'
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[58vh] min-h-[400px] max-h-[800px] bg-[#a4c9ae] sm:h-[72vh]">
                {webgl === false ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center">
                    <p className="font-bold">WebGL2 n’est pas disponible.</p>
                    <p className="text-sm">
                      Pour ce mode de vie en 3D, ouvrez un navigateur compatible.
                    </p>
                  </div>
                ) : (
                  <World3D
                    city={life.city}
                    life={life}
                    tool={mode === 'walk' ? 'inspect' : mode === 'demolish' ? 'demolish' : building}
                    inspect={selection}
                    onTile={clickTile}
                  />
                )}
              </div>
              <p
                role="status"
                aria-live="polite"
                className="min-h-10 bg-white px-4 py-3 text-sm font-semibold text-emerald-900"
              >
                {life.lastEvent}
              </p>
            </div>
            {mode === 'build' && (
              <section className="rounded-xl bg-white p-3 shadow-sm">
                <p className="mb-2 text-sm font-black">
                  Choisir un bâtiment à placer — Budget municipal : {money(life.city.coins)} · Bois
                  : {life.city.wood}
                </p>
                <div className="flex flex-wrap gap-2">
                  {TOOLBAR.map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={building === item}
                      onClick={() => setBuilding(item)}
                      className={
                        building === item
                          ? 'rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white'
                          : 'rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-emerald-50'
                      }
                    >
                      {CATALOG[item].icon} {CATALOG[item].label} ({CATALOG[item].coins} FCFA)
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-3">
            <section className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Footprints className="h-5 w-5" /> Mes destinations
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Un trajet suit les routes existantes. Les bâtiments sont accessibles depuis leurs
                entrées.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {LIFE_LOCATIONS.map((place) => (
                  <button
                    key={place.name}
                    type="button"
                    onClick={() => go(place)}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-left text-xs font-semibold hover:bg-emerald-100"
                  >
                    {place.name}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Position : {life.pos.x + 1}, {life.pos.y + 1} · Trajet restant : {life.route.length}{' '}
                cases.
              </p>
            </section>
            <section className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="font-black">Vie et interactions</h2>
              <p className="mt-1 text-xs text-slate-500">
                Lieu intérieur : {life.inside ?? 'dehors'} · Repas disponibles : {life.meals}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => act(action.id)}
                    className="rounded-xl bg-[#eaf4eb] p-3 text-left text-xs font-semibold hover:bg-emerald-200"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </section>
            <section className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-2 font-black">
                <BriefcaseBusiness className="h-4 w-4" /> Mon métier
              </h2>
              <select
                value={life.job}
                onChange={(e) => setLife((v) => selectJob(v, e.target.value as Career))}
                className="mt-2 w-full rounded-xl border border-emerald-200 bg-white p-3 text-sm"
              >
                {(['vendeur', 'boulanger', 'agent-communal'] as const).map((career) => (
                  <option key={career} value={career}>
                    {career} · {money(SALARIES[career])} / service
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-600">
                Travaille au {workPlace}. Revenus cumulés : {money(life.earned)}. Dépenses :{' '}
                {money(life.spent)}.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Quartier : {life.city.population} habitants · {life.city.food} repas en réserve ·
                finances collectives {money(life.city.coins)}.
              </p>
            </section>
            <section className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="font-black">Journal de vie</h2>
              <ol className="mt-3 space-y-2 text-xs text-slate-700">
                {life.events.map((e, i) => (
                  <li key={i} className="border-l-2 border-emerald-300 pl-3">
                    {e}
                  </li>
                ))}
              </ol>
            </section>
            <p className="px-2 text-xs text-slate-500">
              Scénario de fiction. Aucune écriture vers les comptes, contrats, parcelles ou
              paiements réels. Sauvegarde locale dans ce navigateur.
            </p>
          </aside>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-6 text-xs text-slate-600">
          <span>
            Décor 3D Kenney (CC0) · PlayCanvas · Quartier inspiré de Lomé, non relevé géographique
            exact.
          </span>
          <Link href="/haroolife/territoire" className="underline">
            Revenir à HarooVille
          </Link>
        </div>
      </div>
    </main>
  )
}
