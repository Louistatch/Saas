'use client'

import './game-interface.css'
import PedestrianStop from './pedestrian-stop'
import { WORLD_W, WORLD_H } from '@/lib/haroolife/city/world'
import { PavementGraph, guidedCellRoute, onPavement } from '@/lib/haroolife/city/pedestrians'
import { municipalPending, municipalRepairDone, municipalStatus, reportMunicipalSignal, pedestrianTicket, type PedestrianReason } from '@/lib/haroolife/city/street-civic'
import { callAmbulance, cancelAmbulance, emergencyEvent, emergencyOf, type EmergencyEvent } from '@/lib/haroolife/city/emergency'
import { EmergencyOverlay, PublicServices } from './public-services'

import { useHarooLifeViewport } from '@/hooks/use-haroolife-viewport'
import GraphicsBoundary from './graphics-boundary'
import { EmploymentPanel, AviationPanel, OnlinePlayers } from './regional-services'
import { advanceHourlyShift } from '@/lib/haroolife/city/employment'
import { careerWorkStatus, careerWorkplace, workCareer } from '@/lib/haroolife/city/careers'
import { airTrip, atAirport, takeFlight } from '@/lib/haroolife/city/aviation'

import {
  type AdCampaign,
  type AdPlacement,
  INTERNAL_CAMPAIGNS,
  isAdFace,
  isSponsored,
  safeHref,
} from '@/lib/haroolife/ads/campaigns'
import { ExposureTracker } from '@/lib/haroolife/ads/exposure'
import { livePosts } from '@/lib/haroolife/ads/board-client'
import { type BoardPost, RENT_OPTIONS, postFace } from '@/lib/haroolife/ads/rental'
import BoardSheet from './board-sheet'
import ResidentConversation from './resident-conversation'
import GameMarket from './game-market'
import { FurnitureShop, useHomeFurnishing } from './home-furnishing'
import VehicleShop from './vehicle-shop'
import { GOODS, buyEstateMeal } from '@/lib/haroolife/city/commerce'
import { type MealItem, advanceMeal, beginMeal, cancelMeal, mealPlace, readyMeal } from '@/lib/haroolife/city/dining'
import DailyActionHud from './daily-action-hud'
import {
  VEHICLE_RULES,
  GAME_FUEL_PER_LITRE,
  FUEL_REFERENCE,
  vehicleCare,
  nextVehicleStop,
  settleVehicleFare,
  finishVehicleStop,
  manualVehicleQuote,
} from '@/lib/haroolife/city/vehicle-economy'
import {
  AutomaticDrivingService,
  type ServiceCustomer,
} from '@/lib/haroolife/city/automatic-service'
import {
  AVATAR_CHOSEN_STORAGE,
  AVATAR_MODELS,
  AVATAR_STORAGE,
  type Avatar,
  DEFAULT_AVATAR,
  loadAvatar,
  decodeAvatar,
  pagneColor,
  saveAvatar,
  shownModel,
} from '@/lib/haroolife/city/avatar'
import {
  companiesBetween,
  type Stop,
  coachTrip,
  companyById,
  hh,
  routeOf,
} from '@/lib/haroolife/city/coaches'
import {
  CAMERA_MODE_STORAGE,
  STREET_CAMERA_MODES,
  type StreetCameraMode,
  isStreetCameraMode,
  nextStreetCameraMode,
} from '@/lib/haroolife/city/camera-modes'
import { bearingTo, canDrop, remaining } from '@/lib/haroolife/city/fares'
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
  finishGuidedWalk,
  goToEstate,
  goToLot,
  goToPoint,
  initialCityLife,
  interiorFor,
  lotAtDoor,
  moveTo,
  pathToLot,
  payRide,
  roadsOf,
  stopActivity,
  travelTo,
  tripTo,
  useProp,
} from '@/lib/haroolife/city/life'
import { LOCALITIES, LOCALITY_IDS, type LocalityId } from '@/lib/haroolife/city/locality'
import { CITY_STORAGE, loadCityLife } from '@/lib/haroolife/city/migrate'
import { ESTATE_GATE } from '@/lib/haroolife/city/navigation'
import { bump } from '@/lib/haroolife/city/perf'
import { FOLLOW_DISTANCE, type InputState, PlayerController } from '@/lib/haroolife/city/player'
import { serviceVehiclePlacement } from '@/lib/haroolife/city/jobs'
import { garageOf, ownVehicle, vehicleOut } from '@/lib/haroolife/city/garage'
import { isStudent } from '@/lib/haroolife/city/street-talk'
import {
  PRESETS,
  type Quality,
  QualityGovernor,
  detectQuality,
  lowerQuality,
  rememberQuality,
  renderPixelRatio,
  softwareRenderer,
} from '@/lib/haroolife/city/quality'
import {
  CATEGORY_LABELS,
  CATEGORY_OF,
  type Category,
  type Lot,
  lotIcon,
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
import { claimMoney, sendMoney } from '@/lib/haroolife/money'
import { debateOfDay, jokeAt, jokeMessage, voteMessage } from '@/lib/haroolife/humour'
import { messeAnnouncement, weekOf } from '@/lib/haroolife/togo-buzz'
import TogoBuzzCards from './togo-buzz-cards'
import { settleTontine } from '@/lib/haroolife/city/tontine'
import { uuid } from '@/lib/haroolife/realtime/client'
import { type RemoteVehicle, ridePose, vehicleMode } from '@/lib/haroolife/realtime/interpolate'
import {
  type Action,
  type Career,
  LIFE_LOCATIONS,
  type LifeState,
  NEED_KEYS,
  SALARIES,
  TRANSPORT_LABEL,
  TRAVEL_COST,
  type Transport,
  sotralFare,
  advanceLifeHour,
  buildInLome,
  buildNearPlayer,
  demolishInLome,
  enterBuilding,
  initialLomeLife,
  interact,
  jobVenue,
  prepareForWork,
  selectCity,
  selectJob,
  waitForNextWorkShift,
} from '@/lib/haroolife/lome-life-engine'
import { placeResidents, residentsAt } from '@/lib/haroolife/lome-presence'
import { BILLBOARDS, PARTNER_APPS, billboardById } from '@/lib/haroolife/lome-sponsors'
import { STREET_VENDORS, TOGO_JOBS, TOGO_JOB_IDS } from '@/lib/haroolife/togo-social-life'
import { type BuildType, CATALOG } from '@/lib/haroolife/townsmen-engine'
import { ROLE_LABELS } from '@/lib/haroolife/world'
import {
  ArrowRight,
  Bell,
  Camera,
  Check,
  Clock3,
  Hammer,
  Home,
  Map as MapIcon,
  MapPin,
  Moon,
  Pause,
  Phone,
  Play,
  Plus,
  Send,
  ShoppingBag,
  Sun,
  UserRound,
  Users,
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
import OnboardingSteps from './city/onboarding'
import TravelSplash from './city/travel-splash'
import HarooCabinView from './game/haroo-cabin-view'
import LiveChat from './live-chat'
import { PAGNES } from './pagnes'
import FarmPanel from './farm-panel'
import InvitePanel from './invite-panel'
import PayBubbles, { usePayBubbles } from './pay-bubbles'
import PhotoPanel from './photo-panel'
import PlayersDirectory from './players-directory'
import HousingPanel from './housing-panel'
import {
  housingOf,
  moveTo as moveHome,
  payBill,
  quartierById,
  receiveGuest,
  settleHousing,
} from '@/lib/haroolife/city/housing'
import { plotLabel, settleBuild } from '@/lib/haroolife/city/homebuild'
import Timetable from './timetable'
import { CROPS, fieldStatus, ripeSaid, settleStore } from '@/lib/haroolife/city/farm'
import { alertIfAway } from '@/lib/haroolife/local-alert'
import { PhoneDevice } from './phone-device'
import { HomeDialog } from './residence-dialog'
import { sayOnPlace, usePresence } from './use-presence'
import { usePlayersOnline } from './use-players-online'
import { useCloudSave } from './use-cloud-save'
import { useInvites } from './use-invites'
import { useRealtime } from './use-realtime'

const CityWorld = dynamic(() => import('./city/city-world'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#9bbd9d] text-sm font-bold text-white">
      Chargement du monde 3D…
    </div>
  ),
})
import RideOverlay from './ride-overlay'
// Animated preview of the chosen character (three.js), loaded only when the sheet opens.
const AvatarPreview = dynamic(() => import('./avatar-preview'), { ssr: false })
type Sheet =
  | 'services'
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
  | 'debates'
  | 'farm'
  | 'online'
  | 'invite'
  | 'photo'
  | 'housing'
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
/** How long a ride lasts on the boulevard: a few seconds, longer for a longer route. */
const rideMs = (cells: number) => 4000 + Math.min(6000, 120 * cells)
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
const JOBS: Career[] = TOGO_JOB_IDS
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
    <span className="hl-need-track block h-[7px] w-full overflow-hidden rounded-full bg-slate-200/80">
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

export function LomeLifeImmersive({ onExit }: { onExit?: () => void } = {}) {
  const screenRef = useHarooLifeViewport<HTMLElement>()
  bump('immersive')
  const [cityLife, setCityLife] = useState<CityLife>(initialCityLife)
  // The generators read one locality at a time: the save's town, applied before any lookup.
  ensureLocality(cityLife)
  const life = cityLife.life
  const currentWorkStatus = careerWorkStatus(cityLife)
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
  // Keep the device’s remembered renderer choice; furnished rooms share the Haroo controller.
  const [renderer, setRenderer] = useState<RendererId>(DEFAULT_RENDERER)
  useEffect(() => setRenderer(currentRenderer()), [])
  const controller = useMemo(() => {
    const c = new PlayerController(
      {
        walkable: (x, y) =>
          freelyWalkable(x, y, estateRoadsRef.current, cityLifeRef.current.life.city.buildings),
        drivable: (x, y) => isCityRoad(x, y) || isDriveway(x, y),
        pavement: (x, z) => onPavement({ x, z }, (cx, cz) => isCityRoad(cx, cz) || isDriveway(cx, cz)),
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
  const [waitingAtSignal, setWaitingAtSignal] = useState(false)
  useEffect(() => {
    const id = window.setInterval(() => setWaitingAtSignal(controller.waitingForSignal), 250)
    return () => window.clearInterval(id)
  }, [controller])
  const [policeStop, setPoliceStop] = useState<PedestrianReason | null>(null)
  const lastGuidedRoute = useRef<CityLife['route'] | null>(null)
  useEffect(() => {
    controller.pavements = new PavementGraph((x, z) => isCityRoad(x, z) || isDriveway(x, z), WORLD_W, WORLD_H)
    controller.policeStopped = false
    setPoliceStop(null)
  }, [cityLife.locality, controller])
  useEffect(() => { controller.repairedSignals = municipalRepairDone(cityLife) }, [cityLife, controller])
  const [nearVehicle, setNearVehicle] = useState(false)
  const [driving, setDriving] = useState(false)
  // Driver's job: the passer-by hailing, the fare on board and its live progress.
  const automaticService = useMemo(
    () =>
      new AutomaticDrivingService(controller, {
        drivable: (x, y) => isCityRoad(x, y) || isDriveway(x, y),
        places: landmarks,
        random: Math.random,
        nextStop: (kind) => nextVehicleStop(cityLifeRef.current, kind),
      }),
    [controller],
  )
  const [serviceState, setServiceState] = useState(() => automaticService.snapshot())
  const fare = serviceState.fare
  const hail = serviceState.customer?.name ?? null
  const [fareLive, setFareLive] = useState<{ left: number; can: boolean; arrow: number }>({
    left: 0,
    can: false,
    arrow: 0,
  })
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
      const a = decodeAvatar({ ...cur, ...next }) ?? DEFAULT_AVATAR
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
  const [cameraMode, setCameraMode] = useState<StreetCameraMode>('follow')
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
  useEffect(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(CAMERA_MODE_STORAGE)
    } catch {
      /* storage can be blocked; the normal follow camera remains available */
    }
    const mode = isStreetCameraMode(saved) ? saved : 'follow'
    setCameraMode(mode)
    controller.camera.distance = STREET_CAMERA_MODES[mode].distance
  }, [controller])
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
  const emergencyActive = !!emergencyOf(cityLife).active
  const municipalClock = municipalPending(cityLife)
  const publicServices = useMemo(() => ({
    emergency: emergencyOf(cityLife).active,
    worksite: municipalPending(cityLife) ? cityLife.civic?.projects?.[cityLife.locality]?.site ?? null : null,
  }), [cityLife.emergency, cityLife.civic, cityLife.locality, cityLife.life.day, cityLife.life.hour])
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
  // Game money to another player: amount, a word, and one clientId per attempt (never paid twice).
  const [gift, setGift] = useState({ amount: '1000', note: '', busy: false })
  const giftClient = useRef<string | null>(null)
  const [chatRoom, setChatRoom] = useState<string | null>(null)
  // Debates and humour: the same debate and first joke for everyone on a calendar day.
  const today = Math.floor(Date.now() / 86_400_000)
  const [jokeN, setJokeN] = useState(today)
  const [debateNote, setDebateNote] = useState('')
  // A conversation with a passer-by of the game (never stored, never sent anywhere).
  // The journey between two towns, shown full screen while the arrival town loads.
  const [journey, setJourney] = useState<{
    from: LocalityId
    to: LocalityId
    hours: number
    company?: string
    stops?: Stop[]
    mode?: 'air'
  } | null>(null)
  // Destination whose coach companies are being compared in the map sheet.
  const [coachTo, setCoachTo] = useState<LocalityId | null>(null)
  const [cabinReady, setCabinReady] = useState(false)
  const endJourney = useCallback(() => {
    setJourney(null)
    setCabinReady(false)
  }, [])
  // A flight booked away from the airport: the player is driven to the terminal, then boards.
  const [pendingFlight, setPendingFlight] = useState<LocalityId | null>(null)
  const [mode, setMode] = useState<Mode>('walk')
  const [building, setBuilding] = useState<BuildType>('house')
  const [, setSelection] = useState<{ x: number; y: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [transport, setTransport] = useState<Transport>('walk')
  const [tripChoice, setTripChoice] = useState<Transport | null>(null)
  useEffect(() => setTripChoice(null), [selectedLot?.id, panel])
  const [riding, setRiding] = useState(false)
  const rideTrack = useRef<{
    start: { x: number; y: number }
    route: { x: number; y: number }[]
    since: number
    seconds: number
    vehicle: RemoteVehicle
  } | null>(null)
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
  // « Aménager » : the furniture of the player's own house and the piece being placed.
  const [shopTab, setShopTab] = useState<'meubles' | 'vehicules' | 'marche'>('marche')
  const furnishing = useHomeFurnishing({
    state: cityLife,
    onChange: setCityLife,
    inHouse: life.inside === 'house' && !cityLife.insideLot,
    onNotice: setNotice,
    closePanel: () => setPanel(null),
  })
  // The game saved online (another phone, a cleared browser), the wallet capped by the server.
  const cloud = useCloudSave({
    loaded,
    cityLife,
    adopt: (world) => {
      setCityLife(world)
      if (world.at.x !== cityLifeRef.current.at.x || world.at.y !== cityLifeRef.current.at.y)
        setCamera(CAMERA_HOME(world.at.x, world.at.y))
    },
    notify: setNotice,
  })
  // Invitations: a friend's bonus on arrival, the bonuses of the friends this player brought.
  const invites = useInvites({
    loaded,
    credit: (amount, line) => {
      setCityLife((old) => ({
        ...old,
        life: {
          ...old.life,
          wallet: old.life.wallet + amount,
          earned: old.life.earned + amount,
          lastEvent: line,
          events: [line, ...old.life.events].slice(0, 8),
        },
      }))
      setNotice(line)
    },
  })
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
  // Supports rented by players (shown first on their support), refreshed every minute.
  const [boardPosts, setBoardPosts] = useState<BoardPost[]>([])
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
    panel === 'services' ? 'Services publics'
    : panel === 'online'
      ? 'Joueurs en ligne'
      : panel === 'home'
        ? 'Mon foyer'
        : panel === 'shop'
          ? shopTab === 'marche'
            ? 'Marché & commerces'
            : 'Aménager'
          : panel === 'map'
            ? `Explorer ${LOCALITIES[cityLife.locality].name}`
            : panel === 'phone'
              ? 'Mon téléphone'
              : panel === 'build'
                ? 'Construire'
                : panel === 'jobs'
                  ? 'Travailler & gagner'
                  : panel === 'debates'
                    ? 'Débats & blagues'
                    : panel === 'farm'
                      ? 'Mon champ'
                      : panel === 'invite'
                        ? 'Inviter des amis'
                        : panel === 'photo'
                          ? 'Photo du jeu'
                          : panel === 'housing'
                            ? 'Mon logement'
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
                                        ? adFocus?.campaign.advertiser.kind === 'vacant'
                                          ? 'Panneau à louer'
                                          : adFocus?.campaign.advertiser.kind === 'player'
                                            ? 'Annonce d’un joueur'
                                            : adFocus && isSponsored(adFocus.campaign)
                                              ? 'Promotion'
                                              : 'Information FaîtiereHub'
                                        : panel === 'lot'
                                          ? 'Lieu'
                                          : panel === 'cooperative'
                                            ? 'Coopérative'
                                            : panel === 'avatar'
                                              ? 'Mon apparence'
                                              : panel === 'player'
                                                ? playerKey?.startsWith('npc:')
                                                  ? 'Habitant'
                                                  : 'Joueur'
                                                : panel === 'market'
                                                  ? 'Marché'
                                                  : ''
  const needs = life.needs
  const wellbeing = Math.round(NEED_KEYS.reduce((sum, k) => sum + needs[k], 0) / NEED_KEYS.length)
  const pending = eventById(life.pendingEvent)
  // Live discussions and other players (Socket.IO relay), when configured; see use-realtime.
  const realtime = useRealtime()
  const presence = usePresence(realtime.state.status === 'online' ? 300_000 : 60_000)
  // Diagnostic panel for real-phone testing (?diag=1 or the phone settings).
  const [diag, setDiag] = useState(false)
  useEffect(() => setDiag(initialDiag()), [])
  const unreadTotal = Object.values(realtime.state.unread).reduce((a, b) => a + b, 0)
  const online = realtime.state.status === 'online'
  // Everyone with the game open, all towns (database heartbeat, independent of the relay).
  const gamePlayers = usePlayersOnline(cityLife.locality, loaded)
  // Slow presence: which locality the player is in (re-sent by the client after reconnection).
  useEffect(() => {
    if (online && realtime.client) void realtime.client.join(cityLife.locality)
  }, [online, realtime.client, cityLife.locality])
  // Movement snapshots at 5 Hz, only when the avatar moved (or every 2 s to stay visible).
  useEffect(() => {
    const client = realtime.client
    if (!online || !client || insideAny) return
    let n = 0
    let last = { x: Number.NaN, z: Number.NaN, at: 0 }
    const id = window.setInterval(() => {
      // A passenger is seen in the ride's vehicle, along its route; a driver, in their own.
      const ride = rideTrack.current
      const along = ride
        ? ridePose(ride.start, ride.route, (performance.now() - ride.since) / 1000, ride.seconds)
        : null
      const p =
        along ?? (controller.driving && controller.vehicle ? controller.vehicle : controller.pos)
      const now = performance.now()
      if (Math.hypot(p.x - last.x, p.z - last.z) < 0.03 && now - last.at < 2000) return
      last = { x: p.x, z: p.z, at: now }
      n++
      client.pose({
        x: Math.round(p.x * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        heading: Math.round(
          along
            ? along.heading
            : controller.driving && controller.vehicle
              ? controller.vehicle.heading
              : controller.heading,
        ),
        mode:
          emergencyOf(cityLifeRef.current).active?.phase === 'transport' ? vehicleMode('ride', 'ems')
          : along && ride
            ? vehicleMode('ride', ride.vehicle)
            : controller.driving
              ? vehicleMode('drive', cityLifeRef.current.duty === 'moto' ? 'moto' : 'taxi')
              : controller.mode,
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
  // Sunday evening: the game says once a week that the Cardinal is about to speak (la messe).
  useEffect(() => {
    if (!loaded) return
    const tell = () => {
      const line = messeAnnouncement(Date.now())
      if (!line) return
      const week = String(weekOf(Date.now()))
      try {
        if (localStorage.getItem('haroolife.messe.v1') === week) return
        localStorage.setItem('haroolife.messe.v1', week)
      } catch {
        return
      }
      setCityLife((old) => ({
        ...old,
        life: { ...old.life, lastEvent: line, events: [line, ...old.life.events].slice(0, 8) },
      }))
    }
    tell()
    const id = window.setInterval(tell, 60_000)
    return () => window.clearInterval(id)
  }, [loaded])
  useEffect(() => {
    if (!adsEnabled) return
    let stop = false
    const locality = cityLife.locality === 'kara' ? 'kara' : 'lome'
    const load = () =>
      void livePosts(locality).then((posts) => {
        if (!stop && posts) setBoardPosts(posts)
      })
    load()
    const id = window.setInterval(load, 60_000)
    return () => {
      stop = true
      window.clearInterval(id)
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
  // A billboard touched in the street, near or far: its sheet (read it, rent it, report it).
  const onTapAd = useCallback((p: { placement: AdPlacement; campaign: AdCampaign }) => {
    setAdFocus(p)
    setPanel('ad')
  }, [])
  const adsProp = useMemo(
    () =>
      adsEnabled && adTracker.current
        ? {
            campaigns: adCampaigns,
            posts: boardPosts,
            tracker: adTracker.current,
            onNear: onNearAd,
            onTap: onTapAd,
          }
        : undefined,
    [adsEnabled, adCampaigns, boardPosts, onNearAd, onTapAd],
  )
  function boardRented(post: BoardPost, price: number, duplicate: boolean) {
    setBoardPosts((old) => [...old.filter((p) => p.id !== post.id), post])
    if (adFocus) setAdFocus({ placement: adFocus.placement, campaign: postFace(post) })
    if (duplicate) return
    const days = RENT_OPTIONS.find((o) => o.price === price)?.label ?? ''
    const line = `Tu as loué le panneau « ${adFocus?.placement.label ?? post.placement} » pour ${days} : ${money(price)}. Tout le quartier le voit.`
    setCityLife((old) => ({
      ...old,
      life: {
        ...old.life,
        wallet: Math.max(0, old.life.wallet - price),
        lastEvent: line,
        events: [line, ...old.life.events].slice(0, 8),
      },
    }))
  }
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
  // At the wheel on a shift: the street stays visible, money moves show as brief bubbles.
  const onDuty = driving && !!cityLife.duty
  const dutyCare = cityLife.duty ? vehicleCare(cityLife, cityLife.duty) : null
  const payBubbles = usePayBubbles(life.wallet, onDuty, dutyCare?.lastReceipt, life.lastEvent)
  const [dutyOpen, setDutyOpen] = useState(false)
  const status =
    driving && cityLife.duty
      ? serviceState.stop
        ? `${serviceState.phase === 'servicing' ? 'En cours' : 'Arrêt automatique'} : ${serviceState.stop.name}.`
        : fare
          ? `Trajet automatique vers ${fare.to.name} · ${money(fare.price)} à l’arrivée.`
          : serviceState.phase === 'pickup'
            ? `Le véhicule rejoint ${hail} automatiquement.`
            : serviceState.phase === 'paid'
              ? `Course payée · recettes brutes du service : ${money(serviceState.earned)}.`
              : 'Recherche automatique du prochain client…'
      : cityLife.route.length
        ? 'En chemin vers ' + destinationName + '…'
        : cityLife.insideLot
          ? 'À l’intérieur : ' +
            (lotById(cityLife.insideLot)?.name ??
              TYPE_LABELS[lotById(cityLife.insideLot)?.type ?? 'lot'])
          : life.inside
            ? 'À l’intérieur : ' + (VENUE_LABELS[life.inside] ?? life.inside)
            : life.lastEvent
  // Each objective carries the action that achieves it, run from the objectives sheet.
  const inLome = LOCALITIES[cityLife.locality].estate !== null
  const missions = [
    {
      done: (cityLife.commerce?.boughtMeals ?? (life.spent >= 650 ? 1 : 0)) > 0,
      text: 'Acheter un repas dans un commerce',
      go: inLome ? 'Aller au marché' : 'Voir la carte',
      run: () => (inLome ? go(12, 11) : open('map')),
    },
    {
      done: life.earned > 0,
      text: 'Effectuer une journée de travail',
      go:
        currentWorkStatus === 'ready'
          ? 'Travailler'
          : currentWorkStatus === 'closed'
            ? 'Attendre 7 h'
            : currentWorkStatus === 'tired' || currentWorkStatus === 'hungry'
              ? 'Se préparer'
              : 'Y aller',
      run: () => workNextStep().run(),
    },
    {
      done: life.city.buildings.length > initialLomeLife().city.buildings.length,
      text: 'Construire un nouveau bâtiment',
      go: 'Construire',
      run: () => open('build'),
    },
  ]
  const completion = missions.filter((m) => m.done).length
  // The home: each new game day brings the month's rent and bills, and the landlord's steps;
  // each new week, the tontine's share for a « bébé tontine »; the granary's losses; the work
  // on the player's own house.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per game day
  useEffect(() => {
    setCityLife((old) => settleBuild(settleStore(settleTontine(settleHousing(old)))))
  }, [life.day])
  // « Mon champ » is ripe: said in the game, and on the phone when the player is in another app.
  const ripe = fieldStatus(cityLife)
  const ripeCrop = ripe.kind === 'ready' ? ripe.field.crop : null
  const wasRipe = useRef(ripeCrop)
  useEffect(() => {
    const before = wasRipe.current
    wasRipe.current = ripeCrop
    if (!ripeCrop || before) return
    const c = CROPS[ripeCrop]
    const msg = `${c.icon} ${ripeSaid(ripeCrop)}`
    say(msg)
    void alertIfAway('Ton champ est mûr', msg, 'haroolife.farm')
  }, [ripeCrop])

  useEffect(() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2')
      setWebgl(Boolean(gl))
      // This context is only a probe. Free it before the real engine creates its own.
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      setWebgl(false)
    }
    // Graphics availability must never prevent loading the saved game or reset its wallet.
    try {
      const loaded = loadCityLife(localStorage)
      if (loaded.source !== 'fresh' || loaded.importedBuilder) {
        setCityLife(loaded.world)
        setCamera(CAMERA_HOME(loaded.world.at.x, loaded.world.at.y))
      }
      if (loaded.importedBuilder) setNotice('Vos constructions HarooVille sont sur le domaine.')
    } catch {
      setNotice('La sauvegarde locale n’a pas pu être lue sur cet appareil.')
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
    const layout = room
      ? layoutFor(
          room,
          cityLife.insideLot ? (lotById(cityLife.insideLot) ?? undefined) : undefined,
          life,
        )
      : null
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
      meal: cityLife.meal,
      fitness: cityLife.fitness,
      energy: life.needs.energy,
      hour: life.hour,
      actor: actor ? { id: actor.id, organizations: actor.organizations.length } : null,
      myCoopLot: myCoopLot?.id ?? null,
      camera,
      riding,
      transport,
      panel,
      commerce: cityLife.commerce,
      fleet: cityLife.fleet,
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
  useEffect(() => {
    const lot = cityLife.insideLot ? lotById(cityLife.insideLot) : null
    if (!lot || (!lot.employer && !/aéroport/i.test(lot.name ?? ''))) return
    setSelectedLot(lot)
    setPanel(lot.employer ? 'jobs' : 'lot')
  }, [cityLife.insideLot])
  // An activity animation lasts a few seconds, then the player stands idle again. Sitting,
  // eating and sleeping last until the player moves; washing and the toilet take a while.
  useEffect(() => {
    if (!cityLife.activity || cityLife.meal || ['sit', 'eat-seated', 'eat', 'sleep'].includes(cityLife.activity.anim)) return
    const seconds = cityLife.activity.prop === 'tv' ? 12 : ['shower', 'toilet'].includes(cityLife.activity.anim) ? 9 : 3.2
    const id = window.setTimeout(() => setCityLife((old) => stopActivity(old)), seconds * 1000)
    return () => window.clearTimeout(id)
  }, [cityLife.activity, cityLife.meal])
  useEffect(() => {
    if (cityLife.meal && cityLife.meal.place !== mealPlace(cityLife)) setCityLife(old => ({ ...cancelMeal(old), activity: null }))
  }, [cityLife.meal, cityLife.locality, cityLife.insideLot, life.inside])
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
    if (lastGuidedRoute.current === cityLife.route) return
    lastGuidedRoute.current = cityLife.route
    const cells = cityLife.route.map((c) => ({ x: c.x, z: c.y }))
    if (!cells.length || riding || controller.driving) { controller.route = cells; return }
    const path = controller.pavements ? guidedCellRoute(controller.pavements, controller.pos, cells) : null
    if (path) controller.route = path
    else {
      controller.route = []
      setCityLife(old => ({ ...old, route: [] }))
      setNotice('Aucun chemin piéton sûr vers ce point. Choisis une entrée reliée au trottoir.')
    }
  }, [cityLife.route, controller, riding])
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
    controller.setTravelling(riding || emergencyActive)
  }, [riding, emergencyActive, controller])
  useEffect(() => {
    const v = cityLife.locality === (cityLife.vehicleLocality ?? 'lome') ? cityLife.vehicle : null
    if (v) {
      if (!controller.vehicle) controller.vehicle = { x: v.x, z: v.z, heading: v.heading, speed: 0 }
      else if (!controller.driving)
        Object.assign(controller.vehicle, { x: v.x, z: v.z, heading: v.heading, speed: 0 })
    } else {
      controller.vehicle = null
      controller.driving = false
      setDriving(false)
    }
    setNearVehicle(!insideAny && controller.canEnterVehicle())
  }, [cityLife.vehicle, cityLife.locality, cityLife.vehicleLocality, insideAny, controller])
  // Boarding uses the continuous pose, including loading a save or moving within one cell.
  useEffect(() => {
    const check = () => setNearVehicle(!insideAny && controller.canEnterVehicle())
    check()
    const id = window.setInterval(check, 140)
    return () => window.clearInterval(id)
  }, [insideAny, controller])
  // A first visit to Lomé parks the player's taxi on the avenue by the estate gate.
  useEffect(() => {
    if (!loaded || cityLife.vehicle !== undefined) return
    setCityLife((old) => ({
      ...old,
      vehicle: { x: ESTATE_GATE.x, z: ESTATE_GATE.y + 3, heading: 0 },
      vehicleLocality: 'lome',
    }))
  }, [loaded, cityLife.vehicle])
  const onPlayerEvents = useCallback(
    (events: ReturnType<PlayerController['drain']>, c: PlayerController) => {
      const guided = cityLifeRef.current.route.length > 0 && !c.driving && Math.hypot(input.x, input.y) < 0.12
      for (const ev of events) {
        if (ev.type === 'pedestrian-stop') {
          input.x = 0; input.y = 0; input.run = false
          setCityLife(old => pedestrianTicket(old, ev.reason))
          setPoliceStop(ev.reason)
          setPanel(null)
        } else if (ev.type === 'reached' && !c.route.length && !c.driving) {
          setCityLife(old => ({ ...finishGuidedWalk(old), pose: { x: c.pos.x, z: c.pos.z, heading: c.heading } }))
        } else if (ev.type === 'cell') {
          if (emergencyOf(cityLifeRef.current).active) continue
          const key = `${cityLifeRef.current.locality}:${ev.x}:${ev.y}`
          reportedCell.current = key
          const v = c.driving ? c.vehicle : null
          const pose = v
            ? { x: v.x, z: v.z, heading: v.heading }
            : { x: c.pos.x, z: c.pos.z, heading: c.heading }
          setCityLife((old) => {
            const moved = moveTo(old, { x: ev.x, y: ev.y }, pose, guided)

            return v
              ? {
                  ...moved,
                  vehicle: { x: v.x, z: v.z, heading: v.heading },
                  vehicleLocality: old.locality,
                }
              : moved
          })
          setNearVehicle(c.canEnterVehicle())
        } else if (ev.type === 'blocked' && !c.driving) {
          // A walk to a point whose end is taken (a parked taxi, a moto): arrived beside it. The
          // vehicle may now be in reach without the player crossing into a new cell. (At the
          // wheel, the automatic service handles its own blocked roads.)
          setNearVehicle(c.canEnterVehicle())
          const route = cityLifeRef.current.route
          const last = route[route.length - 1]
          if (
            last &&
            !cityLifeRef.current.target &&
            Math.hypot(last.x - c.pos.x, last.y - c.pos.z) < 2.2
          ) {
            c.route = []
            setCityLife((old) => (old.route.length ? { ...old, route: [] } : old))
          }
        } else if (ev.type === 'vehicle') {
          const v = c.vehicle
          setDriving(ev.state === 'entered')
          setNearVehicle(ev.state === 'left' ? c.canEnterVehicle() : false)
          setCityLife((old) => ({
            ...old,
            vehicle: v ? { x: v.x, z: v.z, heading: v.heading } : old.vehicle,
            vehicleLocality: v ? old.locality : old.vehicleLocality,
            pose: { x: c.pos.x, z: c.pos.z, heading: c.heading },
          }))
          const moto = cityLifeRef.current.duty === 'moto'
          // The player's own moto or car: driven with the joystick, no job, no fare.
          const own = vehicleOut(cityLifeRef.current)
          if (own) {
            setNotice(
              ev.state === 'entered'
                ? `Tu conduis ${own.kind === 'moto' ? 'ta moto' : 'ta voiture'} : le joystick pour rouler, relâche pour freiner.`
                : `Tu es descendu de ${own.kind === 'moto' ? 'ta moto' : 'ta voiture'}.`,
            )
            continue
          }
          if (ev.state === 'left') automaticService.stop()
          else {
            const kind = cityLifeRef.current.duty ?? 'taxi'
            automaticService.start(kind)
            if (!cityLifeRef.current.duty) setCityLife((old) => ({ ...old, duty: kind }))
          }
          setServiceState(automaticService.snapshot())
          setNotice(
            ev.state === 'entered'
              ? moto
                ? 'Zémidjan automatique : recherche de clients, trajet et paiement inclus.'
                : 'Taxi automatique : recherche de clients, trajet et paiement inclus.'
              : moto
                ? 'Tu es descendu de ton zémidjan.'
                : 'Tu es descendu du taxi.',
          )
        }
      }
    },
    [automaticService],
  )
  const onJoystickActive = useCallback(() => {
    controller.camera.follow = true
    if (cityLifeRef.current.route.length)
      setCityLife((old) => ({ ...old, route: [], target: null }))
  }, [controller])
  // The keyboard walks the player in the street and indoors (every renderer lets them walk).
  useKeyboardInput(
    input,
    panel === null && !policeStop && !talkNpc && !mapView && !riding && !emergencyActive && !(driving && cityLife.duty),
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
    const mine = vehicleOut(cityLife)
    const what = mine
      ? mine.kind === 'moto'
        ? 'de ta moto'
        : 'de ta voiture'
      : cityLife.duty === 'moto'
        ? 'ton zémidjan'
        : 'du taxi'
    if (controller.driving) {
      if (cityLife.duty) {
        automaticService.requestStop()
        setServiceState(automaticService.snapshot())
      } else if (!controller.exitVehicle()) setNotice(`Freine avant de descendre ${what}.`)
    } else if (!controller.enterVehicle())
      setNotice(
        mine
          ? `Approche-toi de ${mine.kind === 'moto' ? 'ta moto' : 'ta voiture'}.`
          : cityLife.duty === 'moto'
            ? 'Approche-toi de ta moto.'
            : 'Approche-toi du taxi pour monter.',
      )
  }
  /** The player's own vehicle, parked on the nearest road beside them (no job). */
  function takeOutVehicle(id: string) {
    const v = ownVehicle(id)
    if (!v) return
    if (controller.driving) {
      setNotice('Descends du véhicule avant d’en sortir un autre.')
      return
    }
    if (insideAny) {
      setNotice(`Sors du bâtiment : ${v.kind === 'moto' ? 'ta moto' : 'ta voiture'} t’attend dans la rue.`)
      return
    }
    const placement = serviceVehiclePlacement(
      controller.pos,
      (x, z) => isCityRoad(x, z) || isDriveway(x, z),
    )
    if (!placement) {
      setNotice('Aucune route accessible pour garer ton véhicule ici.')
      return
    }
    automaticService.stop()
    setServiceState(automaticService.snapshot())
    const { approach, vehicle: parked } = placement
    const vehicle = { x: parked.x, z: parked.z, heading: controller.heading }
    controller.vehicle = { ...vehicle, speed: 0 }
    const close = Math.hypot(approach.x - controller.pos.x, approach.z - controller.pos.z) <= 0.5
    setNearVehicle(close)
    const what = v.kind === 'moto' ? 'Ta moto' : 'Ta voiture'
    const message = close
      ? `${what} est garée juste devant toi. Appuie sur « Monter ».`
      : `${what} est garée sur la route : tu y vas automatiquement.`
    setCityLife((old) => {
      const ready = {
        ...old,
        duty: null,
        garage: { ...garageOf(old), out: id },
        vehicle,
        vehicleLocality: old.locality,
      }
      const moving = close ? ready : goToPoint(ready, { x: approach.x, y: approach.z })
      return {
        ...moving,
        life: { ...moving.life, lastEvent: message, events: [message, ...moving.life.events].slice(0, 8) },
      }
    })
    setPanel(null)
    if (mapView) exitMap()
    controller.camera.follow = true
    setNotice(message)
  }
  function putAwayVehicle() {
    if (controller.driving) {
      setNotice('Descends du véhicule avant de le ranger.')
      return
    }
    controller.vehicle = null
    setNearVehicle(false)
    setCityLife((old) => ({ ...old, garage: { ...garageOf(old), out: null }, vehicle: null }))
    setNotice('Véhicule rangé au garage.')
  }
  // ── Driver's job (zémidjan or taxi): pick up, drive, drop off, get paid ──
  const ownOut = vehicleOut(cityLife)
  const vehicleKind =
    cityLife.duty === 'moto'
      ? 'moto'
      : cityLife.duty
        ? 'taxi'
        : ownOut
          ? ownOut.kind === 'moto'
            ? 'moto'
            : 'car'
          : 'taxi'
  const streetFare = useMemo(
    () => ({
      vehicle: vehicleKind,
      own: Boolean(ownOut),
      hailing: !!cityLife.duty && driving && serviceState.phase === 'searching',
      passenger: fare?.passenger ?? null,
      pickup: serviceState.phase === 'pickup' ? serviceState.customer : null,
      dest: fare ? { x: fare.to.x, y: fare.to.y, name: fare.to.name } : null,
    }),
    [vehicleKind, ownOut, cityLife.duty, driving, fare, serviceState.phase, serviceState.customer],
  ) as {
    vehicle: 'moto' | 'taxi' | 'car'
    own: boolean
    hailing: boolean
    passenger: string | null
    pickup: ServiceCustomer | null
    dest: { x: number; y: number; name: string } | null
  }
  const receiveCustomer = useCallback(
    (customer: ServiceCustomer | null) => {
      automaticService.offer(customer)
    },
    [automaticService],
  )
  useEffect(() => {
    if (!driving || !cityLife.duty) return
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      for (const event of automaticService.update(0.2)) {
        if (event.type === 'paid') {
          setCityLife((old) => settleVehicleFare(old, event.fare, event.kind, event.traveledCells))
          setNotice(
            'Client déposé : recette encaissée, essence et réserve entretien déduites. Détail dans Mes finances.',
          )
        } else if (event.type === 'serviced') {
          setCityLife((old) => finishVehicleStop(old, event.kind, event.service))
          setNotice(
            event.service === 'police'
              ? 'Contrôle terminé : bonne route !'
              : 'Véhicule prêt : les courses reprennent automatiquement.',
          )
        } else setNotice(event.message)
      }
      const next = automaticService.snapshot()
      setServiceState((old) =>
        old.phase === next.phase &&
        old.fare === next.fare &&
        old.customer === next.customer &&
        old.stopRequested === next.stopRequested &&
        old.completed === next.completed &&
        old.stop === next.stop
          ? old
          : next,
      )
    }, 200)
    return () => window.clearInterval(id)
  }, [automaticService, driving, cityLife.duty])
  function setDuty(duty: 'moto' | 'taxi' | null) {
    if (controller.driving) {
      setNotice('Descends du véhicule avant de changer de métier.')
      return
    }
    if (duty && insideAny) {
      setNotice('Sors du bâtiment pour récupérer ton véhicule de service.')
      return
    }
    automaticService.stop()
    setServiceState(automaticService.snapshot())
    if (!duty) {
      setCityLife((old) => ({ ...old, duty: null }))
      setNotice('Service de transport terminé.')
      return
    }
    const placement = serviceVehiclePlacement(
      controller.pos,
      (x, z) => isCityRoad(x, z) || isDriveway(x, z),
    )
    if (!placement) {
      setNotice('Aucune route accessible pour garer le véhicule de service.')
      return
    }
    const { approach, vehicle: parked } = placement
    const vehicle = { x: parked.x, z: parked.z, heading: controller.heading }
    controller.vehicle = { ...vehicle, speed: 0 }
    const close = Math.hypot(approach.x - controller.pos.x, approach.z - controller.pos.z) <= 0.5
    setNearVehicle(close)
    const message = close
      ? `${duty === 'moto' ? 'Ton zémidjan' : 'Ton taxi'} est garé juste devant toi. Appuie sur « Monter ».`
      : `${duty === 'moto' ? 'Ton zémidjan' : 'Ton taxi'} est prêt sur la route : tu y vas automatiquement.`
    setCityLife((old) => {
      const ready = {
        ...old,
        duty,
        vehicle,
        vehicleLocality: old.locality,
        // The job's vehicle replaces the player's own one in the street.
        garage: old.garage ? { ...old.garage, out: null } : undefined,
      }
      const moving = close ? ready : goToPoint(ready, { x: approach.x, y: approach.z })
      return {
        ...moving,
        life: {
          ...moving.life,
          lastEvent: message,
          events: [message, ...moving.life.events].slice(0, 8),
        },
      }
    })
    setPanel(null)
    if (mapView) exitMap()
    controller.camera.follow = true
    setNotice(message)
  }
  // While a passenger is on board: distance left, arrival, and the arrow towards the place.
  useEffect(() => {
    if (!fare) return
    const id = window.setInterval(() => {
      const v = controller.vehicle
      if (!v) return
      const screenUp = controller.camera.angle + 180
      setFareLive({
        left: remaining(fare, v),
        can: canDrop(fare, v, v.speed),
        arrow: screenUp - bearingTo(fare, v),
      })
    }, 250)
    return () => window.clearInterval(id)
  }, [fare, controller])
  // Money other players sent: collected once when the game opens, then every half minute.
  useEffect(() => {
    if (!loaded) return
    let stop = false
    const collect = async () => {
      if (document.visibilityState !== 'visible') return
      const got = await claimMoney()
      if (stop || !got?.length) return
      const total = got.reduce((n, g) => n + g.amount, 0)
      const lines = got.map(
        (g) => `${g.from.name} t’a envoyé ${money(g.amount)}${g.note ? ` : « ${g.note} »` : ''}.`,
      )
      setCityLife((old) => ({
        ...old,
        life: {
          ...old.life,
          wallet: Math.min(100_000_000, old.life.wallet + total),
          lastEvent: lines[lines.length - 1],
          events: [...lines.reverse(), ...old.life.events].slice(0, 8),
        },
      }))
      setNotice(
        got.length === 1 ? lines[0] : `Tu as reçu ${money(total)} de ${got.length} joueurs.`,
      )
    }
    void collect()
    const id = window.setInterval(() => void collect(), 30_000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [loaded])
  async function giveMoney(key: string, name: string) {
    const amount = Math.floor(Number(gift.amount))
    if (!Number.isFinite(amount) || amount < 1 || amount > 50000) {
      setPlayerNote('Choisis un montant entre 1 et 50 000 FCFA.')
      return
    }
    if (life.wallet < amount) {
      setPlayerNote(`Il te manque ${money(amount - life.wallet)} pour envoyer ${money(amount)}.`)
      return
    }
    giftClient.current ??= uuid()
    setGift((g) => ({ ...g, busy: true }))
    // The server checks the wallet it knows: save the latest game first.
    await cloud.flush()
    const r = await sendMoney(key, amount, gift.note, giftClient.current)
    setGift((g) => ({ ...g, busy: false }))
    if ('error' in r) {
      setPlayerNote(r.error)
      return
    }
    giftClient.current = null
    const line = `Tu as envoyé ${money(r.amount)} à ${r.to.name ?? name}.`
    setCityLife((old) => ({
      ...old,
      life: {
        ...old.life,
        wallet: Math.max(0, old.life.wallet - r.amount),
        lastEvent: line,
        events: [line, ...old.life.events].slice(0, 8),
      },
    }))
    setGift({ amount: gift.amount, note: '', busy: false })
    setPlayerNote(line)
  }
  // End-to-end tests only: open a player's sheet by their key (finding them in the street
  // would make the test depend on where they walked).
  useEffect(() => {
    let e2e = false
    try {
      e2e = localStorage.getItem('haroolife.e2e') === '1'
    } catch {
      e2e = false
    }
    if (!e2e) return
    const w = window as unknown as { __LOME_OPEN_PLAYER?: (key: string) => void }
    w.__LOME_OPEN_PLAYER = (key) => {
      setPlayerKey(key)
      setPlayerNote('')
      setPanel('player')
    }
    return () => {
      w.__LOME_OPEN_PLAYER = undefined
    }
  }, [])
  // Probe for the tests: the driver's job as the game sees it.
  useEffect(() => {
    ;(window as unknown as { __LOME_FARE?: unknown }).__LOME_FARE = {
      duty: cityLife.duty ?? null,
      hail,
      fare,
      service: serviceState,
      care: cityLife.duty ? vehicleCare(cityLife, cityLife.duty) : null,
      ...fareLive,
    }
  }, [cityLife.duty, cityLife.fleet, hail, fare, fareLive, serviceState])
  useEffect(() => {
    if (!playing && !cityLife.employment?.shift && !municipalClock) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible')
        setCityLife((old) =>
          old.employment?.shift
            ? advanceHourlyShift(old)
            : { ...old, life: advanceLifeHour(old.life) },
        )
    }, 11000)
    return () => window.clearInterval(id)
  }, [playing, !!cityLife.employment?.shift, municipalClock])
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
    if (panel !== null || policeStop || talkNpc || riding || emergencyActive) return
    if (insideAny) action('leave')
    else if (doorRef.current) action('enter')
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTalkNpc(null)
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
  // The others see the ride's vehicle drive the route meanwhile (pose sent at 5 Hz above).
  useEffect(() => {
    const s = cityLifeRef.current
    rideTrack.current =
      riding && transport !== 'walk'
        ? {
            start: s.at,
            route: s.route,
            since: performance.now(),
            seconds: rideMs(s.route.length) / 1000,
            vehicle: transport,
          }
        : null
  }, [riding, transport])
  // A ride lasts a few seconds on the boulevard (longer for a longer route), then lands.
  useEffect(() => {
    if (!riding) return
    const ms = rideMs(cityLife.route.length)
    const id = window.setTimeout(() => {
      setRiding(false)
      setCityLife((old) => arrive(old))
    }, ms)
    return () => window.clearTimeout(id)
  }, [riding, cityLife.route.length])
  // StreetWorld's RoadTraffic advances independently of React, including while idle.
  // The former 700 ms trafficStep timer only dirtied the whole UI and autosave: no
  // current renderer consumes it. Keep the saved field for legacy save compatibility.

  // Starting a trip or a walk, or entering a place, ends the map view (the game camera comes
  // back). Only the start counts: the map can be opened again while a walk is under way.
  const walking = cityLife.route.length > 0
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to these transitions only
  useEffect(() => {
    if (mapView && (insideAny || riding || walking || webgl === false)) exitMap()
  }, [insideAny, riding, walking, webgl])
  function enterMap() {
    if (webgl === false || (controller.driving && cityLife.duty)) {
      setPanel('map')
      return
    }
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
    rig.distance = STREET_CAMERA_MODES[cameraMode].distance
    setCamera((c) => ({ ...c, distance: rig.distance, angle: rig.angle }))
    setShowNames(false)
    setMapView(false)
  }
  function cycleCameraMode() {
    const next = nextStreetCameraMode(cameraMode)
    setCameraMode(next)
    controller.camera.follow = true
    controller.camera.distance = STREET_CAMERA_MODES[next].distance
    setCamera((old) => ({ ...old, distance: controller.camera.distance }))
    try {
      localStorage.setItem(CAMERA_MODE_STORAGE, next)
    } catch {
      /* the selected mode still works for this session */
    }
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
  /** A message in the game's own line (the status strip and the journal), sheet open or not. */
  function say(msg: string) {
    setCityLife((old) => ({
      ...old,
      life: { ...old.life, lastEvent: msg, events: [msg, ...old.life.events].slice(0, 8) },
    }))
  }
  /** Where a job is worked: its venue in the Lomé quarter, a place of the town elsewhere. */
  function workplace(job: Career): { name: string; go: () => void } | null {
    if (cityLife.locality !== 'lome') {
      const lot = careerWorkplace({ ...cityLife, life: { ...cityLife.life, job } })
      return lot
        ? {
            name: lot.name ?? TYPE_LABELS[lot.type] ?? 'ton lieu de travail',
            go: () => goService(lot),
          }
        : null
    }
    const loc = LIFE_LOCATIONS.find((l) => l.venue === jobVenue(job))
    return loc ? { name: loc.name, go: () => go(loc.x, loc.y) } : null
  }
  function goToWork(job: Career = life.job) {
    const target = workplace(job)
    if (!target) {
      setPanel(null)
      say('Aucun poste accessible ici pour ce métier.')
      return
    }
    target.go()
  }
  /** « Choisir » : the job is taken, the sheet closes and the player heads to the workplace. */
  function chooseJob(job: Career) {
    setLife((old) => selectJob(old, job))
    const target = workplace(job)
    goToWork(job)
    if (!target) return
    const open = life.hour >= 7 && life.hour < 19
    say(
      `${TOGO_JOBS[job].icon} ${TOGO_JOBS[job].label} : en route vers ${target.name}. ` +
        (life.workToday
          ? 'Ton service d’aujourd’hui est déjà payé : reviens demain.'
          : open
            ? `Sur place, touche « Faire mon service » (+${money(SALARIES[job])}).`
            : 'Le service ouvre à 7 h : tu pourras te reposer en attendant.'),
    )
  }
  /** The one next step for today's work, whatever the status: used by the objectives. */
  function workNextStep(): { title: string; run: () => void } {
    if (currentWorkStatus === 'ready')
      return {
        title: `Faire mon service · +${money(SALARIES[life.job])}`,
        run: () => action('work'),
      }
    if (currentWorkStatus === 'away') return { title: 'Aller au travail', run: () => goToWork() }
    if (currentWorkStatus === 'closed') return { title: 'Se reposer jusqu’à 7 h', run: waitForWork }
    if (currentWorkStatus === 'tired' || currentWorkStatus === 'hungry')
      return { title: 'Pause et collation · 1 h', run: prepareWorkNeeds }
    return { title: 'Voir les métiers', run: () => open('jobs') }
  }
  /** Build on the free plot nearest to the player: the result is said, whatever it is. */
  function buildNear(b: BuildType) {
    setBuilding(b)
    if (!LOCALITIES[cityLife.locality].estate) {
      setNotice('Ton terrain est dans ton quartier de Lomé : prends le car pour y construire.')
      return
    }
    // The result (built, or why not) is the engine's message, shown in the status strip.
    setLife((old) => buildNearPlayer(old, b))
    setPanel(null)
  }
  function waitForWork() {
    setLife((old) => waitForNextWorkShift(old))
    setNotice('Tu te reposes jusqu’à l’ouverture du prochain service à 7 h.')
  }
  function prepareWorkNeeds() {
    setLife((old) => prepareForWork(old))
    setNotice('Pause et collation terminées. Vérifie l’heure puis rejoins ton poste.')
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
    // Locked out by the landlord: the home's door stays shut until a new home is rented.
    const home =
      b && life.city.buildings.some((x) => x.x === b.x && x.y === b.y && x.type === 'house')
    if (home && housingOf(cityLife).evicted) {
      say('Le propriétaire a changé la serrure : loue un nouveau logement dans le téléphone.')
      return
    }
    if (b) setCityLife((old) => ({ ...old, pose, route: [], life: enterBuilding(old.life, b) }))
    else if (lot) setCityLife((old) => enterLot(old, lot, pose))
    setNotice(null)
    setPanel(null)
  }
  function action(a: Action) {
    if (a === 'eat') {
      const item = life.meals > 0 ? 'estate' : GOODS.find(g => g.id !== 'soap' && g.id !== 'water' && (cityLife.commerce?.inventory[g.id] ?? 0) > 0)?.id
      if (item) eatMeal(item, false)
      else { setShopTab('marche'); setPanel('shop'); setNotice('Choisis un repas dans ton sac ou chez la vendeuse.') }
      return
    }
    if (a === 'work') {
      setCityLife(workCareer)
      return
    }
    if (a === 'buy-meal') {
      setCityLife(buyEstateMeal)
      return
    }
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
      life.inside === 'house' ? layoutFor('house').props.find((p) => p.action === a) : undefined
    if (!prop) {
      action(a)
      return
    }
    setPanel(null)
    setApproachReq((r) => ({ prop: prop.id, n: (r?.n ?? 0) + 1 }))
  }
  function cityAction(a: CityAction) {
    if (a === 'public-services') { setPanel('services'); return }
    if (a === 'timetable') {
      const lot = cityLife.insideLot ? lotById(cityLife.insideLot) : null
      if (lot) { setSelectedLot(lot); setPanel('lot') }
      return
    }
    if (a === 'browse') {
      setShopTab('marche')
      setPanel('shop')
      return
    }
    if (a === 'bank') {
      setPanel('wallet')
      return
    }
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
    if (p.action === 'eat') { action('eat'); return }
    if (p.action === 'sit') {
      setCityLife(old => ({ ...old, activity: { prop: p.id, anim: 'sit' } }))
      return
    }
    if (['browse', 'offers', 'coop', 'bank', 'timetable', 'public-services'].includes(p.action)) {
      cityAction(p.action as CityAction)
      return
    }
    if (cityLife.insideLot) {
      setCityLife((old) => useProp(old, p.id))
      return
    }
    // Estate interiors keep their original actions; the animation plays on the prop.
    action(p.action as Action)
    setCityLife((old) => ({ ...old, activity: { prop: p.id, anim: animFor(p.kind) } }))
  }
  function eatMeal(item: MealItem, buy: boolean) {
    if (riding || driving) { setNotice('Descends du véhicule pour prendre ton repas.'); return }
    if (mapView) exitMap()
    controller.route = []
    setPanel(null)
    const id = crypto.randomUUID()
    setCityLife(old => beginMeal({ ...old, route: [] }, item, id, buy))
  }
  /**
   * Starts an activity from the sheet: the first prop in the room that offers it. In a Three
   * interior the player first walks to it (the action runs on arrival, see InteriorThree).
   */
  function startActivity(a: CityAction) {
    const room = cityLife.insideLot ? interiorFor(lotById(cityLife.insideLot)?.type ?? 'lot') : null
    const prop = room
      ? layoutFor(
          room,
          cityLife.insideLot ? (lotById(cityLife.insideLot) ?? undefined) : undefined,
          life,
        ).props.find((p) => p.action === a)
      : null
    if (prop) {
      setPanel(null)
      setApproachReq((r) => ({ prop: prop.id, n: (r?.n ?? 0) + 1 }))
    } else cityAction(a)
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
  /**
   * Take the coach to another town. With a company: its fare, the wait for its next departure
   * and its hours on the real road (RN1). Without one (no line known): the bush taxi of before.
   */
  function travel(to: LocalityId, companyId?: string) {
    const legacy = tripTo(cityLife, to)
    if (!legacy || to === cityLife.locality) return
    const company = companyId ? companyById(companyId) : null
    const coach = company ? coachTrip(cityLife.locality, to, company, life.hour) : null
    const fare = coach ? coach.fare : legacy.fare
    const hours = coach ? coach.wait + coach.hours : legacy.hours
    if (life.wallet < fare) {
      setNotice(
        `Il te faut ${money(fare)} pour le car${company ? ` ${company.name}` : ''} vers ${LOCALITIES[to].name}.`,
      )
      return
    }
    setCityLife((old) => {
      let next: CityLife = {
        ...old,
        life: {
          ...old.life,
          wallet: old.life.wallet - fare,
          spent: old.life.spent + fare,
        },
      }
      for (let h = 0; h < hours; h++) next = { ...next, life: advanceLifeHour(next.life) }
      if (to in CITIES) next = { ...next, life: selectCity(next.life, to as keyof typeof CITIES) }
      return travelTo(next, to)
    })
    setCoachTo(null)
    // The change of map is shown while the new town loads (its street reports its tiles).
    setJourney({
      from: cityLife.locality,
      to,
      hours: coach ? coach.hours : legacy.hours,
      company: company?.name,
      stops: coach?.stops,
    })
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

  function goService(lot: Lot) {
    setCityLife((old) => ({
      ...old,
      insideLot: null,
      activity: null,
      employment: old.employment ? { ...old.employment, shift: null } : undefined,
      life: old.life.inside ? interact(old.life, 'leave') : old.life,
    }))
    goLot(lot)
  }
  // Driven to the terminal for a booked flight: once there, the player goes in and boards.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fly reads the state of this render
  useEffect(() => {
    if (!pendingFlight || riding || cityLife.route.length) return
    if (atAirport(cityLife)) {
      fly(pendingFlight)
      return
    }
    const airport = landmarks().find((l) => /aéroport/i.test(l.name ?? ''))
    if (airport && cityLife.target === airport.id) setCityLife((old) => enterLot(old, airport))
    else setPendingFlight(null)
  }, [pendingFlight, riding, cityLife.route.length, cityLife.target, cityLife.insideLot])
  function fly(to: LocalityId) {
    const trip = airTrip(cityLife.locality, to)
    if (!trip) return
    if (!atAirport(cityLife)) {
      const airport = landmarks().find((l) => /aéroport/i.test(l.name ?? ''))
      if (!airport) return
      if (life.wallet < trip.fare + TRAVEL_COST.taxi) {
        setNotice(
          `Il te faut ${money(trip.fare)} pour le billet et ${money(TRAVEL_COST.taxi)} pour le taxi jusqu’au terminal.`,
        )
        return
      }
      // A taxi to the terminal, then boarding on arrival (see the effect on pendingFlight).
      setPendingFlight(to)
      setCityLife((old) => ({ ...old, insideLot: null, activity: null }))
      rideTo(airport, 'taxi')
      return
    }
    setPendingFlight(null)
    const next = takeFlight(cityLife, to)
    if (next.locality === cityLife.locality) {
      setNotice(next.life.lastEvent)
      return
    }
    setCityLife(next)
    setJourney({
      from: cityLife.locality,
      to,
      hours: trip.hours,
      company: 'Vol Lomé – Niamtougou',
      mode: 'air',
    })
    setChunkStats({ chunks: 0, buildings: 0, tris: 0, detailed: false })
    const gate = LOCALITIES[to].gate
    setCamera(CAMERA_HOME(gate.x, gate.y))
    controller.camera.follow = true
    setSelectedLot(null)
    setPanel(null)
    setMode('walk')
    setTransport('walk')
    if (mapView) exitMap()
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

  function stopEmergency() {
    const graph = controller.pavements
    const index = graph?.nearest(controller.pos)
    const point = graph && index !== undefined && index >= 0 ? graph.nodes[index] : controller.pos
    setCityLife(old => ({ ...cancelAmbulance(old),
      at: { x: Math.round(point.x), y: Math.round(point.z) },
      pose: { x: point.x, z: point.z, heading: controller.heading }, route: [],
    }))
  }
  function requestEmergency() {
    if (!webgl) { setNotice('Le monde 3D doit être disponible pour envoyer l’ambulance.'); return }
    if (driving || riding) { setNotice('Descends du véhicule avant de demander une ambulance.'); return }
    const old = cityLifeRef.current
    const point = old.insideLot || old.life.inside
      ? { x: old.at.x, z: old.at.y } : { ...controller.pos }
    const outside = { ...cancelMeal(old), insideLot: null, activity: null,
      duty: null, employment: old.employment ? { ...old.employment, shift: null } : undefined,
      life: { ...old.life, inside: null },
    }
    const next = callAmbulance(outside, point, crypto.randomUUID())
    setCityLife(next)
    if (!emergencyOf(next).active) { setNotice(next.life.lastEvent); return }
    input.x = 0; input.y = 0; input.run = false
    controller.route = []
    controller.camera.follow = true
    setTalkNpc(null)
    setPendingFlight(null)
    setCoachTo(null)
    setSelectedLot(null)
    setPoliceStop(null)
    controller.policeStopped = false
    if (mapView) exitMap()
    setPanel(null)
    setNotice(null)
    setPlaying(false)
  }
  function onEmergency(event: EmergencyEvent) {
    if (event.type === 'failed') {
      setCityLife(old => {
        const next = emergencyEvent(old, event)
        if (next === old) return old
        const graph = controller.pavements
        const index = graph?.nearest(controller.pos)
        const p = graph && index !== undefined && index >= 0 ? graph.nodes[index] : controller.pos
        return { ...next, at: { x: Math.round(p.x), y: Math.round(p.z) },
          pose: { x: p.x, z: p.z, heading: controller.heading } }
      })
    } else setCityLife(old => emergencyEvent(old, event))
  }
  function visitMayor() {
    if (cityLife.insideLot && lotById(cityLife.insideLot)?.type === 'townhall') {
      setCityLife(reportMunicipalSignal)
      return
    }
    const mayor = landmarks().filter(l => l.type === 'townhall').sort((a, b) =>
      Math.hypot(a.door.x - cityLife.at.x, a.door.y - cityLife.at.y) - Math.hypot(b.door.x - cityLife.at.x, b.door.y - cityLife.at.y))[0]
    if (mayor) goService(mayor)
  }
  function inspectWorks() {
    const site = cityLife.civic?.projects?.[cityLife.locality]?.site
    if (!site) return
    setCityLife(old => goToPoint({ ...old, insideLot: null, activity: null,
      life: { ...old.life, inside: null } }, { x: site.x, y: site.z }))
    controller.camera.follow = true
    setPanel(null)
  }

  return (
    <main
      ref={screenRef}
      data-quality={quality}
      className="haroolife-screen fixed inset-0 z-[95] w-full overflow-hidden bg-[#98b7a8] font-sans text-slate-900"
    >
      {/* The game world remains mounted under overlays. No map or dashboard replaces the canvas. */}
      <div
        className="absolute inset-0"
        aria-label={`Monde de jeu 3D de ${LOCALITIES[cityLife.locality].name}`}
        inert={emergencyActive}
      >
        {webgl === null ? (
          <output className="flex h-full items-center justify-center p-8 text-center text-sm">
            Préparation de l’affichage 3D…
          </output>
        ) : webgl === false ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#123b33] p-8 text-center text-white">
            <h1 className="text-2xl font-bold">Lomé Life 3D</h1>
            <p>
              Le rendu 3D exige WebGL2. Active l’accélération graphique et utilise une version
              récente de Firefox, Chrome ou Safari. Les commandes restent accessibles ci-dessous.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-bold text-emerald-950"
            >
              Réessayer l’affichage
            </button>
          </div>
        ) : (
          <GraphicsBoundary onUnavailable={() => setWebgl(false)}>
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
              day={life.day}
              interior={interior}
              interiorTitle={
                cityLife.insideLot
                  ? (lotById(cityLife.insideLot)?.name ??
                    TYPE_LABELS[lotById(cityLife.insideLot)?.type ?? 'lot'])
                  : (VENUE_LABELS[life.inside ?? ''] ?? '')
              }
              interiorLot={
                cityLife.insideLot ? (lotById(cityLife.insideLot) ?? undefined) : undefined
              }
              activity={cityLife.activity}
              daily={{
                meal: cityLife.meal,
                onMealReady: (id, seat) => setCityLife(old => readyMeal(old, id, seat)),
                onMealFrame: (id, seconds) => setCityLife(old => advanceMeal(old, id, seconds)),
                onActivityEnd: () => setCityLife(old => ({ ...cancelMeal(old), activity: null })),
              }}
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
              fare={streetFare}
              services={publicServices}
              onEmergency={onEmergency}
              onHail={receiveCustomer}
              onVehicle={toggleVehicle}
              plot={
                cityLife.plot
                  ? {
                      lotId: cityLife.plot.lot,
                      name: plotLabel(cityLife.plot),
                      built: cityLife.plot.built,
                      working: cityLife.plot.work !== null,
                    }
                  : null
              }
              talkOrigin={cityLife.origin}
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
              home={furnishing.home}
            />
          </GraphicsBoundary>
        )}
      </div>
      {furnishing.bar}
      {journey && (
        <TravelSplash
          from={journey.from}
          to={journey.to}
          hours={journey.hours}
          company={journey.company}
          stops={journey.stops}
          mode={journey.mode}
          cabin={
            webgl ? (
              <HarooCabinView
                mode={journey.mode === 'air' ? 'plane' : 'coach'}
                hour={life.hour}
                pixelRatio={renderPixelRatio(quality)}
                avatarModel={shownModel(avatar)}
                avatarPagne={pagneColor(avatar.pagne)}
                onReady={() => setCabinReady(true)}
              />
            ) : undefined
          }
          cabinReady={cabinReady}
          ready={cityLife.locality === journey.to && chunkStats.chunks > 0}
          onDone={endJourney}
        />
      )}
      <div className="hl-world-shade pointer-events-none absolute inset-x-0 top-0" />
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
        <div className="hl-map-actions pointer-events-auto absolute left-3 right-3 top-[150px] z-10 flex flex-wrap gap-1.5 sm:top-[160px]">
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
          className="hl-map-categories pointer-events-auto absolute left-3 right-16 top-[104px] z-10 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:top-[114px]"
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
          className="hl-venue-activities pointer-events-auto absolute left-3 top-[104px] z-10 rounded-full border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow sm:top-[114px]"
        >
          Activités · {lotById(cityLife.insideLot)?.name ?? 'ce lieu'}
        </button>
      )}
      <header inert={emergencyActive} className="hl-header pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(12px,env(safe-area-inset-top,0px))] sm:px-5">
        <div className="hl-context" aria-label={`HarooLife · ${LOCALITIES[cityLife.locality].name} · ${whereAmI}`}>
          <span className="hl-wordmark"><span aria-hidden>h.</span> HAROOLIFE</span>
          <span className="hl-location"><MapPin size={12} aria-hidden /> {LOCALITIES[cityLife.locality].name} <span aria-hidden>·</span> {whereAmI}</span>
        </div>
        <div className="hl-status pointer-events-auto mx-auto flex max-w-[900px] items-center gap-2 rounded-[24px] border border-white/65 bg-white/95 p-2 shadow-lg shadow-slate-900/10 backdrop-blur-lg">
          <div className="hl-clock flex shrink-0 items-center gap-1 rounded-2xl px-2 text-xs font-bold sm:text-sm">
            {life.hour >= 6 && life.hour < 18
              ? <Sun size={17} className="text-amber-500" aria-hidden />
              : <Moon size={17} className="text-indigo-500" aria-hidden />}{' '}
            <span>
              J{life.day} · {String(life.hour).padStart(2, '0')}h
            </span>
          </div>
          <span className="h-6 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() => open('home')}
            aria-label="Voir mes besoins"
            className="hl-mood flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-xl py-2 text-xs font-semibold text-emerald-700"
          >
            {wellbeing >= 75 ? '🙂' : wellbeing >= 40 ? '😌' : '😟'} {mood}
          </button>
          <button
            type="button"
            onClick={() => open('online')}
            aria-label="Voir les joueurs en ligne"
            title={
              gamePlayers
                ? 'Personnes en ligne dans tout HarooLife'
                : online
                  ? 'Joueurs à proximité dans cette instance'
                  : 'Connexion multijoueur en cours'
            }
            className="hl-presence flex shrink-0 items-center gap-1 rounded-xl bg-emerald-50 px-2 py-2 text-[11px] font-bold text-emerald-800"
          >
            <Users size={14} />{' '}
            {gamePlayers
              ? gamePlayers.online
              : online
                ? realtime.state.present.filter((p) => p.locality === cityLife.locality).length + 1
                : '—'}
            <span className="hidden sm:inline">
              {gamePlayers ? ' en ligne' : online ? ' à proximité' : ' connexion…'}
            </span>
          </button>
          <span className="h-6 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() => open('wallet')}
            aria-label="Voir mon argent"
            className="hl-wallet flex shrink-0 items-center gap-1 rounded-2xl bg-slate-100 px-3 py-2 text-[11px] font-black sm:text-sm"
          >
            {new Intl.NumberFormat('fr-FR').format(life.wallet)}{' '}
            <span className="hl-currency">FCFA</span>
            <Plus size={15} className="rounded-full bg-emerald-600 text-white" />
          </button>
        </div>
        <div className="hl-shortcuts pointer-events-auto mx-auto mt-2 flex max-w-[900px] items-start justify-between gap-2">
          {onDuty ? (
            <span />
          ) : (
            <button
              type="button"
              onClick={() => open('missions')}
              className="hl-objective flex max-w-[79%] items-center gap-2 rounded-full border border-white/40 bg-white/85 px-3 py-2 text-left text-xs font-semibold shadow-md backdrop-blur"
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
          )}
          {actor && (
            <button
              type="button"
              aria-label="Ma coopérative"
              title="Ma coopérative"
              onClick={goMyCooperative}
              className="hl-cooperative flex shrink-0 items-center gap-1 rounded-full bg-emerald-700 px-3 py-2 text-xs font-bold text-white shadow-md"
            >
              🤝 <span className="hidden sm:inline">Ma coopérative</span>
            </button>
          )}
          <button
            type="button"
            aria-label={playing ? 'Mettre en pause' : 'Faire avancer le temps'}
            onClick={() => setPlaying((p) => !p)}
            className="hl-time-control rounded-full bg-white/90 p-2.5 shadow-md"
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
        </div>
        {payBubbles.length > 0 && (
          <div className="mx-auto mt-1 flex max-w-[900px] justify-end">
            <PayBubbles bubbles={payBubbles} />
          </div>
        )}
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
      {emergencyActive && <EmergencyOverlay state={cityLife} onCancel={stopEmergency} />}

      {!mapView && !riding && panel === null && <DailyActionHud state={cityLife}
        onStand={() => setCityLife(old => ({ ...cancelMeal(old), activity: null }))}
        onCancel={() => setCityLife(cancelMeal)} onBag={() => { setShopTab('marche'); open('shop') }} />}
      <div
        className={`hl-controls pointer-events-none absolute inset-x-0 bottom-[calc(100px+env(safe-area-inset-bottom,0px))] z-20 px-3 sm:px-5 ${mapView || riding ? 'hidden' : ''}`}
        inert={emergencyActive}
      >
        <div className="hl-control-columns mx-auto flex max-w-[900px] items-end justify-between gap-2">
          <div className="flex min-w-0 flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => open('home')}
              aria-label="Afficher les besoins du personnage"
              className="hl-needs pointer-events-auto flex min-w-0 items-center gap-2 rounded-full border border-white/70 bg-white/90 py-2 pl-2 pr-3 shadow-lg backdrop-blur"
            >
              <span className="hl-person flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-white">
                <UserRound size={21} />
              </span>
              <span className="hl-needs-grid grid grid-cols-2 gap-x-2 gap-y-0.5">
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
            {!(driving && cityLife.duty) && (
              <Joystick
                input={input}
                disabled={panel !== null || riding || emergencyActive}
                onActive={onJoystickActive}
              />
            )}
          </div>
          <div className="hl-actions pointer-events-auto flex flex-col items-end gap-2">
            {currentWorkStatus === 'ready' && panel === null && (
              <button
                type="button"
                onClick={() => action('work')}
                className="flex min-h-12 max-w-[13rem] items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-left text-xs font-black text-white shadow-lg"
              >
                <span aria-hidden className="text-lg">
                  💼
                </span>
                <span>
                  Faire mon service
                  <span className="block font-semibold">+{money(SALARIES[life.job])}</span>
                </span>
              </button>
            )}
            {!insideAny && !riding && (
              <button
                type="button"
                onClick={cycleCameraMode}
                aria-label={`${STREET_CAMERA_MODES[cameraMode].label}. Changer de caméra`}
                title="Changer la distance de la caméra"
                className="flex min-h-11 items-center gap-2 rounded-full border border-white/70 bg-white/95 px-3 py-2 text-xs font-black text-slate-800 shadow-lg backdrop-blur"
              >
                <Camera size={18} className="text-emerald-700" />
                {!onDuty && STREET_CAMERA_MODES[cameraMode].shortLabel}
              </button>
            )}
            {onDuty && dutyCare && (
              // One line over the street; tap it for the details of the shift.
              <button
                type="button"
                data-testid="service-status"
                aria-expanded={dutyOpen}
                onClick={() => setDutyOpen((o) => !o)}
                className="flex max-w-[14rem] items-center gap-1.5 rounded-full bg-emerald-800/90 py-1.5 pl-1.5 pr-3 text-left text-[11px] font-bold text-white shadow-lg backdrop-blur"
              >
                {fare && serviceState.phase === 'trip' && !serviceState.stop ? (
                  <span
                    data-testid="fare-banner"
                    aria-label={`Course vers ${fare.to.name}`}
                    className="flex min-w-0 items-center gap-1.5"
                  >
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-black text-slate-900"
                      style={{ transform: `rotate(${fareLive.arrow.toFixed(0)}deg)` }}
                    >
                      ↑
                    </span>
                    <span className="shrink-0">{money(fare.price)}</span>
                    <span className="truncate font-semibold text-emerald-100">{fare.to.name}</span>
                  </span>
                ) : (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden className="text-sm leading-none">
                      {serviceState.stop
                        ? serviceState.stop.service === 'fuel'
                          ? '⛽'
                          : serviceState.stop.service === 'garage'
                            ? '🔧'
                            : '👮'
                        : serviceState.phase === 'pickup'
                          ? '🧍'
                          : serviceState.phase === 'paid'
                            ? '✅'
                            : '🔎'}
                    </span>
                    <span className="truncate">
                      {serviceState.stop
                        ? serviceState.stop.service === 'fuel'
                          ? 'Station-service'
                          : serviceState.stop.service === 'garage'
                            ? 'Garage'
                            : 'Contrôle de police'
                        : serviceState.phase === 'pickup'
                          ? hail
                          : serviceState.phase === 'paid'
                            ? 'Course payée'
                            : 'Client…'}
                    </span>
                  </span>
                )}
              </button>
            )}
            {onDuty && dutyCare && dutyOpen && (
              <output
                data-testid="service-details"
                className="max-w-[14rem] rounded-2xl bg-emerald-900/90 px-3 py-2 text-[11px] text-white shadow-lg"
              >
                {fare && (
                  <span className="block truncate font-bold">
                    {fare.passenger} → {fare.to.name} · {fareLive.left} cases
                  </span>
                )}
                <span className="block">
                  {serviceState.completed} course(s) · brut {money(serviceState.earned)}
                </span>
                <span className="block text-emerald-100">
                  ⛽ {(dutyCare.fuelMl / 1000).toFixed(1)} L · entretien automatique
                </span>
                {dutyCare.lastReceipt && (
                  <span className="block font-bold">
                    Dernière course : net +{money(dutyCare.lastReceipt.net)}
                  </span>
                )}
              </output>
            )}
            {!insideAny && ownOut && !nearVehicle && !driving && panel === null && (
              <button
                type="button"
                onClick={() => takeOutVehicle(ownOut.id)}
                className="min-h-12 max-w-[12rem] rounded-2xl bg-amber-400 px-3 py-2 text-xs font-black shadow"
              >
                {ownOut.kind === 'moto' ? '🏍️ Retrouver ma moto' : '🚗 Retrouver ma voiture'}
              </button>
            )}
            {!insideAny && cityLife.duty && !nearVehicle && !driving && panel === null && (
              <button
                type="button"
                onClick={() => setDuty(cityLife.duty ?? null)}
                className="min-h-12 max-w-[12rem] rounded-2xl bg-amber-400 px-3 py-2 text-xs font-black shadow"
              >
                {cityLife.duty === 'moto' ? '🏍️ Retrouver ma moto' : '🚕 Retrouver mon taxi'}
              </button>
            )}
            {!insideAny && (nearVehicle || driving) && (
              <button
                type="button"
                aria-label={
                  ownOut
                    ? ownOut.kind === 'moto'
                      ? driving
                        ? 'Descendre de ma moto'
                        : 'Monter sur ma moto'
                      : driving
                        ? 'Descendre de ma voiture'
                        : 'Monter dans ma voiture'
                    : vehicleKind === 'moto'
                      ? driving
                        ? 'Descendre du zémidjan'
                        : 'Monter sur le zémidjan'
                      : driving
                        ? 'Descendre du taxi'
                        : 'Monter dans le taxi'
                }
                onClick={toggleVehicle}
                disabled={serviceState.stopRequested}
                className="flex min-h-12 max-w-[12rem] items-center justify-center rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-slate-900 shadow disabled:bg-slate-200"
              >
                {serviceState.stopRequested
                  ? 'Arrêt prévu à l’arrivée'
                  : driving && fare
                    ? 'Descendre à l’arrivée'
                    : driving
                      ? 'Descendre'
                      : vehicleKind === 'moto'
                        ? '🏍️ Monter'
                        : vehicleKind === 'car'
                          ? '🚗 Monter'
                          : '🚕 Monter'}
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
                  <span className="block">
                    {nearAd.campaign.advertiser.kind === 'vacant'
                      ? 'Louer ce panneau'
                      : 'Lire l’annonce'}
                  </span>
                  <span className="block truncate text-[11px] font-semibold text-slate-500">
                    {nearAd.campaign.advertiser.kind === 'vacant'
                      ? `dès ${money(RENT_OPTIONS[0].price)}`
                      : isSponsored(nearAd.campaign)
                        ? 'Promotion'
                        : nearAd.campaign.advertiser.name}
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
            {!onDuty && (
              <>
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
              </>
            )}
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
        <div className={`hl-journal pointer-events-auto mx-auto mt-2 max-w-[900px] ${onDuty ? 'hidden' : ''}`}>
          <button
            type="button"
            onClick={() => open('journal')}
            aria-live="polite"
            className="hl-journal-entry max-w-[94%] rounded-2xl bg-slate-950/65 px-3 py-2 text-left text-[11px] font-medium text-white shadow backdrop-blur sm:text-xs"
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

      {waitingAtSignal && !insideAny && !policeStop && !mapView && <output className="pointer-events-none absolute inset-x-4 top-[152px] z-20 mx-auto max-w-sm rounded-2xl bg-white/95 p-3 text-center text-sm font-bold text-emerald-950 shadow">🚦 J’attends le vert piéton, puis je traverse.</output>}
      {policeStop && <PedestrianStop reason={policeStop} message={cityLife.life.lastEvent} onResume={() => {
        controller.policeStopped = false
        input.x = 0
        input.y = 0
        input.run = false
        const graph = controller.pavements
        const n = graph?.nearest(controller.pos)
        if (graph && n !== undefined && n >= 0) {
          const p = graph.nodes[n]
          controller.route = [{ x: p.x, z: p.z }]
        }
        setPoliceStop(null)
        setNotice('Retour au trottoir. Carte → destination → À pied : je marche prudemment pour toi.')
      }} />}
      {talkNpc && (
        <section
          aria-label="Conversation"
          className="pointer-events-auto absolute inset-x-3 bottom-[calc(100px+env(safe-area-inset-bottom,0px))] z-40 mx-auto max-h-[75dvh] max-w-[520px] overflow-y-auto overscroll-contain rounded-[24px] bg-white p-4 shadow-2xl"
        >
          <button
            type="button"
            onClick={() => setTalkNpc(null)}
            aria-label="Fermer la conversation"
            className="mb-2 ml-auto block rounded-full bg-slate-100 px-3 py-2 text-xs font-bold"
          >
            Fermer ✕
          </button>
          <ResidentConversation
            key={`${cityLife.insideLot ?? life.inside}:${talkNpc.id}`}
            resident={{
              key: `${cityLife.insideLot ?? life.inside}:${talkNpc.id}`,
              name: talkNpc.role,
              role: talkNpc.role,
              lot: cityLife.insideLot ? (lotById(cityLife.insideLot) ?? undefined) : undefined,
            }}
            state={cityLife}
            onChange={setCityLife}
            onAction={(a) => {
              setTalkNpc(null)
              startActivity(a)
            }}
          />
        </section>
      )}
      <nav
        aria-label="Navigation du jeu"
        inert={emergencyActive}
        className="hl-navigation absolute inset-x-0 bottom-0 z-30 px-3 pb-[max(10px,env(safe-area-inset-bottom,0px))]"
      >
        <div className="hl-dock mx-auto grid max-w-[520px] grid-cols-4 gap-1 rounded-[26px] border border-white/75 bg-white/95 p-2 shadow-2xl backdrop-blur-lg">
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
                  // « Aménager » opens on the furniture at home, on the market everywhere else.
                  if (item.id === 'shop')
                    setShopTab(life.inside === 'house' && !cityLife.insideLot ? 'meubles' : 'marche')
                  open(item.id)
                }}
                className={
                  'hl-nav-item relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[18px] text-[11px] font-semibold transition ' +
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

      {pending && !emergencyActive && (
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
          onExit={
            onExit
              ? () => {
                  flushSave()
                  onExit()
                }
              : undefined
          }
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
              className="hl-sheet fixed inset-x-0 bottom-[calc(var(--haroo-bottom-gap,0px)+85px+env(safe-area-inset-bottom,0px))] z-[120] mx-auto flex max-h-[min(calc(var(--haroo-visible-height,100vh)*0.68),680px)] w-[calc(100%-16px)] max-w-[620px] flex-col overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-2xl outline-none sm:max-h-[calc(var(--haroo-visible-height,100vh)*0.7)]"
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
                      : `HarooLife · ${LOCALITIES[cityLife.locality].name} · Quartier fictif`}
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
                {panel === 'services' && <PublicServices state={cityLife} onCall={requestEmergency} onMayor={visitMayor} onInspect={inspectWorks} />}
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
                  <div role="tablist" aria-label="Aménager" className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
                    {([['meubles', 'Meubles'], ['vehicules', 'Véhicules'], ['marche', 'Marché']] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={shopTab === id}
                        onClick={() => setShopTab(id)}
                        className={`min-h-11 rounded-xl text-xs font-bold ${shopTab === id ? 'bg-white text-emerald-800 shadow' : 'text-slate-600'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {panel === 'shop' && shopTab === 'meubles' && (
                  <FurnitureShop state={cityLife} onChange={setCityLife} onPlace={furnishing.start} />
                )}
                {panel === 'shop' && shopTab === 'vehicules' && (
                  <VehicleShop
                    state={cityLife}
                    onChange={setCityLife}
                    onTakeOut={takeOutVehicle}
                    onPutAway={putAwayVehicle}
                    driving={driving}
                  />
                )}
                {panel === 'shop' && shopTab === 'marche' && (
                  <>
                    <GameMarket
                      state={cityLife}
                      onChange={setCityLife}
                      onEat={eatMeal}
                      onGoMarket={() => {
                        const market = landmarks().find((l) => l.type === 'market')
                        if (market) {
                          setTalkNpc(null)
                          // Choosing a destination also leaves the current interior.
                          setCityLife((old) => ({
                            ...old,
                            insideLot: null,
                            activity: null,
                            life: old.life.inside ? interact(old.life, 'leave') : old.life,
                          }))
                          goLot(market)
                        }
                      }}
                      onRealOffers={() => setPanel('market')}
                    />
                    <details className="rounded-2xl border border-slate-100 p-3">
                      <summary className="text-sm font-bold">
                        Repas du domaine · {life.meals} disponible(s)
                      </summary>
                      <ActionButton
                        title="Acheter au domaine · 650 FCFA"
                        onClick={() => action('buy-meal')}
                      />
                    </details>
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
                      <AviationPanel state={cityLife} onFly={fly} />
                      <NationalMap
                        current={cityLife.locality}
                        onPick={(id) => {
                          if (id !== cityLife.locality) {
                            if (routeOf(cityLife.locality, id)) setCoachTo(id)
                            else travel(id)
                          }
                        }}
                      />
                      <div className="mt-2 grid gap-1">
                        {LOCALITY_IDS.filter((id) => id !== cityLife.locality).map((id) => {
                          const trip = tripTo(cityLife, id)
                          const road = routeOf(cityLife.locality, id)
                          return (
                            <div key={id} className="grid gap-1">
                              <button
                                type="button"
                                aria-expanded={road ? coachTo === id : undefined}
                                onClick={() =>
                                  road ? setCoachTo(coachTo === id ? null : id) : travel(id)
                                }
                                className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-left text-xs ring-1 ring-slate-200 hover:ring-emerald-400"
                              >
                                <span className="text-base">
                                  {airTrip(cityLife.locality, id) ? '✈️' : '🚌'}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block font-bold">
                                    Voyager vers {LOCALITIES[id].name}
                                  </span>
                                  <span className="block text-slate-500">
                                    {road
                                      ? (() => {
                                          const trips = companiesBetween(cityLife.locality, id)
                                            .map((c) =>
                                              coachTrip(cityLife.locality, id, c, life.hour),
                                            )
                                            .filter((t) => t !== null)
                                          const cheapest = Math.min(...trips.map((t) => t.fare))
                                          const hours = Math.min(...trips.map((t) => t.hours))
                                          const air = airTrip(cityLife.locality, id)
                                          return `Car dès ${money(cheapest)}, ${hours} h par ${road
                                            .slice(1, -1)
                                            .map((s) => s.name)
                                            .join(
                                              ', ',
                                            )}${air ? ` · Avion ${air.hours} h, ${money(air.fare)}` : ''}.`
                                        })()
                                      : `${LOCALITIES[id].note} Car interurbain : ${trip.hours} h, ${money(trip.fare)}.`}
                                  </span>
                                </span>
                                <ArrowRight size={14} className="shrink-0 text-emerald-700" />
                              </button>
                              {road && coachTo === id && (
                                <ul
                                  aria-label={`Compagnies vers ${LOCALITIES[id].name}`}
                                  data-testid="coach-companies"
                                  className="grid gap-1 pl-3"
                                >
                                  {airTrip(cityLife.locality, id) && (
                                    <li>
                                      <button
                                        type="button"
                                        aria-label={`Prendre l’avion vers ${LOCALITIES[id].name}`}
                                        onClick={() => fly(id)}
                                        className="flex w-full items-center gap-3 rounded-xl bg-sky-50 px-3 py-2 text-left text-xs ring-1 ring-sky-200 hover:ring-sky-500"
                                      >
                                        <span className="min-w-0 flex-1">
                                          <span className="block font-bold">
                                            ✈️ Avion · {airTrip(cityLife.locality, id)?.from} →{' '}
                                            {airTrip(cityLife.locality, id)?.to}
                                          </span>
                                          <span className="block text-slate-600">
                                            {atAirport(cityLife)
                                              ? 'Tu es au terminal : embarquement maintenant'
                                              : 'Un taxi te dépose au terminal, puis tu embarques'}{' '}
                                            · {airTrip(cityLife.locality, id)?.hours} h de vol
                                          </span>
                                        </span>
                                        <strong className="shrink-0">
                                          {money(airTrip(cityLife.locality, id)?.fare ?? 0)}
                                        </strong>
                                      </button>
                                    </li>
                                  )}
                                  {companiesBetween(cityLife.locality, id).map((c) => {
                                    const t = coachTrip(cityLife.locality, id, c, life.hour)
                                    if (!t) return null
                                    return (
                                      <li key={c.id}>
                                        <button
                                          type="button"
                                          aria-label={`Prendre le car ${c.name} vers ${LOCALITIES[id].name}`}
                                          onClick={() => travel(id, c.id)}
                                          className="flex w-full items-center gap-3 rounded-xl bg-amber-50 px-3 py-2 text-left text-xs ring-1 ring-amber-200 hover:ring-amber-500"
                                        >
                                          <span className="min-w-0 flex-1">
                                            <span className="block font-bold">{c.name}</span>
                                            <span className="block text-slate-600">
                                              Départ {hh(t.departs)}
                                              {t.wait ? ` (dans ${t.wait} h)` : ' (maintenant)'} ·{' '}
                                              {t.hours} h de route · {c.note}
                                            </span>
                                          </span>
                                          <strong className="shrink-0">{money(t.fare)}</strong>
                                        </button>
                                      </li>
                                    )
                                  })}
                                  <li className="px-1 text-[10px] text-slate-500">
                                    Car : plafonds officiels de déc. 2024 et prix observés des
                                    compagnies (hausse du carburant en 2026 possible). Avion : prix
                                    annoncé par Liz Aviation en 2023, ligne non confirmée en 2026.
                                    Horaires du jeu. Argent du jeu uniquement.
                                  </li>
                                </ul>
                              )}
                            </div>
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
                                <span className="text-base">{lotIcon(lot)}</span>
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
                    {cityLife.locality === 'lome' ? (
                      <>
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
                          {LIFE_LOCATIONS.filter((place) =>
                            matchesFilter(mapFilter, place.venue),
                          ).map((place) => (
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
                          ))}
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
                            Les noms du domaine suivent la ville où tu habites. Pour changer de
                            ville, voyage depuis la carte du Togo ci-dessus.
                          </p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                          <strong>Panneaux publicitaires</strong>
                          <p className="mt-1 text-xs text-slate-500">
                            Un panneau par quartier, visible par tous les habitants. Tarif affiché
                            par semaine ; aucune réservation n’est encore facturée.
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
                      </>
                    ) : (
                      <section
                        className="rounded-2xl bg-slate-50 p-3 text-sm"
                        aria-label="Quartiers de la ville"
                      >
                        <strong>Les quartiers de {LOCALITIES[cityLife.locality].name}</strong>
                        <ul className="mt-2 space-y-1 text-xs text-slate-600">
                          {districts().map((d) => (
                            <li key={d.id}>
                              <strong>{d.name}</strong> · {d.note}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
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
                        Ces trajets te déposent automatiquement. Pour gagner de l’argent, ouvre
                        Métiers et monte dans ton véhicule de service.
                      </p>
                    </div>
                  </>
                )}
                {panel === 'invite' && <InvitePanel onOpen={() => void invites.refresh()} />}
                {panel === 'housing' && (
                  <HousingPanel
                    state={cityLife}
                    onPay={(bill) => setCityLife((old) => payBill(old, bill))}
                    onMove={(q, kind) => setCityLife((old) => moveHome(old, q, kind))}
                    onReceive={(name) => setCityLife((old) => receiveGuest(old, name))}
                    onBuild={(change) => setCityLife(change)}
                    online={realtime.state.present
                      .filter(
                        (p) => p.locality === cityLife.locality && p.key !== realtime.state.me?.key,
                      )
                      .slice(0, 6)
                      .map((p) => ({ key: p.key, name: p.name }))}
                    onInvitePlayer={async (g) => {
                      const client = realtime.client
                      if (!client) return 'Messagerie indisponible pour le moment.'
                      const dm = await client.openDm(g.key)
                      if ('error' in dm) return dm.error
                      const where = quartierById(housingOf(cityLife).quartier)?.name ?? 'Lomé'
                      const refused = client.send(
                        dm.room,
                        `Viens chez moi ce soir à ${where} ! On boit une sucrerie et on cause.`,
                      )
                      return refused
                        ? String(refused)
                        : `Invitation envoyée à ${g.name} en message privé.`
                    }}
                  />
                )}
                {panel === 'photo' && (
                  <PhotoPanel
                    place={
                      cityLife.insideLot
                        ? `${lotById(cityLife.insideLot)?.name ?? 'Lomé'}, ${LOCALITIES[cityLife.locality].name}`
                        : LOCALITIES[cityLife.locality].name
                    }
                  />
                )}
                {panel === 'farm' && (
                  <FarmPanel cityLife={cityLife} update={(change) => setCityLife(change)} />
                )}
                {panel === 'debates' &&
                  (() => {
                    const debate = debateOfDay(today)
                    const joke = jokeAt(jokeN)
                    const canTalk =
                      !!realtime.client &&
                      realtime.state.status === 'online' &&
                      !!realtime.state.me?.can_write
                    // Post in the « Togo » room, then open it: the real players argue there.
                    const say = (body: string) => {
                      if (!canTalk || !realtime.client) {
                        setDebateNote(
                          'Le salon Togo n’est pas disponible : connecte-toi et choisis ta maison pour débattre.',
                        )
                        return
                      }
                      const refused = realtime.client.send('world:togo', body)
                      if (refused) {
                        setDebateNote(refused)
                        return
                      }
                      setDebateNote('')
                      setChatRoom('world:togo')
                      setPanel('messages')
                    }
                    return (
                      <div className="space-y-4" data-testid="debates">
                        <section
                          aria-label="Débat du jour"
                          className="space-y-3 rounded-3xl bg-[#123b33] p-4 text-white"
                        >
                          <p className="text-xs font-semibold text-emerald-200">
                            🎤 Débat du jour · même sujet pour tout le Togo
                          </p>
                          <p className="text-xl font-black leading-tight">{debate.question}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {debate.sides.map((side, i) => (
                              <button
                                type="button"
                                key={side}
                                onClick={() => say(voteMessage(debate, i as 0 | 1))}
                                className={`min-h-14 rounded-2xl px-3 py-2 text-sm font-black text-slate-900 shadow ${
                                  i === 0 ? 'bg-amber-300' : 'bg-emerald-300'
                                }`}
                              >
                                {side}
                              </button>
                            ))}
                          </div>
                          <p className="text-xs text-emerald-100">
                            Ton camp est annoncé dans le salon « Togo », où les autres joueurs te
                            répondent.
                          </p>
                        </section>
                        <section
                          aria-label="Blague du jour"
                          className="space-y-3 rounded-3xl bg-amber-50 p-4 ring-1 ring-amber-200"
                        >
                          <p className="text-xs font-semibold text-amber-800">😂 Blague du jour</p>
                          <p className="text-base font-semibold leading-snug text-slate-900">
                            {joke}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setJokeN((n) => n + 1)}
                              className="flex-1 rounded-xl bg-white px-3 py-3 text-sm font-bold text-slate-800 ring-1 ring-amber-200"
                            >
                              Une autre
                            </button>
                            <button
                              type="button"
                              onClick={() => say(jokeMessage(joke))}
                              className="flex-1 rounded-xl bg-amber-500 px-3 py-3 text-sm font-black text-white"
                            >
                              Partager au salon Togo
                            </button>
                          </div>
                        </section>
                        <TogoBuzzCards origin={cityLife.origin} onShare={say} />
                        {debateNote && (
                          <p role="status" className="text-sm text-slate-600">
                            {debateNote}
                          </p>
                        )}
                      </div>
                    )
                  })()}
                {panel === 'online' && (
                  <PlayersDirectory
                    counts={gamePlayers}
                    client={realtime.client}
                    relayOnline={online}
                    onRoom={(room) => {
                      setChatRoom(room)
                      setPanel('messages')
                    }}
                  />
                )}
                {/* Nearby players come from the live relay; without it, the count above says enough. */}
                {panel === 'online' && (online || !gamePlayers) && (
                  <OnlinePlayers
                    state={realtime.state}
                    locality={cityLife.locality}
                    onPlayer={(key) => {
                      setPlayerKey(key)
                      setPlayerNote('')
                      setPanel('player')
                    }}
                  />
                )}
                {panel === 'jobs' && (
                  <>
                    <EmploymentPanel state={cityLife} onChange={setCityLife} onGo={goService} />
                    <p className="text-sm text-slate-600">
                      Choisis un métier et rends-toi sur place entre 7h et 19h. Un seul salaire par
                      journée.
                    </p>
                    {JOBS.map((job) => (
                      <button
                        type="button"
                        key={job}
                        onClick={() => chooseJob(job)}
                        className={
                          'flex w-full items-center justify-between rounded-2xl border p-4 text-left text-sm ' +
                          (life.job === job
                            ? 'border-emerald-600 bg-emerald-50'
                            : 'border-slate-200 bg-white')
                        }
                      >
                        <span>
                          <strong className="block">
                            {TOGO_JOBS[job].icon} {TOGO_JOBS[job].label}
                          </strong>
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
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                      <p className="font-black">
                        {currentWorkStatus === 'done'
                          ? '✅ Service payé aujourd’hui'
                          : currentWorkStatus === 'closed'
                            ? '🌙 Service fermé · ouverture à 7 h'
                            : currentWorkStatus === 'tired'
                              ? '😴 Trop fatigué pour commencer'
                              : currentWorkStatus === 'hungry'
                                ? '🍲 Mange avant ton service'
                                : currentWorkStatus === 'away'
                                  ? '📍 Rejoins ton lieu de travail'
                                  : '💼 Tu es sur place · service prêt'}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Métier : {TOGO_JOBS[life.job].label} · salaire {money(SALARIES[life.job])}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {currentWorkStatus === 'closed' && (
                        <ActionButton title="Se reposer jusqu’à 7 h" onClick={waitForWork} />
                      )}
                      {currentWorkStatus === 'away' && (
                        <ActionButton title="Aller au travail" onClick={() => goToWork()} />
                      )}
                      {currentWorkStatus === 'ready' && (
                        <ActionButton
                          title={`Faire le service · +${money(SALARIES[life.job])}`}
                          onClick={() => action('work')}
                        />
                      )}
                      {(currentWorkStatus === 'tired' || currentWorkStatus === 'hungry') && (
                        <ActionButton title="Pause et collation · 1 h" onClick={prepareWorkNeeds} />
                      )}
                      <ActionButton title="Fermer" outline onClick={() => setPanel(null)} />
                    </div>
                    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm font-black">Au volant : payé à la course</p>
                      <p className="text-xs text-slate-600">
                        Monte sur ton véhicule : il cherche les clients, les prend en charge, suit
                        les routes et encaisse à l’arrivée automatiquement. Les courses s’enchaînent
                        jusqu’à ta descente. Essence et réserve entretien sont déduites de chaque
                        recette : ton gain net est affiché. Les arrêts à la station, au garage et à
                        la brigade sont automatiques.
                      </p>
                      {(
                        [
                          ['moto', '🏍️ Zémidjan (moto-taxi)', 'Dès 200 FCFA la course'],
                          ['taxi', '🚕 Taxi', 'Dès 400 FCFA la course'],
                        ] as const
                      ).map(([kind, label, price]) => (
                        <button
                          type="button"
                          key={kind}
                          data-testid={`duty-${kind}`}
                          onClick={() => setDuty(cityLife.duty === kind ? null : kind)}
                          className={
                            'flex w-full items-center justify-between rounded-2xl border p-3 text-left text-sm ' +
                            (cityLife.duty === kind
                              ? 'border-emerald-600 bg-emerald-50'
                              : 'border-slate-200 bg-white')
                          }
                        >
                          <span>
                            <strong className="block">{label}</strong>
                            <span className="text-xs text-slate-500">{price}</span>
                          </span>
                          <span className="text-xs font-bold">
                            {cityLife.duty === kind ? '✓ En service · Arrêter' : 'Commencer'}
                          </span>
                        </button>
                      ))}
                      <p className="text-xs text-slate-600">
                        En commençant, un véhicule de service est garé sur la route la plus proche
                        et ton personnage s’y rend automatiquement.
                      </p>
                      {cityLife.duty && !driving && (
                        <ActionButton
                          title="Rapprocher mon véhicule de service"
                          onClick={() => setDuty(cityLife.duty ?? null)}
                        />
                      )}
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
                    {(['taxi', 'moto'] as const)
                      .filter((kind) => cityLife.fleet?.[kind] || cityLife.duty === kind)
                      .map((kind) => {
                        const care = vehicleCare(cityLife, kind)
                        return (
                          <section
                            key={kind}
                            className="rounded-2xl border border-emerald-100 p-4 text-sm"
                            data-testid={`vehicle-ledger-${kind}`}
                          >
                            <h3 className="font-black">
                              {kind === 'taxi' ? '🚕 Taxi' : '🏍️ Zémidjan'} · frais automatiques
                            </h3>
                            <p className="mt-1 text-xs text-slate-500">
                              Super : {GAME_FUEL_PER_LITRE} FCFA/L · référence officielle du
                              11/09/2026, vérifiée le 16/10/2026. Réservoir initial fourni. Les
                              provisions sont débitées sur les recettes, puis utilisées à la pompe
                              et au garage.{' '}
                              <a
                                href={FUEL_REFERENCE.source}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                              >
                                Source Togo Officiel
                              </a>
                              .
                            </p>
                            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <dt>Réservoir</dt>
                              <dd>
                                {(care.fuelMl / 1000).toFixed(2)} /{' '}
                                {VEHICLE_RULES[kind].tankMl / 1000} L
                              </dd>
                              <dt>Provision essence</dt>
                              <dd>{money(care.fuelReserve)}</dd>
                              <dt>Réserve entretien</dt>
                              <dd>{money(care.maintenanceReserve)}</dd>
                              <dt>Kilométrage</dt>
                              <dd>
                                {care.km.toFixed(1)} km · {care.courses} courses
                              </dd>
                              <dt>Arrêts effectués</dt>
                              <dd>
                                {care.refills} plein(s), {care.services} entretien(s), {care.checks}{' '}
                                contrôle(s)
                              </dd>
                            </dl>
                            {care.lastReceipt && (
                              <div
                                className="mt-3 rounded-xl bg-emerald-50 p-3"
                                aria-label="Reçu de la dernière course"
                              >
                                <p className="text-xs">{care.lastReceipt.destination}</p>
                                <p>Recette : {money(care.lastReceipt.gross)}</p>
                                <p>Essence : −{money(care.lastReceipt.fuel)}</p>
                                <p>Réserve entretien : −{money(care.lastReceipt.maintenance)}</p>
                                <strong className="block">
                                  Net gagné : +{money(care.lastReceipt.net)}
                                </strong>
                              </div>
                            )}
                            <p className="mt-2 text-xs text-slate-500">
                              Arrêt essence à 25 %, entretien tous les 8 km de jeu et contrôle tous
                              les 3 trajets. Rythme accéléré pour la simulation.
                            </p>
                          </section>
                        )
                      })}
                    <ActionButton title="Trouver un travail" onClick={() => open('jobs')} />
                  </>
                )}
                {panel === 'messages' && realtime.state.status !== 'disabled' && (
                  <LiveChat
                    key={chatRoom ?? 'rooms'}
                    initialRoom={chatRoom}
                    client={realtime.client}
                    state={realtime.state}
                    locality={cityLife.locality}
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
                      Touche une construction : elle est bâtie sur le terrain libre le plus proche
                      de toi, au bord d’une route. Les ressources sont déduites du budget municipal
                      fictif.
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
                          onClick={() => buildNear(b)}
                          disabled={
                            life.city.coins < CATALOG[b].coins || life.city.wood < CATALOG[b].wood
                          }
                          className={
                            'rounded-2xl border p-3 text-left text-xs disabled:opacity-50 ' +
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
                      title={`Choisir moi-même l’emplacement (${CATALOG[building].label})`}
                      outline
                      onClick={() => {
                        setMode('build')
                        setPanel(null)
                      }}
                    />
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
                        data-testid={`mission-${i}`}
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
                        <span className="min-w-0 flex-1">{m.text}</span>
                        {!m.done && (
                          <button
                            type="button"
                            onClick={m.run}
                            className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white"
                          >
                            {m.go}
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-2">
                      {currentWorkStatus !== 'done' && (
                        <ActionButton title={workNextStep().title} onClick={workNextStep().run} />
                      )}
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
                {panel === 'player' && playerKey?.startsWith('npc:') && (
                  <div data-testid="npc-sheet">
                    <ResidentConversation
                      key={playerKey}
                      resident={{
                        key: playerKey,
                        name: playerKey.slice(4),
                        role: isStudent(playerKey.slice(4))
                          ? 'Étudiant à l’université'
                          : 'Habitant du quartier',
                      }}
                      state={cityLife}
                      onChange={setCityLife}
                    />
                  </div>
                )}
                {panel === 'player' &&
                  playerKey &&
                  !playerKey.startsWith('npc:') &&
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
                        <form
                          aria-label={`Envoyer de l’argent à ${name}`}
                          className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3"
                          onSubmit={(e) => {
                            e.preventDefault()
                            void giveMoney(playerKey, name)
                          }}
                        >
                          <p className="text-sm font-black">💸 Envoyer de l’argent du jeu</p>
                          <div className="flex flex-wrap gap-1">
                            {[500, 1000, 2000, 5000].map((v) => (
                              <button
                                type="button"
                                key={v}
                                aria-pressed={gift.amount === String(v)}
                                onClick={() => {
                                  giftClient.current = null
                                  setGift((g) => ({ ...g, amount: String(v) }))
                                }}
                                className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${
                                  gift.amount === String(v)
                                    ? 'bg-amber-500 text-white ring-amber-500'
                                    : 'bg-white text-slate-800 ring-amber-200'
                                }`}
                              >
                                {money(v)}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input
                              aria-label="Montant en FCFA"
                              inputMode="numeric"
                              value={gift.amount}
                              onChange={(e) => {
                                giftClient.current = null
                                setGift((g) => ({
                                  ...g,
                                  amount: e.target.value.replace(/[^0-9]/g, '').slice(0, 5),
                                }))
                              }}
                              className="w-24 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                            />
                            <input
                              aria-label="Un mot (facultatif)"
                              value={gift.note}
                              maxLength={80}
                              placeholder="Un mot (facultatif)"
                              onChange={(e) => setGift((g) => ({ ...g, note: e.target.value }))}
                              className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={gift.busy || blocked}
                            className="w-full rounded-xl bg-amber-500 px-3 py-3 text-sm font-black text-white disabled:opacity-50"
                          >
                            {gift.busy ? 'Envoi…' : `Envoyer ${money(Number(gift.amount) || 0)}`}
                          </button>
                          <p className="text-[11px] text-slate-600">
                            Argent du jeu uniquement. Au plus 50 000 FCFA par envoi et 100 000 par
                            jour.
                          </p>
                        </form>
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
                    const layout = room ? layoutFor(room, lot, life) : null
                    const acts = actionsFor(lot.type, lot.service)
                    // The same way as the trip itself: from the lawn or a plot too, not only roads.
                    const path = here ? null : pathToLot(cityLife, lot)
                    const cells = path ? path.length - 1 : null
                    const eta = (perCell: number) =>
                      cells === null
                        ? 'hors réseau'
                        : `~ ${Math.max(1, Math.round(cells * perCell))} min`
                    return (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-3xl">
                            {lotIcon(lot)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xl font-black">
                              {lot.name ?? TYPE_LABELS[lot.type]}
                            </p>
                            <p className="text-xs text-slate-500">
                              📍 {districts().find((d) => d.id === lot.district)?.name},{' '}
                              {LOCALITIES[cityLife.locality].name} · {TYPE_LABELS[lot.type]}
                              {lot.name && lot.floors > 1 ? ` · ${lot.floors} niveaux` : ''}
                            </p>
                          </div>
                        </div>
                        {lot.type === 'market' && (
                          <div className="grid grid-cols-2 gap-2" aria-label="Vendeurs du marché">
                            {STREET_VENDORS.map((vendor, index) => (
                              <div key={vendor.id} className="rounded-2xl bg-amber-50 p-3 text-xs">
                                <strong className="block text-sm">
                                  {vendor.icon} {vendor.name}
                                </strong>
                                <span className="block text-slate-600">
                                  {vendor.offer} · {money(vendor.price)}
                                </span>
                                <span className="mt-1 block italic text-amber-900">
                                  « {vendor.lines[(life.day + index) % vendor.lines.length]} »
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
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
                        {insideHere && /aéroport/i.test(lot.name ?? '') && (
                          <AviationPanel state={cityLife} onFly={fly} />
                        )}
                        {insideHere && acts.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-700">Choisir une activité</p>
                            {acts.map((a) => {
                              // The room's own wording when it has one (the lecture of the hour).
                              const prop = layout?.props.find((p) => p.action === a.id)
                              return (
                                <button
                                  type="button"
                                  key={a.id}
                                  onClick={() => startActivity(a.id)}
                                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm"
                                >
                                  <span className="font-bold">{prop?.label ?? a.label}</span>
                                  <span className="text-xs text-slate-500">
                                    {(a.id === 'fuel' || a.id === 'maintain') && cityLife.duty
                                      ? `À payer : ${money(manualVehicleQuote(cityLife, cityLife.duty, a.id === 'fuel' ? 'fuel' : 'garage'))} après provisions`
                                      : (prop?.hint ?? a.hint)}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {lot.type === 'townhall' && <output className="block rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">🚦 {municipalStatus(cityLife)}</output>}
                        {lot.type === 'university' && <Timetable day={life.day} hour={life.hour} />}
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
                            className={`grid gap-2 ${cityLife.locality === 'lome' ? 'grid-cols-4' : 'grid-cols-3'}`}
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
                                // The SOTRAL city bus runs in Lomé only, priced by distance.
                                ...(cityLife.locality === 'lome'
                                  ? [
                                      {
                                        t: 'bus' as const,
                                        icon: '🚌',
                                        label: 'Bus',
                                        price: money(sotralFare(cells ?? 0)),
                                        eta: eta(0.16),
                                      },
                                    ]
                                  : []),
                              ] as const
                            ).map((o) => (
                              <button
                                type="button"
                                key={o.t}
                                onClick={() => setTripChoice(o.t)}
                                disabled={
                                  cells === null ||
                                  life.wallet <
                                    (o.t === 'bus' ? sotralFare(cells) : TRAVEL_COST[o.t])
                                }
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
                              {TRANSPORT_LABEL[tripChoice]} vers {lot.name ?? TYPE_LABELS[lot.type]}
                            </p>
                            <p className="text-xs text-slate-600">
                              {TRAVEL_COST[tripChoice] === 0
                                ? 'Trajet gratuit.'
                                : tripChoice === 'bus'
                                  ? `Ticket SOTRAL ${money(sotralFare(cells ?? 0))} (tarif par distance depuis déc. 2024), payé au départ.`
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
                {panel === 'ad' && adFocus && !isAdFace(adFocus.campaign) && (
                  <BoardSheet
                    focus={adFocus}
                    posts={boardPosts}
                    wallet={life.wallet}
                    beforeRent={cloud.flush}
                    onRented={boardRented}
                    onClose={() => setPanel(null)}
                  />
                )}
                {panel === 'ad' && adFocus && isAdFace(adFocus.campaign) && (
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
                        : 'Le même personnage te suit dans la rue, dans les bâtiments et au volant. Ton apparence reste enregistrée sur cet appareil ; tu peux changer de tenue à tout moment.'}
                    </p>
                    {webgl === true && (
                      <GraphicsBoundary
                        onUnavailable={() =>
                          setNotice(
                            'L’aperçu 3D est indisponible ; le choix du personnage reste possible.',
                          )
                        }
                      >
                        <AvatarPreview
                          model={shownModel(avatar)}
                          pagne={pagneColor(avatar.pagne)}
                        />
                      </GraphicsBoundary>
                    )}
                    <div
                      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                      role="group"
                      aria-label="Choisir mon personnage"
                    >
                      {AVATAR_MODELS.map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          aria-pressed={shownModel(avatar) === m.id}
                          onClick={() => chooseAvatar({ model: m.id })}
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
