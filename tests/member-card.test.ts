/**
 * Carte de membre FaîtiereHub (face unique, CR80) : rendu, QR, contraste,
 * mise en page et exports.
 *
 * Lancer : node --import tsx --test tests/member-card.test.ts
 * (depuis la racine du dépôt ; polices et WASM lus dans node_modules / lib).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { before, describe, test } from 'node:test'
import { inflateSync } from 'node:zlib'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import jsQR from 'jsqr'
import sharp from 'sharp'
import { resolveCardBranding } from '../lib/card-engine/branding'
import {
  CARD_FALLBACK_FILES,
  CARD_FONT_FACES,
  CARD_FONT_PUBLIC_PATH,
  CARD_FONT_STACK,
} from '../lib/card-engine/card-fonts'
import { LIBERATION_ADVANCES, LIBERATION_UNITS_PER_EM } from '../lib/card-engine/glyph-metrics'
import { harooCardVerifyUrl } from '../lib/card-engine/haroo-card'
import { imageAspectFromDataUrl } from '../lib/card-engine/image-size'
import * as memberCard from '../lib/card-engine/member-card'
import {
  GRID,
  PHOTO_CIRCLE,
  RADIUS,
  TRIM_W,
  TYPE,
  cardLayout,
  chooseQr,
  describeCardQr,
  effectiveStatus,
  formatLongDate,
  headerTitle,
  membershipPeriod,
  photoFrame,
  renderCardSvg,
  statusView,
  validityProgress,
} from '../lib/card-engine/member-card'
import { buildCardPdf, cardPdfPageSize } from '../lib/card-engine/pdf'
import { type BuildCardSchemaOptions, buildCardSchema } from '../lib/card-engine/schema'
import { CARDS_PER_SHEET, SHEET, cellTrimOrigin, cropMarksPath } from '../lib/card-engine/sheet'
import {
  type FontWeight,
  PT,
  advanceEm,
  breakLines,
  fitText,
  fontRuns,
  inPrimaryFont,
  measureText,
} from '../lib/card-engine/text-metrics'
import {
  ICON_ON_ACCENT_MIN,
  blend,
  contrastRatio,
  deriveCardTokens,
  hslToRgb,
  parseHex,
  toHex,
} from '../lib/card-engine/tokens'
import { CARD_VERIFY_ORIGIN, cardVerifyUrl } from '../lib/card-engine/verify-url'
import { encodeText } from '../lib/utils/qr'

const ROOT = process.cwd()
const AS_OF = '2026-10-10'
const SAFE = 30
const W = 856
const H = 540

let fontBuffers: Uint8Array[] = []
let LOGO = ''

before(async () => {
  await initWasm(await readFile(join(ROOT, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')))
  // Comme la route /api/cards : Poppins (quatre graisses), puis Liberation Sans.
  fontBuffers = await Promise.all(
    [...CARD_FONT_FACES.map((f) => f.file), ...CARD_FALLBACK_FILES].map(
      async (f) => new Uint8Array(await readFile(join(ROOT, 'lib/card-engine/fonts', f))),
    ),
  )
  LOGO = `data:image/png;base64,${(await readFile(join(ROOT, 'public/logo.png'))).toString('base64')}`
})

// ─── Jeux de données ─────────────────────────────────────────────────────────

const pngDataUrl = async (svg: string, w: number, h: number) =>
  `data:image/png;base64,${(await sharp(Buffer.from(svg)).resize(w, h).png().toBuffer()).toString('base64')}`

const PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="350" height="450"><rect width="350" height="450" fill="#dfe6ea"/><ellipse cx="175" cy="190" rx="72" ry="90" fill="#6b4329"/><path d="M20 450 C 30 340, 320 340, 330 450 Z" fill="#1f5f8b"/></svg>`
const SQUARE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><circle cx="200" cy="200" r="190" fill="#0b5d2a"/><circle cx="200" cy="200" r="120" fill="#f2c230"/></svg>`
const WIDE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="#fff"/><rect x="20" y="20" width="160" height="160" fill="#8b4513"/><text x="210" y="125" font-family="Liberation Sans" font-weight="700" font-size="72" fill="#8b4513">COPCAK</text></svg>`
/** Image de signature fournie par les données (encre sombre sur blanc). */
const SIGNATURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><rect width="400" height="120" fill="#fff"/><path d="M20 90 L380 30" stroke="#1a237e" stroke-width="6"/></svg>`

const BASE: BuildCardSchemaOptions = {
  member: {
    first_name: 'Akossiwa',
    last_name: 'Amegavi',
    phone: '+228 90 12 34 56',
    photo_url: null,
    village: 'Kuma Konda',
    canton: 'Kuma',
    prefecture: 'Kloto',
    region: 'Plateaux',
  },
  cardNumber: 'KPA-482913',
  expiryDate: '2027-10-08',
  createdAt: '2026-10-08T09:12:00Z',
  status: 'active',
  level: 'argent',
  cooperativeName: 'COOPCA Kpalimé',
  organisationId: '11111111-aaaa-4bbb-8ccc-000000000001',
  organisationLevel: 'cooperative',
  unionName: 'Union des Producteurs de Café du Kloto',
  faitiereName: 'Faîtière des Producteurs du Plateau',
  brandColor: '#0D3D22',
  accentColor: '#1ed760',
  template: { title: 'Carte de membre', subtitle: "Pass d'accès coopératif" },
}

async function fullOptions(): Promise<BuildCardSchemaOptions> {
  return {
    ...BASE,
    member: {
      ...BASE.member,
      photo_url: await pngDataUrl(PHOTO_SVG, 350, 450),
      signature_url: await pngDataUrl(SIGNATURE_SVG, 400, 120),
    },
    faitiereLogoUrl: await pngDataUrl(SQUARE_LOGO_SVG, 400, 400),
    faitiereLogoAspect: 1,
    cooperativeLogoUrl: await pngDataUrl(WIDE_LOGO_SVG, 600, 200),
    cooperativeLogoAspect: 3,
  }
}

const noImages = (): BuildCardSchemaOptions => ({
  ...BASE,
  unionName: null,
  faitiereName: null,
  cooperativeName: 'Groupement Kpodzi',
})

const LONG_40: BuildCardSchemaOptions = {
  ...BASE,
  member: {
    ...BASE.member,
    first_name: 'Ɖevi Kɔmla Ŋutsugbe',
    last_name: 'Ɖokui-Agbodjan Kodjo',
  },
  cooperativeName: 'Union des Groupements Maraîchers de la Préfecture du Zio et Environs',
  organisationLevel: 'union',
  unionName: null,
}

const SUSPENDED: BuildCardSchemaOptions = { ...BASE, status: 'suspended', brandColor: '#6B2D8B' }

type Extra = Partial<Parameters<typeof renderCardSvg>[1]>

function svgOf(opts: BuildCardSchemaOptions, extra: Extra = {}): string {
  return renderCardSvg(buildCardSchema(opts), {
    mode: 'screen',
    asOf: AS_OF,
    fontCss: null,
    ...extra,
  })
}

function rasterize(svg: string, width: number): Buffer {
  return Buffer.from(
    new Resvg(svg, {
      fitTo: { mode: 'width', value: width },
      font: { fontBuffers, defaultFontFamily: 'Poppins', loadSystemFonts: false },
    })
      .render()
      .asPng(),
  )
}

// ─── Boîtes de texte du SVG, pour détecter débordements et collisions ───────

interface Box {
  s: string
  x0: number
  x1: number
  top: number
  bottom: number
  size: number
  fill: string | null
  weight: FontWeight
}

const decode = (t: string) =>
  t
    .replace(/<[^>]+>/g, '')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

function textBoxes(svg: string): Box[] {
  const out: Box[] = []
  for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const attrs = m[1]
    const get = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1]
    const size = Number.parseFloat(get('font-size') ?? '0')
    let x = Number.parseFloat(get('x') ?? '0')
    let y = Number.parseFloat(get('y') ?? '0')
    let sx = 1
    const tr = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+) 1\)/.exec(get('transform') ?? '')
    if (tr) {
      x = Number.parseFloat(tr[1])
      y = Number.parseFloat(tr[2])
      sx = Number.parseFloat(tr[3])
    }
    const s = decode(m[2])
    const weight = Number(get('font-weight') ?? '400') as FontWeight
    const w =
      measureText(s, size, { weight, tracking: Number.parseFloat(get('letter-spacing') ?? '0') }) *
      sx
    const anchor = get('text-anchor') ?? 'start'
    const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
    out.push({
      s,
      x0,
      x1: x0 + w,
      top: y - size * 0.72,
      bottom: y + size * 0.22,
      size,
      fill: get('fill') ?? null,
      weight,
    })
  }
  return out
}

const allText = (svg: string) =>
  textBoxes(svg)
    .map((b) => b.s)
    .join(' | ')

function assertLayoutSound(
  svg: string,
  label: string,
  panel?: { x: number; y: number; h: number },
): void {
  const boxes = textBoxes(svg).filter((b) => b.s.trim())
  assert.ok(boxes.length > 15, `${label}: du texte attendu`)
  for (const b of boxes) {
    assert.ok(b.x0 >= SAFE - 0.5, `${label}: « ${b.s} » déborde à gauche (${b.x0.toFixed(1)})`)
    assert.ok(b.x1 <= W - SAFE + 0.5, `${label}: « ${b.s} » déborde à droite (${b.x1.toFixed(1)})`)
    assert.ok(b.bottom <= H - SAFE, `${label}: « ${b.s} » sort en bas (${b.bottom.toFixed(1)})`)
    assert.ok(b.top >= SAFE, `${label}: « ${b.s} » sort en haut (${b.top.toFixed(1)})`)
    assert.ok(b.size / PT >= 5.99, `${label}: « ${b.s} » à ${(b.size / PT).toFixed(2)} pt`)
    // Hors du panneau du QR, aucun texte ne le chevauche.
    if (panel && (b.x0 + b.x1) / 2 < panel.x) {
      const ox = b.x1 - panel.x
      const oy = Math.min(b.bottom, panel.y + panel.h) - Math.max(b.top, panel.y)
      assert.ok(!(ox > 0.5 && oy > 0.5), `${label}: « ${b.s} » chevauche le panneau du QR`)
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      assert.ok(
        !(ox > 1 && oy > 1.5),
        `${label}: « ${a.s} » et « ${b.s} » se chevauchent (${ox.toFixed(1)} × ${oy.toFixed(1)})`,
      )
    }
  }
}

function layoutOf(opts: BuildCardSchemaOptions) {
  return cardLayout(buildCardSchema(opts), { asOf: AS_OF })
}

// ─── Rendu ───────────────────────────────────────────────────────────────────

describe('rendu de la carte (face unique)', () => {
  test('données complètes : chaque champ réel est imprimé, dans la zone de sécurité', async () => {
    const opts = await fullOptions()
    const svg = svgOf(opts, { platformLogo: LOGO })
    const text = allText(svg)
    for (const expected of [
      'CARTE DE MEMBRE',
      'Faîtière des Producteurs du Plateau',
      'Membre vérifié',
      'Akossiwa AMEGAVI',
      'Argent',
      'COOPÉRATIVE',
      'COOPCA Kpalimé',
      'UNION',
      'LOCALITÉ',
      'TÉLÉPHONE',
      '+228 90 12 34 56',
      'N° MEMBRE',
      'KPA-482913',
      'SIGNATURE',
      "VALIDE JUSQU'AU",
      '08 octobre 2027',
      'STATUT',
      'Active',
      'PÉRIODE',
      '2026 – 2027',
    ]) {
      assert.ok(text.includes(expected), `« ${expected} » manquant`)
    }
    const layout = layoutOf(opts)
    assert.deepEqual(
      layout.tiles.find((t) => t.label === 'LOCALITÉ')?.lines.join(' '),
      'Kuma Konda, Kuma, Kloto, Plateaux',
    )
    assert.deepEqual(
      layout.lineage.map((r) => [r.label, r.lines.join(' ')]),
      [
        ['COOPÉRATIVE', 'COOPCA Kpalimé'],
        ['UNION', 'Union des Producteurs de Café du Kloto'],
      ],
    )
    // Plus de ligne « Sécurisé · Vérifiable » ni de pastille de statut redondante.
    assert.ok(!text.includes('Sécurisé'))
    assert.ok(!/MEMBRE ACTIF/i.test(text))
    // Photo, logo FaîtiereHub, logo de l'organisation et signature réelle intégrés.
    assert.ok(svg.includes(LOGO.slice(0, 60)), 'logo FaîtiereHub')
    assert.ok(/<clipPath id="tl[^"]+"/.test(svg), 'logo de l’organisation au bandeau')
    assert.ok(/data-signature="1"/.test(svg), 'signature réelle dessinée')
    assertLayoutSound(svg, 'complet', layout.panel)

    const png = rasterize(svg, 1011)
    const meta = await sharp(png).metadata()
    assert.equal(meta.width, 1011)
    assert.equal(meta.height, 638) // 85,6 × 54 mm à 300 ppp
  })

  test('chaque organisation n’apparaît qu’une fois (coopérative, union, faîtière)', async () => {
    const cases: [string, BuildCardSchemaOptions, string[]][] = [
      [
        'lignée complète',
        await fullOptions(),
        [
          'COOPCA Kpalimé',
          'Union des Producteurs de Café du Kloto',
          'Faîtière des Producteurs du Plateau',
        ],
      ],
      [
        'sans faîtière : union au bandeau',
        { ...BASE, faitiereName: null },
        ['COOPCA Kpalimé', 'Union des Producteurs de Café du Kloto'],
      ],
      ['sans lignée', noImages(), ['Groupement Kpodzi']],
    ]
    for (const [label, opts, names] of cases) {
      const flat = allText(svgOf(opts)).replace(/ \| /g, ' ')
      for (const name of names) {
        const count = flat.split(name).length - 1
        assert.equal(count, 1, `${label} : « ${name} » imprimé ${count} fois`)
      }
    }
    // Sans faîtière, l'union est l'émettrice : pas de ligne « UNION » sous le nom.
    const noFaitiere = layoutOf({ ...BASE, faitiereName: null })
    assert.deepEqual(noFaitiere.issuer, ['Union des Producteurs de Café du Kloto'])
    assert.deepEqual(
      noFaitiere.lineage.map((r) => r.label),
      ['COOPÉRATIVE'],
    )
    // Tuiles : localité et téléphone, jamais la coopérative.
    assert.deepEqual(
      layoutOf(BASE).tiles.map((t) => t.label),
      ['LOCALITÉ', 'TÉLÉPHONE'],
    )
  })

  test('sans photo, sans logo, sans signature : états dessinés, aucun trou', () => {
    const svg = svgOf(noImages())
    assert.ok(!svg.includes('<image'), 'aucune image')
    assert.ok(svg.includes('data-placeholder="photo"'), 'silhouette en place de la photo')
    assert.ok(!svg.includes('data-signature'), 'pas de paraphe inventé : ligne vierge')
    assert.ok(allText(svg).includes('SIGNATURE'))
    assert.ok(!/<clipPath id="tl[^"]+"/.test(svg), 'pas de cartouche de logo vide')
    const layout = layoutOf(noImages())
    // Ni faîtière ni union : le bandeau nomme le registre, jamais la coopérative.
    assert.deepEqual(layout.issuer, ['FaîtiereHub'])
    assert.deepEqual(layout.lineage, [{ label: 'COOPÉRATIVE', lines: ['Groupement Kpodzi'] }])
    assertLayoutSound(svg, 'sans images', layout.panel)
    // Téléphone absent : tiret, pas de champ vide.
    const noPhone = layoutOf({ ...noImages(), member: { ...BASE.member, phone: '' } })
    assert.deepEqual(noPhone.tiles[1].lines, ['—'])
    assert.ok(Buffer.byteLength(svg) < 60_000, 'SVG sans image sous 60 Ko')
  })

  test('nom de 40 caractères (éwé) : jamais tronqué, ni comprimé, ni en collision', () => {
    const full = `${LONG_40.member.first_name} ${LONG_40.member.last_name}`
    assert.equal(full.length, 40)
    const svg = svgOf(LONG_40)
    const layout = layoutOf(LONG_40)
    assertLayoutSound(svg, 'nom long', layout.panel)
    assert.equal(
      layout.name.join(' ').replace(/- /g, '-'),
      'Ɖevi Kɔmla Ŋutsugbe ƉOKUI-AGBODJAN KODJO',
    )
    assert.ok(layout.name.length <= 2, 'deux lignes au plus')
    assert.ok(!/scale\(0\.\d+ 1\)/.test(svg), 'aucune compression horizontale')
    assert.ok(!layout.name.join(' ').includes('…'), 'aucune ellipse dans un nom de personne')
  })

  test('pire cas : textes très longs restent lisibles, sans compression, sans collision', () => {
    const worst: BuildCardSchemaOptions = {
      ...LONG_40,
      member: {
        first_name: 'Ɖevi Kɔmla Ŋutsugbe Mawuena Atsu',
        last_name: 'Ɖokui-Agbodjan Ŋutsugbe-Koudjogbo',
        village: 'Agou Apégamé',
        canton: 'Agou-Nyogbo',
        prefecture: 'Agou',
        region: 'Plateaux',
      },
      cardNumber: 'FAITIERE-2026-00012345',
      faitiereName: 'Faîtière Nationale des Producteurs Agricoles du Togo',
      template: { title: 'Carte de membre', subtitle: '' },
    }
    const svg = svgOf(worst)
    const layout = layoutOf(worst)
    assertLayoutSound(svg, 'pire cas', layout.panel)
    assert.equal(layout.number.join(''), 'FAITIERE-2026-00012345', 'numéro jamais abrégé')
    assert.equal(
      layout.name.join(' ').replace(/- /g, '-'),
      'Ɖevi Kɔmla Ŋutsugbe Mawuena Atsu ƉOKUI-AGBODJAN ŊUTSUGBE-KOUDJOGBO',
    )
    // L'organisation émettrice figure en entier au bandeau (deux lignes).
    assert.equal(layout.issuer.join(' '), 'Faîtière Nationale des Producteurs Agricoles du Togo')
    assert.ok(!/scale\(0\.\d+ 1\)/.test(svg), 'aucune compression horizontale')
  })

  test('noms d’organisation : retour à la ligne avant toute ellipse', () => {
    const union = layoutOf(BASE).lineage[1]
    assert.equal(union.label, 'UNION')
    assert.ok(union.lines.length === 2, 'union repliée sur deux lignes')
    assert.equal(union.lines.join(' '), 'Union des Producteurs de Café du Kloto')
    // Organisation du membre : jusqu'à trois lignes, l'union s'efface avant elle.
    const coop = 'Coopérative des Maraîchers de Kuma Konda'
    const own = layoutOf({ ...BASE, cooperativeName: coop }).lineage
    assert.equal(own[0].lines.join(' '), coop)
    // Nom démesuré : « … » à un mot entier en dernier recours, jamais comprimé.
    const huge = 'Union des Groupements Maraîchers de la Préfecture du Zio et Environs'
    const layout = layoutOf({ ...LONG_40, cooperativeName: huge })
    const lines = layout.lineage[0].lines
    assert.ok(lines.length <= 2)
    assert.ok(lines[lines.length - 1].endsWith('…'))
    assert.ok(huge.startsWith(lines.join(' ').replace(/…$/, '')), 'coupé à un mot entier')
    assert.ok(!/scale\(0\.\d+ 1\)/.test(svgOf({ ...LONG_40, cooperativeName: huge })))
    // L'organisation émettrice tient en entier au bandeau, sur deux lignes au plus.
    const big = 'Faîtière Nationale des Producteurs Agricoles et Maraîchers du Togo'
    assert.equal(layoutOf({ ...BASE, faitiereName: big }).issuer.join(' '), big)
  })

  test('carte suspendue : badge et statut réels, couleur distincte, pas de « vérifié »', () => {
    const svg = svgOf(SUSPENDED)
    const text = allText(svg)
    assert.ok(text.includes('Carte suspendue'))
    assert.ok(text.split(' | ').includes('Suspendue'))
    assert.ok(!/vérifié/i.test(text), 'jamais « membre vérifié » pour une carte suspendue')
    const t = deriveCardTokens({ brand: SUSPENDED.brandColor })
    assert.ok(svg.includes(`fill="${t.tones.warn.badgeFill}"`), 'badge ambre')
    assert.ok(!svg.includes(`fill="${t.tones.ok.badgeFill}"`), 'pas de badge vert')
    assert.notEqual(t.tones.warn.badgeFill, t.tones.ok.badgeFill)
    assertLayoutSound(svg, 'suspendue', layoutOf(SUSPENDED).panel)
  })

  test('identifiants SVG uniques entre deux cartes, et par suffixe', () => {
    const ids = (s: string) => [...s.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
    const a = svgOf(BASE)
    const other = svgOf({ ...BASE, cardNumber: 'KPA-000001' })
    assert.deepEqual(
      ids(a).filter((i) => ids(other).includes(i)),
      [],
    )
    const preview = svgOf(BASE, { idSuffix: '-ap' })
    const print = svgOf(BASE, { idSuffix: '-pr' })
    assert.deepEqual(
      ids(preview).filter((i) => ids(print).includes(i)),
      [],
    )
    assert.equal(new Set(ids(a)).size, ids(a).length, 'pas de doublon dans une carte')
  })

  test('mode écran : zone rognée, angles arrondis ; mode impression : fond perdu, angles vifs', () => {
    const screen = svgOf(BASE)
    assert.match(screen, /viewBox="0 0 856 540"/)
    assert.ok(screen.includes('rx="31.8"'), 'rayon 3,18 mm en masque')
    assert.ok(!/ width="\d+" height="\d+" role=/.test(screen), 's’adapte au conteneur')
    const print = svgOf(BASE, { mode: 'print' })
    assert.match(print, /viewBox="-30 -30 916 600"/)
    assert.ok(!print.includes('rx="31.8"'), 'angles vifs à l’impression')
    assert.match(svgOf(BASE, { mode: 'print', intrinsicSize: true }), /width="916" height="600"/)
  })

  test('titre : intitulé court par défaut, titre personnalisé respecté', () => {
    assert.equal(headerTitle(buildCardSchema(BASE)), 'CARTE DE MEMBRE')
    for (const title of ['Carte de Membre', "Carte d'identité membre", '']) {
      assert.equal(
        headerTitle(buildCardSchema({ ...BASE, template: { title } })),
        'CARTE DE MEMBRE',
      )
    }
    assert.equal(
      headerTitle(buildCardSchema({ ...BASE, template: { title: 'Pass coopérateur' } })),
      'PASS COOPÉRATEUR',
    )
  })

  test('une seule face : aucun rendu de verso n’est exposé', () => {
    assert.equal('renderCardFace' in memberCard, false)
    assert.equal(typeof memberCard.renderCardSvg, 'function')
    const svg = svgOf(BASE)
    assert.equal(svg.match(/<svg\b/g)?.length, 1)
    assert.equal(svg.match(/fill="#000000" shape-rendering="crispEdges"/g)?.length, 1, 'un QR')
  })
})

// ─── Grille, échelle typographique, bandeau ─────────────────────────────────

/** Cartes représentatives : complète, sans images, nom long, suspendue, pire cas. */
async function sampleCards(): Promise<[string, BuildCardSchemaOptions][]> {
  return [
    ['complète', await fullOptions()],
    ['sans images', noImages()],
    ['nom long', LONG_40],
    ['suspendue', SUSPENDED],
    ['expirée', { ...BASE, expiryDate: '2026-01-01', createdAt: '2025-01-01' }],
    [
      'nom démesuré',
      {
        ...LONG_40,
        member: { ...LONG_40.member, first_name: 'Ɖevi Kɔmla Ŋutsugbe Mawuena Atsu' },
        cardNumber: 'FAITIERE-2026-00012345',
        faitiereName: 'Faîtière Nationale des Producteurs Agricoles du Togo',
      },
    ],
  ]
}

describe('grille et typographie', () => {
  test('grille : trois colonnes (22 mm | centre | 22 mm), gouttières de 2,5 mm, marges de 3 mm', () => {
    assert.equal(GRID.safe, 30)
    assert.equal(GRID.gutter, 25)
    assert.equal(GRID.left.x, GRID.safe)
    assert.equal(GRID.left.w, 220)
    assert.equal(GRID.right.w, 220)
    assert.equal(GRID.centre.x, GRID.left.x + GRID.left.w + GRID.gutter)
    assert.equal(GRID.right.x, GRID.centre.x + GRID.centre.w + GRID.gutter)
    assert.equal(GRID.right.x + GRID.right.w, TRIM_W - GRID.safe)
    assert.equal(PHOTO_CIRCLE.r * 2, 140, 'portrait de 14 mm')
    assert.equal(PHOTO_CIRCLE.cx, GRID.left.x + GRID.left.w / 2, 'portrait centré dans sa colonne')
  })

  test('alignements : tuiles = QR, ligne de signature = bas des tuiles, bords communs', async () => {
    for (const [label, opts] of await sampleCards()) {
      const { geometry: g, panel } = layoutOf(opts)
      const first = g.tiles[0]
      const last = g.tiles[g.tiles.length - 1]
      const eq = (a: number, b: number, what: string) =>
        assert.ok(Math.abs(a - b) < 0.05, `${label} : ${what} (${a.toFixed(2)} ≠ ${b.toFixed(2)})`)
      eq(first.y, panel.y, 'haut des tuiles = haut du QR')
      eq(last.y + last.h, panel.y + panel.h, 'bas des tuiles = bas du QR')
      eq(panel.y + panel.h, g.signatureY, 'bas du QR = ligne de signature')
      eq(g.signatureY, GRID.dataBottom, 'ligne de signature sur la grille')
      eq(g.nameX, GRID.centre.x, 'bord gauche du nom')
      eq(g.lineageX, GRID.centre.x, 'bord gauche de la ligne coopérative')
      for (const tile of g.tiles) {
        eq(tile.x, GRID.centre.x, 'bord gauche des tuiles')
        eq(tile.x + tile.w, GRID.centre.x + GRID.centre.w, 'bord droit des tuiles')
      }
      eq(panel.x, GRID.right.x, 'bord gauche du QR')
      eq(panel.x + panel.w, TRIM_W - GRID.safe, 'bord droit du QR')
      eq(g.badgeRight, TRIM_W - GRID.safe, 'bord droit du badge')
      assert.deepEqual(g.footerCells, [GRID.left.x, GRID.centre.x, GRID.right.x], `${label} : pied`)
      assert.ok(g.footerRule > GRID.dataBottom, `${label} : filet du pied sous les tuiles`)
      // Le panneau du QR et les tuiles sont des rectangles dessinés à ces cotes.
      const svg = svgOf(opts)
      assert.ok(
        svg.includes(
          `<rect x="${panel.x}" y="${panel.y.toFixed(1)}" width="${panel.w}" height="${panel.h.toFixed(1)}" rx="${RADIUS.panel}" fill="#FFFFFF"/>`,
        ),
        `${label} : panneau du QR`,
      )
      for (const tile of g.tiles) {
        assert.ok(
          svg.includes(
            `<rect x="${tile.x.toFixed(1)}" y="${tile.y.toFixed(1)}" width="${tile.w.toFixed(1)}" height="${tile.h.toFixed(1)}" rx="${RADIUS.tile}"`,
          ),
          `${label} : tuile`,
        )
      }
    }
  })

  test('quatre tailles de texte au plus, toutes ≥ 6 pt ; le gras réservé au numéro', async () => {
    const scale = new Set(
      [TYPE.value.pt, TYPE.title.pt, TYPE.org.pt, TYPE.label.pt, TYPE.small.pt].map((pt) =>
        (pt * PT).toFixed(1),
      ),
    )
    assert.equal(scale.size, 3, 'hors nom : 7,5, 6,5 et 6 pt')
    for (const [label, opts] of await sampleCards()) {
      const svg = svgOf(opts, { platformLogo: LOGO })
      const boxes = textBoxes(svg)
      const sizes = new Set(boxes.map((b) => b.size.toFixed(1)))
      assert.ok(sizes.size <= 4, `${label} : ${sizes.size} tailles (${[...sizes].join(', ')})`)
      const layout = layoutOf(opts)
      for (const b of boxes) {
        assert.ok(b.size / PT >= 5.99, `${label} : « ${b.s} » à ${(b.size / PT).toFixed(2)} pt`)
        const isName = layout.name.includes(b.s)
        if (isName) {
          assert.equal(b.weight, TYPE.name.weight, `${label} : nom en demi-gras`)
          const pt = b.size / PT
          assert.ok(pt <= TYPE.name.pt + 0.05 && pt >= TYPE.name.minTwoLines - 0.05, `nom à ${pt}`)
        } else {
          assert.ok(scale.has(b.size.toFixed(1)), `${label} : « ${b.s} » hors échelle`)
        }
        if (b.weight === 700) {
          assert.ok(layout.number.includes(b.s), `${label} : « ${b.s} » en gras`)
        }
      }
    }
    // Nom : 13 pt quand il tient sur une ligne.
    const short = textBoxes(svgOf(BASE)).find((b) => b.s === 'Akossiwa AMEGAVI')
    assert.equal(short?.size.toFixed(1), (13 * PT).toFixed(1))
  })

  test('nom : 13 → 10 pt sur une ligne, puis deux lignes avant de rétrécir encore', () => {
    const name = (first: string, last: string) =>
      textBoxes(svgOf({ ...BASE, member: { ...BASE.member, first_name: first, last_name: last } }))
        .filter((b) => b.weight === TYPE.name.weight && b.size > TYPE.value.pt * PT + 0.1)
        .map((b) => ({ s: b.s, pt: b.size / PT }))
    const one = name('Komlanvi Edem', 'Agbodjan')
    assert.equal(one.length, 1)
    assert.ok(one[0].pt < 12.99 && one[0].pt >= 9.95, `une ligne réduite : ${one[0].pt}`)
    const two = name('Komlanvi Edem Mawuéna', 'Agbodjan-Koudjogbo')
    assert.equal(two.length, 2, 'deux lignes')
    assert.ok(Math.abs(two[0].pt - 10) < 0.05, `deux lignes à 10 pt : ${two[0].pt}`)
  })

  test('bandeau sur une rangée : titre, badge et titre du QR sur une ligne', async () => {
    for (const [label, opts] of await sampleCards()) {
      const layout = layoutOf(opts)
      assert.equal(layout.title.length, 1, `${label} : titre sur une ligne`)
      assert.ok(layout.issuer.length <= 2, `${label} : organisation sur deux lignes au plus`)
      const svg = svgOf(opts)
      const boxes = textBoxes(svg)
      const badge = boxes.find((b) => b.s === layout.status.badge)
      assert.ok(badge, `${label} : badge « ${layout.status.badge} » sur une ligne`)
      const title = boxes.find((b) => b.s === layout.title[0])
      assert.ok(title && badge && title.x1 < badge.x0, `${label} : titre avant le badge`)
      const qrTitle = boxes.find(
        (b) => b.s === 'Vérifier en ligne' || b.s === 'Scanner pour vérifier',
      )
      assert.ok(qrTitle, `${label} : titre du QR`)
      assert.ok(
        qrTitle && qrTitle.x0 >= layout.panel.x && qrTitle.x1 <= layout.panel.x + layout.panel.w,
        `${label} : titre du QR dans le panneau`,
      )
    }
  })

  test('superposition de la grille : option de mise au point seulement', () => {
    assert.ok(!svgOf(BASE).includes('data-debug'))
    const debug = svgOf(BASE, { debugGrid: true })
    assert.ok(debug.includes('data-debug="grid"'))
    for (const x of [GRID.centre.x, GRID.right.x]) assert.ok(debug.includes(`M${x} 0V`))
  })
})

// ─── Photo : disque rempli, jamais déformée, visage entier ──────────────────

/** Personne de synthèse : visage centré horizontalement, à `hy` de la hauteur. */
function personSvg(w: number, h: number, hy: number): string {
  const u = Math.min(w, h) / 10
  const cx = w / 2
  const cy = h * hy
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#cfe3f0"/><path d="M${cx - 4.2 * u} ${h} C ${cx - 4 * u} ${cy + 2.6 * u}, ${cx + 4 * u} ${cy + 2.6 * u}, ${cx + 4.2 * u} ${h} Z" fill="#c8641f"/><ellipse cx="${cx}" cy="${cy}" rx="${1.55 * u}" ry="${2 * u}" fill="#7a4a2c"/><ellipse cx="${cx}" cy="${cy - 1.7 * u}" rx="${1.7 * u}" ry="${0.7 * u}" fill="#1d1d1d"/></svg>`
}

