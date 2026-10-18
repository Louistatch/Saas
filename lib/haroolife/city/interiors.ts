import { actionsFor } from './activities'
/**
 * Interior layouts: furnished rooms for every kind of place, as data. A layout lists
 * equipment and furniture (procedural low-poly props or CC0 Kenney furniture), the
 * non-player characters at work in the room and what they do, and which action each
 * prop triggers. Pure data, so tests can check that a gym really has treadmills.
 */
import type { Interior } from './life'
import { nextSession, sessionAt, sessionKey, universityLayout } from './university'
import type { Lot } from './world'

export type PropKind =
  | 'fuel-pump'
  | 'treadmill'
  | 'bench-press'
  | 'dumbbell-rack'
  | 'bike'
  | 'mat'
  | 'locker'
  | 'reception'
  | 'shower'
  | 'toilet'
  | 'mirror'
  | 'plant'
  | 'water-cooler'
  | 'pew'
  | 'altar'
  | 'bed'
  | 'hospital-bed'
  | 'desk'
  | 'counter'
  | 'shelf'
  | 'table'
  | 'chair'
  | 'sofa'
  | 'tv'
  | 'fridge'
  | 'stove'
  | 'atm'
  | 'board'
  | 'stall'
  | 'cabinet'
  | 'sign'
  | 'lamp'
  | 'tree'
  | 'fountain'
  | 'crate'
export interface Prop {
  id: string
  kind: PropKind
  x: number
  z: number
  rot?: number
  /** Action sent when the prop is used (string: CityAction, estate Action or `use:` id). */
  action?: string
  /** Label shown in the HUD list of activities. */
  label?: string
  hint?: string
}
export type NpcAnim =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit'
  | 'sit-enter'
  | 'sit-exit'
  | 'eat'
  | 'eat-seated'
  | 'lift'
  | 'talk'
  | 'work'
  | 'pray'
  | 'rest'
  | 'sleep'
  | 'shower'
  | 'toilet'
  | 'cycle'
  | 'drive'
  | 'enter'
export interface Npc {
  id: string
  /** Adult avatar id from the shared catalogue. */
  model: string
  x: number
  z: number
  rot?: number
  anim: NpcAnim
  /** What this character is doing, shown in the sheet. */
  role: string
  /** Walks back and forth to this point when set. */
  to?: { x: number; z: number }
  /** A figurant (a student in the amphitheatre): present and animated, not talked to. */
  extra?: boolean
}
export interface Layout {
  /** City rooms use their own furniture actions; the prototype home remains unchanged. */
  cityType?: string
  name: string
  /** Room size (scene units). */
  w: number
  d: number
  floor: string
  wall: string
  trim: string
  props: Prop[]
  npcs: Npc[]
  /** Where the player stands on entering. */
  spawn: { x: number; z: number }
}

const CH = ['afi', 'abra', 'afi', 'kossi', 'koffi', 'kossi']

