'use client'

import {
  type AdCampaign,
  type AdPlacement,
  INTERNAL_CAMPAIGNS,
  isSponsored,
  safeHref,
} from '@/lib/haroolife/ads/campaigns'
import { ExposureTracker } from '@/lib/haroolife/ads/exposure'
import {
  AVATAR_CHOSEN_STORAGE,
  AVATAR_MODELS,
  AVATAR_STORAGE,
  type Avatar,
  DEFAULT_AVATAR,
  loadAvatar,
  pagneColor,
  saveAvatar,
  shownModel,
} from '@/lib/haroolife/city/avatar'
import { CAMERA_HOME, type CameraState, worldPos } from '@/lib/haroolife/city/geometry'
import {
  type InteractionTarget,
  estateRef,
  lotRef,
  resolveInteraction,
} from '@/lib/haroolife/city/interaction'
import { type Npc, type Prop, animFor, layoutFor } from '@/lib/haroolife/city/interiors'
import {
  type CityAction,
  type CityLife,
  type Interior,
  actionsFor,
  arrive,
  cityInteract,
  ensureLocality,
  enterLot,
  freelyWalkable,
  goToEstate,
  goToLot,
  goToPoint,
  initialCityLife,
  interiorFor,
  lotAtDoor,
  moveTo,
  payRide,
  roadsOf,
  stopActivity,
  travelTo,
  tripTo,
  useProp,
  walkStep,
} from '@/lib/haroolife/city/life'
import { LOCALITIES, LOCALITY_IDS, type LocalityId } from '@/lib/haroolife/city/locality'
import { CITY_STORAGE, loadCityLife } from '@/lib/haroolife/city/migrate'
import { ESTATE_GATE } from '@/lib/haroolife/city/navigation'
import { findPath } from '@/lib/haroolife/city/navigation'
import { bump } from '@/lib/haroolife/city/perf'
import {
  type CameraRig,
  FOLLOW_DISTANCE,
  type InputState,
  PlayerController,
} from '@/lib/haroolife/city/player'
import {
  PRESETS,
  type Quality,
  QualityGovernor,
  detectQuality,
  lowerQuality,
  rememberQuality,
  softwareRenderer,
} from '@/lib/haroolife/city/quality'
import { TRAFFIC_STEP_MS } from '@/lib/haroolife/city/traffic'
import {
  CATEGORY_LABELS,
  CATEGORY_OF,
  type Category,
  type Lot,
  TYPE_ICONS,
  TYPE_LABELS,
  placeName as cityPlaceName,
  districts,
  inEstate,
  isCityRoad,
  isDriveway,
  landmarks,
  landmarksIn,
  lotAt as lotAtCell,
  lotById,
  toWorld,
} from '@/lib/haroolife/city/world'
import { type Actor, type OrgRef, primaryOrganization } from '@/lib/haroolife/domain/actor'
import { createInteractionEngine } from '@/lib/haroolife/domain/engine'
import { HttpAggregationService, HttpIdentityAdapter } from '@/lib/haroolife/domain/http'
import { GameWorldAdapter } from '@/lib/haroolife/domain/services'
import { DEFAULT_RENDERER, currentRenderer } from '@/lib/haroolife/engine/select'
import type { RendererId } from '@/lib/haroolife/engine/types'
import {
  CITIES,
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
  demolishInLome,
  enterBuilding,
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
  Map as MapIcon,
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
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Drawer } from 'vaul'
import CooperativePanel from './city/cooperative-panel'
import DiagOverlay, { initialDiag, rememberDiag } from './city/diag-overlay'
import Joystick, { useKeyboardInput } from './city/joystick'
import MarketPanel from './city/market-panel'
import NationalMap from './city/national-map'
import TravelSplash from './city/travel-splash'
import OnboardingSteps from './city/onboarding'
import LiveChat from './live-chat'
import { PAGNES } from './pagnes'
import { PhoneDevice } from './phone-device'
import { HomeDialog } from './residence-dialog'
import { sayOnPlace, usePresence } from './use-presence'
import { useRealtime } from './use-realtime'

const CityWorld = dynamic(() => import('./city/city-world'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#9bbd9d] text-sm font-bold text-white">
      Chargement du monde 3D de Lomé…
    </div>
  ),
})
const RideOverlay = dynamic(() => import('./travel-scene-3d'), { ssr: false })
// Animated preview of the chosen character (three.js), loaded only when the sheet opens.
const AvatarPreview = dynamic(() => import('./avatar-preview'), { ssr: false })
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
  | 'ad'
  | 'lot'
  | 'cooperative'
  | 'market'
  | 'residence'
  | 'avatar'
  | 'player'
  | null
type Mode = 'walk' | 'build' | 'demolish'
/** The module a HarooLife address opens inside the single 3D world. */
export function routeModule(pathname: string | null): 'walk' | 'build' | 'map' {
  const path = (pathname ?? '').replace(/\/+$/, '')
  if (path === '/haroolife/territoire') return 'build'
  if (path === '/haroolife/territoire/carte') return 'map'
  return 'walk'
}
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
/** Camera distance of the map view: a neighbourhood with its streets and landmarks. */
const MAP_VIEW_DISTANCE = 68

