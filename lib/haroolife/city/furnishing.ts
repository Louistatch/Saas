/**
 * « Aménager » : the furniture and appliances the player buys for their home in Lomé, then places
 * in the room drawn by the HarooLife engine (game/render/room-world.ts). Pure: no React, no
 * network. The prices are indicative orders of magnitude of Lomé's shops and markets
 * (Hédzranawoé, Assigamé, the appliance stores of the boulevard), not quotes.
 *
 * A piece bought and not yet placed waits « dans le carton »; placing it gives it a spot of the
 * room (`x`, `z`, a quarter turn `rot`). Resold, a piece fetches 40 % of its price, like any
 * second-hand appliance. Footprints are in room units (the house is 12.25 × 10.25).
 */
import type { CityLife } from './life'

const FURNITURE_ASSETS = '/haroolife/assets/furniture/'
const KIT = '/haroolife/vendor/kenney-3d/furniture-kit/'

export type FurnitureCategory = 'appareils' | 'meubles' | 'deco'

export interface FurnitureItem {
  id: string
  name: string
  /** FCFA. */
  price: number
  category: FurnitureCategory
  hint: string
  url: string
  /** Uniform scale of the model in the room. */
  scale: number
  /** Footprint in room units, before rotation (width along x, depth along z). */
  w: number
  d: number
  /** A television: a « Regarder la télé » point in front of it. */
  watch?: boolean
}

export const FURNITURE: readonly FurnitureItem[] = [
  {
    id: 'tv-43',
    name: 'Télé LED 43 pouces, meuble et décodeur',
    price: 195_000,
    category: 'appareils',
    hint: 'Regarder la télé : loisir',
    url: `${FURNITURE_ASSETS}lome-tv-meuble.glb`,
    scale: 1.2,
    w: 1.6,
    d: 0.6,
    watch: true,
  },
  {
    id: 'ventilateur',
    name: 'Ventilateur sur pied',
    price: 18_000,
    category: 'appareils',
    hint: 'Indispensable en saison chaude',
    url: `${FURNITURE_ASSETS}lome-ventilateur.glb`,
    scale: 1.2,
    w: 0.55,
    d: 0.55,
  },
  {
    id: 'refrigerateur',
    name: 'Réfrigérateur',
    price: 175_000,
    category: 'appareils',
    hint: 'De l’eau fraîche à la maison',
    url: `${FURNITURE_ASSETS}kitchenFridge.glb`,
    scale: 2.3,
    w: 1.0,
    d: 0.7,
  },
  {
    id: 'congelateur',
    name: 'Congélateur coffre',
    price: 165_000,
    category: 'appareils',
    hint: 'Pour vendre de l’eau glacée devant chez toi',
    url: `${FURNITURE_ASSETS}lome-congelateur.glb`,
    scale: 1.2,
    w: 1.3,
    d: 0.8,
  },
  {
    id: 'machine-a-laver',
    name: 'Machine à laver',
    price: 195_000,
    category: 'appareils',
    hint: 'Fini la lessive à la main',
    url: `${KIT}washer.glb`,
    scale: 2.2,
    w: 0.9,
    d: 0.9,
  },
  {
    id: 'enceinte',
    name: 'Enceinte colonne',
    price: 45_000,
    category: 'appareils',
    hint: 'La musique pour tout le quartier',
    url: `${FURNITURE_ASSETS}lome-enceinte.glb`,
    scale: 1.2,
    w: 0.5,
    d: 0.5,
  },
  {
    id: 'groupe',
    name: 'Groupe électrogène',
    price: 150_000,
    category: 'appareils',
    hint: 'Pour les délestages de la CEET',
    url: `${FURNITURE_ASSETS}lome-groupe.glb`,
    scale: 1.2,
    w: 0.9,
    d: 0.7,
  },
  {
    id: 'canape',
    name: 'Canapé trois places',
    price: 150_000,
    category: 'meubles',
    hint: 'Le salon pour recevoir',
    url: `${FURNITURE_ASSETS}loungeSofa.glb`,
    scale: 2.6,
    w: 2.6,
    d: 1.1,
  },
  {
    id: 'fauteuil',
    name: 'Fauteuil',
    price: 55_000,
    category: 'meubles',
    hint: 'La place du chef de famille',
    url: `${FURNITURE_ASSETS}loungeChair.glb`,
    scale: 2.4,
    w: 1.2,
    d: 1.0,
  },
  {
    id: 'armoire',
    name: 'Armoire en bois',
    price: 85_000,
    category: 'meubles',
    hint: 'Ranger les habits et les pagnes',
    url: `${FURNITURE_ASSETS}lome-armoire.glb`,
    scale: 1.2,
    w: 1.4,
    d: 0.75,
  },
  {
    id: 'table-basse',
    name: 'Table basse',
    price: 30_000,
    category: 'meubles',
    hint: 'Devant le canapé',
    url: `${FURNITURE_ASSETS}tableCoffee.glb`,
    scale: 2.4,
    w: 1.6,
    d: 1.0,
  },
  {
    id: 'table-plastique',
    name: 'Table en plastique',
    price: 9_000,
    category: 'meubles',
    hint: 'Pour manger ou jouer aux cartes',
    url: `${FURNITURE_ASSETS}lome-table-plastique.glb`,
    scale: 1.2,
    w: 1.0,
    d: 1.0,
  },
  {
    id: 'chaise-plastique',
    name: 'Chaise en plastique',
    price: 3_500,
    category: 'meubles',
    hint: 'La chaise de toutes les cours',
    url: `${FURNITURE_ASSETS}lome-chaise-plastique.glb`,
    scale: 1.2,
    w: 0.7,
    d: 0.7,
  },
  {
    id: 'etagere',
    name: 'Étagère',
    price: 35_000,
    category: 'meubles',
    hint: 'Livres, photos, souvenirs',
    url: `${FURNITURE_ASSETS}bookcaseOpen.glb`,
    scale: 2.4,
    w: 1.0,
    d: 0.6,
  },
  {
    id: 'lampe',
    name: 'Lampe sur pied',
    price: 15_000,
    category: 'deco',
    hint: 'Une lumière douce le soir',
    url: `${FURNITURE_ASSETS}lampRoundFloor.glb`,
    scale: 2,
    w: 0.4,
    d: 0.4,
  },
  {
    id: 'plante',
    name: 'Plante en pot',
    price: 5_000,
    category: 'deco',
    hint: 'Un coin de verdure',
    url: `${FURNITURE_ASSETS}pottedPlant.glb`,
    scale: 2.4,
    w: 0.55,
    d: 0.6,
  },
  {
    id: 'poubelle',
    name: 'Poubelle',
    price: 2_500,
    category: 'deco',
    hint: 'Une maison propre',
    url: `${KIT}trashcan.glb`,
    scale: 2,
    w: 0.45,
    d: 0.5,
  },
]