const PHOTO_RATIOS = [
  { name: '3:4', w: 600, h: 800, hy: 0.38 },
  { name: '7:9', w: 700, h: 900, hy: 0.38 },
  { name: '1:1', w: 700, h: 700, hy: 0.42 },
  { name: '4:3', w: 1024, h: 768, hy: 0.42 },
  { name: '9:16', w: 720, h: 1280, hy: 0.3 },
] as const

const jpegDataUrl = async (svg: string) =>
  `data:image/jpeg;base64,${(await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer()).toString('base64')}`

describe('photo du portrait (médaillon rond)', () => {
  const circle = PHOTO_CIRCLE

  test('cadrage « cover » aux proportions réelles, portrait recadré par le bas', async () => {
    for (const r of PHOTO_RATIOS) {
      const photo = await jpegDataUrl(personSvg(r.w, r.h, r.hy))
      const svg = svgOf({ ...BASE, member: { ...BASE.member, photo_url: photo } })
      const tag = /<image [^>]*data-photo-ppi="[^"]+"[^>]*\/>/.exec(svg)?.[0] ?? ''
      const attr = (n: string) => Number(new RegExp(` ${n}="([-\\d.]+)"`).exec(tag)?.[1])
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map(attr)
      assert.ok(tag.includes('preserveAspectRatio="xMidYMin slice"'), `${r.name} : jamais étirée`)
      // Proportions de la source conservées (à l'arrondi d'affichage près).
      assert.ok(Math.abs(w / h - r.w / r.h) < 0.005, `${r.name} : ${w}×${h} déformée`)
      // Le disque est entièrement couvert.
      assert.ok(x <= circle.cx - circle.r + 0.1 && x + w >= circle.cx + circle.r - 0.1, r.name)
      assert.ok(y <= circle.cy - circle.r + 0.1 && y + h >= circle.cy + circle.r - 0.1, r.name)
      assert.ok(Math.abs(x + w / 2 - circle.cx) < 0.1, `${r.name} : centrée horizontalement`)
      if (r.h > r.w) {
        const excess = h - 2 * circle.r
        const top = circle.cy - circle.r - y
        assert.ok(
          Math.abs(top - excess * 0.15) < 0.2,
          `${r.name} : ${top.toFixed(1)} rogné en haut`,
        )
      } else {
        assert.ok(Math.abs(y - (circle.cy - circle.r)) < 0.1, `${r.name} : centrée verticalement`)
      }
      // Le visage et le haut des cheveux tombent dans le disque, avec de la marge.
      const u = Math.min(r.w, r.h) / 10
      const map = (py: number) => y + (py / r.h) * h
      const faceY = map(r.h * r.hy)
      const hairTop = map(r.h * r.hy - 2.4 * u)
      assert.ok(
        Math.abs(faceY - circle.cy) < circle.r * 0.45,
        `${r.name} : visage ${faceY.toFixed(0)}`,
      )
      assert.ok(
        hairTop > circle.cy - circle.r + 4,
        `${r.name} : front coupé (${hairTop.toFixed(1)})`,
      )
    }
  })

  test('rendu : ciel au-dessus des cheveux, visage au centre, aucune bande vide', async () => {
    const k = 2022 / W
    for (const r of PHOTO_RATIOS) {
      const photo = await jpegDataUrl(personSvg(r.w, r.h, r.hy))
      const svg = svgOf({ ...BASE, member: { ...BASE.member, photo_url: photo } })
      const { data, info } = await sharp(rasterize(svg, 2022))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const px = (ux: number, uy: number) => {
        const o = (Math.round(uy * k) * info.width + Math.round(ux * k)) * 3
        return [data[o], data[o + 1], data[o + 2]]
      }
      const near = (c: number[], hex: string, tol = 40) => {
        const t = parseHex(hex)
        return !!t && Math.abs(c[0] - t.r) + Math.abs(c[1] - t.g) + Math.abs(c[2] - t.b) < tol * 3
      }
      const frame = photoFrame([r.w, r.h])
      const faceY = frame.y + r.hy * frame.height
      assert.ok(near(px(circle.cx, faceY), '#7a4a2c'), `${r.name} : visage absent au centre`)
      assert.ok(
        near(px(circle.cx, circle.cy - circle.r + 4), '#cfe3f0'),
        `${r.name} : pas de ciel en haut`,
      )
      // Bords gauche et droit du disque remplis par la photo (pas de bande du fond).
      for (const dx of [-circle.r + 5, circle.r - 5]) {
        const c = px(circle.cx + dx, circle.cy)
        assert.ok(
          near(c, '#cfe3f0') || near(c, '#c8641f') || near(c, '#7a4a2c'),
          `${r.name} : bord vide`,
        )
      }
    }
  })

  test('définition : signalée sous 300 ppp, jamais bloquante ; taille inconnue : 7:9 sans déformation', async () => {
    const tiny = await pngDataUrl(personSvg(60, 80, 0.38), 60, 80)
    const layout = layoutOf({ ...BASE, member: { ...BASE.member, photo_url: tiny } })
    assert.equal(layout.photo?.lowResolution, true)
    assert.ok((layout.photo?.ppi ?? 0) < 300)
    const sharpPhoto = await jpegDataUrl(personSvg(700, 900, 0.38))
    const ok = layoutOf({ ...BASE, member: { ...BASE.member, photo_url: sharpPhoto } })
    assert.equal(ok.photo?.lowResolution, false)
    assert.ok((ok.photo?.ppi ?? 0) > 1000, 'photo d’identité 700 × 900 : > 1 000 ppp sur 14 mm')
    // URL non intégrée (aperçu, feuille) : proportions supposées 7:9, `slice` en garde-fou.
    const remote = layoutOf({
      ...BASE,
      member: { ...BASE.member, photo_url: 'https://x/p-face.jpg' },
    })
    assert.equal(remote.photo?.measured, false)
    assert.ok(Math.abs((remote.photo?.aspect ?? 0) - 7 / 9) < 1e-9)
    assert.equal(layoutOf(BASE).photo, null)
  })
})

