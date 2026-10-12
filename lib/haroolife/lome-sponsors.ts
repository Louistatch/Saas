/**
 * Monetisation surfaces of the Lomé 3D neighbourhood: billboards on the streets and
 * partner slots in the in-game phone. Inventory and list prices only: nothing here is a
 * sale, and no advertiser is invented. Available slots carry FaîtiereHub's own services
 * ("house" notices) until a real partner books them through the contact page.
 */
import type { CityId } from './lome-districts'

export type SlotStatus = 'house' | 'available'
export interface Billboard {
  id: string
  /** District index on the grid: 0 north, 1 west, 2 centre, 3 east, 4 south. */
  district: 0 | 1 | 2 | 3 | 4
  x: number
  y: number
  /** Facing: rotation around the vertical axis, degrees. */
  rotation: number
  status: SlotStatus
  /** What the panel shows today (a FaîtiereHub service, or the offer itself). */
  headline: string
  href: string
  /** List price, FCFA for 7 days. HYPOTHÈSE: not yet billed to anyone. */
  priceWeek: number
}
export interface PartnerApp {
  id: string
  name: string
  icon: string
  status: SlotStatus
  href: string
  /** List price, FCFA per month. HYPOTHÈSE: not yet billed to anyone. */
  priceMonth: number
}

/** Price per billboard-week by district, FCFA. The centre costs more than the edges. */
export const BILLBOARD_PRICE: Record<Billboard['district'], number> = {
  0: 15000,
  1: 15000,
  2: 25000,
  3: 20000,
  4: 15000,
}
export const PARTNER_APP_PRICE = 50000
export const CONTACT_HREF = '/contact?sujet=haroolife-partenaire'

export const BILLBOARDS: Billboard[] = [
  {
    id: 'bb-nord',
    district: 0,
    x: 11,
    y: 3,
    rotation: 0,
    status: 'house',
    headline: 'Le marché FaîtiereHub : vendez votre récolte',
    href: '/marche',
    priceWeek: BILLBOARD_PRICE[0],
  },
  {
    id: 'bb-ouest',
    district: 1,
    x: 4,
    y: 10,
    rotation: 90,
    status: 'available',
    headline: 'Votre annonce ici',
    href: CONTACT_HREF,
    priceWeek: BILLBOARD_PRICE[1],
  },
  {
    id: 'bb-centre',
    district: 2,
    x: 8,
    y: 8,
    rotation: 45,
    status: 'house',
    headline: 'Carte Haroo : votre identité professionnelle',
    href: '/haroo',
    priceWeek: BILLBOARD_PRICE[2],
  },
  {
    id: 'bb-est',
    district: 3,
    x: 18,
    y: 11,
    rotation: 270,
    status: 'available',
    headline: 'Votre annonce ici',
    href: CONTACT_HREF,
    priceWeek: BILLBOARD_PRICE[3],
  },
  {
    id: 'bb-sud',
    district: 4,
    x: 11,
    y: 18,
    rotation: 180,
    status: 'available',
    headline: 'Votre annonce ici',
    href: CONTACT_HREF,
    priceWeek: BILLBOARD_PRICE[4],
  },
]

export const PARTNER_APPS: PartnerApp[] = [
  { id: 'marche', name: 'Marché', icon: '🧺', status: 'house', href: '/marche', priceMonth: 0 },
  { id: 'haroo', name: 'Ma carte', icon: '🪪', status: 'house', href: '/haroo', priceMonth: 0 },
  { id: 'meteo', name: 'Météo', icon: '🌦️', status: 'house', href: '/haroolife', priceMonth: 0 },
  {
    id: 'slot-1',
    name: 'Partenaire',
    icon: '➕',
    status: 'available',
    href: CONTACT_HREF,
    priceMonth: PARTNER_APP_PRICE,
  },
  {
    id: 'slot-2',
    name: 'Partenaire',
    icon: '➕',
    status: 'available',
    href: CONTACT_HREF,
    priceMonth: PARTNER_APP_PRICE,
  },
  {
    id: 'slot-3',
    name: 'Partenaire',
    icon: '➕',
    status: 'available',
    href: CONTACT_HREF,
    priceMonth: PARTNER_APP_PRICE,
  },
]

export const billboardById = (id: string | null | undefined): Billboard | null =>
  BILLBOARDS.find((b) => b.id === id) ?? null

/** Inventory summary for the investor file: slots, list prices, nothing sold. */
export function inventorySummary(city: CityId = 'lome') {
  const billboardsAvailable = BILLBOARDS.filter((b) => b.status === 'available')
  const appsAvailable = PARTNER_APPS.filter((a) => a.status === 'available')
  return {
    city,
    billboards: BILLBOARDS.length,
    billboardsAvailable: billboardsAvailable.length,
    /** FCFA per week if every available billboard were booked at list price. HYPOTHÈSE. */
    billboardWeekCeiling: billboardsAvailable.reduce((s, b) => s + b.priceWeek, 0),
    partnerApps: PARTNER_APPS.length,
    partnerAppsAvailable: appsAvailable.length,
    /** FCFA per month if every partner slot were booked at list price. HYPOTHÈSE. */
    partnerMonthCeiling: appsAvailable.reduce((s, a) => s + a.priceMonth, 0),
    sold: 0,
  }
}