const GYM: Layout = {
  name: 'Salle de sport',
  w: 11,
  d: 9,
  floor: '#3a3f46',
  wall: '#f4c84a',
  trim: '#1f2937',
  props: [
    { id: 'sign', kind: 'sign', x: 0, z: -4.3 },
    // Cardio row along the back wall.
    {
      id: 'treadmill-1',
      kind: 'treadmill',
      x: -3.2,
      z: -2.9,
      action: 'use-treadmill',
      label: 'Tapis de course',
      hint: 'Forme +6 · Énergie −15 · 500 FCFA',
    },
    { id: 'treadmill-2', kind: 'treadmill', x: -1.9, z: -2.9, action: 'use-treadmill' },
    { id: 'treadmill-3', kind: 'treadmill', x: -0.6, z: -2.9, action: 'use-treadmill' },
    {
      id: 'bike-1',
      kind: 'bike',
      x: 1.0,
      z: -2.9,
      action: 'use-bike',
      label: 'Vélo',
      hint: 'Forme +4 · Énergie −10 · 500 FCFA',
    },
    { id: 'bike-2', kind: 'bike', x: 2.1, z: -2.9, action: 'use-bike' },
    // Free weights.
    {
      id: 'rack',
      kind: 'dumbbell-rack',
      x: -4.4,
      z: 0.2,
      rot: 90,
      action: 'use-weights',
      label: 'Musculation',
      hint: 'Forme +8 · Énergie −20 · 500 FCFA',
    },
    { id: 'bench-1', kind: 'bench-press', x: -2.6, z: 0.6, action: 'use-weights' },
    { id: 'bench-2', kind: 'bench-press', x: -1.0, z: 0.6, action: 'use-weights' },
    { id: 'mirror', kind: 'mirror', x: -4.42, z: -1.6 },
    // Mats and yoga.
    {
      id: 'mat-1',
      kind: 'mat',
      x: 1.4,
      z: 1.0,
      action: 'use-yoga',
      label: 'Yoga',
      hint: 'Loisir +12 · Forme +3',
    },
    { id: 'mat-2', kind: 'mat', x: 2.8, z: 1.0, action: 'use-yoga' },
    // Reception, lockers, showers, toilet.
    {
      id: 'reception',
      kind: 'reception',
      x: 3.6,
      z: 3.0,
      rot: 180,
      action: 'coach',
      label: 'Coach',
      hint: 'Forme +5 · 1 000 FCFA',
    },
    { id: 'cooler', kind: 'water-cooler', x: 4.6, z: 1.2 },
    { id: 'locker-1', kind: 'locker', x: 3.0, z: -4.1 },
    { id: 'locker-2', kind: 'locker', x: 3.7, z: -4.1 },
    { id: 'locker-3', kind: 'locker', x: 4.4, z: -4.1 },
    {
      id: 'shower-1',
      kind: 'shower',
      x: 4.6,
      z: -2.6,
      rot: -90,
      action: 'use-shower',
      label: 'Douche',
      hint: 'Hygiène +40',
    },
    { id: 'shower-2', kind: 'shower', x: 4.6, z: -1.4, rot: -90, action: 'use-shower' },
    {
      id: 'toilet',
      kind: 'toilet',
      x: 4.6,
      z: -0.2,
      rot: -90,
      action: 'toilet',
      label: 'Toilettes',
      hint: 'Vessie 100',
    },
    { id: 'plant-1', kind: 'plant', x: -4.5, z: 3.6 },
    { id: 'plant-2', kind: 'plant', x: 1.6, z: 3.8 },
  ],
  npcs: [
    {
      id: 'coach',
      model: CH[3],
      x: 3.6,
      z: 2.2,
      rot: 180,
      anim: 'idle',
      role: 'Coach Kossi, à l’accueil',
    },
    {
      id: 'runner-1',
      model: CH[0],
      x: -1.9,
      z: -2.75,
      rot: 180,
      anim: 'run',
      role: 'Afi court sur le tapis',
    },
    { id: 'runner-2', model: CH[4], x: 1.0, z: -2.75, rot: 180, anim: 'sit', role: 'Yao pédale' },
    {
      id: 'lifter',
      model: CH[5],
      x: -2.6,
      z: 0.95,
      rot: 0,
      anim: 'lift',
      role: 'Edem soulève des haltères',
    },
    { id: 'yogi', model: CH[1], x: 2.8, z: 1.0, rot: 0, anim: 'sit', role: 'Ama fait du yoga' },
    {
      id: 'walker',
      model: CH[2],
      x: 0.2,
      z: 2.6,
      rot: 90,
      anim: 'walk',
      role: 'Sena rejoint les vestiaires',
      to: { x: 2.4, z: -3.3 },
    },
  ],
  spawn: { x: 0.2, z: 3.4 },
}

