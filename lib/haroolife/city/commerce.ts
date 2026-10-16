import { interact } from '../lome-life-engine'
import type { CityLife } from './life'
import { lotById } from './world'

/** Indicative game prices, not live prices or orders on the real Haroo marketplace. */
export const GOODS = [
  {
    id: 'ayimolou',
    name: 'Ayimolou',
    icon: '🍛',
    price: 500,
    description: 'Riz et haricots, à manger sur place ou plus tard.',
    needs: { hunger: 35 },
  },
  {
    id: 'akoume',
    name: 'Akoumé et sauce',
    icon: '🍲',
    price: 650,
    description: 'Une assiette pour reprendre des forces.',
    needs: { hunger: 45, energy: 5 },
  },
  {
    id: 'brochettes',
    name: 'Brochettes',
    icon: '🍢',
    price: 300,
    description: 'La petite pause du quartier.',
    needs: { hunger: 20, fun: 5 },
  },
  {
    id: 'water',
    name: 'Eau potable',
    icon: '💧',
    price: 100,
    description: 'Boire et récupérer un peu d’énergie.',
    needs: { energy: 8, hunger: 5 },
  },
  {
    id: 'maize',
    name: 'Maïs et gari · panier',
    icon: '🌽',
    price: 800,
    description: 'Provisions prêtes à utiliser pour un repas.',
    needs: { hunger: 50 },
  },
  {
    id: 'fish',
    name: 'Poisson grillé',
    icon: '🐟',
    price: 1000,
    description: 'Une portion accompagnée, préparée par la vendeuse.',
    needs: { hunger: 50, energy: 10 },
  },
  {
    id: 'fruit',
    name: 'Fruits de saison',
    icon: '🥭',
    price: 200,
    description: 'Une collation légère.',
    needs: { hunger: 15, energy: 5 },
  },
  {
    id: 'soap',
    name: 'Savon et eau de toilette',
    icon: '🧼',
    price: 250,
    description: 'Une toilette complète : hygiène +35.',
    needs: { hygiene: 35 },
  },
] as const
export type GoodsId = (typeof GOODS)[number]['id']
export type Commerce = { inventory: Partial<Record<GoodsId, number>>; boughtMeals: number }
export const emptyCommerce = (): Commerce => ({ inventory: {}, boughtMeals: 0 })
export function decodeCommerce(value: unknown, oldSpent = 0): Commerce {
  // Capture legacy objective completion once, before new vehicle expenses can affect it.
  if (!value || typeof value !== 'object')
    return { ...emptyCommerce(), boughtMeals: oldSpent >= 650 ? 1 : 0 }
  const data = value as Partial<Commerce>
  const inventory: Commerce['inventory'] = {}
  for (const item of GOODS) {
    const n = data.inventory?.[item.id]
    if (Number.isInteger(n) && n! >= 0 && n! <= 20) inventory[item.id] = n
  }
  return {
    inventory,
    boughtMeals:
      Number.isSafeInteger(data.boughtMeals) && data.boughtMeals! >= 0 ? data.boughtMeals! : 0,
  }
}
const tell = (s: CityLife, msg: string): CityLife => ({
  ...s,
  life: { ...s.life, lastEvent: msg, events: [msg, ...s.life.events].slice(0, 8) },
})
export function canShop(s: CityLife): boolean {
  if (!s.insideLot && ['market', 'bakery', 'park'].includes(s.life.inside ?? '')) return true
  const lot = s.insideLot ? lotById(s.insideLot) : null
  return !!lot && !lot.service && ['market', 'shop', 'park', 'port'].includes(lot.type)
}
export function purchase(s: CityLife, id: GoodsId): CityLife {
  const item = GOODS.find((p) => p.id === id)
  if (!item || !canShop(s))
    return tell(s, 'Entre au marché, dans une boutique ou chez un vendeur du parc pour acheter.')
  const commerce = s.commerce ?? emptyCommerce()
  const qty = commerce.inventory[id] ?? 0
  if (qty >= 20) return tell(s, 'Ton sac contient déjà 20 exemplaires de cet article.')
  if (s.life.wallet < item.price)
    return tell(s, 'Solde insuffisant : choisis un article moins cher ou effectue une course.')
  return tell(
    {
      ...s,
      commerce: {
        inventory: { ...commerce.inventory, [id]: qty + 1 },
        boughtMeals: commerce.boughtMeals + ('hunger' in item.needs && item.id !== 'water' ? 1 : 0),
      },
      life: { ...s.life, wallet: s.life.wallet - item.price, spent: s.life.spent + item.price },
    },
    `${item.name} acheté : −${item.price} FCFA. Disponible dans Mon sac.`,
  )
}
export function consume(s: CityLife, id: GoodsId): CityLife {
  const item = GOODS.find((p) => p.id === id)
  const commerce = s.commerce ?? emptyCommerce()
  if (!item || !(commerce.inventory[id]! > 0)) return tell(s, 'Tu ne possèdes pas cet article.')
  const needs = { ...s.life.needs }
  for (const [key, gain] of Object.entries(item.needs)) {
    const k = key as keyof typeof needs
    needs[k] = Math.min(100, needs[k] + gain)
  }
  return tell(
    {
      ...s,
      commerce: {
        ...commerce,
        inventory: { ...commerce.inventory, [id]: commerce.inventory[id]! - 1 },
      },
      life: { ...s.life, needs },
    },
    `${item.name} utilisé. Tes besoins ont été améliorés.`,
  )
}

/** Keep the original estate meal workflow and its objective in step with the new catalogue. */
export function buyEstateMeal(s: CityLife): CityLife {
  const life = interact(s.life, 'buy-meal')
  const gained = Math.max(0, life.meals - s.life.meals)
  return {
    ...s,
    life,
    commerce: gained
      ? { ...(s.commerce ?? emptyCommerce()), boughtMeals: (s.commerce?.boughtMeals ?? 0) + gained }
      : s.commerce,
  }
}
