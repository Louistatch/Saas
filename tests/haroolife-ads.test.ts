import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  type AdCampaign,
  INTERNAL_CAMPAIGNS,
  PLACEMENTS,
  ROTATION_MS,
  campaignFor,
  canMove,
  exposed,
  isSponsored,
  runsOn,
  safeHref,
  safeImage,
} from '../lib/haroolife/ads/campaigns'
import { setLocality } from '../lib/haroolife/city/locality'
import { inEstate, isCityRoad, lotAt, terrainAt, worldLots } from '../lib/haroolife/city/world'

const NOW = Date.parse('2026-10-13T10:00:00Z')
const avenue = PLACEMENTS.find((p) => p.id === 'lome-avenue') as (typeof PLACEMENTS)[number]
const partner = (over: Partial<AdCampaign> = {}): AdCampaign => ({
  id: 'p1',
  advertiser: { name: 'Partenaire fictif (démo)', kind: 'partner' },
  creative: {
    title: 'Démo',
    body: 'Créatif de démonstration',
    cta: 'Voir',
    href: '/contact',
    palette: ['#000', '#fff', '#f00'],
  },
  status: 'active',
  locality: 'lome',
  placements: ['lome-avenue'],
  startsAt: '2026-10-01T00:00:00Z',
  endsAt: '2026-10-31T00:00:00Z',
  weight: 1,
  version: 1,
  ...over,
})

describe('HarooLife billboards: placements and campaigns (M2)', () => {
  it('every pilot support stands on open land beside a road, never a door or the estate', () => {
    for (const p of PLACEMENTS) {
      setLocality(p.locality)
      assert.equal(terrainAt(p.x, p.y), 'land', p.id)
      assert.equal(isCityRoad(p.x, p.y), false, `${p.id} not on the road`)
      assert.equal(inEstate(p.x, p.y), false, p.id)
      const lot = lotAt(p.x, p.y)
      assert.ok(!lot || lot.type === 'park' || lot.type === 'lot', `${p.id} on open ground`)
      assert.ok(
        !worldLots().some((l) => l.door.x === p.x && l.door.y === p.y),
        `${p.id} blocks no door`,
      )
      const d = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[p.faces]
      assert.ok(isCityRoad(p.x + d[0], p.y + d[1]), `${p.id} faces its road`)
    }
    assert.equal(PLACEMENTS.filter((p) => p.locality === 'lome').length, 2)
    assert.equal(PLACEMENTS.filter((p) => p.locality === 'kara').length, 2)
    setLocality('lome')
  })
  it('internal campaigns run everywhere, unsponsored; a support always shows something', () => {
    for (const p of PLACEMENTS) assert.ok(campaignFor(p, INTERNAL_CAMPAIGNS, NOW))
    assert.ok(INTERNAL_CAMPAIGNS.every((c) => !isSponsored(c)))
  })
  it('only active (or approved) campaigns, inside their window, in their town and supports', () => {
    for (const status of ['draft', 'pending', 'paused', 'expired'] as const)
      assert.equal(runsOn(partner({ status }), avenue, NOW), false, status)
    assert.equal(runsOn(partner({ status: 'approved' }), avenue, NOW), true)
    assert.equal(
      runsOn(partner({ endsAt: '2026-10-13T09:59:59Z' }), avenue, NOW),
      false,
      'expired at once',
    )
    assert.equal(runsOn(partner({ startsAt: '2026-10-14T00:00:00Z' }), avenue, NOW), false)
    assert.equal(runsOn(partner({ locality: 'kara' }), avenue, NOW), false)
    assert.equal(runsOn(partner({ placements: ['lome-jardin'] }), avenue, NOW), false)
    assert.equal(runsOn(partner({ startsAt: 'pas une date' }), avenue, NOW), false)
    assert.equal(
      runsOn(
        partner({ creative: { ...partner().creative, href: 'javascript:alert(1)' } }),
        avenue,
        NOW,
      ),
      false,
    )
  })
  it('rotation changes per time slot only, deterministic, sponsored marked', () => {
    const all = [...INTERNAL_CAMPAIGNS, partner()]
    const seen = new Set<string>()
    for (let i = 0; i < 6; i++) seen.add(campaignFor(avenue, all, NOW + i * ROTATION_MS)?.id ?? '')
    assert.ok(seen.has('p1'))
    assert.equal(
      campaignFor(avenue, all, NOW),
      campaignFor(avenue, all, NOW + 1000),
      'stable inside a slot',
    )
    assert.equal(isSponsored(partner()), true)
  })
  it('links and images: site paths and https on allowed hosts only', () => {
    assert.equal(safeHref('/marche'), '/marche')
    assert.equal(safeHref('https://www.faitierehub.com/haroo'), 'https://www.faitierehub.com/haroo')
    for (const bad of [
      'javascript:alert(1)',
      '//evil.example',
      'http://www.faitierehub.com',
      'https://evil.example/x',
      'data:text/html,x',
    ])
      assert.equal(safeHref(bad), null, bad)
    assert.equal(
      safeImage('https://www.faitierehub.com/ads/a.webp'),
      'https://www.faitierehub.com/ads/a.webp',
    )
    assert.equal(safeImage('https://www.faitierehub.com/ads/a.svg'), null)
    assert.equal(safeImage('https://cdn.evil.example/a.webp'), null)
  })
  it('admin status workflow', () => {
    assert.ok(
      canMove('draft', 'pending') &&
        canMove('pending', 'approved') &&
        canMove('approved', 'active'),
    )
    assert.ok(
      canMove('active', 'paused') && canMove('paused', 'active') && canMove('active', 'expired'),
    )
    assert.ok(!canMove('draft', 'active'), 'never live without review')
    assert.ok(!canMove('expired', 'active'))
  })
  it('exposure: in front, within range, inside the field of view, never from behind', () => {
    // The avenue panel faces east (+x). A camera east of it looking west sees it.
    assert.equal(exposed(avenue, { x: avenue.x + 6, z: avenue.y, angle: 90 }), true)
    // Same place, looking east (away): not seen.
    assert.equal(exposed(avenue, { x: avenue.x + 6, z: avenue.y, angle: 270 }), false)
    // Behind the panel (west side), looking at it: back of the board, not counted.
    assert.equal(exposed(avenue, { x: avenue.x - 6, z: avenue.y, angle: 270 }), false)
    // Too far.
    assert.equal(exposed(avenue, { x: avenue.x + 30, z: avenue.y, angle: 90 }), false)
  })
})