export const CATEGORY_NAMES: Record<FurnitureCategory, string> = {
  appareils: 'Électroménager et électronique',
  meubles: 'Meubles',
  deco: 'Décoration',
}

/** At most this many pieces bought (placed or in their box). */
export const MAX_PIECES = 30
/** Second-hand value of a piece, as a fraction of its price. */
export const RESALE = 0.4

export interface Piece {
  uid: string
  item: string
  /** Spot in the room once placed; absent while it waits in its box. */
  x?: number
  z?: number
  /** Quarter turns (0 to 3). */
  rot?: number
}

export interface Furnishing {
  pieces: Piece[]
  /** Next piece number (unique ids). */
  next: number
}

export const furnitureItem = (id: string) => FURNITURE.find((f) => f.id === id)

/** The footprint of a piece turned by `rot` quarter turns. */
export function footprint(item: FurnitureItem, rot = 0): { w: number; d: number } {
  return rot % 2 ? { w: item.d, d: item.w } : { w: item.w, d: item.d }
}

export const isPlaced = (p: Piece): p is Piece & { x: number; z: number } =>
  p.x !== undefined && p.z !== undefined

const money = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`
const tell = (s: CityLife, msg: string): CityLife => ({
  ...s,
  life: { ...s.life, lastEvent: msg, events: [msg, ...s.life.events].slice(0, 8) },
})

export function furnishingOf(s: CityLife): Furnishing {
  return s.furnishing ?? { pieces: [], next: 1 }
}

export function buyFurniture(s: CityLife, id: string): CityLife {
  const item = furnitureItem(id)
  if (!item) return tell(s, 'Cet article n’est plus en vente.')
  const f = furnishingOf(s)
  if (f.pieces.length >= MAX_PIECES)
    return tell(s, `Ta maison est pleine : ${MAX_PIECES} objets au plus. Revends-en un d’abord.`)
  if (s.life.wallet < item.price)
    return tell(s, `Solde insuffisant : ${money(item.price)} pour ${item.name.toLowerCase()}.`)
  return tell(
    {
      ...s,
      furnishing: { pieces: [...f.pieces, { uid: `p${f.next}`, item: id }], next: f.next + 1 },
      life: { ...s.life, wallet: s.life.wallet - item.price, spent: s.life.spent + item.price },
    },
    `${item.name} acheté : −${money(item.price)}. Livré chez toi, encore dans son carton : place-le dans ta maison.`,
  )
}

/** Puts a piece at a spot already checked (`canPlace`, game/core/furnish.ts). */
export function placePiece(s: CityLife, uid: string, x: number, z: number, rot: number): CityLife {
  const f = furnishingOf(s)
  const piece = f.pieces.find((p) => p.uid === uid)
  const item = piece && furnitureItem(piece.item)
  if (!piece || !item) return s
  return tell(
    {
      ...s,
      furnishing: {
        ...f,
        pieces: f.pieces.map((p) =>
          p.uid === uid ? { ...p, x: round(x), z: round(z), rot: ((rot % 4) + 4) % 4 } : p,
        ),
      },
    },
    `${item.name} installé.`,
  )
}

/** Back in its box (the spot is freed). */
export function storePiece(s: CityLife, uid: string): CityLife {
  const f = furnishingOf(s)
  const piece = f.pieces.find((p) => p.uid === uid)
  const item = piece && furnitureItem(piece.item)
  if (!piece || !item) return s
  return tell(
    {
      ...s,
      furnishing: {
        ...f,
        pieces: f.pieces.map((p) => (p.uid === uid ? { uid, item: p.item } : p)),
      },
    },
    `${item.name} rangé dans son carton.`,
  )
}

export function resellPiece(s: CityLife, uid: string): CityLife {
  const f = furnishingOf(s)
  const piece = f.pieces.find((p) => p.uid === uid)
  const item = piece && furnitureItem(piece.item)
  if (!piece || !item) return s
  const value = Math.round((item.price * RESALE) / 500) * 500
  return tell(
    {
      ...s,
      furnishing: { ...f, pieces: f.pieces.filter((p) => p.uid !== uid) },
      life: { ...s.life, wallet: s.life.wallet + value, earned: s.life.earned + value },
    },
    `${item.name} revendu d’occasion : +${money(value)}.`,
  )
}

const round = (n: number) => Math.round(n * 100) / 100

export function decodeFurnishing(value: unknown): Furnishing | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Partial<Furnishing>
  if (!Array.isArray(v.pieces)) return undefined
  const pieces: Piece[] = []
  const seen = new Set<string>()
  for (const raw of v.pieces.slice(0, MAX_PIECES)) {
    const p = raw as Partial<Piece>
    if (typeof p?.uid !== 'string' || !/^p\d{1,6}$/.test(p.uid) || seen.has(p.uid)) continue
    if (typeof p.item !== 'string' || !furnitureItem(p.item)) continue
    seen.add(p.uid)
    const placed =
      Number.isFinite(p.x) &&
      Number.isFinite(p.z) &&
      Math.abs(p.x as number) <= 6.2 &&
      Math.abs(p.z as number) <= 5.2
    pieces.push(
      placed
        ? {
            uid: p.uid,
            item: p.item,
            x: p.x as number,
            z: p.z as number,
            rot:
              Number.isInteger(p.rot) && (p.rot as number) >= 0 && (p.rot as number) < 4
                ? p.rot
                : 0,
          }
        : { uid: p.uid, item: p.item },
    )
  }
  const highest = Math.max(0, ...pieces.map((p) => Number(p.uid.slice(1))))
  const next =
    Number.isSafeInteger(v.next) && (v.next as number) > highest ? (v.next as number) : highest + 1
  return { pieces, next }
}