// ─── Statut, dates, jauge : tirés des données, jamais d'une année codée ─────

describe('dates, statut et jauge', () => {
  test('date longue en français, sans décalage de fuseau', () => {
    assert.equal(formatLongDate('2027-10-08'), '08 octobre 2027')
    assert.equal(formatLongDate('2027-01-01T00:00:00Z'), '01 janvier 2027')
    assert.equal(formatLongDate('2027-12-31T23:59:59-05:00'), '31 décembre 2027')
    assert.equal(formatLongDate('2031-08-15'), '15 août 2031')
    assert.equal(formatLongDate(''), '—')
    assert.equal(formatLongDate(null), '—')
    assert.equal(formatLongDate('2026-09-30', true), '30 sept. 2026')
    // Pied : mois abrégé seulement quand la date longue déborde de sa colonne.
    assert.equal(layoutOf(BASE).footer.date, '08 octobre 2027')
    assert.equal(layoutOf({ ...BASE, expiryDate: '2026-09-30' }).footer.date, '30 sept. 2026')
  })

  test('période d’adhésion : années des données, pas de l’horloge', () => {
    assert.equal(membershipPeriod('1999-03-02T10:00:00Z', '2088-03-02'), '1999 – 2088')
    assert.equal(membershipPeriod('2031-01-01', '2031-12-31'), '2031')
    assert.equal(membershipPeriod('', ''), '—')
    const text = allText(svgOf({ ...BASE, createdAt: '1999-03-02', expiryDate: '2088-03-02' }))
    assert.ok(text.includes('1999 – 2088'))
    assert.ok(text.includes('02 mars 2088'))
  })

  test('badge de statut : « membre vérifié » seulement si la carte est active', () => {
    assert.equal(statusView('active').badge, 'Membre vérifié')
    assert.equal(statusView('active').verified, true)
    assert.ok(allText(svgOf(BASE)).includes('Membre vérifié'))
    for (const [status, badge, word, tone] of [
      ['suspended', 'Carte suspendue', 'Suspendue', 'warn'],
      ['pending', 'En attente', 'En attente', 'warn'],
      ['expired', 'Carte expirée', 'Expirée', 'danger'],
      ['revoked', 'Carte révoquée', 'Révoquée', 'danger'],
    ] as const) {
      const v = statusView(status)
      assert.equal(v.badge, badge)
      assert.equal(v.word, word)
      assert.equal(v.tone, tone)
      assert.equal(v.verified, false)
      const layout = layoutOf({ ...BASE, status })
      assert.equal(layout.status.badge, badge)
      assert.ok(!/vérifié/i.test(allText(svgOf({ ...BASE, status }))), `${status} : pas vérifié`)
    }
  })

  test('« expirée » se déduit de la date, pas d’un drapeau', () => {
    const member = buildCardSchema(BASE).member
    assert.equal(effectiveStatus(member, '2027-10-08'), 'active', 'valable le jour même')
    assert.equal(effectiveStatus(member, '2027-10-09'), 'expired')
    assert.equal(effectiveStatus({ ...member, status: 'revoked' }, '2020-01-01'), 'revoked')
    const expired = layoutOf({ ...BASE, expiryDate: '2026-01-01', createdAt: '2025-01-01' })
    assert.equal(expired.status.badge, 'Carte expirée')
    assert.equal(expired.footer.word, 'Expirée')
    assert.equal(expired.footer.bar.fill, expired.footer.bar.track, 'jauge pleine')
  })

  test('jauge : part écoulée de la période de validité, calculée', () => {
    assert.equal(validityProgress('2026-01-01', '2027-01-01', '2026-01-01'), 0)
    assert.equal(validityProgress('2026-01-01', '2027-01-01', '2027-01-01'), 1)
    assert.equal(validityProgress('2026-01-01', '2027-01-01', '2030-05-05'), 1)
    assert.equal(validityProgress('2026-01-01', '2027-01-01', '2020-05-05'), 0)
    const half = validityProgress('2026-01-01T08:00:00Z', '2026-01-31', '2026-01-16') ?? -1
    assert.ok(Math.abs(half - 0.5) < 1e-9, `mi-parcours : ${half}`)
    assert.equal(validityProgress('', '2027-01-01', '2026-01-01'), null)
    assert.equal(validityProgress('2027-01-01', '2026-01-01', '2026-06-01'), null)

    // Rendu : remplissage = part × longueur de la piste.
    const opts = { ...BASE, createdAt: '2026-01-01', expiryDate: '2027-01-01' }
    for (const asOf of ['2026-04-02', '2026-07-02', '2026-10-01']) {
      const layout = cardLayout(buildCardSchema(opts), { asOf })
      const p = validityProgress(opts.createdAt, opts.expiryDate, asOf) ?? 0
      assert.ok(Math.abs(layout.footer.bar.fill - p * layout.footer.bar.track) < 1e-6)
      const svg = renderCardSvg(buildCardSchema(opts), { asOf })
      assert.match(svg, new RegExp(`data-progress="${p.toFixed(4)}"`))
    }
    const empty = cardLayout(buildCardSchema({ ...opts, createdAt: null }), { asOf: AS_OF })
    assert.equal(empty.footer.bar.fill, 0, 'date manquante : jauge vide, jamais décorative')
  })

  test('niveau inconnu : aucun niveau inventé', () => {
    const text = allText(svgOf({ ...BASE, level: null }))
    for (const word of ['Bronze', 'Argent', 'Or']) {
      assert.ok(!text.split(' | ').includes(word), `${word} inventé`)
    }
    assert.ok(
      allText(svgOf({ ...BASE, level: 'or' }))
        .split(' | ')
        .includes('Or'),
    )
  })

  test('aucune année du jour, ni exemple, codée dans le moteur de cartes', async () => {
    const dir = join(ROOT, 'lib/card-engine')
    const files = (await readdir(dir)).filter(
      (f) => f.endsWith('.ts') && f !== 'glyph-metrics.ts' && f !== 'haroo-card.ts',
    )
    assert.ok(files.length >= 10)
    const extra = [
      'lib/utils/card-image.ts',
      'components/dashboard/card-svg-preview.tsx',
      'app/dashboard/cards/print/page.tsx',
      'app/api/cards/[memberId]/route.ts',
    ]
    const sources = [
      ...(await Promise.all(
        files.map(async (f) => [f, await readFile(join(dir, f), 'utf8')] as const),
      )),
      ...(await Promise.all(
        extra.map(async (f) => [f, await readFile(join(ROOT, f), 'utf8')] as const),
      )),
    ]
    for (const [file, src] of sources) {
      assert.ok(!/\b20[2-4]\d\b/.test(src), `${file} : année codée en dur`)
      assert.ok(
        !/FENOMAT|HAROFEMA|KPA-\d|COOP-12345|FNPAT|AKWA|Akossiwa|ALL-\d/i.test(src),
        `${file} : donnée d'exemple codée`,
      )
    }
  })
})