describe('billboard exposure statistics', () => {
  it('counts an impression after one second of continuous view, once per 30 s', async () => {
    const { ExposureTracker } = await import('../lib/haroolife/ads/exposure')
    const t = new ExposureTracker()
    const v = [{ campaign: 'c', placement: 'p' }]
    assert.equal(t.observe(0, v), 0)
    assert.equal(t.observe(500, v), 0)
    assert.equal(t.observe(1000, v), 1)
    for (let ms = 1250; ms < 30_000; ms += 250) assert.equal(t.observe(ms, v), 0)
    assert.equal(t.observe(31_000, v), 1)
    // A glance (< 1 s) never counts; leaving resets the timer.
    assert.equal(t.observe(31_500, []), 0)
    assert.equal(t.observe(40_000, v), 0)
    assert.equal(t.observe(40_900, v), 0)
    assert.deepEqual(t.flush(), [{ campaign: 'c', placement: 'p', impressions: 2, clicks: 0 }])
    assert.deepEqual(t.flush(), [])
  })
  it('clicks are explicit taps, capped per campaign and session', async () => {
    const { ExposureTracker, MAX_CLICKS_PER_CAMPAIGN } = await import(
      '../lib/haroolife/ads/exposure'
    )
    const t = new ExposureTracker()
    for (let i = 0; i < MAX_CLICKS_PER_CAMPAIGN; i++) assert.equal(t.click('c', 'p'), true)
    assert.equal(t.click('c', 'p'), false)
    assert.equal(t.flush()[0].clicks, MAX_CLICKS_PER_CAMPAIGN)
  })
})
