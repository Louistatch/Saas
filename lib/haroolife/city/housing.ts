/**
 * The player's home: rent by quartier, the CEET electricity bill and the TdE water bill, at real
 * Togolese prices, and a landlord who does not wait. Pure: no React, no network.
 *
 * Sources (amounts in the game's FCFA, real values):
 * - Rents: listings observed 2023-2026 (immoask, habitat-afrik, coinafrique, yop.l-frii, expat):
 *   each amount says whether it was observed in that quartier or estimated from its neighbours.
 * - Move-in: caution and guarantee capped at 3 months of rent each by decree n° 2022-001/PR of
 *   5 January 2022; landlords commonly ask more in advance. The game asks the legal maximum:
 *   3 months of caution (given back on leaving without debt) and 3 months paid in advance, plus
 *   1 month of agency fee when moving through an agency.
 * - Electricity: CEET household tariff of May 2025 (arrêté of 24 March 2025), postpaid, before
 *   VAT: < 2.2 kVA 60 / 93 / 130 F per kWh (0–30 / 31–120 / over 120 kWh), ≥ 2.2 kVA 93 / 130 /
 *   153 F (0–120 / 121–350 / over 350) plus 600 F per kVA; meter rent and upkeep 1 000 F a month.
 * - Water: TdE tariff of 9 August 2019, before VAT: 190 / 380 / 500 F per m³ (0–10 / 11–30 / over
 *   30 m³), the whole month at the tranche reached; meter 720 F (15 mm) or 765 F (20 mm). Rooms in
 *   a shared compound pay their share of the compound's meter at the social tranche.
 * - Landlord: the decree lets a lease be ended one month after rent stops being paid. The game's
 *   landlord knocks after 5 days, cuts the compound's power after 10 and changes the lock after 30;
 *   the caution pays the debt.
 *
 * A game month is 30 game days.
 */
import type { CityLife } from './life'

export type HousingKind = 'chambre' | 'chambre-salon' | 'deux-chambres' | 'villa'

export const KINDS: Record<
  HousingKind,
  { label: string; kwh: number; kva: number; water: number; shared: boolean }
> = {
  chambre: { label: 'Chambre simple', kwh: 30, kva: 0, water: 4, shared: true },
  'chambre-salon': { label: 'Chambre-salon', kwh: 45, kva: 0, water: 6, shared: true },
  'deux-chambres': { label: '2 chambres-salon', kwh: 90, kva: 3.3, water: 15, shared: false },
  villa: { label: 'Villa', kwh: 350, kva: 6.6, water: 35, shared: false },
}
export const KIND_IDS = Object.keys(KINDS) as HousingKind[]

export interface Rent {
  /** FCFA a month. */
  amount: number
  /** Seen in a listing of that quartier (true), or estimated from its neighbours. */
  observed: boolean
}
export interface Quartier {
  id: string
  name: string
  rents: Record<HousingKind, Rent>
}
const r = (amount: number, observed = false): Rent => ({ amount, observed })

/** Lomé's quartiers of the game (its five districts). */
export const QUARTIERS: Quartier[] = [
  {
    id: 'agoe',
    name: 'Agoè',
    rents: {
      chambre: r(18000, true),
      'chambre-salon': r(35000, true),
      'deux-chambres': r(75000, true),
      villa: r(250000),
    },
  },
  {
    id: 'adidogome',
    name: 'Adidogomé',
    rents: {
      chambre: r(15000),
      'chambre-salon': r(25000),
      'deux-chambres': r(50000, true),
      villa: r(200000),
    },
  },
  {
    id: 'tokoin',
    name: 'Tokoin',
    rents: {
      chambre: r(25000),
      'chambre-salon': r(55000, true),
      'deux-chambres': r(90000),
      villa: r(400000, true),
    },
  },
  {
    id: 'be',
    name: 'Bè',
    rents: {
      chambre: r(20000),
      'chambre-salon': r(40000),
      'deux-chambres': r(70000),
      villa: r(300000),
    },
  },
  {
    id: 'baguida',
    name: 'Baguida',
    rents: {
      chambre: r(25000),
      'chambre-salon': r(100000, true),
      'deux-chambres': r(150000),
      villa: r(1500000, true),
    },
  },
]
export const quartierById = (id: string) => QUARTIERS.find((q) => q.id === id) ?? null