const HOUSE: Layout = {
  name: 'Maison',
  w: 9,
  d: 8,
  floor: '#c7b399',
  wall: '#7293a1',
  trim: '#e8e5d8',
  props: [
    {
      id: 'bed',
      kind: 'bed',
      x: 2.4,
      z: -2.1,
      rot: 90,
      action: 'sleep',
      label: 'Dormir',
      hint: 'Énergie 100',
    },
    {
      id: 'sofa',
      kind: 'sofa',
      x: -1.0,
      z: 1.3,
      rot: 180,
      action: 'relax',
      label: 'Se détendre',
      hint: 'Loisir +40',
    },
    { id: 'tv', kind: 'tv', x: -1.0, z: -3.4, action: 'relax' },
    { id: 'fridge', kind: 'fridge', x: -3.4, z: -2.9 },
    {
      id: 'stove',
      kind: 'stove',
      x: -2.2,
      z: -3.2,
      action: 'eat',
      label: 'Manger',
      hint: 'Faim 100',
    },
    {
      id: 'table',
      kind: 'table',
      x: 1.2,
      z: 1.4,
      action: 'socialize',
      label: 'Discuter',
      hint: 'Social +38',
    },
    { id: 'chair-1', kind: 'chair', x: 1.9, z: 1.9, rot: 145, action: 'sit', label: 'S’asseoir' },
    // The dining corner: no button of its own, the meal walks the player there.
    { id: 'dining-table', kind: 'table', x: -1.6, z: -1.3 },
    { id: 'dining-1', kind: 'chair', x: -2.1, z: -2.0, action: 'sit' },
    { id: 'dining-2', kind: 'chair', x: -1.1, z: -2.0, action: 'sit' },
    {
      id: 'shower',
      kind: 'shower',
      x: 3.8,
      z: 1.0,
      rot: -90,
      action: 'wash',
      label: 'Se laver',
      hint: 'Hygiène 100',
    },
    {
      id: 'toilet',
      kind: 'toilet',
      x: 3.8,
      z: 2.4,
      rot: -90,
      action: 'toilet',
      label: 'Toilettes',
      hint: 'Vessie 100',
    },
    { id: 'plant', kind: 'plant', x: 3.6, z: -3.2 },
  ],
  npcs: [
    {
      id: 'neighbour',
      model: CH[1],
      x: -2.6,
      z: 2.4,
      rot: 90,
      anim: 'talk',
      role: 'Une voisine passe dire bonjour',
    },
  ],
  spawn: { x: 0, z: 2.8 },
}

const MARKET: Layout = {
  name: 'Commerce',
  w: 10,
  d: 8,
  floor: '#d8c39a',
  wall: '#c65c43',
  trim: '#f4ead8',
  props: [
    { id: 'meal-table', kind: 'table', x: 3.0, z: 1.7 },
    {
      id: 'meal-chair-1',
      kind: 'chair',
      x: 2.0,
      z: 1.7,
      rot: 90,
      action: 'sit',
      label: 'S’asseoir à table',
    },
    {
      id: 'meal-chair-2',
      kind: 'chair',
      x: 3.0,
      z: 2.9,
      rot: 180,
      action: 'sit',
      label: 'S’asseoir à table',
    },
    {
      id: 'counter',
      kind: 'counter',
      x: 0.4,
      z: -1.6,
      action: 'buy-meal',
      label: 'Acheter un repas',
      hint: '650 FCFA',
    },
    { id: 'shelf-1', kind: 'shelf', x: 3.2, z: -3.2 },
    { id: 'shelf-2', kind: 'shelf', x: 3.2, z: -1.4 },
    { id: 'stall-1', kind: 'stall', x: -2.6, z: 1.8, action: 'buy-meal' },
    { id: 'stall-2', kind: 'stall', x: -0.6, z: 1.8, action: 'buy-meal' },
    { id: 'crate-1', kind: 'crate', x: -3.8, z: -2.8 },
    { id: 'crate-2', kind: 'crate', x: -3.2, z: -2.8 },
    { id: 'fridge', kind: 'fridge', x: 4.1, z: 0.6 },
    { id: 'plant', kind: 'plant', x: -4.2, z: 3.4 },
  ],
  npcs: [
    {
      id: 'seller',
      model: CH[0],
      x: 0.4,
      z: -2.5,
      rot: 0,
      anim: 'work',
      role: 'La vendeuse sert au comptoir',
    },
    {
      id: 'shopper',
      model: CH[3],
      x: -1.6,
      z: 0.4,
      rot: 180,
      anim: 'walk',
      role: 'Un client compare les prix',
      to: { x: 2.4, z: 0.4 },
    },
    {
      id: 'shopper-2',
      model: CH[2],
      x: 1.2,
      z: -0.6,
      rot: 220,
      anim: 'idle',
      role: 'Une cliente attend son tour',
    },
  ],
  spawn: { x: 0, z: 3.0 },
}

