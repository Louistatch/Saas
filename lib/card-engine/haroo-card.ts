/**
 * Cartes professionnelles Haroo — rendu SVG.
 *
 * Distinct de `renderer.ts`, qui produit la carte de MEMBRE d'une coopérative
 * (niveaux bronze/argent/or, identité rattachée à une organisation). Ici on
 * rend une carte de PROFIL professionnel : ouvrier, acheteur, agronome, ou
 * opérateur accrédité. Le porteur n'appartient pas forcément à une
 * coopérative — d'où l'absence de niveau et la mention d'organisation
 * facultative.
 *
 * Même format que la carte membre (1180 × 740, ratio CR80) pour rester
 * imprimable par la même chaîne que les cartes physiques : les maquettes de
 * référence sont plus larges, mais un format non standard casserait
 * l'impression.
 */

import { encodeText } from '@/lib/utils/qr'
import { darken, lighten } from './schema'

export type HarooCardType = 'OUVRIER' | 'ACHETEUR' | 'AGRONOME' | 'OPERATEUR'

export interface HarooCardData {
  type: HarooCardType
  firstName: string
  lastName: string
  cardNumber: string
  /** Coopérative ou groupement de rattachement — facultatif. */
  organisation?: string | null
  photoUrl?: string | null
}

interface HarooTheme {
  /** Couleur d'accent : médaillon, liseré photo, pastille du numéro. */
  accent: string
  /** Fond du corps de carte, du plus clair (gauche) au plus sombre (droite). */
  bodyFrom: string
  bodyTo: string
  /** Libellé du rôle, sur une ou deux lignes. */
  lines: [string] | [string, string]
  /** Tracé de l'icône du rôle, dessiné dans un carré de 48 centré en (0,0). */
  icon: string
}

const CHECK_ICON = 'M-9 0 l6 6 l12 -13'

const THEMES: Record<HarooCardType, HarooTheme> = {
  OUVRIER: {
    accent: '#E3B023',
    bodyFrom: '#145E31',
    bodyTo: '#0A2C18',
    lines: ['OUVRIER', 'AGRICOLE'],
    // Houe + sillons : le geste de travail de la terre.
    icon: 'M-14 10 h28 M-10 14 h20 M2 -14 a5 5 0 1 0 0.1 0 M0 -8 v12 M0 -2 l-9 7 M0 -2 l9 3',
  },
  ACHETEUR: {
    accent: '#E2622A',
    bodyFrom: '#9A3413',
    bodyTo: '#0F3A22',
    lines: ['ACHETEUR', 'AGRICOLE'],
    // Panier de collecte.
    icon: 'M-15 -4 h30 l-4 18 h-22 z M-8 -4 l3 -9 M8 -4 l-3 -9 M-6 2 v8 M6 2 v8',
  },
  AGRONOME: {
    accent: '#E3B023',
    bodyFrom: '#14522B',
    bodyTo: '#0A2C18',
    lines: ['AGRONOME'],
    // Jeune pousse sortant du sol.
    icon: 'M-14 12 h28 M0 12 v-14 M0 -2 a12 12 0 0 0 -12 -8 a12 12 0 0 0 12 8 z M0 -2 a12 12 0 0 1 12 -8 a12 12 0 0 1 -12 8 z',
  },
  OPERATEUR: {
    accent: '#2FA96B',
    bodyFrom: '#0B2E52',
    bodyTo: '#0C4430',
    lines: ['OPÉRATEUR', 'ACCRÉDITÉ'],
    // Bouclier de confiance.
    icon: 'M0 -15 l13 6 v9 c0 8 -6 14 -13 17 c-7 -3 -13 -9 -13 -17 v-9 z',
  },
}

