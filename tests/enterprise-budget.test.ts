import assert from 'node:assert/strict'
import test from 'node:test'
import {
  type EnterpriseBudgetInput,
  calculateEnterpriseBudget,
} from '../lib/agronomy/enterprise-budget'

test('reproduit les valeurs de contrôle du classeur maïs', () => {
  const input: EnterpriseBudgetInput = {
    areaHa: 1,
    costs: [
      {
        id: 'all',
        label: 'Charges',
        category: 'other',
        quantity: 1,
        unitPrice: 393100,
        scaling: 'per_hectare',
      },
    ],
    scenarios: [
      { id: 'central', label: 'Central', yieldTonnesPerHa: 5, salePricePerTonne: 166000 },
    ],
  }
  const [result] = calculateEnterpriseBudget(input)
  assert.equal(result.revenue, 830000)
  assert.equal(result.result, 436900)
  assert.equal(result.costPerKg, 78.62)
  assert.equal(Math.round((result.breakEvenYieldTonnesPerHa ?? 0) * 100) / 100, 2.37)
  assert.equal(result.breakEvenPricePerTonne, 78620)
})

test('applique séparément les coûts par exploitation et par hectare', () => {
  const [result] = calculateEnterpriseBudget({
    areaHa: 5,
    costs: [
      {
        id: 'ha',
        label: 'Par hectare',
        category: 'other',
        quantity: 1,
        unitPrice: 100000,
        scaling: 'per_hectare',
      },
      {
        id: 'farm',
        label: 'Forfait',
        category: 'other',
        quantity: 1,
        unitPrice: 50000,
        scaling: 'per_farm',
      },
    ],
    scenarios: [{ id: 's', label: 'S', yieldTonnesPerHa: 2, salePricePerTonne: 100000 }],
  })
  assert.equal(result.totalCost, 550000)
  assert.equal(result.revenue, 1000000)
})

test('déduit les pertes post-récolte de la quantité vendable', () => {
  const [result] = calculateEnterpriseBudget({
    areaHa: 2,
    costs: [],
    scenarios: [
      { id: 's', label: 'S', yieldTonnesPerHa: 4, salePricePerTonne: 100000, lossRatePercent: 10 },
    ],
  })
  assert.equal(result.marketableTonnes, 7.2)
  assert.equal(result.revenue, 720000)
})