const HALL: Layout = {
  name: 'Bureau public',
  w: 10,
  d: 8,
  floor: '#d9d4c7',
  wall: '#6b7a86',
  trim: '#f1efe8',
  props: [
    {
      id: 'desk-1',
      kind: 'desk',
      x: -1.2,
      z: -2.0,
      action: 'work',
      label: 'Travailler',
      hint: 'Salaire du jour',
    },
    {
      id: 'desk-2',
      kind: 'desk',
      x: 1.6,
      z: -2.0,
      action: 'work-city',
      label: 'Petit boulot',
      hint: '+1 500 FCFA · Énergie −20',
    },
    {
      id: 'desk-3',
      kind: 'desk',
      x: -1.2,
      z: 1.0,
      action: 'learn',
      label: 'Suivre un cours',
      hint: 'Compétence +1 · 1 000 FCFA',
    },
    {
      id: 'atm',
      kind: 'atm',
      x: 4.2,
      z: -1.0,
      rot: -90,
      action: 'bank',
      label: 'Mon compte',
      hint: 'Solde et dépenses',
    },
    { id: 'board', kind: 'board', x: 0.2, z: -3.9 },
    { id: 'chair-1', kind: 'chair', x: -1.2, z: -1.1, rot: 180 },
    { id: 'chair-2', kind: 'chair', x: 1.6, z: -1.1, rot: 180 },
    { id: 'chair-3', kind: 'chair', x: 3.2, z: 2.4, rot: 0 },
    { id: 'chair-4', kind: 'chair', x: 3.8, z: 2.4, rot: 0 },
    { id: 'cabinet', kind: 'cabinet', x: -4.0, z: -3.0 },
    { id: 'plant', kind: 'plant', x: -4.2, z: 3.2 },
  ],
  npcs: [
    {
      id: 'clerk',
      model: CH[4],
      x: -1.2,
      z: -2.8,
      rot: 0,
      anim: 'work',
      role: 'L’agent traite les dossiers',
    },
    {
      id: 'clerk-2',
      model: CH[1],
      x: 1.6,
      z: -2.8,
      rot: 0,
      anim: 'work',
      role: 'Une agente au guichet',
    },
    {
      id: 'visitor',
      model: CH[5],
      x: 3.5,
      z: 2.4,
      rot: 0,
      anim: 'sit',
      role: 'Un usager patiente',
    },
  ],
  spawn: { x: 0, z: 3.0 },
}

const CHAPEL: Layout = {
  name: 'Lieu de culte',
  w: 10,
  d: 9,
  floor: '#e6dcc8',
  wall: '#a78b6b',
  trim: '#f6f0e4',
  props: [
    {
      id: 'altar',
      kind: 'altar',
      x: 0,
      z: -3.4,
      action: 'pray',
      label: 'Prier avec la communauté',
      hint: 'Social +20 · Loisir +10',
    },
    ...[-2.4, -1.2, 0.0, 1.2, 2.4].flatMap((z, i) => [
      { id: `pew-l-${i}`, kind: 'pew' as const, x: -1.6, z, action: 'pray' },
      { id: `pew-r-${i}`, kind: 'pew' as const, x: 1.6, z, action: 'pray' },
    ]),
    { id: 'plant-1', kind: 'plant', x: -4.2, z: -3.4 },
    { id: 'plant-2', kind: 'plant', x: 4.2, z: -3.4 },
  ],
  npcs: [
    {
      id: 'imam',
      model: CH[3],
      x: 0,
      z: -2.6,
      rot: 180,
      anim: 'talk',
      role: 'Le responsable du culte parle',
    },
    {
      id: 'faithful-1',
      model: CH[0],
      x: -1.6,
      z: 0.3,
      rot: 0,
      anim: 'pray',
      role: 'Fidèle en prière',
    },
    {
      id: 'faithful-2',
      model: CH[5],
      x: 1.6,
      z: 1.5,
      rot: 0,
      anim: 'pray',
      role: 'Fidèle en prière',
    },
    { id: 'faithful-3', model: CH[2], x: 1.6, z: -0.9, rot: 0, anim: 'sit', role: 'Fidèle assise' },
  ],
  spawn: { x: 0, z: 3.6 },
}