export const MONTH_DAYS = 30
export const CAUTION_MONTHS = 3
export const ADVANCE_MONTHS = 3
export const AGENCY_MONTHS = 1
export const monthOf = (day: number) => Math.floor((Math.max(1, day) - 1) / MONTH_DAYS)
/** First game day of a month. */
export const monthStart = (month: number) => month * MONTH_DAYS + 1

/** CEET bill of a month (FCFA, before VAT). */
export function electricityBill(kind: HousingKind): number {
  const { kwh, kva } = KINDS[kind]
  const tiers =
    kva < 2.2
      ? [
          [30, 60],
          [90, 93],
          [Number.POSITIVE_INFINITY, 130],
        ]
      : [
          [120, 93],
          [230, 130],
          [Number.POSITIVE_INFINITY, 153],
        ]
  let left = kwh
  let energy = 0
  for (const [size, price] of tiers) {
    const used = Math.min(left, size)
    energy += used * price
    left -= used
    if (left <= 0) break
  }
  return Math.round(energy + 1000 + (kva >= 2.2 ? 600 * kva : 0))
}

/** TdE bill of a month (FCFA, before VAT); a room's share of the compound meter. */
export function waterBill(kind: HousingKind): number {
  const { water, shared } = KINDS[kind]
  if (shared) return water * 190
  const price = water <= 10 ? 190 : water <= 30 ? 380 : 500
  const meter = water > 20 ? 765 : 720
  return Math.max(10, water) * price + meter
}

export interface Housing {
  quartier: string
  kind: HousingKind
  rent: number
  /** Months of rent paid in advance, still to be used. */
  prepaid: number
  /** Caution held by the landlord (given back on leaving without debt). */
  caution: number
  /** Last month settled (rent consumed or owed, bills issued). */
  month: number
  debt: { rent: number; ceet: number; tde: number }
  /** First day of the oldest unpaid rent, or null. */
  lateSince: number | null
  /** The landlord's last step: 0 none, 1 knocked, 2 power cut, 3 locked out. */
  step: 0 | 1 | 2 | 3
  evicted: boolean
  /** Game day of the last guest received (one evening a day). */
  guestDay?: number
}