// ─── QR ──────────────────────────────────────────────────────────────────────

function decodeQr(png: Buffer): Promise<string | null> {
  return sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(
      ({ data, info }) => jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null,
    )
}

describe('QR de vérification', () => {
  const numbers = ['KPA-482913', 'UCP-000214', 'ZIO-100377', 'FAITIERE-2026-00012345', 'N° é/1 2']

  test('charge utile inchangée : https://www.faitierehub.com/verify/<numéro encodé>', () => {
    assert.equal(CARD_VERIFY_ORIGIN, 'https://www.faitierehub.com')
    for (const n of numbers) {
      assert.equal(
        cardVerifyUrl({ cardNumber: n }),
        `https://www.faitierehub.com/verify/${encodeURIComponent(n)}`,
      )
      assert.equal(
        describeCardQr(buildCardSchema({ ...BASE, cardNumber: n })).url,
        cardVerifyUrl({ cardNumber: n }),
      )
    }
    assert.equal(
      harooCardVerifyUrl({ cardNumber: 'OUV-1', verifyToken: null }),
      cardVerifyUrl({ cardNumber: 'OUV-1' }),
    )
    assert.equal(
      harooCardVerifyUrl({ cardNumber: 'OUV-1', verifyToken: 'tok' }),
      'https://www.faitierehub.com/verify/t/tok',
    )
  })

  test('géométrie : module ≥ 0,33 mm, silence ≥ 4 modules, ECC Q ou M', () => {
    for (const n of [...numbers, 'X'.repeat(40)]) {
      const info = describeCardQr(buildCardSchema({ ...BASE, cardNumber: n }))
      assert.ok(info.moduleMm >= 0.33, `${n} : module ${info.moduleMm.toFixed(3)} mm`)
      assert.ok(info.quietZoneModules >= 4, `${n} : silence ${info.quietZoneModules.toFixed(2)}`)
      assert.ok(Number.isInteger(info.modulePx), 'module = nombre entier de pixels à 300 ppp')
      assert.ok(info.ecc === 'Q' || info.ecc === 'M')
    }
    // Numéro au format réel (ABC-123456) : version 4, ECC Q, modules de 0,338 mm
    // (4 px à 300 ppp), symbole de 11,2 mm dans un panneau de 22 mm.
    const typical = describeCardQr(buildCardSchema(BASE))
    assert.equal(typical.ecc, 'Q')
    assert.equal(typical.version, 4)
    assert.equal(typical.modulePx, 4)
    assert.ok(typical.symbolMm >= 11, `symbole ${typical.symbolMm} mm`)
    // Q seulement s'il ne coûte pas de version de plus que M.
    const long = chooseQr(cardVerifyUrl({ cardNumber: 'FAITIERE-2026-00012345' }))
    assert.equal(long.ecc, 'M')
    assert.equal(long.matrix.length, 33)
  })

  test('QR noir sur blanc pur, sans filtre ni motif sous les modules', () => {
    const svg = svgOf(BASE, { platformLogo: LOGO })
    const qr =
      /<g transform="translate\([\d.]+ [\d.]+\) scale\([\d.]+\)" fill="#000000" shape-rendering="crispEdges"><path d="[^"]+"\/><\/g>/.exec(
        svg,
      )
    assert.ok(qr, 'groupe du QR noir, sans filtre')
    const panel = layoutOf(BASE).panel
    assert.ok(
      svg.includes(
        `<rect x="${panel.x}" y="${panel.y.toFixed(1)}" width="${panel.w}" height="${panel.h.toFixed(1)}" rx="${RADIUS.panel}" fill="#FFFFFF"/>`,
      ),
      'panneau blanc pur',
    )
  })

  for (const mode of ['screen', 'print'] as const) {
    test(`décodage jsQR du rendu complet (${mode}) : taille réelle, 300 ppp et 150 ppp`, async () => {
      const widthMm = mode === 'print' ? 91.6 : 85.6
      let decoded = 0
      for (const brand of ['#0D3D22', '#F2C230', '#6B2D8B']) {
        for (const n of [numbers[0], numbers[3], numbers[4]]) {
          const schema = buildCardSchema({ ...BASE, cardNumber: n, brandColor: brand })
          const svg = renderCardSvg(schema, {
            mode,
            asOf: AS_OF,
            platformLogo: LOGO,
            fontCss: null,
          })
          const full = rasterize(svg, Math.round((widthMm / 25.4) * 600)) // taille réelle, 600 ppp
          const expected = cardVerifyUrl({ cardNumber: n })
          const dpis = brand === '#0D3D22' && n === numbers[0] ? [600, 300, 150] : [300, 150]
          for (const dpi of dpis) {
            const w = Math.round((widthMm / 25.4) * dpi)
            const small = dpi === 600 ? full : await sharp(full).resize(w).png().toBuffer()
            assert.equal(await decodeQr(small), expected, `${mode} ${brand} ${n} @${dpi} ppp`)
            // Gain de point : léger flou de l'impression et de la capture, de
            // 0,8 px (un cinquième de module à 300 ppp) ; à 150 ppp, où le
            // module ne fait plus que 2 px, un quart de module.
            const sigma = dpi === 150 ? 0.5 : 0.8
            const blurred = await sharp(small).blur(sigma).png().toBuffer()
            assert.equal(await decodeQr(blurred), expected, `${mode} ${brand} ${n} @${dpi} flou`)
            decoded += 2
          }
        }
      }
      assert.equal(decoded, 2 * (3 + 8 * 2))
    })
  }

  test('sans logo officiel fourni (emblème vectoriel au bandeau) : décodable à 150 ppp', async () => {
    const svg = svgOf(BASE)
    const full = rasterize(svg, Math.round((85.6 / 25.4) * 600))
    const small = await sharp(full)
      .resize(Math.round((85.6 / 25.4) * 150))
      .png()
      .toBuffer()
    assert.equal(await decodeQr(small), cardVerifyUrl({ cardNumber: 'KPA-482913' }))
  })
})