const CLINIC: Layout = {
  name: 'Clinique',
  w: 10,
  d: 8,
  floor: '#e9f0f1',
  wall: '#7fb3bf',
  trim: '#ffffff',
  props: [
    {
      id: 'bed-1',
      kind: 'hospital-bed',
      x: -2.8,
      z: -2.4,
      action: 'care',
      label: 'Consultation',
      hint: 'Énergie +30 · Hygiène +20 · 1 500 FCFA',
    },
    { id: 'bed-2', kind: 'hospital-bed', x: -0.8, z: -2.4, action: 'care' },
    { id: 'bed-3', kind: 'hospital-bed', x: 1.2, z: -2.4, action: 'care' },
    { id: 'desk', kind: 'desk', x: 2.4, z: 1.4, rot: 180, action: 'care' },
    { id: 'chair', kind: 'chair', x: 2.4, z: 2.3, rot: 0 },
    { id: 'cabinet', kind: 'cabinet', x: 4.1, z: -2.6 },
    { id: 'cooler', kind: 'water-cooler', x: 4.3, z: 0.4 },
    {
      id: 'toilet',
      kind: 'toilet',
      x: -4.2,
      z: 2.6,
      rot: 90,
      action: 'toilet',
      label: 'Toilettes',
      hint: 'Vessie 100',
    },
    { id: 'plant', kind: 'plant', x: -4.2, z: -3.4 },
    { id: 'sign', kind: 'sign', x: 0, z: -3.9 },
  ],
  npcs: [
    {
      id: 'doctor',
      model: CH[5],
      x: 2.4,
      z: 0.5,
      rot: 0,
      anim: 'work',
      role: 'Le médecin consulte',
    },
    {
      id: 'nurse',
      model: CH[1],
      x: -0.8,
      z: -1.4,
      rot: 0,
      anim: 'walk',
      role: 'L’infirmière fait sa tournée',
      to: { x: 1.2, z: -1.4 },
    },
    {
      id: 'patient',
      model: CH[2],
      x: -2.8,
      z: -2.3,
      rot: 90,
      anim: 'rest',
      role: 'Une patiente se repose',
    },
  ],
  spawn: { x: 0, z: 3.0 },
}

const PARK: Layout = {
  name: 'Jardin',
  w: 11,
  d: 9,
  floor: '#5f9e4e',
  wall: '#9fd1e8',
  trim: '#9fd1e8',
  props: [
    {
      id: 'fountain',
      kind: 'fountain',
      x: 0,
      z: -0.6,
      action: 'relax',
      label: 'Se détendre',
      hint: 'Loisir +25',
    },
    { id: 'bench-1', kind: 'pew', x: -2.6, z: 1.6, rot: 0, action: 'relax' },
    { id: 'bench-2', kind: 'pew', x: 2.6, z: 1.6, rot: 0, action: 'relax' },
    { id: 'tree-1', kind: 'tree', x: -3.8, z: -2.8 },
    { id: 'tree-2', kind: 'tree', x: 3.6, z: -3.0 },
    { id: 'tree-3', kind: 'tree', x: 4.2, z: 2.6 },
    { id: 'tree-4', kind: 'tree', x: -4.3, z: 2.9 },
    { id: 'lamp-1', kind: 'lamp', x: -1.6, z: -3.2 },
    { id: 'lamp-2', kind: 'lamp', x: 1.6, z: -3.2 },
    {
      id: 'stall',
      kind: 'stall',
      x: -3.2,
      z: -0.4,
      rot: 90,
      action: 'buy-meal',
      label: 'Brochettes',
      hint: '650 FCFA',
    },
  ],
  npcs: [
    {
      id: 'jogger',
      model: CH[3],
      x: -3.5,
      z: 3.2,
      rot: 90,
      anim: 'run',
      role: 'Un joggeur fait le tour',
      to: { x: 3.5, z: 3.2 },
    },
    {
      id: 'kids',
      model: CH[2],
      x: 2.6,
      z: 1.6,
      rot: 0,
      anim: 'sit',
      role: 'Une passante lit sur le banc',
    },
    {
      id: 'vendor',
      model: CH[0],
      x: -3.2,
      z: 0.4,
      rot: 180,
      anim: 'work',
      role: 'La vendeuse de brochettes',
    },
  ],
  spawn: { x: 0, z: 3.4 },
}

