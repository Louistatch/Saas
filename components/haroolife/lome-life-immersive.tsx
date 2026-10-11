'use client'

import {
  type CityAction,
  type CityLife,
  type Interior,
  actionsFor,
  arrive,
  cityInteract,
  decodeCityLife,
  fromLegacy,
  goToEstate,
  goToLot,
  goToPoint,
  initialCityLife,
  interiorFor,
  lotAtDoor,
  payRide,
  stepDir,
  walkStep,
} from '@/lib/haroolife/city/life'
import {
  CATEGORY_LABELS,
  CATEGORY_OF,
  type Category,
  DISTRICTS,
  type Lot,
  TYPE_ICONS,
  TYPE_LABELS,
  placeName as cityPlaceName,
  landmarksIn,
  lotAt as lotAtCell,
  lotById,
  toWorld,
} from '@/lib/haroolife/city/world'
import {
  CITIES,
  CITY_IDS,
  MAP_FILTERS,
  type MapFilter,
  districtAt,
  matchesFilter,
  placeNameAt,
} from '@/lib/haroolife/lome-districts'
import { eventById, resolveEvent } from '@/lib/haroolife/lome-events'
import {
  type Action,
  type Career,
  LIFE_LOCATIONS,
  type LifeState,
  NEED_KEYS,
  SALARIES,
  TRAVEL_COST,
  type Transport,
  advanceLifeHour,
  buildInLome,
  decodeLomeLife,
  demolishInLome,
  initialLomeLife,
  interact,
  jobVenue,
  selectCity,
  selectJob,
} from '@/lib/haroolife/lome-life-engine'
import { placeResidents, residentsAt } from '@/lib/haroolife/lome-presence'
import { BILLBOARDS, PARTNER_APPS, billboardById } from '@/lib/haroolife/lome-sponsors'
import { type BuildType, CATALOG } from '@/lib/haroolife/townsmen-engine'
import { ROLE_LABELS } from '@/lib/haroolife/world'
import {
  ArrowRight,
  Bell,
  Check,
  Clock3,
  Hammer,
  Home,
  Map,
  Pause,
  Phone,
  Play,
  Plus,
  Send,
  ShoppingBag,
  Sun,
  UserRound,
  Users,
  Utensils,
  X,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CAMERA_HOME, type CameraState } from './city/city-world'
import { sayOnPlace, usePresence } from './use-presence'

const CityWorld = dynamic(() => import('./city/city-world'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#9bbd9d] text-sm font-bold text-white">
      Chargement du monde 3D de Lomé…
    </div>
  ),
})
const RideOverlay = dynamic(() => import('./travel-scene-3d'), { ssr: false })
const STORAGE = 'haroolife.lome-life.v1'
const CITY_STORAGE = 'haroolife.lome-city.v1'
type Dir = [-1 | 0 | 1, -1 | 0 | 1]
const KEYS: Record<string, Dir> = {
  arrowup: [0, -1],
  w: [0, -1],
  arrowdown: [0, 1],
  s: [0, 1],
  arrowleft: [-1, 0],
  a: [-1, 0],
  arrowright: [1, 0],
  d: [1, 0],
}
const PAD: { label: string; dir: Dir; cls: string }[] = [
  { label: 'Avancer', dir: [0, -1], cls: 'col-start-2 row-start-1' },
  { label: 'Gauche', dir: [-1, 0], cls: 'col-start-1 row-start-2' },
  { label: 'Droite', dir: [1, 0], cls: 'col-start-3 row-start-2' },
  { label: 'Reculer', dir: [0, 1], cls: 'col-start-2 row-start-3' },
]
type Sheet =
  | 'home'
  | 'shop'
  | 'map'
  | 'phone'
  | 'build'
  | 'jobs'
  | 'messages'
  | 'wallet'
  | 'missions'
  | 'journal'
  | 'billboard'
  | 'lot'
  | null
type Mode = 'walk' | 'build' | 'demolish'
const money = (n: number) => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
const BUILDINGS: BuildType[] = [
  'road',
  'house',
  'market',
  'bakery',
  'farm',
  'mill',
  'lumberyard',
  'well',
  'park',
]
const JOBS: Career[] = ['vendeur', 'boulanger', 'agent-communal']
const VENUE_LABELS: Record<string, string> = {
  house: 'Maison',
  market: 'Marché',
  bakery: 'Boulangerie',
  hall: 'Mairie',
  well: 'Puits',
  park: 'Jardin',
}
const LOCATION_ICONS = ['🏠', '🛒', '🥖', '🏛️', '🚰', '🌳']
const NAV_ITEMS = [
  { id: 'home', label: 'Maison', icon: Home },
  { id: 'shop', label: 'Acheter', icon: ShoppingBag },
  { id: 'map', label: 'Carte', icon: Map },
  { id: 'phone', label: 'Téléphone', icon: Phone },
] as const
const NEEDS = [
  { key: 'hunger' as const, icon: '🍲', label: 'Faim', color: 'bg-orange-400' },
  { key: 'energy' as const, icon: '⚡', label: 'Énergie', color: 'bg-amber-400' },
  { key: 'hygiene' as const, icon: '💧', label: 'Hygiène', color: 'bg-sky-400' },
  { key: 'social' as const, icon: '💬', label: 'Social', color: 'bg-emerald-400' },
  { key: 'fun' as const, icon: '🎉', label: 'Loisir', color: 'bg-fuchsia-400' },
  { key: 'bladder' as const, icon: '🚽', label: 'Toilettes', color: 'bg-teal-400' },
]
function NeedBar({ value, color }: { value: number; color: string }) {
  return (
    <span className="block h-[7px] w-full overflow-hidden rounded-full bg-slate-200/80">
      <span
        className={'block h-full rounded-full transition-all duration-200 ' + color}
        style={{ width: value + '%' }}
      />
    </span>
  )
}
function ActionButton({
  title,
  onClick,
  icon,
  outline = false,
}: {
  title: string
  onClick: () => void
  icon?: React.ReactNode
  outline?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition active:scale-[.98] ' +
        (outline
          ? 'border border-slate-200 bg-white text-slate-800'
          : 'bg-emerald-600 text-white shadow-md shadow-emerald-600/15 hover:bg-emerald-700')
      }
    >
      {icon}
      {title}
    </button>
  )
}
function DailyStatus({ life }: { life: LifeState }) {
  const completed = life.workToday ? 1 : 0
  return (
    <div className="grid grid-cols-3 gap-2 text-center text-xs">
      <div className="rounded-xl bg-slate-50 p-3">
        <strong className="block text-lg">{life.meals}</strong>Repas
      </div>
      <div className="rounded-xl bg-slate-50 p-3">
        <strong className="block text-lg">{completed}/1</strong>Service
      </div>
      <div className="rounded-xl bg-slate-50 p-3">
        <strong className="block text-lg">{life.city.population}</strong>Habitants simulés
      </div>
    </div>
  )
}

