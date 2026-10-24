import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  expiryFor,
  fieldsForType,
  formatPhone,
  formatQuantity,
  formatWorkDates,
  groupByProximity,
  isOpen,
  publishSchema,
  toKg,
  totalPay,
  whatsappLink,
} from '../lib/market/work'

const NOW = Date.parse('2026-10-23T09:00:00Z')
const DAY = 86_400_000

describe('marché et travail : règles sans base', () => {
  it('une offre de travail se ferme deux jours après le dernier jour de travail', () => {
    const at = Date.parse(expiryFor({ type: 'job', starts_on: '2026-11-03', work_days: 2 }, NOW))
    assert.equal(new Date(at).toISOString().slice(0, 10), '2026-11-07')
    // Sans date, un mois ; jamais moins de trois jours, même pour un travail déjà passé.
    assert.equal(Date.parse(expiryFor({ type: 'job' }, NOW)), NOW + 30 * DAY)
    assert.equal(
      Date.parse(expiryFor({ type: 'job', starts_on: '2026-10-01', work_days: 1 }, NOW)),
      NOW + 3 * DAY,
    )
  })

  it('une prévente reste ouverte un mois après la récolte, au plus six mois', () => {
    const at = Date.parse(expiryFor({ type: 'prevente', starts_on: '2026-12-15' }, NOW))
    assert.equal(new Date(at).toISOString().slice(0, 10), '2027-01-14')
    assert.equal(
      Date.parse(expiryFor({ type: 'prevente', starts_on: '2028-01-01' }, NOW)),
      NOW + 183 * DAY,
    )
    assert.equal(Date.parse(expiryFor({ type: 'autre' }, NOW)), NOW + 45 * DAY)
  })

  it('une annonce sans date d’expiration reste ouverte', () => {
    assert.equal(isOpen(null, NOW), true)
    assert.equal(isOpen('2026-10-22T00:00:00Z', NOW), false)
    assert.equal(isOpen('2026-10-24T00:00:00Z', NOW), true)
  })

  it('compte en kilos et en sacs de 100 kg', () => {
    assert.equal(toKg(20, 'sac'), 2000)
    assert.equal(toKg(250, 'kg'), 250)
    assert.equal(formatQuantity(2000).replace(/\s/g, ' '), '2 000 kg · 20 sacs')
    assert.equal(formatQuantity(100), '100 kg · 1 sac')
    assert.equal(formatQuantity(250), '250 kg')
  })

  it('décrit les dates et la paie d’une offre de travail', () => {
    assert.equal(formatWorkDates('2026-11-03', 2), 'mar. 3 nov. · 2 jours')
    assert.equal(formatWorkDates(null, 1), '1 jour')
    assert.equal(formatWorkDates(null, null), null)
    assert.equal(totalPay(2500, 3), 7500)
    assert.equal(totalPay(2500, null), null)
  })

  it('groupe les annonces du plus proche au plus loin, sans groupe vide', () => {
    const groups = groupByProximity([
      { id: 'a', proximity: 3 as const },
      { id: 'b', proximity: 0 as const },
      { id: 'c', proximity: 3 as const },
    ])
    assert.deepEqual(
      groups.map((g) => [g.label, g.items.map((i) => i.id)]),
      [
        ['Dans votre canton', ['b']],
        ['Ailleurs au Togo', ['a', 'c']],
      ],
    )
  })

  it('une offre de travail exige un salaire par jour et ne garde pas de prix au kilo', () => {
    const missing = publishSchema.safeParse({ type: 'job', title: 'Récolte du maïs' })
    assert.equal(missing.success, false)
    assert.equal(missing.error?.issues[0].message, 'Indiquez le salaire par jour')
    const job = publishSchema.parse({
      type: 'job',
      title: 'Récolte du maïs',
      wage_per_day_fcfa: 2500,
      price_per_kg_fcfa: 300,
      starts_on: '2026-11-03',
      work_days: 2,
    })
    assert.deepEqual(fieldsForType(job), {
      culture: null,
      quantity_kg: null,
      price_per_kg_fcfa: null,
      wage_per_day_fcfa: 2500,
      positions: 1,
      starts_on: '2026-11-03',
      work_days: 2,
    })
    const sale = publishSchema.parse({
      type: 'prevente',
      title: 'Maïs blanc',
      quantity_kg: 2000,
      price_per_kg_fcfa: 250,
      wage_per_day_fcfa: 2500,
    })
    assert.equal(fieldsForType(sale).wage_per_day_fcfa, null)
    assert.equal(fieldsForType(sale).quantity_kg, 2000)
    assert.equal(
      publishSchema.safeParse({ type: 'prevente', title: 'Maïs', starts_on: '3/11' }).success,
      false,
    )
  })

  it('affiche un numéro togolais par paires, laisse les autres tels quels', () => {
    assert.equal(formatPhone('+22890112233'), '+228 90 11 22 33')
    assert.equal(formatPhone('90112233'), '+228 90 11 22 33')
    assert.equal(formatPhone('+33612345678'), '+33612345678')
  })

  it('le lien WhatsApp ajoute l’indicatif du Togo à un numéro local', () => {
    assert.equal(whatsappLink('90 11 22 33'), 'https://wa.me/22890112233')
    assert.equal(
      whatsappLink('+228 90 11 22 33', 'Bonjour'),
      'https://wa.me/22890112233?text=Bonjour',
    )
  })
})