const LAYOUTS: Record<Interior, Layout> = {
  gym: GYM,
  house: HOUSE,
  market: MARKET,
  bakery: { ...MARKET, name: 'Boulangerie', wall: '#b07a3b' },
  hall: {
    ...HALL,
    props: [
      ...HALL.props.map(
        (p): Prop =>
          p.action === 'work-city' || p.action === 'learn'
            ? { ...p, action: undefined, label: undefined, hint: undefined }
            : p,
      ),
      {
        id: 'toilet',
        kind: 'toilet',
        x: -4.1,
        z: 1.5,
        rot: 90,
        action: 'toilet',
        label: 'Toilettes',
        hint: 'Vessie 100',
      },
    ],
  },
  well: {
    ...PARK,
    name: 'Puits',
    props: PARK.props
      .filter((p) => p.kind !== 'stall')
      .map(
        (p): Prop =>
          p.id === 'fountain'
            ? { ...p, action: 'wash', label: 'Se laver au puits', hint: 'Hygiène 100' }
            : { ...p, action: undefined, label: undefined, hint: undefined },
      ),
  },
  chapel: CHAPEL,
  clinic: CLINIC,
  park: {
    ...PARK,
    props: PARK.props.map(
      (p): Prop =>
        p.kind === 'stall'
          ? {
              ...p,
              action: 'browse',
              label: 'Choisir mes achats',
              hint: 'Brochettes, eau et provisions · prix au comptoir',
            }
          : p,
    ),
  },
}
const cityLayouts = new Map<string, Layout>()
export function layoutFor(
  i: Interior,
  lot?: Pick<Lot, 'type' | 'service'> & Partial<Pick<Lot, 'name'>>,
  /** Game day and hour: the university's lecture (lecturer, students) depends on it. */
  clock: { day: number; hour: number } = { day: 1, hour: 8 },
): Layout {
  if (!lot) return LAYOUTS[i]
  const mosque = lot.type === 'worship' && /mosqu/i.test(lot.name ?? '')
  const university = lot.type === 'university'
  // One layout per lecture (or per gap between two): the room is rebuilt when a course starts.
  const session = university ? sessionAt(clock.day, clock.hour) : null
  const next = university && !session ? nextSession(clock.day, clock.hour) : null
  const lecture = university
    ? session
      ? `on:${sessionKey(session)}`
      : `off:${clock.day}:${next ? sessionKey(next) : ''}`
    : ''
  const key = `${i}:${lot.type}:${lot.service ?? ''}:${mosque ? 'mosque' : ''}${lecture}`
  const cached = cityLayouts.get(key)
  if (cached) return cached
  const base = university
    ? universityLayout(clock.day, clock.hour)
    : mosque
      ? {
          ...LAYOUTS[i],
          name: 'Mosquée du quartier',
          wall: '#d8e6dc',
          props: LAYOUTS[i].props.map(
            (p): Prop =>
              ['pew', 'altar'].includes(p.kind)
                ? { ...p, kind: 'mat', label: p.action ? 'Moment de prière' : undefined }
                : p,
          ),
        }
      : LAYOUTS[i]
  const actions = actionsFor(lot.type, lot.service)
  const allowed = new Set(actions.map((a) => a.id as string))
  const props = base.props.map((p): Prop => {
    if (!p.action) return p
    const action = p.action === 'buy-meal' ? 'browse' : p.action
    const definition = actions.find((a) => a.id === action)
    // The university's seat names the lecture of the hour: its own label wins.
    return allowed.has(action)
      ? university
        ? { ...p, action }
        : { ...p, action, label: definition?.label ?? p.label, hint: definition?.hint ?? p.hint }
      : { ...p, action: undefined, label: undefined, hint: undefined }
  })
  const kinds: Partial<Record<string, PropKind>> = {
    sit: 'chair',
    bank: 'atm',
    learn: 'desk',
    coop: 'board',
    rest: 'bed',
    'work-city': 'desk',
    socialize: 'table',
    train: 'mat',
    offers: 'board',
    fuel: 'counter',
    maintain: 'desk',
    police: 'reception',
    'civic-report': 'board',
    timetable: 'sign',
  }
  const occupied = new Set<string>()
  let extraBoards = 0
  // Give every advertised action an actual walk-to object, using the existing furniture.
  for (const action of actions) {
    if (props.some((p) => p.action === action.id)) continue
    let prop = props.find(
      (p) =>
        !p.action &&
        !occupied.has(p.id) &&
        p.kind === kinds[action.id] &&
        (action.id !== 'sit' ||
          !base.npcs.some((n) => n.anim === 'sit' && Math.hypot(n.x - p.x, n.z - p.z) < 0.75)),
    )
    prop ??= props.find(
      (p) =>
        !p.action &&
        !occupied.has(p.id) &&
        ['desk', 'counter', 'board', 'table', 'sofa', 'shelf', 'mat'].includes(p.kind),
    )
    if (prop) {
      const index = props.indexOf(prop)
      occupied.add(prop.id)
      props[index] = { ...prop, action: action.id, label: action.label, hint: action.hint }
    } else {
      props.push({
        id: `city-${action.id}`,
        kind: kinds[action.id] === 'board' ? 'board' : 'sign',
        x: -1.5 + extraBoards++ * 1.5,
        z: -base.d / 2 + 0.15,
        action: action.id,
        label: action.label,
        hint: action.hint,
      })
    }
  }
  const roles: Partial<Record<Lot['type'] | NonNullable<Lot['service']>, string>> = {
    bank: 'Akossiwa · conseillère du compte de jeu',
    school: 'Kossi · enseignant',
    university: 'Kossi · formateur',
    station: 'Dodzi · responsable de la gare',
    cooperative: 'Abla · animatrice de coopérative',
    industry: 'Komi · magasinier',
    townhall: 'Maire Agbavi · personnage municipal fictif',
    fuel: 'Yao · pompiste',
    garage: 'Komi · mécanicien',
    police: 'Agent Afi · police du quartier',
    shop: 'Maman Abla · vendeuse',
    market: 'Maman Abla · commerçante',
  }
  if (lot.service === 'fuel') {
    const pump = props.find((p) => p.action === 'fuel')
    if (pump) pump.kind = 'fuel-pump'
  }
  const layout: Layout = {
    ...base,
    cityType: key,
    props,
    npcs: base.npcs.map((n, index) =>
      index === 0 && !university && roles[lot.service ?? lot.type]
        ? { ...n, role: roles[lot.service ?? lot.type]! }
        : n,
    ),
  }
  cityLayouts.set(key, layout)
  return layout
}
/** Activities offered in a room: one entry per labelled prop, in layout order. */
export const activitiesOf = (l: Layout) =>
  l.props.filter((p): p is Prop & { action: string; label: string } => Boolean(p.action && p.label))
/** The animation the player performs while using a prop. */
export function animFor(kind: PropKind): NpcAnim {
  switch (kind) {
    case 'treadmill':
      return 'run'
    case 'bike':
      return 'cycle'
    case 'chair':
    case 'pew':
    case 'sofa':
    case 'mat':
      return 'sit'
    case 'bench-press':
    case 'dumbbell-rack':
      return 'lift'
    case 'bed':
      return 'sleep'
    case 'shower':
      return 'shower'
    case 'toilet':
      return 'toilet'
    case 'hospital-bed':
      return 'rest'
    case 'altar':
      return 'pray'
    case 'desk':
    case 'counter':
    case 'stall':
    case 'atm':
    case 'reception':
      return 'work'
    default:
      return 'idle'
  }
}
