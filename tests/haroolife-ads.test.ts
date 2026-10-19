import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  type AdCampaign,
  INTERNAL_CAMPAIGNS,
  PILOT_SUPPORTS,
  PLACEMENTS,
  ROTATION_MS,
  campaignFor,
  canMove,
  exposed,
  isAdFace,
  isSponsored,
  runsOn,
  safeHref,
  safeImage,
  supportNear,
  supportsSeen,
} from '../lib/haroolife/ads/campaigns'
import {
  type BoardPost,
  boardTextProblem,
  decodePosts,
  faceFor,
  postIdOf,
  rentProblem,
  untilSaid,
} from '../lib/haroolife/ads/rental'
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
    // A support by each market, station, university, hospital and town hall; never two side by side.
    assert.equal(PLACEMENTS.filter((p) => p.locality === 'lome').length, 12)
    assert.equal(PLACEMENTS.filter((p) => p.locality === 'kara').length, 8)
    assert.equal(new Set(PLACEMENTS.map((p) => p.id)).size, PLACEMENTS.length)
    for (const a of PLACEMENTS)
      for (const b of PLACEMENTS)
        if (a !== b && a.locality === b.locality)
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 4, `${a.id} / ${b.id}`)
    setLocality('lome')
  })
  it('FaîtiereHub notices run on the pilot supports, unsponsored; the others are for rent', () => {
    for (const p of PLACEMENTS) {
      const face = faceFor(p, INTERNAL_CAMPAIGNS, [], NOW)
      if (PILOT_SUPPORTS.includes(p.id)) {
        assert.equal(face.advertiser.kind, 'internal', p.id)
        assert.ok(campaignFor(p, INTERNAL_CAMPAIGNS, NOW))
      } else {
        assert.equal(face.advertiser.kind, 'vacant', p.id)
        assert.equal(face.creative.title, 'Panneau disponible')
        assert.match(face.creative.body, /À louer dès 5\s000 FCFA par jour/)
      }
    }
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

const post = (over: Partial<BoardPost> = {}): BoardPost => ({
  id: '9a000000-0000-4000-8000-000000000001',
  placement: 'lome-assigame',
  title: 'Maïs de Bè',
  body: 'Je vends mon maïs, passe au marché samedi.',
  palette: 1,
  author: '@ama_be',
  mine: false,
  startsAt: '2026-10-13T08:00:00Z',
  endsAt: '2026-10-14T08:00:00Z',
  ...over,
})
const assigame = PLACEMENTS.find((p) => p.id === 'lome-assigame') as (typeof PLACEMENTS)[number]

describe('billboards rented by players', () => {
  it('a rented support shows its post, in its window only, before any campaign', () => {
    const face = faceFor(assigame, INTERNAL_CAMPAIGNS, [post()], NOW)
    assert.deepEqual(
      [face.advertiser, face.creative.title, face.creative.palette[0], postIdOf(face)],
      [{ name: '@ama_be', kind: 'player' }, 'Maïs de Bè', '#14532d', post().id],
    )
    assert.equal(isSponsored(face), false)
    // A partner on every Lomé support does not push a player who paid out of their window.
    const everywhere = partner({ placements: [] })
    assert.equal(faceFor(assigame, [everywhere], [post()], NOW).advertiser.kind, 'player')
    assert.equal(faceFor(assigame, [everywhere], [], NOW).advertiser.kind, 'partner')
    // Before its start, after its end, or on another support: « À louer ».
    for (const p of [
      post({ startsAt: '2026-10-13T11:00:00Z' }),
      post({ endsAt: '2026-10-13T10:00:00Z' }),
      post({ placement: 'lome-marche-be' }),
    ])
      assert.equal(faceFor(assigame, INTERNAL_CAMPAIGNS, [p], NOW).advertiser.kind, 'vacant')
    assert.equal(
      faceFor(avenue, INTERNAL_CAMPAIGNS, [post({ placement: 'lome-avenue' })], NOW).advertiser
        .kind,
      'player',
    )
  })
  it('only campaigns count as ads: a player’s post or « À louer » is never measured', () => {
    const showing = {
      'lome-avenue': INTERNAL_CAMPAIGNS[0],
      'lome-assigame': faceFor(assigame, [], [], NOW),
      'lome-jardin': faceFor(avenue, [], [post({ placement: 'lome-avenue' })], NOW),
    }
    assert.deepEqual(Object.values(showing).map(isAdFace), [true, false, false])
    const cam = (p: { x: number; y: number }, angle: number) => ({
      tx: p.x + 6,
      tz: p.y,
      distance: 0,
      angle,
    })
    assert.deepEqual(
      supportsSeen(PLACEMENTS, showing, cam(avenue, 90)).map((s) => s.placement),
      ['lome-avenue'],
    )
    assert.equal(supportsSeen(PLACEMENTS, showing, cam(assigame, 90)).length, 0)
    // On foot by a free support: the button offers to rent it.
    assert.equal(
      supportNear(PLACEMENTS, showing, { x: assigame.x + 1, z: assigame.y }, false)?.id,
      'lome-assigame',
    )
    assert.equal(supportNear(PLACEMENTS, showing, { x: assigame.x + 1, z: assigame.y }, true), null)
  })
  it('a notice never carries a phone number, a link or an e-mail (as the database)', () => {
    for (const ok of [
      'Je vends mon maïs, 25 000 le sac',
      'Anniversaire de Kossi samedi à 16 h',
      'Tontine : 2 000 par semaine, 12 membres',
      'Cours de maths, 3e et 2nde, Bè.',
    ])
      assert.equal(boardTextProblem(ok), null, ok)
    const bad: [string, string][] = [
      ['Appelle au 90 12 34 56', 'telephone'],
      ['+228.90.12.34.56', 'telephone'],
      ['(228) 90-12-34-56', 'telephone'],
      ['www.monmais.com', 'lien'],
      ['Visite monmais.tg ce soir', 'lien'],
      ['https://x.y', 'lien'],
      ['écris à ama@mail.tg', 'email'],
    ]
    for (const [text, why] of bad) assert.equal(boardTextProblem(text), why, text)
    assert.equal(rentProblem('Ma', 'Je vends'), 'Titre : de 3 à 32 caractères')
    assert.equal(rentProblem('Maïs', 'x'.repeat(121)), 'Message : de 3 à 120 caractères')
    assert.match(rentProblem('Maïs', 'Appelle 90123456') ?? '', /numéro de téléphone/)
    assert.equal(rentProblem('  Maïs   de Bè ', ' Je vends\tmon maïs '), null)
  })
  it('posts from the network are checked field by field', () => {
    const good = post()
    const back = decodePosts([
      good,
      { ...good, id: 3 },
      { ...good, endsAt: 'demain' },
      { ...good, palette: 9, title: 'x'.repeat(80) },
      null,
      'texte',
    ])
    assert.equal(back.length, 2)
    assert.deepEqual(back[0], good)
    assert.equal(back[1].palette, 0)
    assert.equal(back[1].title.length, 32)
    assert.deepEqual(decodePosts({ not: 'a list' }), [])
    assert.equal(untilSaid('2026-10-17T14:00:00Z'), 'jusqu’à samedi 14 h')
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