describe('encodeur QR', () => {
  const sums = (m: boolean[][]) => createHash('sha256').update(JSON.stringify(m)).digest('hex')

  test('défaut inchangé (masque 0) : les QR Haroo ne bougent pas d’un module', () => {
    const url = 'https://www.faitierehub.com/verify/KPA-482913'
    assert.equal(
      sums(encodeText(url, 'H')),
      '4d6e404c651d31db1d71f01c7446929b2418cae3bea010e8820325dae1a632da',
    )
    assert.equal(
      sums(encodeText(url, 'M')),
      '15ef53d62a7fefc9a8f6bea767b51392e6a62a617670999b78249c72acf97236',
    )
    assert.equal(
      sums(encodeText(url, 'Q')),
      'efdd8e3308e4b06f671bde0ae386224f3d8bc34e8894357fbd524b8e2b06cc0d',
    )
    assert.equal(
      sums(encodeText('a', 'H')),
      'ab2eed628f405820ee2776131c143414739f42a8e6b1414e1258323dcd10a761',
    )
  })

  test('mask: auto choisit un masque à pénalité minimale et reste décodable', () => {
    for (const text of ['https://www.faitierehub.com/verify/KPA-482913', 'a', 'x'.repeat(60)]) {
      for (const ecc of ['L', 'M', 'Q', 'H'] as const) {
        const auto = encodeText(text, ecc, { mask: 'auto' })
        const n = auto.length
        const scale = 8
        const px = Buffer.alloc((n + 8) * scale * (n + 8) * scale * 4, 255)
        const side = (n + 8) * scale
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            if (!auto[y][x]) continue
            for (let dy = 0; dy < scale; dy++) {
              for (let dx = 0; dx < scale; dx++) {
                const o = (((y + 4) * scale + dy) * side + (x + 4) * scale + dx) * 4
                px[o] = px[o + 1] = px[o + 2] = 0
              }
            }
          }
        }
        const res = jsQR(new Uint8ClampedArray(px), side, side)
        assert.equal(res?.data, text, `${ecc} ${text.length} car.`)
      }
    }
  })
})