const note = (s: CityLife, msg: string): CityLife => ({
  ...s,
  life: { ...s.life, lastEvent: msg, events: [msg, ...s.life.events].slice(0, 8) },
})
const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`

/** The home a player has from the start: a chambre-salon in Tokoin, advance and caution paid. */
export function defaultHousing(day: number): Housing {
  const q = quartierById('tokoin') as Quartier
  const rent = q.rents['chambre-salon'].amount
  return {
    quartier: q.id,
    kind: 'chambre-salon',
    rent,
    prepaid: ADVANCE_MONTHS,
    caution: rent * CAUTION_MONTHS,
    month: monthOf(day),
    debt: { rent: 0, ceet: 0, tde: 0 },
    lateSince: null,
    step: 0,
    evicted: false,
  }
}
export const housingOf = (s: CityLife): Housing => s.housing ?? defaultHousing(s.life.day)
export const totalDebt = (h: Housing) => h.debt.rent + h.debt.ceet + h.debt.tde
/** Day the next rent is due. */
export const nextDue = (h: Housing) => monthStart(h.month + 1)

/**
 * Brings the home up to the game's day: each new month uses a month of advance or adds the rent
 * to the debt, and brings the CEET and TdE bills; then the landlord acts on late rent.
 * Idempotent for a given day.
 */
export function settleHousing(s: CityLife): CityLife {
  let h = housingOf(s)
  const now = monthOf(s.life.day)
  const said: string[] = []
  if (!h.evicted)
    while (h.month < now) {
      const month = h.month + 1
      const ceet = electricityBill(h.kind)
      const tde = waterBill(h.kind)
      const paidAhead = h.prepaid > 0
      h = {
        ...h,
        month,
        prepaid: paidAhead ? h.prepaid - 1 : 0,
        debt: {
          rent: h.debt.rent + (paidAhead ? 0 : h.rent),
          ceet: h.debt.ceet + ceet,
          tde: h.debt.tde + tde,
        },
        lateSince: paidAhead ? h.lateSince : (h.lateSince ?? monthStart(month)),
      }
      said.push(
        paidAhead
          ? `Nouveau mois : loyer pris sur l’avance (${h.prepaid} mois restants). Factures : CEET ${fcfa(ceet)}, TdE ${fcfa(tde)}.`
          : `Loyer du mois dû : ${fcfa(h.rent)}. Factures : CEET ${fcfa(ceet)}, TdE ${fcfa(tde)}.`,
      )
    }
  if (!h.evicted && h.debt.rent > 0 && h.lateSince !== null) {
    const late = s.life.day - h.lateSince
    if (late >= 30 && h.step < 3) {
      // Locked out: the caution pays what it can; the rest stays owed.
      const covered = Math.min(h.caution, totalDebt(h))
      let left = covered
      const take = (n: number) => {
        const t = Math.min(n, left)
        left -= t
        return n - t
      }
      h = {
        ...h,
        step: 3,
        evicted: true,
        caution: h.caution - covered,
        prepaid: 0,
        debt: { rent: take(h.debt.rent), ceet: take(h.debt.ceet), tde: take(h.debt.tde) },
      }
      said.push(
        `Un mois de loyer impayé : le propriétaire a changé la serrure. La caution a payé ${fcfa(covered)}. Cherche un nouveau logement.`,
      )
    } else if (late >= 10 && h.step < 2) {
      h = { ...h, step: 2 }
      said.push(
        `${late} jours de retard : le propriétaire a coupé le courant de ta chambre. Paie ${fcfa(h.debt.rent)} pour qu’il le remette.`,
      )
    } else if (late >= 5 && h.step < 1) {
      h = { ...h, step: 1 }
      said.push(
        `Le propriétaire a frappé à ta porte : ${fcfa(h.debt.rent)} de loyer en retard. Au bout d’un mois, il change la serrure.`,
      )
    }
  }
  if (h === s.housing) return s
  let next: CityLife = { ...s, housing: h }
  for (const msg of said) next = note(next, msg)
  return next
}

export type Bill = 'rent' | 'ceet' | 'tde'
const BILL_LABEL: Record<Bill, string> = { rent: 'Loyer', ceet: 'Facture CEET', tde: 'Facture TdE' }

/** Pays one debt in full from the wallet. */
export function payBill(s: CityLife, bill: Bill): CityLife {
  const h = housingOf(s)
  const amount = h.debt[bill]
  if (amount <= 0) return note(s, `${BILL_LABEL[bill]} : rien à payer.`)
  if (s.life.wallet < amount) return note(s, `Il te faut ${fcfa(amount)} pour payer.`)
  const debt = { ...h.debt, [bill]: 0 }
  const rentPaid = bill === 'rent'
  return note(
    {
      ...s,
      housing: {
        ...h,
        debt,
        lateSince: rentPaid ? null : h.lateSince,
        step: rentPaid && !h.evicted ? 0 : h.step,
      },
      life: { ...s.life, wallet: s.life.wallet - amount, spent: s.life.spent + amount },
    },
    `${BILL_LABEL[bill]} payé : −${fcfa(amount)}.${rentPaid && h.step === 2 && !h.evicted ? ' Le propriétaire a remis le courant.' : ''}`,
  )
}

/** What moving in costs: caution, advance and the agency's month. */
export function moveInCost(rent: number) {
  return {
    caution: rent * CAUTION_MONTHS,
    advance: rent * ADVANCE_MONTHS,
    agency: rent * AGENCY_MONTHS,
    total: rent * (CAUTION_MONTHS + ADVANCE_MONTHS + AGENCY_MONTHS),
  }
}

/**
 * Moves to another home: the old caution comes back once every debt is paid; the new home asks
 * its caution, its advance and the agency's month.
 */
export function moveTo(s: CityLife, quartier: string, kind: HousingKind): CityLife {
  const h = housingOf(s)
  const q = quartierById(quartier)
  if (!q) return note(s, 'Quartier inconnu.')
  if (!h.evicted && h.quartier === quartier && h.kind === kind)
    return note(s, 'Tu habites déjà ici.')
  if (totalDebt(h) > 0)
    return note(
      s,
      `Règle d’abord tes dettes (${fcfa(totalDebt(h))}) : aucun propriétaire ne loue à quelqu’un qui part sans payer.`,
    )
  const rent = q.rents[kind].amount
  const cost = moveInCost(rent)
  const refund = h.evicted ? 0 : h.caution
  if (s.life.wallet + refund < cost.total)
    return note(
      s,
      `Il faut ${fcfa(cost.total)} pour entrer (caution ${fcfa(cost.caution)}, avance ${fcfa(cost.advance)}, agence ${fcfa(cost.agency)}).`,
    )
  const housing: Housing = {
    quartier,
    kind,
    rent,
    prepaid: ADVANCE_MONTHS,
    caution: cost.caution,
    month: monthOf(s.life.day),
    debt: { rent: 0, ceet: 0, tde: 0 },
    lateSince: null,
    step: 0,
    evicted: false,
  }
  const paid = cost.total - refund
  return note(
    {
      ...s,
      housing,
      life: {
        ...s.life,
        wallet: s.life.wallet - paid,
        spent: s.life.spent + Math.max(0, paid),
      },
    },
    `${KINDS[kind].label} à ${q.name} : ${fcfa(rent)} par mois. Payé ${fcfa(cost.total)}${refund ? `, dont ${fcfa(refund)} de ton ancienne caution rendue` : ''}.`,
  )
}

/** A friend (a resident you know) comes for the evening: drinks offered, social and fun. */
export function receiveGuest(s: CityLife, name: string): CityLife {
  const h = housingOf(s)
  if (h.evicted) return note(s, 'Tu n’as plus de logement pour recevoir.')
  if (h.guestDay === s.life.day) return note(s, 'Tu as déjà reçu quelqu’un ce soir.')
  if (s.life.hour < 16 || s.life.hour >= 23)
    return note(s, 'On reçoit le soir, entre 16 h et 23 h.')
  const drinks = 1000
  if (s.life.wallet < drinks) return note(s, `Il faut ${fcfa(drinks)} pour les boissons.`)
  const needs = s.life.needs
  return note(
    {
      ...s,
      housing: { ...h, guestDay: s.life.day },
      life: {
        ...s.life,
        wallet: s.life.wallet - drinks,
        spent: s.life.spent + drinks,
        needs: {
          ...needs,
          social: Math.min(100, needs.social + 30),
          fun: Math.min(100, needs.fun + 20),
        },
      },
    },
    `${name} est venu·e chez toi : sucreries et causerie jusqu’à la nuit. −${fcfa(drinks)}, social +30.`,
  )
}

/** Saved home, checked (a saved game can be edited by hand). */
export function decodeHousing(v: unknown): Housing | undefined {
  if (!v || typeof v !== 'object') return undefined
  const h = v as Partial<Housing>
  const int = (n: unknown, max: number) =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max
  const q = typeof h.quartier === 'string' ? quartierById(h.quartier) : null
  if (!q || !h.kind || !(h.kind in KINDS)) return undefined
  if (!int(h.rent, 5_000_000) || !int(h.prepaid, 24) || !int(h.caution, 20_000_000))
    return undefined
  if (!int(h.month, 100_000) || !h.debt) return undefined
  const d = h.debt
  if (!int(d.rent, 100_000_000) || !int(d.ceet, 100_000_000) || !int(d.tde, 100_000_000))
    return undefined
  return {
    quartier: q.id,
    kind: h.kind,
    rent: h.rent as number,
    prepaid: h.prepaid as number,
    caution: h.caution as number,
    month: h.month as number,
    debt: { rent: d.rent as number, ceet: d.ceet as number, tde: d.tde as number },
    lateSince: int(h.lateSince, 1_000_000) ? (h.lateSince as number) : null,
    step: h.step === 1 || h.step === 2 || h.step === 3 ? h.step : 0,
    evicted: h.evicted === true,
    ...(int(h.guestDay, 1_000_000) ? { guestDay: h.guestDay as number } : {}),
  }
}
