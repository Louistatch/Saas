/**
 * « Ma maison » : buy a plot in Lomé and build a house on it the Togolese way, stage by stage, as
 * the money comes. The mason works a few game days on each stage once it is paid; nothing moves
 * while it is not. Once the house is finished the player moves in and pays no more rent (the CEET
 * and TdE bills stay). Pure: no React, no network.
 *
 * The amounts are the game's, not the market's. A real lot in Lomé costs tens of millions of FCFA
 * (listings seen in 2024-2026: half a lot of 300 m² for about 10 million in Adidogomé, 600 m² for
 * 45 million in Baguida), out of reach of a game where an hour of work pays 1 200 FCFA. The game
 * keeps the order of the quartiers (Agoè the cheapest, Baguida the dearest) and the order of the
 * work (foundations, walls, roof, openings, plaster, paint), with amounts a player reaches in a
 * few game months. The panel says so.
 *
 * The plot is one of the city's « Terrain disponible » lots, so the street draws the work on it
 * (game/render/street-world.ts).
 */
import { type Housing, housingOf, ownedHousing, quartierById, totalDebt } from './housing'
import type { CityLife } from './life'
import type { Lot } from './world'

/** Price of a plot (half a lot) by quartier, in the game's FCFA. */
export const PLOT_PRICES: Record<string, number> = {
  agoe: 450_000,
  adidogome: 550_000,
  be: 700_000,
  tokoin: 850_000,
  baguida: 1_000_000,
}

export interface Stage {
  id: string
  name: string
  cost: number
  /** Game days of work once paid. */
  days: number
  /** Said when the work starts, then when it is finished. */
  start: string
  done: string
}

export const STAGES: Stage[] = [
  {
    id: 'fondations',
    name: 'Fondations',
    cost: 250_000,
    days: 3,
    start: 'Le maçon a pris l’avance et promis de commencer « demain matin sans faute ».',
    done: 'Les fondations sont coulées. Le maçon jure que c’est « du solide, même pour un étage plus tard ».',
  },
  {
    id: 'murs',
    name: 'Élévation des murs',
    cost: 400_000,
    days: 5,
    start:
      'Les parpaings arrivent sur un tricycle surchargé. Le chef de chantier compte deux fois.',
    done: 'Les murs sont montés. Le fer qui dépasse en haut ? « C’est pour l’étage, un jour. »',
  },
  {
    id: 'toiture',
    name: 'Toiture en tôles',
    cost: 300_000,
    days: 3,
    start: 'Le charpentier a choisi les tôles : « bac alu, la meilleure ». Livraison promise.',
    done: 'La toiture est posée. La première pluie a testé les tôles : ça chante, mais ça ne coule pas.',
  },
  {
    id: 'menuiserie',
    name: 'Portes et fenêtres',
    cost: 180_000,
    days: 2,
    start: 'Le menuisier du quartier prend les mesures… et l’avance.',
    done: 'Portes et fenêtres posées : la maison ferme à clé.',
  },
  {
    id: 'crepi',
    name: 'Crépissage et compteur CEET',
    cost: 220_000,
    days: 3,
    start: 'Le crépissage commence ; la CEET promet le branchement « dans les délais ».',
    done: 'Murs crépis, compteur CEET branché. Plus personne ne dira « maison inachevée ».',
  },
  {
    id: 'finitions',
    name: 'Peinture et carrelage',
    cost: 200_000,
    days: 2,
    start: 'Le peintre a choisi la couleur avec toi. Ta tante, elle, voulait du vert.',
    done: 'Peinture et carrelage finis : ta maison est prête. Il ne reste qu’à emménager.',
  },
]
export const BUILD_COST = STAGES.reduce((n, st) => n + st.cost, 0)

export interface Plot {
  /** The city lot (Lomé) the house stands on. */
  lot: string
  /** Its quartier (one of housing.ts's). */
  quartier: string
  /** Game day of purchase. */
  bought: number
  /** Stages finished, 0 to STAGES.length. */
  built: number
  /** The stage under way: finished on this game day. */
  work: { until: number } | null
}