// ─── Couleurs : contraste ───────────────────────────────────────────────────

/** Couleurs d'organisation de toutes sortes, y compris absurdes. */
function brandInputs(): (string | null)[] {
  const inputs: (string | null)[] = [
    null,
    '',
    'pas-une-couleur',
    '#0D3D22',
    '#1ed760',
    '#F2C230',
    '#E8590C',
    '#1F5FA8',
    '#6B2D8B',
    '#C0392B',
    '#7a9485',
    '#ffffff',
    '#000000',
    '#fff',
    '#808080',
    '#00ff00',
    '#ffff00',
    '#ff00ff',
  ]
  for (let h = 0; h < 360; h += 15) {
    for (const [s, l] of [
      [1, 0.5],
      [0.9, 0.3],
      [0.6, 0.7],
      [0.2, 0.15],
      [1, 0.95],
    ]) {
      inputs.push(toHex(hslToRgb({ h, s, l })))
    }
  }
  return inputs
}

describe('contraste et jetons de couleur', () => {
  test('rapport de contraste WCAG', () => {
    assert.equal(contrastRatio('#000000', '#ffffff').toFixed(2), '21.00')
    assert.equal(contrastRatio('#777777', '#ffffff').toFixed(2), '4.48')
    assert.equal(contrastRatio('#767676', '#ffffff').toFixed(2), '4.54')
  })

  test('palette fixe : texte ≥ AA sur son fond ; l’organisation ne change que l’accent', () => {
    const base = deriveCardTokens({})
    for (const brand of brandInputs()) {
      const t = deriveCardTokens({ brand })
      // Seuls l'accent et son pictogramme dépendent de l'organisation.
      for (const key of ['text', 'label', 'bandInk', 'bandMuted', 'panelInk', 'qr'] as const) {
        assert.equal(t[key], base[key], `${brand} : ${key} ne doit pas dépendre de la marque`)
      }
      assert.ok(
        contrastRatio(t.onAccent, t.accent) >= ICON_ON_ACCENT_MIN,
        `${brand} : pictogramme ${contrastRatio(t.onAccent, t.accent).toFixed(2)}`,
      )
      assert.ok(parseHex(t.accent), `${brand} : accent valide`)
    }
    for (const bg of [base.bandTop, base.bandBottom]) {
      for (const fg of [base.bandInk, base.bandMuted, base.bandHub]) {
        assert.ok(contrastRatio(fg, bg) >= 4.5, `${fg} sur ${bg}`)
      }
    }
    for (const tone of Object.values(base.tones)) {
      assert.ok(contrastRatio(tone.badgeText, tone.badgeFill) >= 4.5, `badge ${tone.badgeText}`)
    }
    for (const fg of [base.panelInk, base.panelMuted]) {
      assert.ok(contrastRatio(fg, base.panel) >= 4.5)
    }
    // Libellés : vert atténué, AA sur chaque teinte du fond (centre lumineux compris).
    const glass = blend(base.bgMid, '#FFFFFF', base.glassAlpha + 0.03)
    for (const bg of [base.bgGlow, base.bgMid, base.bgDeep, glass]) {
      assert.ok(contrastRatio(base.label, bg) >= 4.5, `libellé sur ${bg}`)
      assert.ok(contrastRatio(base.text, bg) >= 4.5, `valeur sur ${bg}`)
    }
    // Atténué : nettement moins lumineux que les valeurs (hiérarchie).
    assert.ok(contrastRatio(base.text, base.bgMid) - contrastRatio(base.label, base.bgMid) > 1.5)
    assert.ok(contrastRatio(base.qr, base.panel) >= 20, 'QR noir sur blanc')
  })

  /**
   * Contraste mesuré sur le rendu : la carte est rasterisée SANS ses textes, et
   * chaque texte est comparé aux pixels réels de son fond (dégradés, vitrage,
   * feuillage compris). Seuil AA : 4,5 ; 3 pour le grand texte (≥ 14 pt gras).
   */
  test('chaque texte rendu atteint WCAG AA sur son fond réel', async () => {
    const scale = 1011 / W
    for (const [label, opts] of [
      ['vert', await fullOptions()],
      ['jaune', { ...LONG_40, brandColor: '#F2C230', status: 'expired' }],
      ['violet', SUSPENDED],
    ] as const) {
      const svg = svgOf(opts, { platformLogo: LOGO })
      const bare = svg.replace(/<text\b[\s\S]*?<\/text>/g, '')
      const { data, info } = await sharp(rasterize(bare, 1011))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      for (const b of textBoxes(svg)) {
        const fills = b.fill ? [b.fill] : ['#FFFFFF']
        const x0 = Math.max(0, Math.floor(b.x0 * scale))
        const x1 = Math.min(info.width - 1, Math.ceil(b.x1 * scale))
        const y0 = Math.max(0, Math.floor((b.top + b.size * 0.1) * scale))
        const y1 = Math.min(info.height - 1, Math.ceil(b.bottom * scale))
        for (const fill of fills) {
          const ratios: number[] = []
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const o = (y * info.width + x) * 3
              ratios.push(contrastRatio(fill, { r: data[o], g: data[o + 1], b: data[o + 2] }))
            }
          }
          ratios.sort((a, z) => a - z)
          const worst = ratios[Math.floor(ratios.length * 0.02)]
          const large = b.weight >= 600 && b.size / PT >= 14
          assert.ok(
            worst >= (large ? 3 : 4.5),
            `${label} : « ${b.s} » ${fill} à ${worst.toFixed(2)}:1`,
          )
        }
      }
    }
  })
})

// ─── Polices et mesure du texte ─────────────────────────────────────────────

