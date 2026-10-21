import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CARD_COMMISSION_FCFA,
  CREDIT_PACKS,
  MIN_PURCHASE_CREDITS,
  OUTCOMES,
  TRAINING_FEE_FCFA,
  TRAINING_INSTALLMENTS,
  capabilities,
  formatFcfa,
  outcomeOf,
  packIsCoherent,
  roleAtLeast,
  toCsv,
  trainingAmountError,
  trainingChoices,
} from '../lib/payg/model'

test('packs : 20 = 5 000, 40 = 10 000, 100 = 25 000, toujours 250 FCFA le crédit', () => {
  assert.deepEqual(
    CREDIT_PACKS.map((p) => [p.credits, p.priceFcfa]),
    [
      [20, 5000],
      [40, 10000],
      [100, 25000],
    ],
  )
  for (const p of CREDIT_PACKS)
    assert.ok(packIsCoherent(p.credits, p.priceFcfa, CARD_COMMISSION_FCFA))
  assert.equal(packIsCoherent(10, 2500, 250), false, 'moins de 20 crédits refusé')
  assert.equal(packIsCoherent(20, 4000, 250), false, 'remise cachée refusée')
  assert.equal(MIN_PURCHASE_CREDITS, 20)
})

test('formation : 15 000 en une fois ou en 5 tranches de 3 000, jamais au-delà du reste', () => {
  assert.equal(TRAINING_FEE_FCFA, 15000)
  assert.equal(TRAINING_INSTALLMENTS, 5)
  assert.equal(trainingAmountError(15000, 15000), null)
  assert.equal(trainingAmountError(3000, 15000), null)
  assert.equal(trainingAmountError(6000, 6000), null)
  assert.match(trainingAmountError(2500, 15000) ?? '', /multiple/)
  assert.match(trainingAmountError(9000, 6000) ?? '', /reste/)
  assert.match(trainingAmountError(3000, 0) ?? '', /déjà réglée/)
  assert.match(trainingAmountError(0, 15000) ?? '', /invalide/)
  assert.deepEqual(
    trainingChoices(15000).map((c) => c.amount),
    [3000, 15000],
  )
  assert.deepEqual(
    trainingChoices(3000).map((c) => c.amount),
    [3000],
  )
  assert.deepEqual(trainingChoices(0), [])
})

test('rôles : l’agent émet et imprime, seul le gérant recharge et gère l’équipe', () => {
  assert.ok(roleAtLeast('owner', 'manager'))
  assert.ok(!roleAtLeast('agent', 'manager'))
  const agent = capabilities('institutional', 'agent')
  assert.ok(agent.issueCards && agent.printCards && agent.seeWallet)
  assert.ok(!agent.recharge && !agent.manageAgents && !agent.seeLedger)
  const manager = capabilities('institutional', 'manager')
  assert.ok(manager.recharge && manager.manageAgents && manager.exportReports)
  const individual = capabilities('individual', 'owner')
  assert.ok(individual.recharge && !individual.manageAgents, 'pas d’agents pour un individuel')
})

test('chaque réponse SQL a une phrase et un statut HTTP ; un débit refusé ne dit jamais « émis »', () => {
  for (const [code, o] of Object.entries(OUTCOMES)) {
    assert.ok(o.message.length > 5, code)
    assert.ok(o.status >= 200 && o.status < 600, code)
  }
  assert.equal(outcomeOf('insufficient_credits').status, 402)
  assert.match(outcomeOf('insufficient_credits').message, /Recharge|recharge/)
  assert.match(outcomeOf('already_has_card').message, /aucun crédit/)
  assert.equal(outcomeOf('inconnu').status, 500)
})

test('CSV lisible par Excel : BOM, séparateur « ; », guillemets échappés', () => {
  const csv = toCsv(
    ['Nom', 'Note'],
    [
      ['Kossi; Agro', 'dit "oui"'],
      ['Ama', null],
    ],
  )
  assert.ok(csv.startsWith('﻿'))
  assert.equal(csv.slice(1), 'Nom;Note\r\n"Kossi; Agro";"dit ""oui"""\r\nAma;\r\n')
})

test('montants affichés en FCFA avec espace des milliers', () => {
  assert.equal(formatFcfa(25000), '25 000 FCFA')
  assert.equal(formatFcfa(250), '250 FCFA')
})
