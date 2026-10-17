/**
 * Players rent the street billboards with game money (FCFA of the game, never real money) and
 * pass on a piece of news: « Je vends mon maïs à Bè », « Anniversaire de Kossi samedi ». The
 * rules are the database's (supabase/migrations/20261017_190000_haroolife_board_posts.sql), kept
 * here so the phone refuses a text before sending it: two durations, four colours, a short title
 * and message, never a phone number, a link or an e-mail. A rented support shows its post first;
 * one nobody rents says « Panneau disponible · À louer ». Pure.
 */
import { type AdCampaign, type AdPlacement, campaignFor } from './campaigns'

/** A rented face, as the street receives it (haroolife_board_posts_live). */
export interface BoardPost {
  id: string
  placement: string
  title: string
  body: string
  palette: number
  /** « @pseudo », or the name shown in the game. */
  author: string
  /** The viewer's own post. */
  mine: boolean
  startsAt: string
  endsAt: string
}

export const RENT_OPTIONS = [
  { hours: 24, price: 5000, label: '1 jour' },
  { hours: 72, price: 12000, label: '3 jours' },
] as const
export type RentHours = (typeof RENT_OPTIONS)[number]['hours']

/** Background, text, accent: paper and ink, market green, bissap red, lagoon blue. */
export const BOARD_PALETTES: [string, string, string][] = [
  ['#fbf5e6', '#1f2933', '#d9480f'],
  ['#14532d', '#ffffff', '#facc15'],
  ['#7f1d1d', '#fff7ed', '#fbbf24'],
  ['#1e3a8a', '#ffffff', '#fde047'],
]
export const TITLE_MAX = 32
export const BODY_MAX = 120

/** Report reasons, as stored (haroolife_board_reports.reason) and as said to the player. */
export const REPORT_REASONS = [
  { id: 'insulte', label: 'Insulte ou moquerie blessante' },
  { id: 'arnaque', label: 'Arnaque' },
  { id: 'choquant', label: 'Contenu choquant' },
  { id: 'autre', label: 'Autre chose' },
] as const

/** Spaces collapsed, control characters gone (as private.haroolife_board_clean). */
export function cleanBoardText(text: string): string {
  return text
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** What a billboard never shows (as private.haroolife_board_text_problem). */
export function boardTextProblem(text: string): 'lien' | 'email' | 'telephone' | null {
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)) return 'email'
  if (
    /(https?:|www\.|[a-z0-9-]\.(com|net|org|tg|fr|io|me|ly|co|info|biz|app|xyz)([^a-z0-9_]|$))/i.test(
      text,
    )
  )
    return 'lien'
  if (/\d{8,}/.test(text.replace(/[\s.()/+-]/g, ''))) return 'telephone'
  return null
}

/** Why this title and message cannot go up, in the database's words; null when they can. */
export function rentProblem(title: string, body: string): string | null {
  const t = cleanBoardText(title)
  const b = cleanBoardText(body)
  if (t.length < 3 || t.length > TITLE_MAX) return `Titre : de 3 à ${TITLE_MAX} caractères`
  if (b.length < 3 || b.length > BODY_MAX) return `Message : de 3 à ${BODY_MAX} caractères`
  if (boardTextProblem(`${t} ${b}`))
    return 'Pas de numéro de téléphone, de lien ni d’e-mail sur un panneau'
  return null
}

const VACANT: [string, string, string] = ['#fff8e7', '#1f2933', '#e8590c']

/** The face of a support nobody rents. */
export function vacantFace(p: AdPlacement): AdCampaign {
  return {
    id: `vacant:${p.id}`,
    advertiser: { name: 'Panneau disponible', kind: 'vacant' },
    creative: {
      title: 'Panneau disponible',
      body: `À louer dès ${RENT_OPTIONS[0].price.toLocaleString('fr-FR')} FCFA par jour. Touche le panneau pour y passer ton information.`,
      cta: 'Louer ce panneau',
      href: '/haroolife',
      palette: VACANT,
    },
    status: 'active',
    locality: p.locality,
    placements: [p.id],
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2099-01-01T00:00:00Z',
    weight: 1,
    version: 1,
  }
}

/** A player's post as a face. */
export function postFace(post: BoardPost): AdCampaign {
  return {
    id: `post:${post.id}`,
    advertiser: { name: post.author, kind: 'player' },
    creative: {
      title: post.title,
      body: post.body,
      cta: 'Signaler',
      href: '/haroolife',
      palette: BOARD_PALETTES[post.palette] ?? BOARD_PALETTES[0],
    },
    status: 'active',
    locality: post.placement.startsWith('kara-') ? 'kara' : 'lome',
    placements: [post.placement],
    startsAt: post.startsAt,
    endsAt: post.endsAt,
    weight: 1,
    version: 1,
  }
}

/** The post a support shows now, if it is rented. */
export function postOn(p: AdPlacement, posts: readonly BoardPost[], now: number): BoardPost | null {
  return (
    posts.find(
      (x) => x.placement === p.id && Date.parse(x.startsAt) <= now && now < Date.parse(x.endsAt),
    ) ?? null
  )
}

/**
 * What a support shows now: the player who rented it (they paid for this window), else the
 * campaigns (partners, then FaîtiereHub's own notices on the pilots), else « À louer ».
 */
export function faceFor(
  p: AdPlacement,
  campaigns: AdCampaign[],
  posts: readonly BoardPost[],
  now: number,
): AdCampaign {
  const post = postOn(p, posts, now)
  if (post) return postFace(post)
  return campaignFor(p, campaigns, now) ?? vacantFace(p)
}

/** The post behind a face (`post:<id>`), for the sheet. */
export const postIdOf = (c: AdCampaign) =>
  c.advertiser.kind === 'player' && c.id.startsWith('post:') ? c.id.slice(5) : null

/** Live posts from the API, checked field by field (anything odd is dropped). */
export function decodePosts(v: unknown): BoardPost[] {
  if (!Array.isArray(v)) return []
  const out: BoardPost[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    if (
      typeof o.id !== 'string' ||
      typeof o.placement !== 'string' ||
      typeof o.title !== 'string' ||
      typeof o.body !== 'string' ||
      typeof o.author !== 'string' ||
      typeof o.startsAt !== 'string' ||
      typeof o.endsAt !== 'string' ||
      !Number.isFinite(Date.parse(o.startsAt)) ||
      !Number.isFinite(Date.parse(o.endsAt))
    )
      continue
    const palette = Number(o.palette)
    out.push({
      id: o.id,
      placement: o.placement,
      title: o.title.slice(0, TITLE_MAX),
      body: o.body.slice(0, BODY_MAX),
      palette:
        Number.isInteger(palette) && palette >= 0 && palette < BOARD_PALETTES.length ? palette : 0,
      author: o.author.slice(0, 40),
      mine: o.mine === true,
      startsAt: o.startsAt,
      endsAt: o.endsAt,
    })
  }
  return out
}

/** « jusqu’à samedi 14 h » in Togo time (GMT, no daylight saving). */
export function untilSaid(endsAt: string): string {
  const d = new Date(endsAt)
  const day = d.toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'Africa/Lome' })
  const hour = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lome',
  })
  return `jusqu’à ${day} ${hour.replace(':', ' h ')}`.replace(/ h 00$/, ' h')
}