describe('polices : Poppins, repli Liberation Sans', () => {
  /** Avance Liberation Sans (en em) d'un point de code, d'après la table générée. */
  const lib = (weight: 400 | 700, cp: number): number => {
    for (const [start, run] of LIBERATION_ADVANCES[weight]) {
      if (cp >= start && cp < start + run.length) return run[cp - start] / LIBERATION_UNITS_PER_EM
    }
    return Number.NaN
  }
  const sha = async (path: string) =>
    createHash('sha256')
      .update(await readFile(join(ROOT, path)))
      .digest('hex')

  test('Poppins embarquée (4 graisses, licence OFL) et copie publique identique', async () => {
    assert.deepEqual(
      CARD_FONT_FACES.map((f) => f.weight),
      [400, 500, 600, 700],
    )
    for (const f of CARD_FONT_FACES) {
      const lib = await sha(`lib/card-engine/fonts/${f.file}`)
      assert.equal(await sha(`public${CARD_FONT_PUBLIC_PATH}${f.file}`), lib, `${f.file} : copie`)
    }
    for (const licence of [
      'lib/card-engine/fonts/POPPINS-OFL.txt',
      'lib/card-engine/fonts/LICENSE.txt',
    ]) {
      assert.match(await readFile(join(ROOT, licence), 'utf8'), /SIL Open Font License|OFL/)
    }
    // Serveur : la route charge Poppins + Liberation Sans et les embarque dans la fonction.
    const route = await readFile(join(ROOT, 'app/api/cards/[memberId]/route.ts'), 'utf8')
    assert.match(route, /loadMemberCardFonts\(\)/)
    assert.match(route, /fontCss: null/)
    const config = await readFile(join(ROOT, 'next.config.mjs'), 'utf8')
    assert.match(
      config,
      /'\/api\/cards\/\[memberId\]': \[[^\]]*'\.\/lib\/card-engine\/fonts\/\*\.ttf'/,
    )
    const fonts = await readFile(join(ROOT, 'lib/card-engine/fonts.ts'), 'utf8')
    assert.match(fonts, /CARD_FONT_FACES\.map\(\(f\) => f\.file\)/)
  })

  test('SVG : pile Poppins, @font-face publiques par défaut, aucune règle pour resvg', () => {
    const inline = renderCardSvg(buildCardSchema(BASE), { asOf: AS_OF })
    assert.ok(inline.includes(`font-family="${CARD_FONT_STACK}"`))
    assert.ok(CARD_FONT_STACK.startsWith('Poppins, Liberation Sans'))
    for (const f of CARD_FONT_FACES) {
      assert.ok(
        inline.includes(
          `font-weight:${f.weight};font-display:block;src:url("${CARD_FONT_PUBLIC_PATH}${f.file}")`,
        ),
        `@font-face ${f.weight}`,
      )
    }
    assert.ok(!svgOf(BASE).includes('<style>'), 'fontCss: null → aucune règle')
    const embedded = renderCardSvg(buildCardSchema(BASE), { fontCss: '@font-face{x:y}' })
    assert.ok(embedded.includes('<style>@font-face{x:y}</style>'))
  })

  test('resvg rend bien Poppins : largeurs rendues = largeurs mesurées (à 4 % près)', async () => {
    // Une valeur et un nom tirés d'une vraie carte, rasterisés seuls.
    const card = svgOf({
      ...BASE,
      member: { ...BASE.member, first_name: 'Ɖevi Kɔmla', last_name: 'Agbodjan' },
      cooperativeName: 'Kpɔvɛ Mawuéna',
    })
    for (const target of ['Ɖevi Kɔmla AGBODJAN', 'Kpɔvɛ Mawuéna', 'KPA-482913', 'Membre vérifié']) {
      const el = [...card.matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/g)]
        .map((m) => m[0])
        .find((t) => decode(t) === target)
      assert.ok(el, `« ${target} » posé`)
      const box = textBoxes(el as string)[0]
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 856 540" width="3424" height="2160">${el}</svg>`
      const { data, info } = await sharp(rasterize(svg, 3424))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      let minX = info.width
      let maxX = 0
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          if (data[(y * info.width + x) * 4 + 3] > 40) {
            minX = Math.min(minX, x)
            maxX = Math.max(maxX, x)
          }
        }
      }
      const rendered = (maxX - box.x0 * 4) / 4
      const predicted = box.x1 - box.x0
      assert.ok(
        Math.abs(rendered - predicted) / predicted < 0.04,
        `${target} : rendu ${rendered.toFixed(1)}, mesuré ${predicted.toFixed(1)}`,
      )
      // C'est bien Poppins : composé en Liberation Sans, le texte serait nettement plus étroit.
      if (target === 'Membre vérifié') {
        const w = box.weight >= 600 ? 700 : 400
        const liberation = [...target].reduce((sum, ch) => sum + lib(w, ch.codePointAt(0) ?? 0), 0)
        const libWidth =
          liberation * box.size +
          (box.x1 - box.x0 - measureText(target, box.size, { weight: box.weight }))
        assert.ok(
          Math.abs(rendered - libWidth) / libWidth > 0.06,
          `${target} : rendu ${rendered.toFixed(1)} trop proche de Liberation Sans (${libWidth.toFixed(1)})`,
        )
      }
    }
  })

  test('lettres éwé et kabiyè : absentes de Poppins, mesurées dans Liberation Sans', () => {
    for (const cp of [
      0x186, 0x189, 0x190, 0x14a, 0x1b2, 0x194, 0x254, 0x257, 0x25b, 0x14b, 0x28b,
    ]) {
      for (const weight of [400, 500, 600, 700] as const) {
        assert.equal(inPrimaryFont(cp, weight), false, `U+${cp.toString(16)} absent de Poppins`)
        // 400–500 → Liberation Regular ; 600–700 → Liberation Bold (comme le <tspan>).
        const expected = lib(weight >= 600 ? 700 : 400, cp)
        assert.ok(expected > 0.3, `U+${cp.toString(16)} dans Liberation Sans`)
        assert.equal(advanceEm(cp, weight), expected, `U+${cp.toString(16)} @${weight}`)
      }
    }
    // Lettres latines et accentuées du français : Poppins.
    for (const ch of 'aAéÉèêëîïôûùçÇœŒ’–…°') {
      assert.equal(inPrimaryFont(ch.codePointAt(0) ?? 0, 500), true, `« ${ch} » dans Poppins`)
    }
    assert.notEqual(advanceEm(0x61, 400), lib(400, 0x61))
    // Tons combinants : la grappe entière passe en repli, le ton a une chasse nulle.
    assert.equal(advanceEm(0x303, 400), 0)
    assert.equal(measureText('ã', 100), lib(400, 0x61) * 100)
    assert.deepEqual(fontRuns('Kɔmla', 600), [
      { text: 'K', fallback: false },
      { text: 'ɔ', fallback: true },
      { text: 'mla', fallback: false },
    ])
    assert.deepEqual(fontRuns('Kpã', 500), [
      { text: 'Kp', fallback: false },
      { text: 'ã', fallback: true },
    ])
  })

  test('SVG : chaque suite de repli est une chunk Liberation Sans à la bonne graisse', () => {
    const svg = svgOf(LONG_40)
    const name = [...svg.matchAll(/<text\b[^>]*font-weight="600"[^>]*>([\s\S]*?)<\/text>/g)]
      .map((m) => m[0])
      .find((t) => decode(t).startsWith('Ɖevi'))
    assert.ok(name, 'nom posé')
    const spans = [...(name as string).matchAll(/<tspan([^>]*)>([^<]*)<\/tspan>/g)]
    assert.ok(spans.length >= 5)
    for (const [, attrs, content] of spans) {
      const fallback = /font-family="Liberation Sans/.test(attrs)
      assert.equal(
        fallback,
        [...content].some((ch) => !inPrimaryFont(ch.codePointAt(0) ?? 0, 600)),
      )
      if (fallback) assert.match(attrs, /font-weight="700"/, 'nom (600) → Liberation Bold')
    }
    // Hors de la première, chaque suite démarre une chunk à sa propre abscisse.
    assert.ok(spans.slice(1).every(([, attrs]) => / x="[\d.]+"/.test(attrs)))
  })

  test('coupure aux espaces et après les traits d’union, jamais au milieu d’un mot', () => {
    assert.deepEqual(breakLines('AGBODJAN-KOUDJOGBO', 220, 30, { weight: 700 }, 2), [
      'AGBODJAN-',
      'KOUDJOGBO',
    ])
    assert.equal(breakLines('Honoré', 10, 30, {}, 2), null, 'un mot trop large n’est pas coupé')
    const name = 'Komlanvi Edem Mawuéna Akossiwa Kodjo'
    const fit = fitText(name, { maxWidth: 300, prefPt: 9, minPt: 7.5, maxLines: 2 })
    assert.equal(fit.lines.join(' '), name, 'aucun mot perdu')
    const cut = fitText('Union des Groupements Maraîchers de la Préfecture du Zio et Environs', {
      maxWidth: 200,
      prefPt: 7,
      minPt: 6.5,
      maxLines: 1,
      allowEllipsis: true,
    })
    assert.equal(cut.ellipsized, true)
    assert.ok(cut.lines[0].endsWith('…'))
  })
})

// ─── Identité visuelle : lignée, couleur, logos ─────────────────────────────

