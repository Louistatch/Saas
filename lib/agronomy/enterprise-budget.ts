export type CostScaling = 'per_hectare' | 'per_farm' | 'per_tonne' | 'per_kg'

export interface BudgetCostInput {
  id: string
  label: string
  category:
    | 'land'
    | 'seed'
    | 'fertilizer'
    | 'crop_protection'
    | 'labour'
    | 'mechanization'
    | 'harvest'
    | 'post_harvest'
    | 'transport'
    | 'other'
  quantity: number
  unitPrice: number
  scaling: CostScaling
}

export interface BudgetScenarioInput {
  id: string
  label: string
  yieldTonnesPerHa: number
  salePricePerTonne: number
  lossRatePercent?: number
}

export interface EnterpriseBudgetInput {
  areaHa: number
  costs: BudgetCostInput[]
  scenarios: BudgetScenarioInput[]
}

export interface BudgetScenarioResult extends BudgetScenarioInput {
  marketableTonnes: number
  revenue: number
  totalCost: number
  result: number
  costPerKg: number | null
  breakEvenYieldTonnesPerHa: number | null
  breakEvenPricePerTonne: number | null
  returnOnCostPercent: number | null
}

const finiteNonNegative = (value: number, field: string) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} doit être positif ou nul`)
}

export function costAmount(cost: BudgetCostInput, areaHa: number, productionTonnes: number) {
  finiteNonNegative(cost.quantity, `Quantité ${cost.label}`)
  finiteNonNegative(cost.unitPrice, `Prix ${cost.label}`)
  const base = cost.quantity * cost.unitPrice
  if (cost.scaling === 'per_farm') return base
  if (cost.scaling === 'per_tonne') return base * productionTonnes
  if (cost.scaling === 'per_kg') return base * productionTonnes * 1000
  return base * areaHa
}

export function calculateEnterpriseBudget(input: EnterpriseBudgetInput): BudgetScenarioResult[] {
  if (!Number.isFinite(input.areaHa) || input.areaHa <= 0) {
    throw new Error('La superficie doit être supérieure à zéro')
  }

  return input.scenarios.map((scenario) => {
    finiteNonNegative(scenario.yieldTonnesPerHa, `Rendement ${scenario.label}`)
    finiteNonNegative(scenario.salePricePerTonne, `Prix de vente ${scenario.label}`)
    const lossRate = scenario.lossRatePercent ?? 0
    if (!Number.isFinite(lossRate) || lossRate < 0 || lossRate >= 100) {
      throw new Error('Le taux de pertes doit être compris entre 0 et 100 %')
    }

    const grossTonnes = scenario.yieldTonnesPerHa * input.areaHa
    const marketableTonnes = grossTonnes * (1 - lossRate / 100)
    const totalCost = input.costs.reduce(
      (sum, cost) => sum + costAmount(cost, input.areaHa, marketableTonnes),
      0,
    )
    const revenue = marketableTonnes * scenario.salePricePerTonne
    const result = revenue - totalCost
    const effectivePricePerHa = scenario.salePricePerTonne * (1 - lossRate / 100)

    return {
      ...scenario,
      marketableTonnes,
      revenue,
      totalCost,
      result,
      costPerKg: marketableTonnes > 0 ? totalCost / (marketableTonnes * 1000) : null,
      breakEvenYieldTonnesPerHa:
        effectivePricePerHa > 0 ? totalCost / input.areaHa / effectivePricePerHa : null,
      breakEvenPricePerTonne: marketableTonnes > 0 ? totalCost / marketableTonnes : null,
      returnOnCostPercent: totalCost > 0 ? (result / totalCost) * 100 : null,
    }
  })
}

export const MAIZE_REFERENCE_COSTS: BudgetCostInput[] = [
  {
    id: 'seed',
    label: 'Semences certifiées',
    category: 'seed',
    quantity: 25,
    unitPrice: 4500,
    scaling: 'per_hectare',
  },
  {
    id: 'npk',
    label: 'NPK 15-15-15',
    category: 'fertilizer',
    quantity: 4,
    unitPrice: 18000,
    scaling: 'per_hectare',
  },
  {
    id: 'urea',
    label: 'Urée 46 %',
    category: 'fertilizer',
    quantity: 2,
    unitPrice: 18000,
    scaling: 'per_hectare',
  },
  {
    id: 'mechanization',
    label: 'Labour et hersage',
    category: 'mechanization',
    quantity: 1,
    unitPrice: 47500,
    scaling: 'per_hectare',
  },
  {
    id: 'labour',
    label: 'Main-d’œuvre et opérations',
    category: 'labour',
    quantity: 1,
    unitPrice: 96500,
    scaling: 'per_hectare',
  },
]