export function LomeLifeImmersive() {
  const [cityLife, setCityLife] = useState<CityLife>(initialCityLife)
  const life = cityLife.life
  const setLife = useCallback(
    (next: LifeState | ((old: LifeState) => LifeState)) =>
      setCityLife((c) => ({ ...c, life: typeof next === 'function' ? next(c.life) : next })),
    [],
  )
  const [camera, setCamera] = useState<CameraState>(() => CAMERA_HOME(cityLife.at.x, cityLife.at.y))
  const [follow, setFollow] = useState(true)
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null)
  const [cityFilter, setCityFilter] = useState<Category | 'all'>('all')
  const [chunkStats, setChunkStats] = useState({ chunks: 0, buildings: 0 })
  const insideAny = Boolean(cityLife.insideLot || life.inside)
  const interior = cityLife.insideLot
    ? interiorFor(lotById(cityLife.insideLot)?.type ?? 'lot')
    : (life.inside as Interior | null)
  const doorLot = lotAtDoor(cityLife)
  const [loaded, setLoaded] = useState(false)
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [panel, setPanel] = useState<Sheet>(null)
  const [mode, setMode] = useState<Mode>('walk')
  const [building, setBuilding] = useState<BuildType>('house')
  const [selection, setSelection] = useState<{ x: number; y: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [transport, setTransport] = useState<Transport>('walk')
  const [riding, setRiding] = useState(false)
  const [mapFilter, setMapFilter] = useState<MapFilter>('all')
  const [billboard, setBillboard] = useState<string | null>(null)
  const board = billboardById(billboard)
  const cityDef = CITIES[life.cityId]
  const whereAmI =
    life.cityId === 'lome'
      ? cityPlaceName(cityLife.at.x, cityLife.at.y)
      : placeNameAt(life.cityId, life.pos.x, life.pos.y)
  const [chatDraft, setChatDraft] = useState('')
  const [chat, setChat] = useState<{ by: 'me' | 'npc'; body: string }[]>([
    {
      by: 'npc',
      body: 'Salut ! Bienvenue dans notre quartier fictif de Lomé. Passe au marché quand tu veux.',
    },
  ])
  const [notice, setNotice] = useState<string | null>(null)
  const nearTarget =
    life.target && Math.abs(life.pos.x - life.target.x) + Math.abs(life.pos.y - life.target.y) === 1
  const title =
    panel === 'home'
      ? 'Mon foyer'
      : panel === 'shop'
        ? 'Marché & commerces'
        : panel === 'map'
          ? 'Explorer Lomé'
          : panel === 'phone'
            ? 'Mon téléphone'
            : panel === 'build'
              ? 'Construire'
              : panel === 'jobs'
                ? 'Travailler & gagner'
                : panel === 'messages'
                  ? 'Messages du quartier'
                  : panel === 'wallet'
                    ? 'Mes finances'
                    : panel === 'missions'
                      ? 'Mes objectifs'
                      : panel === 'journal'
                        ? 'Journal de vie'
                        : panel === 'billboard'
                          ? 'Panneau publicitaire'
                          : panel === 'lot'
                            ? 'Lieu'
                            : ''
  const needs = life.needs
  const wellbeing = Math.round(NEED_KEYS.reduce((sum, k) => sum + needs[k], 0) / NEED_KEYS.length)
  const pending = eventById(life.pendingEvent)
  const presence = usePresence()
  const here = presence.status === 'ready' ? (presence.world?.here ?? null) : null
  const visitors = useMemo(
    () => (here ? placeResidents(here.residents, life.city.buildings) : []),
    [here, life.city.buildings],
  )
  const hereNow = life.inside ? residentsAt(visitors, life.inside) : []
  const rain = (here?.sky[0]?.precipitation_probability ?? 0) >= 50
  const targetLot = cityLife.target ? lotById(cityLife.target) : null
  const destinationName = targetLot
    ? (targetLot.name ?? TYPE_LABELS[targetLot.type])
    : life.target
      ? (LIFE_LOCATIONS.find((x) => x.x === life.target!.x && x.y === life.target!.y)?.name ??
        'ta destination')
      : 'ta destination'
  const [placeDraft, setPlaceDraft] = useState('')
  const [placeError, setPlaceError] = useState('')
  const [placeBusy, setPlaceBusy] = useState(false)
  async function sayOnThePlace() {
    const body = placeDraft.trim().slice(0, 200)
    if (!body || !here) return
    setPlaceBusy(true)
    setPlaceError('')
    const err = await sayOnPlace(here.canton.canton_id, body)
    setPlaceBusy(false)
    if (err) setPlaceError(err)
    else {
      setPlaceDraft('')
      void presence.reload()
    }
  }
  const mood = wellbeing >= 75 ? 'Heureux' : wellbeing >= 40 ? 'Bien' : 'Fatigué'
  const status = cityLife.route.length
    ? 'En chemin vers ' + destinationName + '…'
    : cityLife.insideLot
      ? 'À l’intérieur : ' +
        (lotById(cityLife.insideLot)?.name ??
          TYPE_LABELS[lotById(cityLife.insideLot)?.type ?? 'lot'])
      : life.inside
        ? 'À l’intérieur : ' + (VENUE_LABELS[life.inside] ?? life.inside)
        : life.lastEvent
  const missions = [
    { done: life.spent >= 650, text: 'Acheter un repas dans un commerce' },
    { done: life.earned > 0, text: 'Effectuer une journée de travail' },
    {
      done: life.city.buildings.length > initialLomeLife().city.buildings.length,
      text: 'Construire un nouveau bâtiment',
    },
  ]
  const completion = missions.filter((m) => m.done).length

  useEffect(() => {
    try {
      setWebgl(Boolean(document.createElement('canvas').getContext('webgl2')))
      const rawCity = localStorage.getItem(CITY_STORAGE)
      const city = rawCity ? decodeCityLife(JSON.parse(rawCity)) : null
      if (city) {
        setCityLife(city)
        setCamera(CAMERA_HOME(city.at.x, city.at.y))
      } else {
        const raw = localStorage.getItem(STORAGE)
        const save = raw ? decodeLomeLife(JSON.parse(raw)) : null
        if (save) {
          const migrated = fromLegacy(save)
          setCityLife(migrated)
          setCamera(CAMERA_HOME(migrated.at.x, migrated.at.y))
        }
      }
    } catch {
      setWebgl(false)
    }
    setLoaded(true)
  }, [])
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(CITY_STORAGE, JSON.stringify(cityLife))
    } catch {
      /* Offline game supports blocked storage. */
    }
  }, [cityLife, loaded])
  // Live state for the end-to-end tests (chunks loaded, buildings, position, interior).
  useEffect(() => {
    ;(window as unknown as { __LOME_CITY?: unknown }).__LOME_CITY = {
      ...chunkStats,
      at: cityLife.at,
      route: cityLife.route.length,
      inside: cityLife.insideLot ?? life.inside,
    }
  }, [chunkStats, cityLife.at, cityLife.route.length, cityLife.insideLot, life.inside])
  // The camera follows the player while walking, until the player pans by hand.
  useEffect(() => {
    if (!follow) return
    setCamera((c) => {
      const home = CAMERA_HOME(cityLife.at.x, cityLife.at.y)
      return { ...c, tx: home.tx, tz: home.tz }
    })
  }, [cityLife.at.x, cityLife.at.y, follow])
  // Navigation advances automatically while the page is visible; no whole-hour penalty per road tile.
  useEffect(() => {
    if (!cityLife.route.length || insideAny || riding) return
    const ms = transport === 'walk' ? 420 : transport === 'moto' ? 220 : 160
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setCityLife((old) => walkStep(old))
    }, ms)
    return () => window.clearInterval(id)
  }, [cityLife.route.length, insideAny, transport, riding])
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setLife((old) => advanceLifeHour(old))
    }, 11000)
    return () => window.clearInterval(id)
  }, [playing])
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setPlaying(false)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null)
        return
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const dir = KEYS[e.key.toLowerCase()]
      if (!dir) return
      e.preventDefault()
      setPanel(null)
      setFollow(true)
      setCityLife((old) => stepDir(old, dir[0], dir[1]))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (riding && (cityLife.route.length === 0 || insideAny)) setRiding(false)
  }, [riding, cityLife.route.length, insideAny])
  // A ride lasts a few seconds on the boulevard (longer for a longer route), then lands.
  useEffect(() => {
    if (!riding) return
    const ms = 4000 + Math.min(6000, 120 * cityLife.route.length)
    const id = window.setTimeout(() => {
      setRiding(false)
      setCityLife((old) => arrive(old))
    }, ms)
    return () => window.clearTimeout(id)
  }, [riding, cityLife.route.length])
  // Street traffic keeps moving while the player stands still (only when the tab is visible).
  useEffect(() => {
    if (insideAny) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible')
        setCityLife((old) =>
          old.route.length
            ? old
            : { ...old, life: { ...old.life, trafficStep: old.life.trafficStep + 1 } },
        )
    }, 700)
    return () => window.clearInterval(id)
  }, [insideAny])

  function open(id: Exclude<Sheet, null>) {
    setPanel((cur) => (cur === id ? null : id))
    setNotice(null)
  }
  function go(x: number, y: number) {
    setMode('walk')
    setPanel(null)
    setSelection({ x, y })
    setTransport('walk')
    setFollow(true)
    setCityLife((old) => goToEstate(old, x, y))
  }
  function goLot(lot: Lot) {
    setMode('walk')
    setPanel(null)
    setTransport('walk')
    setFollow(true)
    setCityLife((old) => goToLot(old, lot))
  }
  function rideTo(lot: Lot, t: Transport) {
    if (life.wallet < TRAVEL_COST[t]) {
      setNotice('Solde insuffisant pour ce transport fictif.')
      goLot(lot)
      return
    }
    setMode('walk')
    setPanel(null)
    setFollow(true)
    setTransport(t)
    setCityLife((old) => {
      const going = goToLot(old, lot)
      return going.route.length ? payRide(going, t) : going
    })
    setRiding(true)
  }
  function action(a: Action) {
    if (a === 'enter' && !insideAny && doorLot && !life.target) {
      setCityLife((old) => cityInteract(old, 'enter'))
      setPanel(null)
      return
    }
    if (a === 'leave' && cityLife.insideLot) {
      setCityLife((old) => cityInteract(old, 'leave'))
      setPanel(null)
      return
    }
    setLife((old) => interact(old, a))
    if (a === 'enter' || a === 'leave') setPanel(null)
  }
  function cityAction(a: CityAction) {
    setCityLife((old) => cityInteract(old, a))
    if (a === 'enter' || a === 'leave') setPanel(null)
  }
  function roomAction(a: string) {
    if (cityLife.insideLot) cityAction(a as CityAction)
    else action(a as Action)
  }
  function tile(x: number, y: number) {
    setSelection({ x, y })
    if (mode === 'walk') {
      setFollow(true)
      const built = life.city.buildings.some((b) => b.x === x && b.y === y && b.type !== 'road')
      setCityLife((old) => (built ? goToEstate(old, x, y) : goToPoint(old, toWorld({ x, y }))))
    }
    if (mode === 'build') setLife((old) => buildInLome(old, x, y, building))
    if (mode === 'demolish') setLife((old) => demolishInLome(old, x, y))
  }
  function trip(t: Transport) {
    if (t !== 'walk' && life.wallet < TRAVEL_COST[t]) {
      setNotice('Solde insuffisant pour ce transport fictif.')
      return
    }
    if (cityLife.route.length === 0) {
      setNotice('Choisis d’abord une destination.')
      return
    }
    setTransport(t)
    setCityLife((old) => payRide(old, t))
    setRiding(t !== 'walk')
    setPanel(null)
  }
  function sendMessage() {
    const body = chatDraft.trim().slice(0, 180)
    if (!body) return
    setChat((prev) => [
      ...prev.slice(-20),
      { by: 'me', body },
      {
        by: 'npc',
        body: /travail|emploi/i.test(body)
          ? 'Le marché embauche des vendeurs. Passe à la rubrique Métiers pour tenter ta chance !'
          : /manger|faim|repas/i.test(body)
            ? 'À la boulangerie, tu peux acheter un repas avec des FCFA fictifs.'
            : 'Bienvenue ! On se croise bientôt au jardin ou au marché.',
      },
    ])
    setChatDraft('')
  }
  function reset() {
    if (!window.confirm('Recommencer uniquement ta partie fictive de Lomé Life ?')) return
    setCityLife(initialCityLife())
    setCamera(CAMERA_HOME(initialCityLife().at.x, initialCityLife().at.y))
    setPanel(null)
    setMode('walk')
    setTransport('walk')
    setPlaying(false)
  }

  return (
    <main className="fixed inset-0 z-[95] h-[100dvh] w-screen overflow-hidden bg-[#98b7a8] font-sans text-slate-900">
      {/* The game world remains mounted under overlays. No map or dashboard replaces the canvas. */}
      <div className="absolute inset-0" aria-label="Monde de jeu 3D de Lomé">
        {webgl === false ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#123b33] p-8 text-center text-white">
            <h1 className="text-2xl font-bold">Lomé Life 3D</h1>
            <p>
              Le rendu 3D exige WebGL2. Ouvre ce jeu dans Chrome avec l’accélération graphique
              activée.
            </p>
          </div>
        ) : (
          <CityWorld
            city={life.city}
            tool={mode === 'walk' ? 'inspect' : mode === 'demolish' ? 'demolish' : building}
            selected={selection}
            onTile={tile}
            player={cityLife.at}
            playerRotation={(life.trafficStep * 37) % 360}
            camera={camera}
            onCamera={(c) => {
              if (c.tx !== camera.tx || c.tz !== camera.tz) setFollow(false)
              setCamera(c)
            }}
            step={life.trafficStep}
            interior={interior}
            onInteriorAction={roomAction}
            ride={riding && cityLife.route.length > 0 && !insideAny ? { transport, rain } : null}
            visitors={visitors}
            onBillboard={(id) => {
              setBillboard(id)
              setPanel('billboard')
            }}
            onCell={(cell) => {
              const lot = lotAtCell(cell.x, cell.y)
              if (lot) {
                setSelectedLot(lot)
                setPanel('lot')
              } else {
                setFollow(true)
                setCityLife((old) => goToPoint(old, cell))
              }
            }}
            onLotIcon={(lot) => {
              setSelectedLot(lot)
              setPanel('lot')
            }}
            filter={cityFilter}
            onStats={setChunkStats}
          />
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-[#203d49]/40 via-[#203d49]/10 to-transparent" />
      {riding && cityLife.route.length > 0 && !insideAny && webgl !== false && (
        <RideOverlay
          transport={transport}
          rain={rain}
          destination={destinationName}
          boulevard={cityDef.boulevard}
          onMap={() => {
            setRiding(false)
            open('map')
          }}
          onSkip={() => {
            setRiding(false)
            setCityLife((old) => arrive(old))
          }}
        />
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-5">
        <div className="pointer-events-auto mx-auto flex max-w-[900px] items-center gap-2 rounded-[24px] border border-white/65 bg-white/95 p-2 shadow-lg shadow-slate-900/10 backdrop-blur-lg">
          <div className="flex shrink-0 items-center gap-1 rounded-2xl px-2 text-xs font-bold sm:text-sm">
            <Sun size={17} className="text-amber-500" />{' '}
            <span>
              J{life.day} · {String(life.hour).padStart(2, '0')}h
              <span className="hidden text-emerald-800 sm:inline"> · {whereAmI}</span>
            </span>
          </div>
          <span className="h-6 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() => open('home')}
            aria-label="Voir mes besoins"
            className="flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-xl py-2 text-xs font-semibold text-emerald-700"
          >
            {wellbeing >= 75 ? '🙂' : wellbeing >= 40 ? '😌' : '😟'} {mood}
          </button>
          {here && (
            <span
              className="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800"
              title={'Habitants de ' + here.canton.canton + ' présents dans le quartier'}
            >
              <Users size={14} /> {here.residents.length}
              <span className="hidden sm:inline"> · {here.canton.canton}</span>
            </span>
          )}
          <span className="h-6 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() => open('wallet')}
            aria-label="Voir mon argent"
            className="flex shrink-0 items-center gap-1 rounded-2xl bg-slate-100 px-3 py-2 text-[11px] font-black sm:text-sm"
          >
            {new Intl.NumberFormat('fr-FR').format(life.wallet)}{' '}
            <span className="hidden sm:inline">FCFA</span>
            <Plus size={15} className="rounded-full bg-emerald-600 text-white" />
          </button>
        </div>
        <div className="pointer-events-auto mx-auto mt-2 flex max-w-[900px] items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => open('missions')}
            className="flex max-w-[79%] items-center gap-2 rounded-full border border-white/40 bg-white/85 px-3 py-2 text-left text-xs font-semibold shadow-md backdrop-blur"
          >
            <span>🎯</span>
            <span className="truncate">
              {life.route.length
                ? 'Destination en cours…'
                : needs.hunger < 35
                  ? 'Mange quelque chose'
                  : life.workToday
                    ? 'Développe ton quartier'
                    : 'Gagne ton premier salaire'}
            </span>
          </button>
          <button
            type="button"
            aria-label={playing ? 'Mettre en pause' : 'Faire avancer le temps'}
            onClick={() => setPlaying((p) => !p)}
            className="rounded-full bg-white/90 p-2.5 shadow-md"
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
        </div>
        {mode !== 'walk' && (
          <div className="pointer-events-auto mx-auto mt-2 flex max-w-[900px] items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-950/90 px-3 py-2 text-xs font-semibold text-white shadow">
            <span>
              {mode === 'build'
                ? '🏗️ Pose ' + CATALOG[building].label + ' en touchant un terrain'
                : '🗑️ Choisis un bâtiment à démolir'}
            </span>
            <button
              type="button"
              onClick={() => {
                setMode('walk')
                setPanel(null)
              }}
              className="rounded-lg bg-white px-3 py-1.5 text-emerald-950"
            >
              Terminer
            </button>
          </div>
        )}
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(100px+env(safe-area-inset-bottom))] z-20 px-3 sm:px-5">
        <div className="mx-auto flex max-w-[900px] items-end justify-between gap-2">
          <button
            type="button"
            onClick={() => open('home')}
            aria-label="Afficher les besoins du personnage"
            className="pointer-events-auto flex min-w-0 max-w-[75%] items-center gap-2 rounded-full border border-white/70 bg-white/90 py-2 pl-2 pr-3 shadow-lg backdrop-blur"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-white">
              <UserRound size={21} />
            </span>
            <span className="grid w-[150px] grid-cols-2 gap-x-2 gap-y-0.5 sm:w-[200px]">
              {NEEDS.map((n) => (
                <span
                  key={n.key}
                  className="flex items-center gap-1"
                  title={n.label + ' ' + needs[n.key] + '%'}
                >
                  <span className="text-xs">{n.icon}</span>
                  <NeedBar value={needs[n.key]} color={n.color} />
                </span>
              ))}
            </span>
          </button>
          <div
            className="pointer-events-auto grid grid-cols-3 grid-rows-3 gap-1"
            role="group"
            aria-label="Déplacer le personnage"
          >
            {PAD.map((b) => (
              <button
                type="button"
                key={b.label}
                aria-label={b.label}
                onClick={() => {
                  setFollow(true)
                  setCityLife((old) => stepDir(old, b.dir[0], b.dir[1]))
                }}
                className={
                  'flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-base font-black text-emerald-900 shadow active:scale-95 ' +
                  b.cls
                }
              >
                {b.dir[1] === -1 ? '▲' : b.dir[1] === 1 ? '▼' : b.dir[0] === -1 ? '◀' : '▶'}
              </button>
            ))}
            <button
              type="button"
              aria-label="Entrer ou sortir"
              onClick={() => action(insideAny ? 'leave' : 'enter')}
              className="col-start-2 row-start-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-[10px] font-black text-white shadow"
            >
              {insideAny ? 'Sortir' : 'Entrer'}
            </button>
          </div>
          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              type="button"
              onClick={() => open('build')}
              aria-label="Ouvrir les outils de construction"
              className="rounded-full bg-emerald-700 p-3 text-white shadow-lg"
            >
              <Hammer size={21} />
            </button>
            <button
              type="button"
              onClick={() => open('missions')}
              aria-label="Ouvrir les objectifs"
              className="rounded-full bg-white/90 p-3 text-slate-900 shadow"
            >
              <Bell size={20} />
            </button>
          </div>
        </div>
        {life.inside && hereNow.length > 0 && (
          <div className="pointer-events-auto mx-auto mt-2 flex max-w-[900px] flex-wrap items-center gap-1 text-[11px]">
            <span className="rounded-full bg-white/90 px-2 py-1 font-bold text-emerald-900 shadow">
              Ici maintenant
            </span>
            {hereNow.slice(0, 6).map((r) => (
              <span
                key={r.display_name}
                className="rounded-full bg-emerald-900/85 px-2 py-1 font-semibold text-white shadow"
              >
                {r.display_name}
                <span className="ml-1 font-normal text-emerald-200">
                  {ROLE_LABELS[r.roles[0]] ?? ''}
                </span>
              </span>
            ))}
            {hereNow.length > 6 && <span className="text-white">+{hereNow.length - 6}</span>}
          </div>
        )}
        <div className="pointer-events-auto mx-auto mt-2 max-w-[900px]">
          <button
            type="button"
            onClick={() => open('journal')}
            role="status"
            className="max-w-[94%] rounded-2xl bg-slate-950/65 px-3 py-2 text-left text-[11px] font-medium text-white shadow backdrop-blur sm:text-xs"
          >
            {status.length > 95 ? status.slice(0, 92) + '…' : status}
          </button>
        </div>
      </div>

      <nav
        aria-label="Navigation du jeu"
        className="absolute inset-x-0 bottom-0 z-30 px-3 pb-[max(10px,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto grid max-w-[520px] grid-cols-4 gap-1 rounded-[26px] border border-white/75 bg-white/95 p-2 shadow-2xl backdrop-blur-lg">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                type="button"
                key={item.id}
                aria-pressed={panel === item.id}
                onClick={() => open(item.id)}
                className={
                  'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[18px] text-[11px] font-semibold transition ' +
                  (panel === item.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100')
                }
              >
                <Icon size={21} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {pending && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-title"
            className="w-full max-w-md rounded-[28px] bg-white p-6 text-center shadow-2xl"
          >
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-50 text-3xl">
              {pending.icon}
            </span>
            <h2 id="event-title" className="mt-4 text-2xl font-black">
              {pending.title}
            </h2>
            <p className="mt-2 text-sm text-slate-600">{pending.body}</p>
            <div className="mt-5 space-y-2">
              {pending.choices.map((choice, i) => (
                <button
                  type="button"
                  key={choice.label}
                  onClick={() => setLife((old) => resolveEvent(old, i))}
                  className={
                    'w-full rounded-2xl px-4 py-3 text-left ' +
                    (i === 0
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'border border-slate-200 bg-white text-slate-900')
                  }
                >
                  <span className="block text-base font-bold">{choice.label}</span>
                  <span
                    className={'block text-xs ' + (i === 0 ? 'text-emerald-100' : 'text-slate-500')}
                  >
                    {choice.hint}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {panel && (
        <div className="absolute inset-0 z-40" aria-label={title}>
          <button
            type="button"
            aria-label="Fermer le panneau"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setPanel(null)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="absolute inset-x-0 bottom-[calc(85px+env(safe-area-inset-bottom))] mx-auto flex max-h-[min(68dvh,680px)] w-[calc(100%-16px)] max-w-[620px] flex-col overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-2xl sm:max-h-[70dvh]"
          >
            <div className="mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-slate-200" />
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-5 pb-3 pt-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Lomé Life · Quartier fictif
                </p>
                <h2 className="text-xl font-black">{title}</h2>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setPanel(null)}
                className="rounded-full bg-slate-100 p-2"
              >
                <X size={21} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-5 pt-4 sm:px-5">
              {notice && (
                <div
                  role="alert"
                  className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900"
                >
                  {notice}
                </div>
              )}
              {panel === 'home' && (
                <>
                  <p className="text-sm text-slate-600">
                    Prends soin de ton personnage. Ses besoins influencent sa journée.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {NEEDS.map((n) => (
                      <div key={n.key} className="rounded-2xl bg-slate-50 p-3">
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span>
                            {n.icon} {n.label}
                          </span>
                          <strong>{needs[n.key]}%</strong>
                        </div>
                        <NeedBar value={needs[n.key]} color={n.color} />
                      </div>
                    ))}
                  </div>
                  <DailyStatus life={life} />
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                      title="Rentrer chez moi"
                      onClick={() => go(9, 9)}
                      icon={<Home size={17} />}
                    />
                    <ActionButton title="Entrer" outline onClick={() => action('enter')} />
                    <ActionButton title="Dormir" outline onClick={() => action('sleep')} />
                    <ActionButton title="Se laver" outline onClick={() => action('wash')} />
                    <ActionButton title="Manger" outline onClick={() => action('eat')} />
                    <ActionButton title="Se détendre" outline onClick={() => action('relax')} />
                    <ActionButton title="Toilettes" outline onClick={() => action('toilet')} />
                    <ActionButton title="Sortir" outline onClick={() => action('leave')} />
                  </div>
                </>
              )}
              {panel === 'shop' && (
                <>
                  <p className="text-sm text-slate-600">
                    Les achats modifient ton argent et le stock réel du moteur de simulation
                    fictive.
                  </p>
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4">
                    <div>
                      <strong className="block">🍲 Repas du quartier</strong>
                      <span className="text-xs text-slate-600">
                        Stock municipal : {life.city.food} · À consommer ensuite
                      </span>
                    </div>
                    <strong className="text-sm">650 FCFA</strong>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton title="Aller au marché" onClick={() => go(12, 11)} />
                    <ActionButton
                      title="Aller à la boulangerie"
                      outline
                      onClick={() => go(13, 11)}
                    />
                  </div>
                  <ActionButton
                    title="Acheter un repas · 650 FCFA"
                    icon={<ShoppingBag size={17} />}
                    onClick={() => action('buy-meal')}
                  />
                  <ActionButton
                    title={'Manger · ' + life.meals + ' repas disponible(s)'}
                    outline
                    icon={<Utensils size={17} />}
                    onClick={() => action('eat')}
                  />
                </>
              )}
              {panel === 'map' && (
                <>
                  <p className="text-sm text-slate-600">
                    Toute la ville est là : touche un bâtiment dans la scène ou choisis un lieu. Ton
                    personnage suit les rues, les ponts et les avenues.
                  </p>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrer la ville">
                    {(
                      ['all', 'shops', 'services', 'leisure', 'worship', 'homes', 'lots'] as const
                    ).map((f) => (
                      <button
                        type="button"
                        key={f}
                        aria-pressed={cityFilter === f}
                        onClick={() => setCityFilter(f)}
                        className={
                          'rounded-full px-3 py-1.5 text-xs font-semibold ' +
                          (cityFilter === f
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700')
                        }
                      >
                        {f === 'all' ? 'Tout' : CATEGORY_LABELS[f]}
                      </button>
                    ))}
                  </div>
                  {DISTRICTS.map((d) => {
                    const places = landmarksIn(d.id).filter(
                      (l) => cityFilter === 'all' || CATEGORY_OF[l.type] === cityFilter,
                    )
                    if (places.length === 0) return null
                    return (
                      <div key={d.id} className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-sm font-black">{d.name}</p>
                        <p className="text-[11px] text-slate-500">{d.note}</p>
                        <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {places.map((lot) => (
                            <button
                              type="button"
                              key={lot.id}
                              onClick={() => {
                                setSelectedLot(lot)
                                setPanel('lot')
                              }}
                              className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-left text-xs ring-1 ring-slate-200 hover:ring-emerald-400"
                            >
                              <span className="text-base">{TYPE_ICONS[lot.type]}</span>
                              <span className="min-w-0 flex-1 truncate font-semibold">
                                {lot.name}
                              </span>
                              <ArrowRight size={14} className="shrink-0 text-emerald-700" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  <p className="text-sm font-black">Mon quartier</p>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrer la carte">
                    {MAP_FILTERS.map((f) => (
                      <button
                        type="button"
                        key={f.id}
                        aria-pressed={mapFilter === f.id}
                        onClick={() => setMapFilter(f.id)}
                        className={
                          'rounded-full px-3 py-1.5 text-xs font-semibold ' +
                          (mapFilter === f.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700')
                        }
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {LIFE_LOCATIONS.filter((place) => matchesFilter(mapFilter, place.venue)).map(
                      (place) => (
                        <button
                          type="button"
                          key={place.name}
                          onClick={() => go(place.x, place.y)}
                          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-emerald-400"
                        >
                          <span className="text-xl">
                            {LOCATION_ICONS[LIFE_LOCATIONS.indexOf(place)]}
                          </span>
                          <span className="min-w-0 text-xs font-bold">
                            {place.name}
                            <span className="block font-normal text-slate-500">
                              {districtAt(life.cityId, place.x, place.y).name}
                            </span>
                          </span>
                          <ArrowRight size={14} className="ml-auto shrink-0 text-emerald-700" />
                        </button>
                      ),
                    )}
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                    <strong>Les quartiers de {cityDef.name}</strong>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {cityDef.districts.map((d) => (
                        <li key={d.id}>
                          <strong className="text-slate-800">{d.name}</strong> · {d.note}
                        </li>
                      ))}
                      <li>
                        <strong className="text-sky-800">{cityDef.water.northEast}</strong> au
                        nord-est,{' '}
                        <strong className="text-sky-800">{cityDef.water.southWest}</strong> au
                        sud-ouest.
                      </li>
                    </ul>
                    <div className="mt-3 flex gap-1" role="group" aria-label="Changer de ville">
                      {CITY_IDS.map((id) => (
                        <button
                          type="button"
                          key={id}
                          aria-pressed={life.cityId === id}
                          onClick={() => setLife((old) => selectCity(old, id))}
                          className={
                            'rounded-full px-3 py-1.5 text-xs font-semibold ' +
                            (life.cityId === id
                              ? 'bg-emerald-700 text-white'
                              : 'bg-white text-slate-700 ring-1 ring-slate-200')
                          }
                        >
                          {CITIES[id].name}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Même quartier de jeu, noms et lieux de la ville choisie. Relevé géographique à
                      venir.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                    <strong>Panneaux publicitaires</strong>
                    <p className="mt-1 text-xs text-slate-500">
                      Un panneau par quartier, visible par tous les habitants. Tarif affiché par
                      semaine ; aucune réservation n’est encore facturée.
                    </p>
                    <ul className="mt-2 space-y-1">
                      {BILLBOARDS.map((bb) => (
                        <li key={bb.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setBillboard(bb.id)
                              setPanel('billboard')
                            }}
                            className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-xs ring-1 ring-slate-200"
                          >
                            <span>
                              <strong>{cityDef.districts[bb.district].name}</strong> ·{' '}
                              {bb.status === 'house' ? bb.headline : 'Disponible'}
                            </span>
                            <span className="font-bold text-emerald-800">
                              {money(bb.priceWeek)}/sem.
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                    <strong>Déplacement</strong>
                    <p className="mt-1 text-xs text-slate-500">
                      {life.route.length} tronçon(s) restant(s) · {money(life.wallet)} disponibles
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {(['walk', 'moto', 'taxi'] as const).map((t) => (
                        <button
                          type="button"
                          key={t}
                          onClick={() => trip(t)}
                          className="rounded-xl border border-emerald-200 bg-white px-2 py-3 text-xs font-semibold"
                        >
                          {t === 'walk' ? '🚶 Marche' : t === 'moto' ? '🏍️ Moto' : '🚕 Taxi'}
                          <span className="mt-1 block text-[10px] text-slate-500">
                            {t === 'walk' ? 'Gratuit' : money(TRAVEL_COST[t])}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Les déplacements motorisés accélèrent le trajet simulé, sans véhicules
                      physiques pilotables pour le moment.
                    </p>
                  </div>
                </>
              )}
              {panel === 'phone' && (
                <>
                  <div className="rounded-[24px] bg-gradient-to-br from-indigo-700 via-violet-700 to-orange-400 p-4 text-white">
                    <p className="text-3xl font-light">{String(life.hour).padStart(2, '0')}:00</p>
                    <p className="text-xs opacity-90">Jour {life.day} · Lomé</p>
                    <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                      {(
                        [
                          { id: 'jobs', icon: '💼', name: 'Métiers' },
                          { id: 'messages', icon: '💬', name: 'Messages' },
                          { id: 'wallet', icon: '💵', name: 'Argent' },
                          { id: 'missions', icon: '🎯', name: 'Missions' },
                          { id: 'journal', icon: '📰', name: 'Journal' },
                          { id: 'build', icon: '🏗️', name: 'Construire' },
                        ] as const
                      ).map((app) => (
                        <button
                          key={app.id}
                          type="button"
                          onClick={() => open(app.id)}
                          className="rounded-xl bg-white/20 p-3 backdrop-blur-sm hover:bg-white/30"
                        >
                          <span className="block text-2xl">{app.icon}</span>
                          <span className="mt-1 block text-[11px]">{app.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs font-bold text-slate-700">Services et partenaires</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      {PARTNER_APPS.map((app) => (
                        <Link
                          key={app.id}
                          href={app.href}
                          className={
                            'rounded-xl p-3 text-[11px] font-semibold ' +
                            (app.status === 'house'
                              ? 'bg-white text-slate-800 ring-1 ring-slate-200'
                              : 'border border-dashed border-emerald-400 bg-emerald-50 text-emerald-800')
                          }
                        >
                          <span className="block text-2xl">{app.icon}</span>
                          {app.name}
                          {app.status === 'available' && (
                            <span className="block font-normal text-emerald-700">
                              {money(app.priceMonth)}/mois
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Trois emplacements partenaires ouverts (banque, assurance, intrants…). Tarif
                      affiché ; aucun partenaire n’est encore facturé.
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Les services et conversations de ce téléphone sont simulés localement. Aucun
                    message réel n’est envoyé.
                  </p>
                </>
              )}
              {panel === 'jobs' && (
                <>
                  <p className="text-sm text-slate-600">
                    Choisis un métier et rends-toi sur place entre 7h et 19h. Un seul salaire par
                    journée.
                  </p>
                  {JOBS.map((job) => (
                    <button
                      type="button"
                      key={job}
                      onClick={() => setLife((old) => selectJob(old, job))}
                      className={
                        'flex w-full items-center justify-between rounded-2xl border p-4 text-left text-sm ' +
                        (life.job === job
                          ? 'border-emerald-600 bg-emerald-50'
                          : 'border-slate-200 bg-white')
                      }
                    >
                      <span>
                        <strong className="block capitalize">{job}</strong>
                        <span className="text-xs text-slate-500">
                          Lieu : {VENUE_LABELS[jobVenue(job)]}
                        </span>
                      </span>
                      <span className="text-right">
                        <strong className="block">{money(SALARIES[job])}</strong>
                        <span className="text-xs">
                          {life.job === job ? '✓ Sélectionné' : 'Choisir'}
                        </span>
                      </span>
                    </button>
                  ))}
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                      title="Aller travailler"
                      onClick={() => {
                        const target = LIFE_LOCATIONS.find(
                          (loc) => loc.venue === jobVenue(life.job),
                        )
                        if (target) go(target.x, target.y)
                      }}
                    />
                    <ActionButton
                      title="Faire mon service"
                      outline
                      onClick={() => action('work')}
                    />
                  </div>
                  <DailyStatus life={life} />
                </>
              )}
              {panel === 'wallet' && (
                <>
                  <div className="rounded-2xl bg-emerald-900 p-5 text-white">
                    <p className="text-xs">Mon solde fictif</p>
                    <p className="mt-2 text-3xl font-black">{money(life.wallet)}</p>
                    <p className="mt-1 text-xs text-emerald-200">
                      Aucun paiement réel et aucune connexion Mobile Money.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-emerald-50 p-4 text-sm">
                      <p>Revenus personnels</p>
                      <strong>{money(life.earned)}</strong>
                    </div>
                    <div className="rounded-xl bg-amber-50 p-4 text-sm">
                      <p>Dépenses</p>
                      <strong>{money(life.spent)}</strong>
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4 text-sm">
                    Budget municipal distinct : <strong>{money(life.city.coins)}</strong> · bois
                    disponible : {life.city.wood}
                  </div>
                  <ActionButton title="Trouver un travail" onClick={() => open('jobs')} />
                </>
              )}
              {panel === 'messages' && here && (
                <>
                  <p className="text-xs text-slate-500">
                    La place de {here.canton.canton} : messages des habitants connectés à HarooLife,
                    200 caractères, visibles par tous les habitants du canton.
                  </p>
                  {presence.world?.me.home === null && (
                    <Link
                      href="/haroolife"
                      className="block rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900"
                    >
                      Choisissez d’abord votre maison dans HarooLife pour parler sur la place.
                    </Link>
                  )}
                  <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
                    {here.messages.length === 0 && (
                      <p className="text-center text-xs text-slate-500">
                        Personne n’a encore parlé ici aujourd’hui.
                      </p>
                    )}
                    {here.messages.map((m) => (
                      <div
                        key={m.id}
                        className={'flex ' + (m.is_me ? 'justify-end' : 'justify-start')}
                      >
                        <span
                          className={
                            'max-w-[85%] rounded-2xl px-3 py-2 text-sm ' +
                            (m.is_me
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white text-slate-800 shadow-sm')
                          }
                        >
                          {!m.is_me && (
                            <strong className="block text-[11px]">{m.display_name}</strong>
                          )}
                          {m.body}
                        </span>
                      </div>
                    ))}
                  </div>
                  {placeError && (
                    <p role="alert" className="text-xs font-semibold text-rose-700">
                      {placeError}
                    </p>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void sayOnThePlace()
                    }}
                    className="flex gap-2"
                  >
                    <input
                      aria-label="Parler sur la place"
                      value={placeDraft}
                      maxLength={200}
                      onChange={(e) => setPlaceDraft(e.target.value)}
                      className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-3 py-3 text-sm"
                      placeholder={'Dire quelque chose à ' + here.canton.canton + '…'}
                    />
                    <button
                      type="submit"
                      disabled={placeBusy}
                      aria-label="Envoyer sur la place"
                      className="rounded-2xl bg-emerald-600 px-4 text-white disabled:opacity-50"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </>
              )}
              {panel === 'messages' && !here && (
                <>
                  <p className="text-xs text-slate-500">
                    {presence.status === 'offline'
                      ? 'Connectez-vous à FaîtiereHub pour retrouver les habitants de votre canton. En attendant : '
                      : ''}
                    Discussion avec Afi, personnage fictif. Réponses scénarisées, sans joueurs en
                    ligne.
                  </p>
                  <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
                    {chat.map((item, i) => (
                      <div
                        key={i}
                        className={'flex ' + (item.by === 'me' ? 'justify-end' : 'justify-start')}
                      >
                        <span
                          className={
                            'max-w-[85%] rounded-2xl px-3 py-2 text-sm ' +
                            (item.by === 'me'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white text-slate-800 shadow-sm')
                          }
                        >
                          {item.body}
                        </span>
                      </div>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      sendMessage()
                    }}
                    className="flex gap-2"
                  >
                    <input
                      aria-label="Écrire à Afi"
                      value={chatDraft}
                      maxLength={180}
                      onChange={(e) => setChatDraft(e.target.value)}
                      className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-3 py-3 text-sm"
                      placeholder="Écrire à Afi…"
                    />
                    <button
                      type="submit"
                      aria-label="Envoyer le message simulé"
                      className="rounded-2xl bg-emerald-600 px-4 text-white"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </>
              )}
              {panel === 'build' && (
                <>
                  <p className="text-sm text-slate-600">
                    Sélectionne une construction puis touche une parcelle libre dans la scène 3D.
                    Les ressources sont déduites du budget municipal fictif.
                  </p>
                  <div className="flex items-center justify-between rounded-xl bg-slate-100 p-3 text-xs font-semibold">
                    <span>🏛️ {money(life.city.coins)}</span>
                    <span>🪵 {life.city.wood} bois</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {BUILDINGS.map((b) => (
                      <button
                        type="button"
                        key={b}
                        onClick={() => {
                          setBuilding(b)
                          setMode('build')
                          setPanel(null)
                        }}
                        className={
                          'rounded-2xl border p-3 text-left text-xs ' +
                          (building === b
                            ? 'border-emerald-600 bg-emerald-50'
                            : 'border-slate-200 bg-white')
                        }
                      >
                        <span className="text-2xl">{CATALOG[b].icon}</span>
                        <strong className="mt-1 block">{CATALOG[b].label}</strong>
                        <span className="block text-slate-500">
                          {CATALOG[b].coins} FCFA · {CATALOG[b].wood} bois
                        </span>
                      </button>
                    ))}
                  </div>
                  <ActionButton
                    title="Passer en mode démolition"
                    outline
                    onClick={() => {
                      setMode('demolish')
                      setPanel(null)
                    }}
                    icon={<Hammer size={17} />}
                  />
                </>
              )}
              {panel === 'missions' && (
                <>
                  <p className="text-sm text-slate-600">
                    Développe ta vie et ta ville : objectifs liés à de vraies actions de jeu.
                  </p>
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4">
                    <strong>Progression</strong>
                    <strong>
                      {completion} / {missions.length}
                    </strong>
                  </div>
                  {missions.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-sm"
                    >
                      <span
                        className={
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full ' +
                          (m.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100')
                        }
                      >
                        {m.done ? <Check size={16} /> : i + 1}
                      </span>
                      <span>{m.text}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton title="Aller au marché" onClick={() => go(12, 11)} />
                    <ActionButton title="Voir les métiers" outline onClick={() => open('jobs')} />
                  </div>
                </>
              )}
              {panel === 'lot' && selectedLot && (
                <>
                  <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow">
                      {TYPE_ICONS[selectedLot.type]}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black">
                        {selectedLot.name ?? TYPE_LABELS[selectedLot.type]}
                      </p>
                      <p className="text-xs text-slate-500">
                        {TYPE_LABELS[selectedLot.type]} ·{' '}
                        {DISTRICTS.find((d) => d.id === selectedLot.district)?.name}
                        {selectedLot.floors > 1 ? ` · ${selectedLot.floors} niveaux` : ''}
                      </p>
                    </div>
                  </div>
                  {actionsFor(selectedLot.type).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-700">Sur place</p>
                      {actionsFor(selectedLot.type).map((a) => {
                        const here =
                          cityLife.insideLot === selectedLot.id || doorLot?.id === selectedLot.id
                        return (
                          <button
                            type="button"
                            key={a.id}
                            disabled={!here}
                            onClick={() => cityAction(a.id)}
                            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm disabled:opacity-50"
                          >
                            <span className="font-bold">{a.label}</span>
                            <span className="text-xs text-slate-500">{a.hint}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {doorLot?.id === selectedLot.id &&
                    !insideAny &&
                    interiorFor(selectedLot.type) && (
                      <ActionButton title="Entrer" onClick={() => cityAction('enter')} />
                    )}
                  {cityLife.insideLot === selectedLot.id && (
                    <ActionButton title="Sortir" outline onClick={() => cityAction('leave')} />
                  )}
                  {doorLot?.id !== selectedLot.id && cityLife.insideLot !== selectedLot.id && (
                    <>
                      <ActionButton
                        title="Y aller à pied · gratuit"
                        onClick={() => goLot(selectedLot)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <ActionButton
                          title={'Zémidjan · ' + money(TRAVEL_COST.moto)}
                          outline
                          onClick={() => rideTo(selectedLot, 'moto')}
                        />
                        <ActionButton
                          title={'Taxi · ' + money(TRAVEL_COST.taxi)}
                          outline
                          onClick={() => rideTo(selectedLot, 'taxi')}
                        />
                      </div>
                    </>
                  )}
                  <p className="text-[11px] text-slate-500">
                    {cityLife.visited.includes(selectedLot.id) ? 'Déjà visité.' : 'Jamais visité.'}{' '}
                    Les habitants connectés présents apparaissent ici quand le serveur temps réel
                    sera ouvert.
                  </p>
                </>
              )}
              {panel === 'billboard' && board && (
                <>
                  <div
                    className={
                      'rounded-2xl p-5 text-center ' +
                      (board.status === 'house'
                        ? 'bg-emerald-800 text-white'
                        : 'border-2 border-dashed border-emerald-400 bg-emerald-50 text-emerald-900')
                    }
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                      {cityDef.districts[board.district].name} · {cityDef.name}
                    </p>
                    <p className="mt-2 text-xl font-black">{board.headline}</p>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
                    <span>
                      {board.status === 'house' ? 'Occupé par FaîtiereHub' : 'Disponible'}
                    </span>
                    <strong>{money(board.priceWeek)} / 7 jours</strong>
                  </div>
                  <p className="text-xs text-slate-500">
                    Vu par les habitants du quartier à chaque passage. Tarif indicatif : la
                    réservation se fait avec l’équipe, aucune facturation automatique.
                  </p>
                  <Link
                    href={board.href}
                    className="flex min-h-12 items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white"
                  >
                    {board.status === 'house' ? 'Ouvrir le service' : 'Réserver ce panneau'}
                  </Link>
                </>
              )}
              {panel === 'journal' && (
                <>
                  <p className="text-sm text-slate-600">
                    Événements enregistrés de ta partie. Pas de véritables nouvelles ou
                    utilisateurs.
                  </p>
                  {life.events.map((ev, i) => (
                    <div
                      key={i}
                      className="rounded-xl border-l-4 border-emerald-400 bg-slate-50 p-3 text-sm"
                    >
                      {ev}
                    </div>
                  ))}
                  <DailyStatus life={life} />
                  <button
                    type="button"
                    onClick={() => setLife((old) => advanceLifeHour(old))}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold"
                  >
                    <Clock3 size={17} /> Avancer d’une heure
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="w-full rounded-xl border border-rose-200 p-3 text-sm font-semibold text-rose-700"
                  >
                    Recommencer ma partie fictive
                  </button>
                  <Link
                    href="/haroolife/territoire"
                    className="block p-2 text-center text-sm font-semibold text-emerald-700 underline"
                  >
                    Ouvrir HarooVille
                  </Link>
                </>
              )}
              <p className="pt-1 text-center text-[10px] text-slate-500">
                HarooLife · Mode fictif, hors paiements et comptes réels
              </p>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
