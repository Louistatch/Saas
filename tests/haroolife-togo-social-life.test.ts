import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AIR_ROUTES,
  SOCIAL_ALERTS,
  STREET_VENDORS,
  TOGO_JOBS,
  climateForMonth,
  prayerMomentAt,
  socialAlertFor,
} from '../lib/haroolife/togo-social-life'

test('le catalogue couvre des métiers et vendeurs togolais sans argent réel', () => {
  assert.ok(Object.keys(TOGO_JOBS).length >= 8)
  assert.equal(TOGO_JOBS.livreur.venue, 'station')
  assert.ok(Object.values(TOGO_JOBS).every((job) => job.wage > 0 && job.wage < 10000))
  assert.ok(STREET_VENDORS.every((vendor) => vendor.price > 0 && vendor.lines.length >= 2))
})

test('les saisons distinguent Lomé et Kara', () => {
  assert.equal(climateForMonth(1, 'kara'), 'harmattan')
  assert.equal(climateForMonth(5, 'lome'), 'grande-mousson')
  assert.equal(climateForMonth(10, 'lome'), 'petite-mousson')
})

test('les prières et alertes sociales sont déterministes et fictives', () => {
  assert.equal(prayerMomentAt(6)?.id, 'matin')
  assert.equal(prayerMomentAt(16), null)
  assert.ok(SOCIAL_ALERTS.every((alert) => alert.handle.endsWith('.jeu')))
  assert.deepEqual(socialAlertFor(2, 8, 'lome'), socialAlertFor(2, 8, 'lome'))
})

test('le trajet aérien relie Lomé à Kara via Niamtougou', () => {
  assert.equal(AIR_ROUTES['lome>kara'].hours, 1)
  assert.match(AIR_ROUTES['lome>kara'].to, /Niamtougou/)
})