/** Préfixe du numéro de carte par type, aligné sur lib/utils/card-number.ts. */
export const HAROO_CARD_PREFIX: Record<HarooCardType, string> = {
  OUVRIER: 'OUV',
  ACHETEUR: 'ACH',
  AGRONOME: 'AGR',
  OPERATEUR: 'OPE',
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function truncate(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max - 1)}…`
}

function qrPath(text: string): { path: string; modules: number } {
  const matrix = encodeText(text, 'H')
  let path = ''
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix.length; x++) {
      if (matrix[y][x]) path += `M${x},${y}h1v1h-1z`
    }
  }
  return { path, modules: matrix.length }
}

/**
 * `photoDataUrl` : la photo convertie en data URL. Indispensable à l'export —
 * une URL distante ne se charge pas dans un SVG rasterisé via canvas (le
 * canvas serait « tainted »). En prévisualisation serveur, l'URL brute suffit.
 */
export function renderHarooCardSvg(data: HarooCardData, photoDataUrl?: string | null): string {
  const theme = THEMES[data.type]
  // Les identifiants SVG (gradients, masques) sont globaux au document : deux
  // cartes affichées côte à côte se voleraient leurs dégradés, la première
  // définition gagnant pour tout le monde. On les suffixe par carte.
  const uid = `${data.type.toLowerCase()}${data.cardNumber.replace(/[^a-zA-Z0-9]/g, '')}`
  const accent = theme.accent
  const accentSoft = lighten(accent, 0.3)

  const fullName = `${data.firstName} ${data.lastName}`.trim().toUpperCase() || 'NOM PRÉNOM'
  const nameSize = fullName.length > 28 ? 15 : fullName.length > 22 ? 17 : 19

  const payload = `https://www.faitierehub.com/verify/${encodeURIComponent(data.cardNumber)}`
  const qr = qrPath(payload)
  const qrScale = 196 / qr.modules

  const photo = photoDataUrl || data.photoUrl
  const photoBlock = photo
    ? `<image href="${escapeXml(photo)}" xlink:href="${escapeXml(photo)}" x="96" y="300" width="208" height="208" preserveAspectRatio="xMidYMid slice" clip-path="url(#hPhoto-${uid})"/>`
    : `<g clip-path="url(#hPhoto-${uid})">
        <rect x="96" y="300" width="208" height="208" fill="${darken(accent, 0.6)}"/>
        <g transform="translate(200 404)" fill="${accentSoft}" opacity="0.5">
          <circle cx="0" cy="-28" r="32"/><path d="M-62 62 C -62 14, 62 14, 62 62 Z"/>
        </g>
      </g>`

  const roleLines = theme.lines
    .map(
      (line, i) =>
        `<text x="0" y="${i * 52}" font-size="46" font-weight="800" fill="#ffffff" letter-spacing="1">${escapeXml(line)}</text>`,
    )
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1180 740" width="1180" height="740">
  <defs>
    <linearGradient id="hBody-${uid}" x1="0" y1="0" x2="1" y2="0.6">
      <stop offset="0" stop-color="${escapeXml(theme.bodyFrom)}"/>
      <stop offset="1" stop-color="${escapeXml(theme.bodyTo)}"/>
    </linearGradient>
    <linearGradient id="hSwoosh-${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${escapeXml(accentSoft)}"/>
      <stop offset="1" stop-color="${escapeXml(accent)}"/>
    </linearGradient>
    <linearGradient id="hRing-${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${escapeXml(accentSoft)}"/>
      <stop offset="0.55" stop-color="${escapeXml(accent)}"/>
      <stop offset="1" stop-color="${escapeXml(darken(accent, 0.45))}"/>
    </linearGradient>
    <filter id="hShadow-${uid}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="5"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.30"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="hCard-${uid}"><rect x="0" y="0" width="1180" height="740" rx="34" ry="34"/></clipPath>
    <clipPath id="hPhoto-${uid}"><circle cx="200" cy="404" r="104"/></clipPath>
  </defs>

  <g clip-path="url(#hCard-${uid})">
    <rect x="0" y="0" width="1180" height="740" fill="url(#hBody-${uid})"/>

    <!-- Feuillage en filigrane, côté droit -->
    <g opacity="0.10" transform="translate(830 250) scale(4.2)" fill="${escapeXml(accentSoft)}">
      <path d="M50 5C30 20 15 45 20 75c2 12 8 18 8 18s-2-30 12-48C58 25 72 18 72 18S60 10 50 5z"/>
    </g>
    <g opacity="0.07" transform="translate(1000 420) rotate(24) scale(3.4)" fill="${escapeXml(accentSoft)}">
      <path d="M50 5C30 20 15 45 20 75c2 12 8 18 8 18s-2-30 12-48C58 25 72 18 72 18S60 10 50 5z"/>
    </g>

    <!-- Vague d'accent sous le bandeau, signature visuelle du profil -->
    <path d="M0 96 C 300 190, 680 40, 1180 128 L1180 176 C 680 92, 300 240, 0 152 Z" fill="url(#hSwoosh-${uid})" opacity="0.95"/>

    <!-- Bandeau d'en-tête -->
    <path d="M0 0 L1180 0 L1180 104 C 700 44, 320 186, 0 116 Z" fill="#F7F8F3"/>

    <!-- Logo + intitulé -->
    <g transform="translate(64 42)">
      <circle cx="0" cy="0" r="22" fill="#15803d"/>
      <path d="M-9 6 C -3 -6, 5 -9, 10 -10 C 9 -2, 4 6, -9 6 Z" fill="#ffffff"/>
      <path d="M-9 8 h18" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>
      <text x="36" y="9" font-size="30" font-weight="800" fill="#12261a" font-family="Arial, sans-serif">Faîtiere<tspan fill="#15803d">Hub</tspan></text>
      <rect x="252" y="-14" width="2" height="28" fill="#c9d2c4"/>
      <text x="272" y="7" font-size="15" font-weight="700" fill="#4a5a4d" letter-spacing="2.4" font-family="Arial, sans-serif">CARTE PROFESSIONNELLE</text>
    </g>

    <!-- Pastille « profil vérifiable » -->
    <g transform="translate(846 20)" filter="url(#hShadow-${uid})">
      <rect x="0" y="0" width="268" height="48" rx="24" fill="#E7F6EC" stroke="#bfe3cc" stroke-width="1.5"/>
      <g transform="translate(30 24)">
        <path d="M0 -13 l11 5 v8 c0 7 -5 12 -11 14 c-6 -2 -11 -7 -11 -14 v-8 z" fill="#15803d"/>
        <path d="${CHECK_ICON}" transform="translate(0 1) scale(0.62)" fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <text x="58" y="30" font-size="16" font-weight="800" fill="#14532d" letter-spacing="1.6" font-family="Arial, sans-serif">PROFIL VÉRIFIABLE</text>
    </g>

    <!-- Photo, cerclée -->
    <circle cx="200" cy="404" r="112" fill="none" stroke="url(#hRing-${uid})" stroke-width="12"/>
    ${photoBlock}
    <g transform="translate(272 476)" filter="url(#hShadow-${uid})">
      <circle cx="0" cy="0" r="24" fill="#ffffff"/>
      <g transform="translate(0 -1)">
        <path d="M0 -12 l10 4 v7 c0 6 -4 11 -10 13 c-6 -2 -10 -7 -10 -13 v-7 z" fill="${escapeXml(accent)}"/>
        <path d="${CHECK_ICON}" transform="translate(0 1) scale(0.55)" fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </g>

    <!-- Médaillon du rôle -->
    <g transform="translate(408 330)">
      <circle cx="0" cy="0" r="48" fill="${darken(accent, 0.55)}" stroke="${escapeXml(accent)}" stroke-width="3"/>
      <path d="${theme.icon}" fill="none" stroke="${escapeXml(accent)}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <!-- Intitulé du rôle + numéro de carte -->
    <g transform="translate(486 ${theme.lines.length === 2 ? 312 : 338})" font-family="Arial, sans-serif">
      ${roleLines}
    </g>
    <g transform="translate(486 ${theme.lines.length === 2 ? 428 : 372})">
      <rect x="0" y="0" width="268" height="50" rx="25" fill="${darken(accent, 0.6)}" stroke="${escapeXml(accent)}" stroke-width="2.5"/>
      <text x="134" y="33" text-anchor="middle" font-size="23" font-weight="800" fill="${escapeXml(accentSoft)}" letter-spacing="2.2" font-family="Arial, sans-serif">${escapeXml(data.cardNumber)}</text>
    </g>

    <!-- Identité -->
    <g transform="translate(486 524)" font-family="Arial, sans-serif">
      <g transform="translate(14 -6)" fill="${escapeXml(accentSoft)}">
        <circle cx="0" cy="-6" r="8"/><path d="M-14 14 C -14 1, 14 1, 14 14 Z"/>
      </g>
      <text x="44" y="0" font-size="${nameSize}" font-weight="800" fill="#ffffff" letter-spacing="0.6">${escapeXml(truncate(fullName, 34))}</text>
      <text x="44" y="24" font-size="16" fill="#ffffff" opacity="0.72">Membre de la communauté agricole</text>
    </g>

    <!-- Filet séparateur -->
    <g transform="translate(486 578)">
      <path d="M0 0 h150" stroke="${escapeXml(accent)}" stroke-width="1.6" opacity="0.55"/>
      <path d="M168 -6 C 174 -14, 184 -16, 190 -16 C 189 -9, 183 -2, 168 -6 Z" fill="${escapeXml(accentSoft)}"/>
      <path d="M208 0 h150" stroke="${escapeXml(accent)}" stroke-width="1.6" opacity="0.55"/>
    </g>

    <!-- Organisation -->
    <g transform="translate(486 626)" font-family="Arial, sans-serif">
      <g transform="translate(14 -6)" fill="${escapeXml(accentSoft)}">
        <circle cx="-9" cy="-7" r="7"/><circle cx="9" cy="-7" r="7"/>
        <path d="M-22 12 C -22 1, -0 1, -0 12 Z"/><path d="M0 12 C 0 1, 22 1, 22 12 Z"/>
      </g>
      <text x="44" y="0" font-size="19" font-weight="800" fill="#ffffff" letter-spacing="0.6">ORGANISATION</text>
      <text x="44" y="24" font-size="16" fill="#ffffff" opacity="0.72">${escapeXml(truncate(data.organisation || 'Indépendant', 34))}</text>
    </g>

    <!-- Bloc QR -->
    <g transform="translate(878 424)" filter="url(#hShadow-${uid})">
      <rect x="0" y="0" width="240" height="266" rx="20" fill="#ffffff"/>
      <text x="120" y="34" text-anchor="middle" font-size="14" font-weight="700" fill="#44544a" letter-spacing="1.4" font-family="Arial, sans-serif">SCAN POUR VÉRIFIER</text>
      <g transform="translate(22 50) scale(${qrScale})">
        <path d="${qr.path}" fill="#0f2417"/>
      </g>
      <g transform="translate(120 148)">
        <circle cx="0" cy="0" r="24" fill="#ffffff"/>
        <circle cx="0" cy="0" r="19" fill="#15803d"/>
        <path d="M-8 5 C -2 -5, 4 -8, 9 -9 C 8 -2, 3 5, -8 5 Z" fill="#ffffff"/>
      </g>
    </g>
  </g>
</svg>`
}