const note = (s: CityLife, msg: string): CityLife => ({
  ...s,
  life: { ...s.life, lastEvent: msg, events: [msg, ...s.life.events].slice(0, 8) },
})
const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`

export const houseReady = (p: Plot | undefined | null) => !!p && p.built >= STAGES.length
/** What the plot shows: bare land, a stage under way, or the finished house. */
export function plotLabel(p: Plot): string {
  if (houseReady(p)) return 'Ma maison'
  return p.built > 0 || p.work ? 'Mon chantier' : 'Mon terrain'
}

/** The city's free plots that can be bought, a few per quartier, cheapest quartier first. */
export function plotsForSale(lots: readonly Lot[], perQuartier = 2) {
  const out: { lot: Lot; quartier: string; price: number }[] = []
  for (const [quartier, price] of Object.entries(PLOT_PRICES).sort((a, b) => a[1] - b[1])) {
    const here = lots
      .filter((l) => l.type === 'lot' && l.district === quartier)
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, perQuartier)
    for (const lot of here) out.push({ lot, quartier, price })
  }
  return out
}

/** Buys a free plot of Lomé (one per player). */
export function buyPlot(s: CityLife, lot: Lot): CityLife {
  if (s.plot) return note(s, 'Tu as déjà ton terrain : construis d’abord dessus.')
  if (s.locality !== 'lome') return note(s, 'Les terrains se visitent sur place : reviens à Lomé.')
  const price = PLOT_PRICES[lot.district]
  if (lot.type !== 'lot' || price === undefined) return note(s, 'Ce terrain n’est pas à vendre.')
  if (s.life.wallet < price) return note(s, `Il faut ${fcfa(price)} pour ce terrain.`)
  const q = quartierById(lot.district)
  const plot: Plot = {
    lot: lot.id,
    quartier: lot.district,
    bought: s.life.day,
    built: 0,
    work: null,
  }
  return note(
    {
      ...s,
      plot,
      life: { ...s.life, wallet: s.life.wallet - price, spent: s.life.spent + price },
    },
    `Terrain acheté à ${q?.name ?? 'Lomé'} : −${fcfa(price)}. Le géomètre a planté les bornes, le chef de quartier a signé, et tu as écrit « Ce terrain n’est pas à vendre » sur la clôture. On n’est jamais trop prudent.`,
  )
}

/** Pays the next stage: the work starts and lasts its days. */
export function startStage(s: CityLife): CityLife {
  const p = s.plot
  if (!p) return note(s, 'Achète d’abord un terrain.')
  if (houseReady(p)) return note(s, 'Ta maison est finie.')
  const st = STAGES[p.built]
  if (p.work) return note(s, `${st.name} en cours : fini le jour ${p.work.until}.`)
  if (s.life.wallet < st.cost)
    return note(
      s,
      `Il faut ${fcfa(st.cost)} pour « ${st.name} ». Le chantier attend, comme tous les chantiers de Lomé.`,
    )
  return note(
    {
      ...s,
      plot: { ...p, work: { until: s.life.day + st.days } },
      life: { ...s.life, wallet: s.life.wallet - st.cost, spent: s.life.spent + st.cost },
    },
    `${st.name} : −${fcfa(st.cost)}. ${st.start} Fin des travaux dans ${st.days} jours.`,
  )
}

/** Brings the work up to the game's day: a paid stage is finished once its days are over. */
export function settleBuild(s: CityLife): CityLife {
  const p = s.plot
  if (!p?.work || s.life.day < p.work.until) return s
  const st = STAGES[p.built]
  return note({ ...s, plot: { ...p, built: p.built + 1, work: null } }, st.done)
}

/** Moves into the finished house: the rented home is left (its caution comes back). */
export function moveIntoHouse(s: CityLife): CityLife {
  const p = s.plot
  if (!p || !houseReady(p)) return note(s, 'Ta maison n’est pas encore finie.')
  const h = housingOf(s)
  if (h.owned) return note(s, 'Tu habites déjà chez toi.')
  if (totalDebt(h) > 0)
    return note(
      s,
      `Règle d’abord tes dettes (${fcfa(totalDebt(h))}) : le propriétaire garde ta caution sinon.`,
    )
  const refund = h.evicted ? 0 : h.caution
  const home: Housing = ownedHousing(p.quartier, s.life.day)
  const q = quartierById(p.quartier)
  return note(
    {
      ...s,
      housing: home,
      life: { ...s.life, wallet: s.life.wallet + refund },
    },
    `Bienvenue chez toi à ${q?.name ?? 'Lomé'} ! Plus de loyer, plus de propriétaire qui frappe.${refund ? ` Ta caution de ${fcfa(refund)} t’est rendue.` : ''} Les factures CEET et TdE, elles, continuent.`,
  )
}

/** What the next stage would cost, and whether a rent is still being paid meanwhile. */
export function buildOutlook(s: CityLife) {
  const p = s.plot
  const next = p && !houseReady(p) ? STAGES[p.built] : null
  const left = p ? STAGES.slice(p.built).reduce((n, st) => n + st.cost, 0) : BUILD_COST
  const rent = housingOf(s).owned ? 0 : housingOf(s).rent
  return { next, left, rent, monthsOfRent: rent > 0 ? Math.ceil(left / rent) : 0 }
}

/** A saved plot, checked (a saved game can be edited by hand). */
export function decodePlot(v: unknown): Plot | undefined {
  if (!v || typeof v !== 'object') return undefined
  const p = v as Partial<Plot>
  const int = (n: unknown, max: number) =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max
  if (typeof p.lot !== 'string' || p.lot.length > 40) return undefined
  if (typeof p.quartier !== 'string' || PLOT_PRICES[p.quartier] === undefined) return undefined
  if (!int(p.bought, 10_000_000) || !int(p.built, STAGES.length)) return undefined
  const until = (p.work as { until?: unknown } | null | undefined)?.until
  return {
    lot: p.lot,
    quartier: p.quartier,
    bought: p.bought as number,
    built: p.built as number,
    work:
      (p.built as number) < STAGES.length && int(until, 10_000_000)
        ? { until: until as number }
        : null,
  }
}
