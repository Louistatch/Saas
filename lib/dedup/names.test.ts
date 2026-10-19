import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ORG_MATCH, bestOrganizationMatch, organizationSimilarity, samePerson } from './names'

test('les trois graphies de Kpèlèwouaï sont la même coopérative', () => {
  assert.ok(organizationSimilarity('ESPOIR DE KPELEWAÏ', 'Espoir de kpèlèwouaï') >= ORG_MATCH)
  assert.ok(organizationSimilarity('Kpelouwai', 'Espoir de kpèlèwouaï') >= ORG_MATCH)
  assert.ok(organizationSimilarity('Kpelouwai', 'ESPOIR DE KPELEWAÏ') >= ORG_MATCH)
  assert.ok(
    organizationSimilarity('Coopérative Espoir de Kpelewai', 'SCOOPS Espoir Kpélèwai') >= ORG_MATCH,
  )
})

test('des organisations différentes ne se confondent pas', () => {
  assert.ok(organizationSimilarity('Espoir de Kara', 'Espoir de Kpalimé') < ORG_MATCH)
  assert.ok(organizationSimilarity('COOPEMA-Kara', 'COOPEMA-Sokodé') < ORG_MATCH)
  assert.ok(organizationSimilarity('COOPEMA-Aného', 'COOPEMA-Atakpamé') < ORG_MATCH)
  assert.ok(organizationSimilarity('Union Régionale Kara', 'Union Régionale Centrale') < ORG_MATCH)
  assert.ok(organizationSimilarity('Scoops nintchè', 'Kpelouwai') < 0.5)
})

test('le meilleur rapprochement est choisi', () => {
  const list = [{ name: 'COOPEMA-Kara' }, { name: 'Espoir de kpèlèwouaï' }, { name: 'FENOMAT' }]
  assert.equal(bestOrganizationMatch('ESPOIR DE KPELEWAÏ', list)?.item.name, 'Espoir de kpèlèwouaï')
})

test('prénom et nom inversés, même téléphone : même personne', () => {
  const a = { first_name: 'Podoma Aklesso', last_name: 'KAGNAYA', phone: '90 12 65 36' }
  const b = { first_name: 'KAGNAYA', last_name: 'Podoma aklesso', phone: '+228 90126536' }
  assert.equal(samePerson(a, b).same, true)
})

test('même téléphone mais autre personne de la famille : pas fusionné', () => {
  const a = { first_name: 'Kpatcha', last_name: 'AKPELI', phone: '90129109' }
  const b = { first_name: 'Essowè', last_name: 'AKPELI', phone: '90129109' }
  assert.equal(samePerson(a, b).same, false)
})