describe('identité de l’organisation', () => {
  const orgs = [
    {
      id: 'f',
      name: 'Faîtière A',
      level: 'faitiere',
      logoUrl: 'https://x/f.png',
      primaryColor: '#112233',
    },
    { id: 'u', name: 'Union B', level: 'union', parentId: 'f' },
    {
      id: 'c',
      name: 'Coopérative C',
      level: 'cooperative',
      parentId: 'u',
      logoUrl: 'https://x/c.png',
      primaryColor: '#445566',
    },
  ]

  test('lignée faîtière > union > coopérative, logos et couleur de l’organisation', () => {
    const b = resolveCardBranding({ organisationId: 'c', orgs })
    assert.equal(b?.faitiereName, 'Faîtière A')
    assert.equal(b?.unionName, 'Union B')
    assert.equal(b?.cooperativeName, 'Coopérative C')
    assert.equal(b?.faitiereLogoUrl, 'https://x/f.png')
    assert.equal(b?.cooperativeLogoUrl, 'https://x/c.png')
    assert.equal(b?.brandColor, '#445566')
    assert.equal(b?.organisationLevel, 'cooperative')
  })

  test('modèle enregistré : le plus proche l’emporte ; absent, la couleur de l’organisation', () => {
    const own = resolveCardBranding({
      organisationId: 'c',
      orgs,
      templates: { f: { bgColor: '#0A0A0A', title: 'T1' }, c: { bgColor: '#123456' } },
    })
    assert.equal(own?.brandColor, '#123456')
    const none = resolveCardBranding({ organisationId: 'u', orgs })
    assert.equal(none?.brandColor, '#112233', 'repli sur la couleur d’un parent')
    assert.equal(none?.unionName, null)
  })

  test('nom de faîtière saisi en texte, cycle de parent_id, organisation inconnue', () => {
    const text = resolveCardBranding({
      organisationId: 'x',
      orgs: [{ id: 'x', name: 'Coop X', faitiereName: 'Faîtière texte' }],
    })
    assert.equal(text?.faitiereName, 'Faîtière texte')
    const cycle = resolveCardBranding({
      organisationId: 'a',
      orgs: [
        { id: 'a', name: 'A', parentId: 'b' },
        { id: 'b', name: 'B', parentId: 'a' },
      ],
    })
    assert.equal(cycle?.cooperativeName, 'A')
    assert.equal(resolveCardBranding({ organisationId: 'zzz', orgs }), null)
  })

  test('proportions des logos lues dans l’en-tête de l’image', async () => {
    assert.equal(imageAspectFromDataUrl(await pngDataUrl(WIDE_LOGO_SVG, 600, 200)), 3)
    assert.equal(imageAspectFromDataUrl(await pngDataUrl(SQUARE_LOGO_SVG, 400, 400)), 1)
    assert.equal(imageAspectFromDataUrl('data:image/png;base64,AAAA'), null)
    assert.equal(imageAspectFromDataUrl('https://x/y.png'), null)
  })

  test('couleur de l’organisation : accent de l’anneau et des pastilles, jamais du texte', () => {
    const t = deriveCardTokens({ brand: '#6B2D8B' })
    const svg = svgOf({ ...BASE, brandColor: '#6B2D8B' })
    assert.ok(svg.includes(`stop-color="${t.accent}"`), 'anneau et pastilles à l’accent')
    for (const b of textBoxes(svg)) {
      assert.notEqual(b.fill?.toUpperCase(), t.accent, `« ${b.s} » à la couleur de marque`)
      assert.notEqual(b.fill?.toUpperCase(), t.accentLight, `« ${b.s} » à la couleur de marque`)
    }
    // Logo d'organisation : faîtière d'abord, sinon coopérative ; aucun : pas de cartouche.
    assert.ok(!/<clipPath id="tl/.test(svg))
  })
})

// ─── Exports : une carte = une image, une page, une case de feuille ─────────

describe('exports : une seule face par carte', () => {
  const mm = (pt: number) => (pt * 25.4) / 72

  const cardPng = (opts: { bleed?: boolean } = {}) =>
    new Uint8Array(
      rasterize(
        renderCardSvg(buildCardSchema(BASE), {
          mode: 'print',
          bleed: opts.bleed,
          intrinsicSize: true,
          asOf: AS_OF,
          platformLogo: LOGO,
        }),
        opts.bleed ? 1083 : 1012,
      ),
    )

  const boxes = (bytes: Uint8Array) =>
    [
      ...Buffer.from(bytes)
        .toString('latin1')
        .matchAll(/\/MediaBox\s*\[([^\]]+)\]/g),
    ].map((m) => m[1].trim().split(/\s+/).map(Number))

  test('PDF : une page de 85,6 × 54 mm par carte, aucune page de verso', async () => {
    const one = await buildCardPdf([cardPng()])
    assert.equal(Buffer.from(one).subarray(0, 5).toString(), '%PDF-')
    const b = boxes(one)
    assert.equal(b.length, 1, 'une carte = une page')
    assert.ok(Math.abs(mm(b[0][2]) - 85.6) < 0.01 && Math.abs(mm(b[0][3]) - 54) < 0.01)
    const png = cardPng()
    assert.equal(boxes(await buildCardPdf([png, png, png])).length, 3, 'trois cartes = trois pages')
    await assert.rejects(buildCardPdf([]))
  })

  test('PDF : fond perdu 91,6 × 60 mm ; repères de coupe 101,6 × 70 mm', async () => {
    assert.deepEqual(cardPdfPageSize({}), { width: 85.6, height: 54 })
    assert.deepEqual(cardPdfPageSize({ bleed: true }), { width: 91.6, height: 60 })
    assert.deepEqual(cardPdfPageSize({ marks: true }), { width: 101.6, height: 70 })
    const marks = await buildCardPdf([cardPng({ bleed: true })], { marks: true })
    const mb = boxes(marks)
    assert.equal(mb.length, 1)
    assert.ok(Math.abs(mm(mb[0][2]) - 101.6) < 0.01 && Math.abs(mm(mb[0][3]) - 70) < 0.01)
    // Repères en vectoriel : opérateur « l » dans un flux de contenu (compressé).
    const raw = Buffer.from(marks)
    const contents: string[] = []
    let at = 0
    for (;;) {
      const start = raw.indexOf('stream', at, 'latin1')
      if (start < 0) break
      const body = start + (raw[start + 6] === 0x0d ? 8 : 7)
      const end = raw.indexOf('endstream', body, 'latin1')
      try {
        contents.push(inflateSync(raw.subarray(body, end)).toString('latin1'))
      } catch {
        // flux d'image ou non compressé
      }
      at = end + 9
    }
    assert.ok(
      contents.some((c) => /\d l\b/.test(c)),
      'repères tracés en vectoriel',
    )
    const text = Buffer.from(await buildCardPdf([cardPng()])).toString('latin1')
    for (const w of [...text.matchAll(/\/Width\s+(\d+)/g)].map((m) => Number(m[1]))) {
      assert.ok(w / (85.6 / 25.4) >= 299, `${w} px sur 85,6 mm`)
    }
  })

  test('API, aperçu, téléchargement et feuille : aucune option ni chemin de verso', async () => {
    const read = (f: string) => readFile(join(ROOT, f), 'utf8')
    const route = await read('app/api/cards/[memberId]/route.ts')
    assert.ok(!/verso|recto|face:\s*z\.|rotate180/.test(route), 'route : pas de face ni de verso')
    assert.match(route, /buildCardPdf\(\[rasterize\(\)\]/, 'route : PDF d’une page par carte')
    const preview = await read('components/dashboard/card-svg-preview.tsx')
    assert.equal(preview.match(/renderCardSvg\(/g)?.length, 1, 'aperçu : une face')
    assert.ok(!/verso|recto/i.test(preview))
    const images = await read('lib/utils/card-image.ts')
    assert.ok(!/verso|recto|rotate180/i.test(images), 'export navigateur : une face')
    assert.equal(images.match(/renderCardCanvas\(/g)?.length, 1, 'PDF : un rendu par carte')
    const renderer = await read('lib/card-engine/renderer.ts')
    assert.ok(!/verso|recto/i.test(renderer), 'PNG : une face, pas d’empilement')
    const print = await read('app/dashboard/cards/print/page.tsx')
    assert.ok(!/verso|recto|bord long/i.test(print), 'feuille : sans recto-verso')
    const page = await read('app/dashboard/cards/page.tsx')
    assert.ok(!/recto|verso/i.test(page), 'tableau de bord : sans recto-verso')
  })

  test('feuille A4 : 8 cartes de 85,6 × 54 mm, une seule face, dans la page', () => {
    assert.equal(CARDS_PER_SHEET, 8)
    const seen = new Set<string>()
    for (let i = 0; i < CARDS_PER_SHEET; i++) {
      const { x, y } = cellTrimOrigin(i)
      seen.add(`${x.toFixed(2)}:${y.toFixed(2)}`)
      assert.ok(x - SHEET.bleed >= 5, 'marge gauche')
      assert.ok(x + SHEET.trimWidth + SHEET.bleed <= SHEET.pageWidth - 5, 'marge droite')
      assert.ok(y - SHEET.bleed - 0.5 - 4 >= 5, 'repères de coupe dans la page (haut)')
      assert.ok(
        y + SHEET.trimHeight + SHEET.bleed + 0.5 + 4 <= SHEET.pageHeight - 5,
        'repères dans la page (bas)',
      )
    }
    assert.equal(seen.size, 8, 'huit cases distinctes')
    assert.ok(SHEET.gutter >= SHEET.bleed * 2 + 1, 'fonds perdus voisins disjoints')
    assert.equal(cellTrimOrigin.length, 1, 'une case ne dépend que de son rang')
  })

  test('repères de coupe : huit traits par carte, hors du fond perdu', () => {
    const path = cropMarksPath({ x: 20, y: 30 })
    assert.equal(path.split('M').length - 1, 8)
    for (const m of path.matchAll(/M([\d.]+) ([\d.]+)([HV])([\d.]+)/g)) {
      const x = Number(m[1])
      const y = Number(m[2])
      if (m[3] === 'H') {
        const start = Math.min(Math.abs(x - 20), Math.abs(x - (20 + SHEET.trimWidth)))
        assert.ok(start >= SHEET.bleed + 0.4, 'trait horizontal après le fond perdu')
        assert.ok(y === 30 || y === 30 + SHEET.trimHeight)
      } else {
        const start = Math.min(Math.abs(y - 30), Math.abs(y - (30 + SHEET.trimHeight)))
        assert.ok(start >= SHEET.bleed + 0.4, 'trait vertical après le fond perdu')
      }
    }
  })
})