const NAV_ITEMS = [
  { id: 'home', label: 'Maison', icon: Home },
  { id: 'shop', label: 'Aménager', icon: ShoppingBag },
  { id: 'map', label: 'Carte', icon: MapIcon },
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
  bump('immersive')
  const [cityLife, setCityLife] = useState<CityLife>(initialCityLife)
  // The generators read one locality at a time: the save's town, applied before any lookup.
  ensureLocality(cityLife)
  const life = cityLife.life
  const setLife = useCallback(
    (next: LifeState | ((old: LifeState) => LifeState)) =>
      setCityLife((c) => ({ ...c, life: typeof next === 'function' ? next(c.life) : next })),
    [],
  )
  const [camera, setCamera] = useState<CameraState>(() => CAMERA_HOME(cityLife.at.x, cityLife.at.y))
  // The continuous player: one controller for the whole session, stepped by the renderer.
  // World queries read the latest state through a ref so buildings on the estate count.
  const cityLifeRef = useRef(cityLife)
  cityLifeRef.current = cityLife
  const estateRoads = useMemo(() => roadsOf(cityLife), [cityLife.life.city.buildings])
  const estateRoadsRef = useRef(estateRoads)
  estateRoadsRef.current = estateRoads
  const input = useRef<InputState>({ x: 0, y: 0, run: false }).current
  // Renderer of the interiors (?engine=three or playcanvas), read once on the client; the
  // default until then, so the PlayCanvas chunk is never fetched unless it was asked for.
  const [renderer, setRenderer] = useState<RendererId>(DEFAULT_RENDERER)
  useEffect(() => setRenderer(currentRenderer()), [])
  const controller = useMemo(() => {
    const c = new PlayerController(
      {
        walkable: (x, y) =>
          freelyWalkable(x, y, estateRoadsRef.current, cityLifeRef.current.life.city.buildings),
        drivable: (x, y) => isCityRoad(x, y) || isDriveway(x, y),
      },
      cityLifeRef.current.at,
      { angle: 35, distance: FOLLOW_DISTANCE },
    )
    c.input = input
    return c
    // biome-ignore lint/correctness/useExhaustiveDependencies: created once; state flows through refs
  }, [])
  /** Cell last reported by the controller: a React `at` that differs is a jump (door, travel, load). */
  const reportedCell = useRef('')
  const [nearVehicle, setNearVehicle] = useState(false)
  const [driving, setDriving] = useState(false)
  // The player's look: chosen on this device, shared by the street, the rooms and the taxi.
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR)
  // New game: no look chosen yet on this device → the appearance sheet opens first, with a
  // « Commencer » button. Closing it (any way) counts as a choice; progress is never touched.
  const [firstRun, setFirstRun] = useState(false)
  useEffect(() => {
    setAvatar(loadAvatar(localStorage))
    try {
      if (!localStorage.getItem(AVATAR_STORAGE) && !localStorage.getItem(AVATAR_CHOSEN_STORAGE)) {
        setFirstRun(true)
        setPanel('avatar')
      }
    } catch {
      /* storage blocked: no first-run prompt */
    }
  }, [])
  const confirmAvatar = () => {
    saveAvatar(localStorage, avatar)
    try {
      localStorage.setItem(AVATAR_CHOSEN_STORAGE, '1')
    } catch {
      /* blocked storage */
    }
    setFirstRun(false)
    setPanel(null)
  }
  const chooseAvatar = (next: Partial<Avatar>) =>
    setAvatar((cur) => {
      const { classic, ...rest } = { ...cur, ...next }
      const a: Avatar = classic ? { ...rest, classic } : rest
      saveAvatar(localStorage, a)
      return a
    })
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null)
  /** Walk-then-use request for the Three interior (HUD activity buttons). */
  const [approachReq, setApproachReq] = useState<{ prop: string; n: number } | null>(null)
  /** Resident reached after a tap: the conversation sheet. */
  const [talkNpc, setTalkNpc] = useState<Npc | null>(null)
  // The real actor behind the player (null when signed out) and the organisation shown
  // inside a house of cooperatives. Buildings are assigned to organisations by the adapter,
  // never the other way round: the domain layer knows nothing about PlayCanvas.
  const [actor, setActor] = useState<Actor | null>(null)
  const [coopOrg, setCoopOrg] = useState<OrgRef | null>(null)
  const worldAdapter = useMemo(
    () => new GameWorldAdapter(landmarks().filter((l) => l.type === 'cooperative')),
    [],
  )
  useEffect(() => {
    let alive = true
    new HttpIdentityAdapter().me().then((a) => alive && setActor(a))
    return () => {
      alive = false
    }
  }, [])
  // One engine per world: commands go to the real services, events feed the HUD notice.
  const engine = useMemo(() => {
    const svc = new HttpAggregationService()
    return createInteractionEngine({ teams: svc, land: svc, parcels: svc })
  }, [])
  useEffect(() => {
    const labels: Record<string, string> = {
      WorkerGroupCreated: 'Recrutement ouvert.',
      WorkerJoined: 'Un ouvrier a rejoint l’équipe.',
      WorkerLeft: 'Un ouvrier a quitté l’équipe.',
      WorkerGroupReady: 'Effectif atteint : l’équipe est prête.',
      WorkerGroupExpired: 'Délai de constitution dépassé.',
      LandPledged: 'Surface engagée dans le regroupement.',
    }
    return engine.events.on('*', (e) => {
      const text = labels[e.type]
      if (text) setNotice(text)
    })
  }, [engine])
  const myOrg = actor ? primaryOrganization(actor) : null
  const myCoopLot = myOrg ? worldAdapter.lotForOrganization(myOrg) : null
  const [cityFilter, setCityFilter] = useState<Category | 'all'>('all')
  /**
   * Map view (V3): an aerial view of the town with its filters, round place icons and the
   * « Noms » switch; the game controls (joystick, door, needs) are hidden meanwhile. The game
   * view keeps the close camera and shows no town-wide filters or names.
   */
  const [mapView, setMapView] = useState(false)
  const playHeading = useRef(35)
  const [showNames, setShowNames] = useState(false)
  const [chunkStats, setChunkStats] = useState({
    chunks: 0,
    buildings: 0,
    tris: 0,
    detailed: false,
  })
  const frameRef = useRef({ drawCalls: 0, fps: 0 })
  const [quality, setQuality] = useState<Quality>('balanced')
  useEffect(() => setQuality(detectQuality()), [])
  // Adaptive quality: when frames stay slow for two consecutive checks the preset steps down
  // (the machine, not the player, decides), so the interface never freezes behind the renderer.
  // With hysteresis: three slow checks step down, a fast minute steps back up (never above
  // the level the device or the player chose), and never while a sheet covers the scene.
  const governor = useRef<QualityGovernor | null>(null)
  const qualityRef = useRef<Quality>('balanced')
  qualityRef.current = quality
  useEffect(() => {
    governor.current = new QualityGovernor(detectQuality(), softwareRenderer())
  }, [])
  useEffect(() => {
    const id = window.setInterval(() => {
      const fps = frameRef.current.fps
      if (!(fps > 0) || document.visibilityState !== 'visible' || !governor.current) return
      const next = governor.current.sample(fps, qualityRef.current)
      if (!next) return
      const down = next === lowerQuality(qualityRef.current)
      setQuality(next)
      setNotice(
        down
          ? `Qualité graphique réduite (${PRESETS[next].label}) pour rester fluide.`
          : `Qualité graphique relevée (${PRESETS[next].label}).`,
      )
    }, 3000)
    return () => window.clearInterval(id)
  }, [])
  const insideAny = Boolean(cityLife.insideLot || life.inside)
  const interior = cityLife.insideLot
    ? interiorFor(lotById(cityLife.insideLot)?.type ?? 'lot')
    : (life.inside as Interior | null)
  const doorLot = lotAtDoor(cityLife)
  const [loaded, setLoaded] = useState(false)
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [panel, setPanel] = useState<Sheet>(null)
  // A player touched in the street (presence key), and the conversation to open in the phone.
  const [playerKey, setPlayerKey] = useState<string | null>(null)
  const [playerNote, setPlayerNote] = useState('')
  const [chatRoom, setChatRoom] = useState<string | null>(null)
  // The journey between two towns, shown full screen while the arrival town loads.
  const [journey, setJourney] = useState<{
    from: LocalityId
    to: LocalityId
    hours: number
  } | null>(null)
  const endJourney = useCallback(() => setJourney(null), [])
  const [mode, setMode] = useState<Mode>('walk')
  const [building, setBuilding] = useState<BuildType>('house')
  const [selection, setSelection] = useState<{ x: number; y: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [transport, setTransport] = useState<Transport>('walk')
  const [tripChoice, setTripChoice] = useState<Transport | null>(null)
  useEffect(() => setTripChoice(null), [selectedLot?.id, panel])
  const [riding, setRiding] = useState(false)
  const [mapFilter, setMapFilter] = useState<MapFilter>('all')
  const [billboard, setBillboard] = useState<string | null>(null)
  const board = billboardById(billboard)
  const cityDef = CITIES[life.cityId]
  const whereAmI =
    life.cityId !== 'lome' && inEstate(cityLife.at.x, cityLife.at.y)
      ? placeNameAt(life.cityId, life.pos.x, life.pos.y)
      : cityPlaceName(cityLife.at.x, cityLife.at.y)
  const [chatDraft, setChatDraft] = useState('')
  const [chat, setChat] = useState<{ by: 'me' | 'npc'; body: string }[]>([
    {
      by: 'npc',
      body: 'Salut ! Bienvenue dans notre quartier fictif de Lomé. Passe au marché quand tu veux.',
    },
  ])
  const [notice, setNotice] = useState<string | null>(null)
  // The door in reach of the avatar (single resolver, continuous position, hysteresis).
  const [door, setDoor] = useState<InteractionTarget | null>(null)
  const doorRef = useRef<InteractionTarget | null>(null)
  // Street billboards (M2): internal notices at once (offline too), live campaigns when reachable.
  const [adCampaigns, setAdCampaigns] = useState<AdCampaign[]>(INTERNAL_CAMPAIGNS)
  const [nearAd, setNearAd] = useState<{ placement: AdPlacement; campaign: AdCampaign } | null>(
    null,
  )
  const [adFocus, setAdFocus] = useState<{ placement: AdPlacement; campaign: AdCampaign } | null>(
    null,
  )
  const adTracker = useRef<ExposureTracker | null>(null)
  if (!adTracker.current) adTracker.current = new ExposureTracker()
  const adsEnabled = process.env.NEXT_PUBLIC_HAROOLIFE_ADS !== 'off'
  const insideName = cityLife.insideLot
    ? (lotById(cityLife.insideLot)?.name ?? TYPE_LABELS[lotById(cityLife.insideLot)?.type ?? 'lot'])
    : life.inside
      ? (VENUE_LABELS[life.inside] ?? life.inside)
      : ''
  const doorName = insideAny ? insideName : (door?.label ?? '')
  const doorTitle = insideAny
    ? `Sortir — ${insideName}`
    : door
      ? `${door.isAccessible ? 'Entrer' : 'Fermé'} — ${door.label}`
      : 'Entrer'
  const title =
    panel === 'home'
      ? 'Mon foyer'
      : panel === 'shop'
        ? 'Marché & commerces'
        : panel === 'map'
          ? `Explorer ${LOCALITIES[cityLife.locality].name}`
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
                          : panel === 'ad'
                            ? adFocus && isSponsored(adFocus.campaign)
                              ? 'Promotion'
                              : 'Information FaîtiereHub'
                            : panel === 'lot'
                              ? 'Lieu'
                              : panel === 'cooperative'
                                ? 'Coopérative'
                                : panel === 'avatar'
                                  ? 'Mon apparence'
                                  : panel === 'player'
                                    ? 'Joueur'
                                    : panel === 'market'
                                      ? 'Marché'
                                      : ''
  const needs = life.needs
  const wellbeing = Math.round(NEED_KEYS.reduce((sum, k) => sum + needs[k], 0) / NEED_KEYS.length)
  const pending = eventById(life.pendingEvent)
  const presence = usePresence()
  // Live discussions and other players (Socket.IO relay), when configured; see use-realtime.
  const realtime = useRealtime()
  // Diagnostic panel for real-phone testing (?diag=1 or the phone settings).
  const [diag, setDiag] = useState(false)
  useEffect(() => setDiag(initialDiag()), [])
  const unreadTotal = Object.values(realtime.state.unread).reduce((a, b) => a + b, 0)
  const online = realtime.state.status === 'online'
  // Slow presence: which locality the player is in (re-sent by the client after reconnection).
  useEffect(() => {
    if (online && realtime.client)
      void realtime.client.join(cityLife.locality === 'kara' ? 'kara' : 'lome')
  }, [online, realtime.client, cityLife.locality])
  // Movement snapshots at 5 Hz, only when the avatar moved (or every 2 s to stay visible).
  useEffect(() => {
    const client = realtime.client
    if (!online || !client || insideAny) return
    let n = 0
    let last = { x: Number.NaN, z: Number.NaN, at: 0 }
    const id = window.setInterval(() => {
      const p = controller.driving && controller.vehicle ? controller.vehicle : controller.pos
      const now = performance.now()
      if (Math.hypot(p.x - last.x, p.z - last.z) < 0.03 && now - last.at < 2000) return
      last = { x: p.x, z: p.z, at: now }
      n++
      client.pose({
        x: Math.round(p.x * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        heading: Math.round(
          controller.driving && controller.vehicle
            ? controller.vehicle.heading
            : controller.heading,
        ),
        mode: controller.driving ? 'drive' : controller.mode,
        n,
      })
    }, 200)
    return () => window.clearInterval(id)
  }, [online, realtime.client, insideAny, controller])
  // Test hook: relay state without reading the UI.
  useEffect(() => {
    ;(window as unknown as { __LOME_REALTIME?: unknown }).__LOME_REALTIME = {
      status: realtime.state.status,
      me: realtime.state.me?.name ?? null,
      // Group rooms; private conversations counted apart (they accumulate over a session).
      rooms: realtime.state.me?.rooms.filter((r) => !r.startsWith('dm:')).length ?? 0,
      dms: realtime.state.me?.rooms.filter((r) => r.startsWith('dm:')).length ?? 0,
      loaded: Object.fromEntries(
        Object.entries(realtime.state.rooms).map(([r, list]) => [r, list.length]),
      ),
      present: realtime.state.present.map((p) => p.name),
      unread: unreadTotal,
      outbox: realtime.state.outbox.map((o) => o.state),
      drop: () => realtime.client?.drop(),
    }
  }, [realtime.state, realtime.client, unreadTotal])
  // Campaigns of this town (CDN-cached API); on failure the internal notices stay.
  useEffect(() => {
    if (!adsEnabled) return
    let stop = false
    const locality = cityLife.locality === 'kara' ? 'kara' : 'lome'
    void fetch(`/api/haroolife/ads?locality=${locality}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { enabled: boolean; campaigns: AdCampaign[] } | null) => {
        if (stop || !d) return
        setAdCampaigns(d.enabled ? d.campaigns : [])
      })
      .catch(() => {})
    return () => {
      stop = true
    }
  }, [adsEnabled, cityLife.locality])
  // Aggregated statistics leave every minute and when the page is hidden (counts only).
  useEffect(() => {
    if (!adsEnabled) return
    const send = (beacon: boolean) => {
      const items = adTracker.current?.flush() ?? []
      if (!items.length) return
      const body = JSON.stringify({ items: items.slice(0, 8) })
      if (beacon && navigator.sendBeacon)
        navigator.sendBeacon(
          '/api/haroolife/ads/events',
          new Blob([body], { type: 'application/json' }),
        )
      else
        void fetch('/api/haroolife/ads/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {})
    }
    const id = window.setInterval(() => send(false), 60_000)
    const onHide = () => {
      if (document.visibilityState === 'hidden') send(true)
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    ;(window as unknown as { __LOME_ADS_FLUSH?: () => void }).__LOME_ADS_FLUSH = () => send(false)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      send(true)
    }
  }, [adsEnabled])
  const onNearAd = useCallback(
    (p: { placement: AdPlacement; campaign: AdCampaign } | null) => setNearAd(p),
    [],
  )
  const adsProp = useMemo(
    () =>
      adsEnabled && adTracker.current
        ? { campaigns: adCampaigns, tracker: adTracker.current, onNear: onNearAd }
        : undefined,
    [adsEnabled, adCampaigns, onNearAd],
  )
  function readAd() {
    if (!nearAd) return
    setAdFocus(nearAd)
    setPanel('ad')
  }
  function learnMore() {
    if (!adFocus) return
    const href = safeHref(adFocus.campaign.creative.href)
    if (!href) return
    adTracker.current?.click(adFocus.campaign.id, adFocus.placement.id)
    window.open(href, '_blank', 'noopener,noreferrer')
  }
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
      const loaded = loadCityLife(localStorage)
      if (loaded.source !== 'fresh' || loaded.importedBuilder) {
        setCityLife(loaded.world)
        setCamera(CAMERA_HOME(loaded.world.at.x, loaded.world.at.y))
      }
      if (loaded.importedBuilder) setNotice('Vos constructions HarooVille sont sur le domaine.')
    } catch {
      setWebgl(false)
    }
    setLoaded(true)
  }, [])
  // Autosave is throttled: serialising the whole city on every walking step cost more than
  // the step itself on slow machines. One pending timer writes the latest state (it is never
  // cancelled by a newer change, so a busy main thread cannot starve it); the tab hiding
  // flushes immediately.
  const pendingSave = useRef<CityLife | null>(null)
  const saveTimer = useRef<number | null>(null)
  const flushSave = useCallback(() => {
    saveTimer.current = null
    if (!pendingSave.current) return
    try {
      localStorage.setItem(CITY_STORAGE, JSON.stringify(pendingSave.current))
    } catch {
      /* Offline game supports blocked storage. */
    }
    pendingSave.current = null
  }, [])
  useEffect(() => {
    if (!loaded) return
    pendingSave.current = cityLife
    if (saveTimer.current === null) saveTimer.current = window.setTimeout(flushSave, 400)
  }, [cityLife, loaded, flushSave])
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushSave()
    }
    window.addEventListener('pagehide', flushSave)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flushSave)
      document.removeEventListener('visibilitychange', onHide)
      flushSave()
    }
  }, [flushSave])
  // Live state for the end-to-end tests (chunks loaded, buildings, position, interior).
  useEffect(() => {
    const room = cityLife.insideLot
      ? interiorFor(lotById(cityLife.insideLot)?.type ?? 'lot')
      : (life.inside as Interior | null)
    const layout = room ? layoutFor(room) : null
    ;(window as unknown as { __LOME_CITY?: unknown }).__LOME_CITY = {
      ...chunkStats,
      ...frameRef.current,
      quality,
      at: cityLife.at,
      route: cityLife.route.length,
      inside: cityLife.insideLot ?? life.inside,
      interiorProps: layout?.props.length ?? 0,
      npcs: layout?.npcs.length ?? 0,
      activity: cityLife.activity,
      fitness: cityLife.fitness,
      energy: life.needs.energy,
      hour: life.hour,
      actor: actor ? { id: actor.id, organizations: actor.organizations.length } : null,
      myCoopLot: myCoopLot?.id ?? null,
      camera,
      riding,
      transport,
      panel,
      wallet: life.wallet,
      lastEvent: life.lastEvent,
      estateBuildings: life.city.buildings.length,
      locality: cityLife.locality,
    }
  }, [
    cityLife.locality,
    life.city.buildings.length,
    riding,
    transport,
    panel,
    life.wallet,
    life.lastEvent,
    actor,
    myCoopLot,
    camera,
    chunkStats,
    quality,
    cityLife.at,
    cityLife.route.length,
    cityLife.insideLot,
    cityLife.activity,
    cityLife.fitness,
    life.inside,
    life.needs.energy,
    life.hour,
  ])
  // Entering a house of cooperatives opens the dashboard of the organisation housed there
  // (the player's own when it is the right building, otherwise the first one assigned).
  useEffect(() => {
    const lot = cityLife.insideLot ? lotById(cityLife.insideLot) : null
    if (!lot || lot.type !== 'cooperative') return
    const housed = actor ? worldAdapter.organizationsAt(lot, actor.organizations) : []
    setCoopOrg(housed[0] ?? myOrg)
    setPanel('cooperative')
  }, [cityLife.insideLot, actor, myOrg, worldAdapter])
  // An activity animation lasts a few seconds, then the player stands idle again.
  useEffect(() => {
    if (!cityLife.activity) return
    const id = window.setTimeout(() => setCityLife((old) => stopActivity(old)), 3200)
    return () => window.clearTimeout(id)
  }, [cityLife.activity])
  // Controller ↔ React bridge. React owns the game state (saves, HUD, interactions); the
  // controller owns the continuous pose. A React `at` that the controller did not report is a
  // jump (leaving a building, travelling, loading a save): the avatar is placed there.
  useEffect(() => {
    const key = `${cityLife.locality}:${cityLife.at.x}:${cityLife.at.y}`
    if (reportedCell.current === key) return
    reportedCell.current = key
    const pose = cityLife.pose
    controller.teleport(cityLife.at, pose?.heading)
    if (pose && Math.abs(pose.x - cityLife.at.x) <= 1 && Math.abs(pose.z - cityLife.at.y) <= 1)
      controller.pos = { x: pose.x, z: pose.z }
    controller.camera.follow = true
  }, [cityLife.at.x, cityLife.at.y, cityLife.locality, controller, cityLife.at, cityLife.pose])
  useEffect(() => {
    controller.route = cityLife.route.map((c) => ({ x: c.x, z: c.y }))
  }, [cityLife.route, controller])
  useEffect(() => {
    controller.setInside(insideAny)
  }, [insideAny, controller])
  // Door in reach: checked ~7 times a second from the controller's continuous pose (never a
  // React update per frame: state changes only when the door itself changes).
  useEffect(() => {
    if (insideAny || webgl === false) {
      doorRef.current = null
      setDoor(null)
      return
    }
    const check = () => {
      const t = controller.driving
        ? null
        : resolveInteraction(
            cityLifeRef.current,
            controller.pos,
            doorRef.current?.id ?? null,
            undefined,
            controller.heading,
          )
      const prev = doorRef.current
      if (prev?.id === t?.id && prev?.isAccessible === t?.isAccessible) return
      doorRef.current = t
      setDoor(t)
    }
    check()
    const id = window.setInterval(check, 140)
    return () => window.clearInterval(id)
  }, [insideAny, webgl, controller])
  useEffect(() => {
    controller.setTravelling(riding)
  }, [riding, controller])
  useEffect(() => {
    const v = cityLife.locality === 'lome' ? cityLife.vehicle : null
    if (v) {
      if (!controller.vehicle) controller.vehicle = { x: v.x, z: v.z, heading: v.heading, speed: 0 }
      else if (!controller.driving)
        Object.assign(controller.vehicle, { x: v.x, z: v.z, heading: v.heading, speed: 0 })
    } else {
      controller.vehicle = null
      controller.driving = false
    }
  }, [cityLife.vehicle, cityLife.locality, controller])
  // A first visit to Lomé parks the player's taxi on the avenue by the estate gate.
  useEffect(() => {
    if (!loaded || cityLife.vehicle !== undefined) return
    setCityLife((old) => ({
      ...old,
      vehicle: { x: ESTATE_GATE.x, z: ESTATE_GATE.y + 3, heading: 0 },
    }))
  }, [loaded, cityLife.vehicle])
  const onPlayerEvents = useCallback(
    (events: ReturnType<PlayerController['drain']>, c: PlayerController) => {
      for (const ev of events) {
        if (ev.type === 'cell') {
          const key = `${cityLifeRef.current.locality}:${ev.x}:${ev.y}`
          reportedCell.current = key
          const pose = { x: c.pos.x, z: c.pos.z, heading: c.heading }
          setCityLife((old) => {
            const head = old.route[0]
            if (head && head.x === ev.x && head.y === ev.y) return { ...walkStep(old), pose }
            return moveTo(old, { x: ev.x, y: ev.y }, pose)
          })
          setNearVehicle(c.canEnterVehicle())
        } else if (ev.type === 'vehicle') {
          const v = c.vehicle
          setDriving(ev.state === 'entered')
          setNearVehicle(ev.state === 'left' ? c.canEnterVehicle() : false)
          setCityLife((old) => ({
            ...old,
            vehicle: v ? { x: v.x, z: v.z, heading: v.heading } : old.vehicle,
            pose: { x: c.pos.x, z: c.pos.z, heading: c.heading },
          }))
          setNotice(
            ev.state === 'entered'
              ? 'Tu conduis le taxi : joystick pour accélérer, freiner et tourner.'
              : 'Tu es descendu du taxi.',
          )
        }
      }
    },
    [],
  )
  const onJoystickActive = useCallback(() => {
    controller.camera.follow = true
    if (cityLifeRef.current.route.length)
      setCityLife((old) => ({ ...old, route: [], target: null }))
  }, [controller])
  // Indoors the keyboard walks the player only where the renderer lets them walk (R3F interiors).
  useKeyboardInput(
    input,
    panel === null && !mapView && (!insideAny || renderer !== 'playcanvas') && !riding,
  )
  // Test hooks: walkability of a cell and an automatic walk to the player's taxi.
  useEffect(() => {
    const w = window as unknown as {
      __LOME_WALKABLE?: (x: number, y: number) => boolean
      __LOME_GOTO_TAXI?: () => void
    }
    w.__LOME_WALKABLE = (x, y) =>
      freelyWalkable(x, y, estateRoadsRef.current, cityLifeRef.current.life.city.buildings)
    w.__LOME_GOTO_TAXI = () => {
      const v = controller.vehicle
      if (!v) return
      setCityLife((old) => goToPoint(old, { x: Math.round(v.x), y: Math.round(v.z) }))
    }
    return () => {
      w.__LOME_WALKABLE = undefined
      w.__LOME_GOTO_TAXI = undefined
    }
  }, [controller])
  function toggleVehicle() {
    if (controller.driving) {
      if (!controller.exitVehicle()) setNotice('Freine avant de descendre du taxi.')
    } else if (!controller.enterVehicle()) setNotice('Approche-toi du taxi pour monter.')
  }
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
  // Key E on a PC: the same action as the door button (never while typing in a field).
  const doorKey = useRef<() => void>(() => {})
  doorKey.current = () => {
    if (panel !== null || riding) return
    if (insideAny) action('leave')
    else if (doorRef.current) action('enter')
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null)
        return
      }
      const el = e.target as HTMLElement | null
      const typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      if ((e.key === 'e' || e.key === 'E') && !typing && !e.repeat && !e.ctrlKey && !e.metaKey) {
        doorKey.current()
      }
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
    }, TRAFFIC_STEP_MS)
    return () => window.clearInterval(id)
  }, [insideAny])

  // Starting a trip or a walk, or entering a place, ends the map view (the game camera comes
  // back). Only the start counts: the map can be opened again while a walk is under way.
  const walking = cityLife.route.length > 0
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to these transitions only
  useEffect(() => {
    if (mapView && (insideAny || riding || walking)) exitMap()
  }, [insideAny, riding, walking])
  function enterMap() {
    setPanel(null)
    const rig = controller.camera
    if (!mapView) playHeading.current = rig.angle
    rig.follow = false
    rig.angle = 0
    rig.tx = controller.pos.x
    rig.tz = controller.pos.z
    rig.distance = MAP_VIEW_DISTANCE
    const [tx, , tz] = worldPos(rig.tx, rig.tz)
    setCamera((c) => ({ ...c, tx, tz, distance: rig.distance, angle: rig.angle }))
    setMapView(true)
  }
  /** Back to the game: the close camera on the player, as it was before the map. */
  function exitMap() {
    const rig = controller.camera
    rig.follow = true
    rig.angle = playHeading.current
    rig.distance = FOLLOW_DISTANCE
    setCamera((c) => ({ ...c, distance: rig.distance, angle: rig.angle }))
    setShowNames(false)
    setMapView(false)
  }
  function open(id: Exclude<Sheet, null>) {
    setPanel((cur) => (cur === id ? null : id))
    setNotice(null)
    setChatRoom(null)
  }
  // Starting a walk or a ride from a sheet closes the map in the same action, so nothing on
  // the map bar is left under the finger for a frame.
  function go(x: number, y: number) {
    if (mapView) exitMap()
    setMode('walk')
    setPanel(null)
    setSelection({ x, y })
    setTransport('walk')
    controller.camera.follow = true
    setCityLife((old) => goToEstate(old, x, y))
  }
  function goLot(lot: Lot) {
    if (mapView) exitMap()
    setMode('walk')
    setPanel(null)
    setTransport('walk')
    controller.camera.follow = true
    setCityLife((old) => goToLot(old, lot))
  }
  function rideTo(lot: Lot, t: Transport) {
    if (life.wallet < TRAVEL_COST[t]) {
      setNotice('Solde insuffisant pour ce transport fictif.')
      return
    }
    if (mapView) exitMap()
    setMode('walk')
    setPanel(null)
    controller.camera.follow = true
    setTransport(t)
    setCityLife((old) => {
      const going = goToLot(old, lot)
      return going.route.length ? payRide(going, t) : going
    })
    setRiding(true)
  }
  /** Resolve the door from where the avatar stands now, at the moment of the tap. */
  function resolveDoor(): InteractionTarget | null {
    if (controller.driving) return null
    return resolveInteraction(
      cityLifeRef.current,
      controller.pos,
      doorRef.current?.id ?? null,
      undefined,
      controller.heading,
    )
  }
  /** « Entrer » (button, sheet or key E): one tap, the building in reach, explicit feedback. */
  function enterDoor() {
    if (controller.driving) {
      setNotice('Descends du taxi pour entrer dans un bâtiment.')
      return
    }
    const t = resolveDoor()
    if (!t) {
      setNotice('Approche-toi d’une porte : le bouton « Entrer » apparaît devant une entrée.')
      return
    }
    if (!t.isAccessible) {
      setNotice(`${t.label} : ${t.reason ?? 'fermé.'}`)
      return
    }
    // Where to come back out: the exact spot in front of this door.
    const pose = { x: controller.pos.x, z: controller.pos.z, heading: controller.heading }
    const b = estateRef(t)
    const lot = lotRef(t)
    if (b) setCityLife((old) => ({ ...old, pose, route: [], life: enterBuilding(old.life, b) }))
    else if (lot) setCityLife((old) => enterLot(old, lot, pose))
    setNotice(null)
    setPanel(null)
  }
  function action(a: Action) {
    if (a === 'enter' && !insideAny) {
      enterDoor()
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
  /**
   * A home action from the needs sheet. Inside the house drawn by Three, the player walks to
   * the equipment that offers it and the action runs on arrival (once); elsewhere the rules of
   * `interact` apply unchanged (they refuse what is not possible here).
   */
  function atHome(a: Action) {
    const prop =
      life.inside === 'house' && renderer !== 'playcanvas'
        ? layoutFor('house').props.find((p) => p.action === a)
        : undefined
    if (!prop) {
      action(a)
      return
    }
    setPanel(null)
    setApproachReq((r) => ({ prop: prop.id, n: (r?.n ?? 0) + 1 }))
  }
  function cityAction(a: CityAction) {
    if (a === 'offers') {
      setPanel('market')
      return
    }
    if (a === 'coop') {
      setCoopOrg((cur) => cur ?? myOrg)
      setPanel('cooperative')
      return
    }
    if (a === 'enter') {
      enterDoor()
      return
    }
    setCityLife((old) => cityInteract(old, a))
    if (a === 'leave') setPanel(null)
  }
  /** « Ma coopérative » : the camera flies to the building that houses the player's organisation. */
  function goMyCooperative() {
    if (!myCoopLot) {
      setNotice(
        actor
          ? 'Votre compte n’est rattaché à aucune coopérative.'
          : 'Connectez-vous pour retrouver votre coopérative.',
      )
      open('home')
      return
    }
    setMode('walk')
    controller.camera.follow = false
    setCoopOrg(myOrg)
    setSelectedLot(myCoopLot)
    setCamera(CAMERA_HOME(myCoopLot.door.x, myCoopLot.door.y))
    setPanel('lot')
    setNotice(null)
  }
  function useEquipment(p: Prop) {
    if (!p.action) return
    setPanel(null)
    if (cityLife.insideLot) {
      setCityLife((old) => useProp(old, p.id))
      return
    }
    // Estate interiors keep their original actions; the animation plays on the prop.
    action(p.action as Action)
    setCityLife((old) => ({ ...old, activity: { prop: p.id, anim: animFor(p.kind) } }))
  }
  /**
   * Starts an activity from the sheet: the first prop in the room that offers it. In a Three
   * interior the player first walks to it (the action runs on arrival, see InteriorThree).
   */
  function startActivity(a: CityAction) {
    const room = cityLife.insideLot ? interiorFor(lotById(cityLife.insideLot)?.type ?? 'lot') : null
    const prop = room ? layoutFor(room).props.find((p) => p.action === a) : null
    if (prop && renderer !== 'playcanvas') {
      setPanel(null)
      setApproachReq((r) => ({ prop: prop.id, n: (r?.n ?? 0) + 1 }))
    } else if (prop) useEquipment(prop)
    else cityAction(a)
  }
  function tile(x: number, y: number) {
    setSelection({ x, y })
    if (mode === 'walk') {
      controller.camera.follow = true
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
  // One world, several addresses. The engine is mounted by the /haroolife layout, so these
  // routes change the module on screen without unmounting the PlayCanvas application:
  // /haroolife/territoire opens « Construire », /haroolife/territoire/carte « Explorer »,
  // /haroolife and /haroolife/territoire/lome the walk around Lomé.
  const pathname = usePathname()
  useEffect(() => {
    const module = routeModule(pathname)
    if (module === 'build') {
      setPanel('build')
      setMode('build')
    } else if (module === 'map') {
      setPanel('map')
      setMode('walk')
    } else {
      setPanel((cur) => (cur === 'build' || cur === 'map' ? null : cur))
      setMode('walk')
    }
  }, [pathname])
  // A signed-in account without a home is invited once to settle in its canton.
  const [residencePrompted, setResidencePrompted] = useState(false)
  useEffect(() => {
    if (residencePrompted || presence.status !== 'ready' || !presence.world) return
    if (presence.world.me.home === null) {
      setResidencePrompted(true)
      setPanel('residence')
    }
  }, [presence.status, presence.world, residencePrompted])

  /** The bush taxi to another town: fare, hours on the road, arrival at its station. */
  function travel(to: LocalityId) {
    const trip = tripTo(cityLife, to)
    if (!trip || to === cityLife.locality) return
    if (life.wallet < trip.fare) {
      setNotice(`Il te faut ${money(trip.fare)} pour le car vers ${LOCALITIES[to].name}.`)
      return
    }
    setCityLife((old) => {
      let next: CityLife = {
        ...old,
        life: {
          ...old.life,
          wallet: old.life.wallet - trip.fare,
          spent: old.life.spent + trip.fare,
        },
      }
      for (let h = 0; h < trip.hours; h++) next = { ...next, life: advanceLifeHour(next.life) }
      if (to in CITIES) next = { ...next, life: selectCity(next.life, to) }
      return travelTo(next, to)
    })
    // The change of map is shown while the new town loads (its street reports its tiles).
    setJourney({ from: cityLife.locality, to, hours: trip.hours })
    setChunkStats({ chunks: 0, buildings: 0, tris: 0, detailed: false })
    // Arriving in another town is a departure like any other: back to the game camera.
    if (mapView) exitMap()
    const gate = LOCALITIES[to].gate
    setCamera(CAMERA_HOME(gate.x, gate.y))
    controller.camera.follow = true
    setSelectedLot(null)
    setPanel(null)
    setMode('walk')
    setTransport('walk')
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
            onTile={tile}
            controller={controller}
            onPlayerEvents={onPlayerEvents}
            remoteFeed={realtime.client ?? undefined}
            remotePresent={realtime.state.present}
            ads={adsProp}
            avatarModel={shownModel(avatar)}
            avatarPagne={pagneColor(avatar.pagne)}
            camera={camera}
            hour={life.hour}
            interior={interior}
            interiorTitle={
              cityLife.insideLot
                ? (lotById(cityLife.insideLot)?.name ??
                  TYPE_LABELS[lotById(cityLife.insideLot)?.type ?? 'lot'])
                : (VENUE_LABELS[life.inside ?? ''] ?? '')
            }
            activity={cityLife.activity}
            onUseProp={useEquipment}
            approach={approachReq}
            onTalk={(npc) => {
              setPanel(null)
              setTalkNpc(npc)
            }}
            onNotice={setNotice}
            ride={riding && cityLife.route.length > 0 && !insideAny ? { transport, rain } : null}
            onCell={(cell) => {
              const lot = lotAtCell(cell.x, cell.y)
              if (lot) {
                setSelectedLot(lot)
                setPanel('lot')
              } else if (!mapView) {
                controller.camera.follow = true
                setCityLife((old) => goToPoint(old, cell))
              }
            }}
            onLotIcon={(lot) => {
              setSelectedLot(lot)
              setPanel('lot')
            }}
            onPlayer={(key) => {
              setPlayerKey(key)
              setPlayerNote('')
              setPanel('player')
            }}
            filter={cityFilter}
            selectedLot={selectedLot}
            showNames={showNames}
            mapView={mapView}
            onStats={(s) =>
              setChunkStats((old) =>
                old.chunks === s.chunks &&
                old.buildings === s.buildings &&
                old.tris === s.tris &&
                old.detailed === s.detailed
                  ? old
                  : s,
              )
            }
            onFrame={(f) => {
              frameRef.current = f
            }}
            quality={quality}
            locality={cityLife.locality}
            renderer={renderer}
            input={input}
            onLeave={() => action('leave')}
          />
        )}
      </div>
      {journey && (
        <TravelSplash
          from={journey.from}
          to={journey.to}
          hours={journey.hours}
          ready={cityLife.locality === journey.to && chunkStats.chunks > 0}
          onDone={endJourney}
        />
      )}
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

      {mapView && !insideAny && !riding && webgl !== false && (
        <div className="pointer-events-auto absolute left-3 right-3 top-[150px] z-10 flex flex-wrap gap-1.5 sm:top-[160px]">
          <button
            type="button"
            onClick={exitMap}
            className="rounded-full bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white shadow"
          >
            Retour au jeu
          </button>
          <button
            type="button"
            aria-pressed={showNames}
            onClick={() => setShowNames((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold shadow ${showNames ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-white/70 bg-white/95 text-slate-800'}`}
          >
            🏷️ Noms
          </button>
          <button
            type="button"
            onClick={() => open('map')}
            className="rounded-full border border-white/70 bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-800 shadow"
          >
            Lieux et villes
          </button>
        </div>
      )}
      {mapView && !insideAny && !riding && webgl !== false && (
        <div
          role="group"
          aria-label="Catégories de lieux"
          className="pointer-events-auto absolute left-3 right-16 top-[104px] z-10 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:top-[114px]"
        >
          {(
            [
              'all',
              'homes',
              'shops',
              'education',
              'health',
              'transport',
              'services',
              'leisure',
              'worship',
            ] as const
          ).map((f) => (
            <button
              type="button"
              key={f}
              aria-pressed={cityFilter === f}
              onClick={() => setCityFilter(f)}
              className={
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold shadow ' +
                (cityFilter === f
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-white/70 bg-white/95 text-slate-800')
              }
            >
              {f === 'all' ? 'Tous' : CATEGORY_LABELS[f]}
            </button>
          ))}
        </div>
      )}
      {cityLife.insideLot && webgl !== false && (
        <button
          type="button"
          aria-label="Activités du lieu"
          onClick={() => {
            const lot = lotById(cityLife.insideLot ?? '')
            if (lot) {
              setSelectedLot(lot)
              open('lot')
            }
          }}
          className="pointer-events-auto absolute left-3 top-[104px] z-10 rounded-full border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow sm:top-[114px]"
        >
          Activités · {lotById(cityLife.insideLot)?.name ?? 'ce lieu'}
        </button>
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
          {actor && (
            <button
              type="button"
              aria-label="Ma coopérative"
              title="Ma coopérative"
              onClick={goMyCooperative}
              className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-700 px-3 py-2 text-xs font-bold text-white shadow-md"
            >
              🤝 <span className="hidden sm:inline">Ma coopérative</span>
            </button>
          )}
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

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-[calc(100px+env(safe-area-inset-bottom))] z-20 px-3 sm:px-5 ${mapView ? 'hidden' : ''}`}
      >
        <div className="mx-auto flex max-w-[900px] items-end justify-between gap-2">
          <div className="flex min-w-0 flex-col items-start gap-2">
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
            <Joystick
              input={input}
              disabled={panel !== null || riding}
              onActive={onJoystickActive}
            />
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            {(nearVehicle || driving) && (
              <button
                type="button"
                aria-label={driving ? 'Descendre du taxi' : 'Monter dans le taxi'}
                onClick={toggleVehicle}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400 text-[10px] font-black text-slate-900 shadow"
              >
                {driving ? 'Descendre' : '🚕 Monter'}
              </button>
            )}
            {nearAd && !insideAny && !driving && panel === null && (
              <button
                type="button"
                data-testid="ad-read"
                onClick={readAd}
                className="flex min-h-11 max-w-[11rem] items-center gap-2 self-end rounded-2xl bg-white/95 px-3 py-2 text-left text-xs font-black text-slate-800 shadow-lg ring-1 ring-slate-200"
              >
                <span aria-hidden className="text-base leading-none">
                  📣
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block">Lire l’annonce</span>
                  <span className="block truncate text-[11px] font-semibold text-slate-500">
                    {isSponsored(nearAd.campaign) ? 'Promotion' : nearAd.campaign.advertiser.name}
                  </span>
                </span>
              </button>
            )}
            {(insideAny || door) && (
              <button
                type="button"
                aria-label="Entrer ou sortir"
                title={doorTitle}
                data-testid="door-action"
                data-door={insideAny ? 'inside' : (door?.id ?? '')}
                onClick={() => action(insideAny ? 'leave' : 'enter')}
                className={`flex min-h-14 max-w-[11rem] items-center gap-2 self-end rounded-2xl px-4 py-2 text-left text-sm font-black shadow-lg ${
                  insideAny || door?.isAccessible
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                <span aria-hidden className="text-lg leading-none">
                  {insideAny ? '🚪' : door?.isAccessible ? '🏠' : '🔒'}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block">
                    {insideAny ? 'Sortir' : door?.isAccessible ? 'Entrer' : 'Fermé'}
                  </span>
                  <span className="block truncate text-[11px] font-semibold opacity-90">
                    {doorName}
                  </span>
                </span>
              </button>
            )}
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
            aria-live="polite"
            className="max-w-[94%] rounded-2xl bg-slate-950/65 px-3 py-2 text-left text-[11px] font-medium text-white shadow backdrop-blur sm:text-xs"
          >
            {status.length > 95 ? status.slice(0, 92) + '…' : status}
          </button>
        </div>
      </div>

      {diag && (
        <DiagOverlay
          client={realtime.client}
          state={realtime.state}
          onClose={() => {
            setDiag(false)
            rememberDiag(false)
          }}
        />
      )}

      {talkNpc && (
        <section
          aria-label="Conversation"
          className="pointer-events-auto absolute inset-x-3 bottom-[calc(100px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[520px] rounded-[24px] border border-white/70 bg-white/95 p-4 shadow-2xl backdrop-blur"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-emerald-700">Personnage du jeu (PNJ)</p>
              <p className="text-base font-black text-slate-900">{talkNpc.role}</p>
            </div>
            <button
              type="button"
              onClick={() => setTalkNpc(null)}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold"
            >
              Fermer
            </button>
          </div>
          <p className="mt-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
            « Bonjour voisin ! Il fait bon aujourd’hui. Passe me voir au marché si tu as besoin de
            quelque chose. »
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                // The game's own social action (need « Social »), applied once per greeting.
                action('socialize')
                setTalkNpc(null)
              }}
              className="flex-1 rounded-2xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white"
            >
              Saluer et discuter
            </button>
          </div>
        </section>
      )}
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
                aria-pressed={item.id === 'map' ? mapView || panel === 'map' : panel === item.id}
                onClick={() => {
                  if (item.id === 'map') {
                    if (mapView) exitMap()
                    else if (insideAny) open('map')
                    else enterMap()
                    return
                  }
                  if (mapView) exitMap()
                  open(item.id)
                }}
                className={
                  'relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[18px] text-[11px] font-semibold transition ' +
                  ((item.id === 'map' ? mapView || panel === 'map' : panel === item.id)
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100')
                }
              >
                <Icon size={21} />
                <span>{item.label}</span>
                {item.id === 'phone' && unreadTotal > 0 && (
                  <span
                    data-testid="unread-badge"
                    className="absolute right-3 top-1 min-w-5 rounded-full bg-rose-500 px-1 text-[10px] font-black text-white"
                  >
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
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
      {panel === 'phone' && (
        <PhoneDevice
          hour={life.hour}
          day={life.day}
          place={LOCALITIES[cityLife.locality].name}
          wallet={money(life.wallet)}
          partners={PARTNER_APPS.map((app) => ({
            id: app.id,
            icon: app.icon,
            name: app.name,
            href: app.href,
            note: app.status === 'available' ? `${money(app.priceMonth)}/mois` : undefined,
          }))}
          diag={diag}
          onDiag={(on) => {
            setDiag(on)
            rememberDiag(on)
          }}
          quality={quality}
          qualities={(['eco', 'balanced', 'high'] as const).map((q) => ({
            id: q,
            label: PRESETS[q].label,
            hint: PRESETS[q].hint,
          }))}
          onQuality={(id) => {
            const q = id as Quality
            setQuality(q)
            rememberQuality(q)
            if (governor.current) governor.current.ceiling = q
          }}
          onOpen={(app) => open(app)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel && panel !== 'residence' && panel !== 'phone' && (
        <Drawer.Root
          open
          autoFocus
          handleOnly
          shouldScaleBackground={false}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              if (firstRun && panel === 'avatar') confirmAvatar()
              else setPanel(null)
            }
          }}
        >
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-[110] bg-slate-950/30" />
            <Drawer.Content
              aria-label={title}
              aria-describedby={undefined}
              className="fixed inset-x-0 bottom-[calc(85px+env(safe-area-inset-bottom))] z-[120] mx-auto flex max-h-[min(68dvh,680px)] w-[calc(100%-16px)] max-w-[620px] flex-col overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-2xl outline-none sm:max-h-[70dvh]"
            >
              <Drawer.Handle
                aria-label="Faire glisser pour fermer"
                className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-slate-300"
              />
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-5 pb-3 pt-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    {panel === 'messages' && realtime.state.status === 'online'
                      ? 'Lomé Life · En direct'
                      : 'Lomé Life · Quartier fictif'}
                  </p>
                  <Drawer.Title className="text-xl font-black">{title}</Drawer.Title>
                </div>
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() =>
                    firstRun && panel === 'avatar' ? confirmAvatar() : setPanel(null)
                  }
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
                    {actor && <OnboardingSteps actor={actor} />}
                    <div className="grid grid-cols-2 gap-2">
                      <ActionButton
                        title="Rentrer chez moi"
                        onClick={() => go(9, 9)}
                        icon={<Home size={17} />}
                      />
                      <ActionButton title="Entrer" outline onClick={() => action('enter')} />
                      <ActionButton title="Dormir" outline onClick={() => atHome('sleep')} />
                      <ActionButton title="Se laver" outline onClick={() => atHome('wash')} />
                      <ActionButton title="Manger" outline onClick={() => atHome('eat')} />
                      <ActionButton title="Se détendre" outline onClick={() => atHome('relax')} />
                      <ActionButton title="Toilettes" outline onClick={() => atHome('toilet')} />
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
                    <div className="rounded-2xl bg-slate-50 p-3" data-testid="national-map">
                      <p className="text-sm font-black">Le Togo</p>
                      <p className="text-[11px] text-slate-500">
                        Tu es à {LOCALITIES[cityLife.locality].name} (
                        {LOCALITIES[cityLife.locality].region}). Choisis une destination : le car
                        interurbain t’y dépose à la gare routière, la ville se charge au fur et à
                        mesure autour de toi.
                      </p>
                      <NationalMap current={cityLife.locality} onPick={travel} />
                      <div className="mt-2 grid gap-1">
                        {LOCALITY_IDS.filter((id) => id !== cityLife.locality).map((id) => {
                          const trip = tripTo(cityLife, id)
                          return (
                            <button
                              type="button"
                              key={id}
                              onClick={() => travel(id)}
                              className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-left text-xs ring-1 ring-slate-200 hover:ring-emerald-400"
                            >
                              <span className="text-base">🚌</span>
                              <span className="min-w-0 flex-1">
                                <span className="block font-bold">
                                  Voyager vers {LOCALITIES[id].name}
                                </span>
                                <span className="block text-slate-500">
                                  {LOCALITIES[id].note} Car interurbain : {trip.hours} h,{' '}
                                  {money(trip.fare)} (tarif fictif).
                                </span>
                              </span>
                              <ArrowRight size={14} className="shrink-0 text-emerald-700" />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <p className="text-sm text-slate-600">
                      Toute la ville est là : touche un bâtiment dans la scène ou choisis un lieu.
                      Ton personnage suit les rues, les ponts et les avenues.
                    </p>
                    <div
                      className="flex flex-wrap gap-1"
                      role="group"
                      aria-label="Filtrer la ville"
                    >
                      {(
                        [
                          'all',
                          'homes',
                          'shops',
                          'education',
                          'health',
                          'transport',
                          'services',
                          'leisure',
                          'worship',
                          'lots',
                        ] as const
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
                    {districts().map((d) => {
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
                    <div
                      className="flex flex-wrap gap-1"
                      role="group"
                      aria-label="Filtrer la carte"
                    >
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
                      <p className="mt-1 text-[11px] text-slate-500">
                        Les noms du domaine suivent la ville où tu habites. Pour changer de ville,
                        voyage depuis la carte du Togo ci-dessus.
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
                {panel === 'messages' && realtime.state.status !== 'disabled' && (
                  <LiveChat
                    key={chatRoom ?? 'rooms'}
                    initialRoom={chatRoom}
                    client={realtime.client}
                    state={realtime.state}
                    locality={cityLife.locality === 'kara' ? 'kara' : 'lome'}
                    onChooseHome={() => open('residence')}
                  />
                )}
                {panel === 'messages' && here && (
                  <>
                    <p className="text-xs text-slate-500">
                      La place de {here.canton.canton} : messages des habitants connectés à
                      HarooLife, 200 caractères, visibles par tous les habitants du canton.
                    </p>
                    {presence.world?.me.home === null && (
                      <button
                        type="button"
                        onClick={() => open('residence')}
                        className="block w-full rounded-xl bg-amber-50 p-3 text-left text-xs font-semibold text-amber-900"
                      >
                        Choisissez d’abord votre maison dans HarooLife pour parler sur la place.
                      </button>
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
                {panel === 'messages' && !here && realtime.state.status !== 'online' && (
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
                      {actor && (
                        <ActionButton
                          title="Ma coopérative"
                          outline
                          onClick={goMyCooperative}
                          icon={<Users size={17} />}
                        />
                      )}
                    </div>
                  </>
                )}
                {panel === 'player' &&
                  playerKey &&
                  (() => {
                    const who = realtime.state.present.find((p) => p.key === playerKey)
                    const name = who?.name ?? 'Joueur'
                    const blocked = realtime.state.me?.blocked.includes(playerKey) ?? false
                    const offline = !realtime.client || realtime.state.status !== 'online'
                    return (
                      <div className="space-y-3" data-testid="player-sheet">
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden
                            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#195f51] text-xl font-black text-white"
                          >
                            {name.slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-lg font-black">{name}</p>
                            <p className="text-sm text-slate-500">
                              {who
                                ? `Joueur réel · en ligne à ${who.locality ? LOCALITIES[who.locality].name : 'HarooLife'}`
                                : 'Joueur réel · vient de partir'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={offline || blocked}
                          onClick={async () => {
                            const c = realtime.client
                            if (!c) return
                            setPlayerNote('')
                            const r = await c.openDm(playerKey)
                            if ('error' in r) setPlayerNote(r.error)
                            else {
                              setChatRoom(r.room)
                              setPanel('messages')
                            }
                          }}
                          className="block w-full rounded-2xl bg-emerald-600 px-4 py-4 text-base font-black text-white shadow disabled:opacity-50"
                        >
                          💬 Discuter avec {name}
                        </button>
                        <p className="text-xs text-slate-500">
                          {offline
                            ? 'La discussion en direct n’est pas disponible pour le moment.'
                            : blocked
                              ? 'Tu as bloqué ce joueur : vous ne pouvez plus vous écrire.'
                              : 'Conversation privée : vous seuls la lisez. Bloquer la ferme aussitôt, des deux côtés.'}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={offline || blocked}
                            onClick={async () => {
                              const e = await realtime.client?.blockPlayer(playerKey)
                              setPlayerNote(
                                e ?? `${name} est bloqué : vous ne pouvez plus vous écrire.`,
                              )
                            }}
                            className="flex-1 rounded-xl bg-slate-100 px-3 py-3 text-sm font-bold text-slate-800 disabled:opacity-50"
                          >
                            🚫 Bloquer
                          </button>
                          <button
                            type="button"
                            disabled={offline}
                            onClick={async () => {
                              const e = await realtime.client?.reportPlayer(
                                playerKey,
                                'Signalé depuis sa fiche dans la rue',
                              )
                              setPlayerNote(e ?? 'Joueur signalé à l’équipe. Merci.')
                            }}
                            className="flex-1 rounded-xl bg-slate-100 px-3 py-3 text-sm font-bold text-slate-800 disabled:opacity-50"
                          >
                            🚩 Signaler
                          </button>
                        </div>
                        {playerNote && (
                          <output className="block rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                            {playerNote}
                          </output>
                        )}
                      </div>
                    )
                  })()}
                {panel === 'lot' &&
                  selectedLot &&
                  (() => {
                    const lot = selectedLot
                    const here =
                      cityLife.insideLot === lot.id || doorLot?.id === lot.id || door?.id === lot.id
                    const insideHere = cityLife.insideLot === lot.id
                    const room = interiorFor(lot.type)
                    const layout = room ? layoutFor(room) : null
                    const acts = actionsFor(lot.type)
                    const path = here ? null : findPath(cityLife.at, lot.door, roadsOf(cityLife))
                    const cells = path ? path.length - 1 : null
                    const eta = (perCell: number) =>
                      cells === null
                        ? 'hors réseau'
                        : `~ ${Math.max(1, Math.round(cells * perCell))} min`
                    return (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-3xl">
                            {TYPE_ICONS[lot.type]}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xl font-black">
                              {lot.name ?? TYPE_LABELS[lot.type]}
                            </p>
                            <p className="text-xs text-slate-500">
                              📍 {districts().find((d) => d.id === lot.district)?.name},{' '}
                              {cityDef.name} · {TYPE_LABELS[lot.type]}
                              {lot.name && lot.floors > 1 ? ` · ${lot.floors} niveaux` : ''}
                            </p>
                          </div>
                        </div>
                        {acts.length > 0 && (
                          <div className="flex flex-wrap gap-1.5" aria-label="Activités proposées">
                            {acts.map((a) => (
                              <span
                                key={a.id}
                                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800"
                              >
                                {a.label}
                              </span>
                            ))}
                          </div>
                        )}
                        {layout && layout.npcs.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-700">
                              Personnages sur place
                            </p>
                            <div className="flex items-center gap-1">
                              {layout.npcs.slice(0, 5).map((n, i) => (
                                <span
                                  key={n.id}
                                  title={n.role}
                                  className={
                                    'flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[11px] font-black text-white ' +
                                    [
                                      'bg-emerald-600',
                                      'bg-amber-500',
                                      'bg-sky-600',
                                      'bg-rose-500',
                                      'bg-violet-600',
                                    ][i % 5]
                                  }
                                >
                                  {n.role
                                    .replace(/^(Le |La |L’|Un |Une |Coach )/, '')
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </span>
                              ))}
                              <span className="ml-1 text-[11px] text-slate-500">
                                {layout.npcs.length} personnages du jeu (pas de vrais joueurs)
                              </span>
                            </div>
                          </div>
                        )}
                        {insideHere && acts.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-700">Choisir une activité</p>
                            {acts.map((a) => (
                              <button
                                type="button"
                                key={a.id}
                                onClick={() => startActivity(a.id)}
                                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm"
                              >
                                <span className="font-bold">{a.label}</span>
                                <span className="text-xs text-slate-500">{a.hint}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {lot.type === 'cooperative' && actor && (
                          <p className="text-xs text-slate-600">
                            {worldAdapter.organizationsAt(lot, actor.organizations).length > 0
                              ? 'Ici siège : ' +
                                worldAdapter
                                  .organizationsAt(lot, actor.organizations)
                                  .map((o) => o.name)
                                  .join(', ')
                              : 'Aucune de vos organisations ne siège ici.'}
                          </p>
                        )}
                        {here && !insideAny && room && (
                          <ActionButton
                            title={
                              lot.type === 'cooperative' ? 'Entrer dans la coopérative' : 'Entrer'
                            }
                            onClick={() => cityAction('enter')}
                          />
                        )}
                        {insideHere && (
                          <ActionButton
                            title="Sortir"
                            outline
                            onClick={() => cityAction('leave')}
                          />
                        )}
                        {!here && (
                          <div
                            className="grid grid-cols-3 gap-2"
                            role="group"
                            aria-label="Comment y aller"
                          >
                            {(
                              [
                                {
                                  t: 'walk' as const,
                                  icon: '🚶',
                                  label: 'À pied',
                                  price: 'Gratuit',
                                  eta: eta(0.4),
                                },
                                {
                                  t: 'moto' as const,
                                  icon: '🛵',
                                  label: 'Zémidjan',
                                  price: money(TRAVEL_COST.moto),
                                  eta: eta(0.12),
                                },
                                {
                                  t: 'taxi' as const,
                                  icon: '🚕',
                                  label: 'Taxi',
                                  price: money(TRAVEL_COST.taxi),
                                  eta: eta(0.1),
                                },
                              ] as const
                            ).map((o) => (
                              <button
                                type="button"
                                key={o.t}
                                onClick={() => setTripChoice(o.t)}
                                disabled={cells === null || life.wallet < TRAVEL_COST[o.t]}
                                aria-pressed={tripChoice === o.t}
                                className={`flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-3 text-center disabled:opacity-40 ${tripChoice === o.t ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                              >
                                <span className="text-2xl">{o.icon}</span>
                                <span className="text-sm font-bold">{o.label}</span>
                                <span className="text-xs text-slate-600">{o.price}</span>
                                <span className="text-[11px] text-slate-400">{o.eta}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {!here && tripChoice && (
                          <div
                            className="space-y-3 rounded-2xl bg-emerald-50 p-4"
                            aria-label="Confirmer le trajet"
                          >
                            <p className="text-sm font-bold">
                              {tripChoice === 'walk'
                                ? 'À pied'
                                : tripChoice === 'moto'
                                  ? 'Zémidjan'
                                  : 'Taxi'}{' '}
                              vers {lot.name ?? TYPE_LABELS[lot.type]}
                            </p>
                            <p className="text-xs text-slate-600">
                              {TRAVEL_COST[tripChoice] === 0
                                ? 'Trajet gratuit.'
                                : `${money(TRAVEL_COST[tripChoice])} de monnaie de jeu seront déduits au départ.`}
                            </p>
                            <div className="flex gap-2">
                              <ActionButton
                                title="Confirmer le trajet"
                                onClick={() => {
                                  const chosen = tripChoice
                                  setTripChoice(null)
                                  if (chosen === 'walk') goLot(lot)
                                  else rideTo(lot, chosen)
                                }}
                              />
                              <ActionButton
                                title="Annuler"
                                outline
                                onClick={() => setTripChoice(null)}
                              />
                            </div>
                          </div>
                        )}
                        <p className="text-[11px] text-slate-500">
                          {cityLife.visited.includes(lot.id) ? 'Déjà visité.' : 'Jamais visité.'}{' '}
                          Condition physique : {cityLife.fitness}/100.
                        </p>
                      </>
                    )
                  })()}
                {panel === 'market' && <MarketPanel actor={actor} />}
                {panel === 'cooperative' &&
                  (coopOrg ? (
                    <CooperativePanel
                      org={coopOrg}
                      actor={actor}
                      onPickOrg={setCoopOrg}
                      engine={engine}
                    />
                  ) : actor ? (
                    <p className="text-sm text-slate-600">
                      Votre compte n’est rattaché à aucune coopérative. Rapprochez-vous de votre
                      organisation pour être enregistré comme membre.
                    </p>
                  ) : (
                    <p className="text-sm text-slate-600">
                      <Link
                        href="/auth/login?redirect=%2Fharoolife"
                        className="font-bold text-emerald-700 underline"
                      >
                        Connectez-vous
                      </Link>{' '}
                      pour retrouver votre coopérative, ses membres et ses regroupements.
                    </p>
                  ))}
                {panel === 'ad' && adFocus && (
                  <>
                    <div
                      data-testid="ad-focus"
                      className="relative overflow-hidden rounded-2xl p-5"
                      style={{
                        background: adFocus.campaign.creative.palette[0],
                        color: adFocus.campaign.creative.palette[1],
                      }}
                    >
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-2"
                        style={{ background: adFocus.campaign.creative.palette[2] }}
                      />
                      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                        {adFocus.campaign.advertiser.name}
                        {isSponsored(adFocus.campaign) ? ' · Promotion' : ''}
                      </p>
                      <p className="mt-2 text-xl font-black">{adFocus.campaign.creative.title}</p>
                      <p className="mt-1 text-sm opacity-90">{adFocus.campaign.creative.body}</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {adFocus.placement.label}.{' '}
                      {isSponsored(adFocus.campaign)
                        ? 'Contenu sponsorisé, validé par l’équipe FaîtiereHub.'
                        : 'Information sur un service FaîtiereHub (pas une publicité payée).'}{' '}
                      Le lien s’ouvre dans un nouvel onglet ; ta partie reste ouverte.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        data-testid="ad-learn-more"
                        onClick={learnMore}
                        className="min-h-12 rounded-2xl bg-emerald-600 px-4 text-sm font-bold text-white"
                      >
                        {adFocus.campaign.creative.cta}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPanel(null)}
                        className="min-h-12 rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-800"
                      >
                        Retour au jeu
                      </button>
                    </div>
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
                {panel === 'avatar' && (
                  <>
                    <p className="text-sm text-slate-600">
                      {firstRun
                        ? 'Choisis qui tu es dans Lomé : le même personnage te suit dans la rue, dans les bâtiments et au volant. Tu pourras changer depuis le téléphone.'
                        : 'Le même personnage te suit dans la rue, dans les bâtiments et au volant. Personnages Quaternius et Kenney (CC0) ; ton choix reste sur cet appareil.'}
                    </p>
                    <AvatarPreview model={shownModel(avatar)} pagne={pagneColor(avatar.pagne)} />
                    <div
                      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                      role="group"
                      aria-label="Choisir mon personnage"
                    >
                      {AVATAR_MODELS.filter((m) => m.family === 'quaternius').map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          aria-pressed={shownModel(avatar) === m.id}
                          onClick={() => chooseAvatar({ model: m.id, classic: undefined })}
                          className={
                            'rounded-2xl border p-3 text-left ' +
                            (shownModel(avatar) === m.id
                              ? 'border-emerald-600 bg-emerald-50'
                              : 'border-slate-200 bg-white')
                          }
                        >
                          <span className="block text-sm font-black">{m.label}</span>
                          <span className="block text-[11px] text-slate-500">{m.hint}</span>
                        </button>
                      ))}
                    </div>
                    <details className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                        Personnages classiques (mini)
                      </summary>
                      <div
                        className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"
                        role="group"
                        aria-label="Choisir un personnage classique"
                      >
                        {AVATAR_MODELS.filter((m) => m.family === 'kenney-mini').map((m) => (
                          <button
                            type="button"
                            key={m.id}
                            aria-pressed={shownModel(avatar) === m.id}
                            onClick={() => chooseAvatar({ model: m.id, classic: true })}
                            className={
                              'rounded-2xl border p-3 text-left ' +
                              (shownModel(avatar) === m.id
                                ? 'border-emerald-600 bg-emerald-50'
                                : 'border-slate-200 bg-white')
                            }
                          >
                            <span className="block text-sm font-black">{m.label}</span>
                            <span className="block text-[11px] text-slate-500">{m.hint}</span>
                          </button>
                        ))}
                      </div>
                    </details>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-black">Mon pagne</legend>
                      <div className="flex flex-wrap gap-2">
                        {PAGNES.map((tone, i) => (
                          <button
                            key={tone}
                            type="button"
                            aria-label={`Pagne ${i + 1}`}
                            aria-pressed={avatar.pagne === i + 1}
                            onClick={() => chooseAvatar({ pagne: i + 1 })}
                            style={{
                              background: `repeating-linear-gradient(135deg, ${tone} 0 6px, ${tone}cc 6px 10px)`,
                            }}
                            className={`h-10 w-10 rounded-full ${avatar.pagne === i + 1 ? 'ring-4 ring-slate-900' : 'ring-2 ring-white'}`}
                          />
                        ))}
                      </div>
                    </fieldset>
                    <p className="text-[11px] text-slate-500">
                      Animations : marche, course, geste d’interaction et salut. Les personnages
                      adultes n’ont pas encore de clip assis ni de conduite : ils gardent une pose
                      debout à côté du meuble ou du véhicule.
                    </p>
                    {firstRun && (
                      <button
                        type="button"
                        onClick={confirmAvatar}
                        className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#218b70] text-base font-black text-white"
                      >
                        Commencer
                      </button>
                    )}
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
                    <button
                      type="button"
                      onClick={() => open('avatar')}
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-800"
                    >
                      Mon apparence :{' '}
                      {AVATAR_MODELS.find((m) => m.id === shownModel(avatar))?.label}, pagne{' '}
                      {avatar.pagne}
                    </button>
                    {presence.status === 'ready' && (
                      <button
                        type="button"
                        onClick={() => open('residence')}
                        className="w-full rounded-xl border border-emerald-200 p-3 text-sm font-semibold text-emerald-800"
                      >
                        {presence.world?.me.home
                          ? `Ma résidence : ${presence.world.me.home.canton}`
                          : 'Choisir ma résidence au Togo'}
                      </button>
                    )}
                    <nav
                      aria-label="Mes services FaîtiereHub"
                      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600"
                    >
                      <Link href="/dashboard">Mon tableau de bord</Link>
                      <Link href="/haroo">Mon espace Haroo</Link>
                      <Link href="/marche">Le marché</Link>
                    </nav>
                  </>
                )}
                <p className="pt-1 text-center text-[10px] text-slate-500">
                  {panel === 'messages' && realtime.state.status === 'online'
                    ? 'Discussion entre vrais comptes HarooLife : messages enregistrés, signalables et modérés'
                    : 'HarooLife · Mode fictif, hors paiements et comptes réels'}
                </p>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
      {panel === 'residence' && presence.world && (
        <HomeDialog
          world={presence.world}
          defaultName={actor?.displayName || 'Habitant'}
          onDone={() => {
            setPanel(null)
            setNotice('Votre maison est installée dans votre canton.')
            void presence.reload()
          }}
          onClose={() => setPanel(null)}
        />
      )}
    </main>
  )
}
