/**
 * HarooLife billboards (D4+, M2): physical supports placed in the 3D towns, campaigns that may
 * run on them, and the rules deciding what a support shows right now. Pure and testable.
 *
 * Internal campaigns promote FaîtiereHub's own services on the pilot supports; a partner
 * campaign exists only after a commercial validation outside the game (status `approved`
 * by an admin), and the panel is then marked « Promotion ». List prices stay in
 * lib/haroolife/lome-sponsors.ts as HYPOTHÈSES. Players rent the others with game money and
 * post a short notice (supabase/migrations/20261017_190000_haroolife_board_posts.sql); a support
 * nobody rents says « Panneau disponible · À louer ».
 */
export type CampaignStatus = 'draft' | 'pending' | 'approved' | 'active' | 'paused' | 'expired'
export type AdLocality = 'lome' | 'kara'
export type SupportKind = 'roadside' | 'market' | 'bus-stop' | 'facade' | 'square'

export interface AdPlacement {
  id: string
  locality: AdLocality
  kind: SupportKind
  /** World cell of the support's foot (open ground beside a road, never a door). */
  x: number
  y: number
  /** Direction the face looks at: the road it stands by. */
  faces: 'N' | 'E' | 'S' | 'W'
  label: string
}
export interface AdCreative {
  title: string
  body: string
  /** Button text in the focus sheet. */
  cta: string
  /** Opened only on an explicit tap: a site path, or an https URL on an allowed host. */
  href: string
  /** Face colours (background, text, accent), hex. */
  palette: [string, string, string]
  /** Optional poster image (webp/png, https on an allowed host); a drawn poster otherwise. */
  image?: string | null
}
/**
 * Who fills a face: FaîtiereHub (internal), a validated partner, a player who rented it, or
 * nobody (vacant, « À louer »). Only internal and partner faces count as ads (exposure, clicks).
 */
export type FaceKind = 'internal' | 'partner' | 'player' | 'vacant'
export interface AdCampaign {
  id: string
  advertiser: { name: string; kind: FaceKind }
  creative: AdCreative
  status: CampaignStatus
  locality: AdLocality | 'all'
  /** Supports it may run on; empty = every support of its locality. */
  placements: string[]
  /** UTC ISO instants; display in Togo time (GMT, no daylight saving). */
  startsAt: string
  endsAt: string
  /** Share of the rotation among the campaigns of a support (1 = normal). */
  weight: number
  version: number
}

/**
 * Supports: the two pilots of each town (beside a street near where the player arrives), then
 * one by each market, station, university, hospital and town hall, on the park beside its road.
 * The same ids are listed in private.haroolife_board_locality (SQL); a test keeps them equal.
 */
export const PLACEMENTS: AdPlacement[] = [
  {
    id: 'lome-avenue',
    locality: 'lome',
    kind: 'roadside',
    x: 47,
    y: 37,
    faces: 'E',
    label: 'Avenue, près du domaine',
  },
  {
    id: 'lome-jardin',
    locality: 'lome',
    kind: 'square',
    x: 43,
    y: 32,
    faces: 'W',
    label: 'Jardin de quartier',
  },
  {
    id: 'kara-gare',
    locality: 'kara',
    kind: 'bus-stop',
    x: 69,
    y: 41,
    faces: 'N',
    label: 'Arrêt de la gare routière',
  },
  {
    id: 'kara-marche',
    locality: 'kara',
    kind: 'market',
    x: 75,
    y: 49,
    faces: 'S',
    label: 'Abords du marché',
  },
  {
    id: 'lome-assigame',
    locality: 'lome',
    kind: 'market',
    x: 49,
    y: 52,
    faces: 'W',
    label: 'Grand marché d’Assigamé',
  },
  {
    id: 'lome-universite',
    locality: 'lome',
    kind: 'roadside',
    x: 37,
    y: 31,
    faces: 'N',
    label: 'Devant l’Université de Lomé',
  },
  {
    id: 'lome-chu-tokoin',
    locality: 'lome',
    kind: 'roadside',
    x: 37,
    y: 23,
    faces: 'W',
    label: 'Près du CHU de Tokoin',
  },
  {
    id: 'lome-gare-agoe',
    locality: 'lome',
    kind: 'bus-stop',
    x: 35,
    y: 5,
    faces: 'E',
    label: 'Gare routière d’Agoè',
  },
  {
    id: 'lome-marche-be',
    locality: 'lome',
    kind: 'market',
    x: 91,
    y: 44,
    faces: 'W',
    label: 'Marché de Bè',
  },
  {
    id: 'lome-hotel-de-ville',
    locality: 'lome',
    kind: 'square',
    x: 59,
    y: 46,
    faces: 'N',
    label: 'Place de l’hôtel de ville',
  },
  {
    id: 'lome-stade-kegue',
    locality: 'lome',
    kind: 'roadside',
    x: 82,
    y: 11,
    faces: 'N',
    label: 'Route du stade de Kégué',
  },
  {
    id: 'lome-marche-adidogome',
    locality: 'lome',
    kind: 'market',
    x: 7,
    y: 46,
    faces: 'N',
    label: 'Marché d’Adidogomé',
  },
  {
    id: 'lome-marche-tokoin',
    locality: 'lome',
    kind: 'market',
    x: 32,
    y: 34,
    faces: 'S',
    label: 'Marché de Tokoin',
  },
  {
    id: 'lome-port-be',
    locality: 'lome',
    kind: 'roadside',
    x: 75,
    y: 67,
    faces: 'S',
    label: 'Port de pêche de Bè',
  },
  {
    id: 'kara-grand-marche',
    locality: 'kara',
    kind: 'market',
    x: 47,
    y: 43,
    faces: 'E',
    label: 'Grand marché de Kara',
  },
  {
    id: 'kara-universite',
    locality: 'kara',
    kind: 'roadside',
    x: 7,
    y: 34,
    faces: 'S',
    label: 'Université de Kara',
  },
  {
    id: 'kara-chu',
    locality: 'kara',
    kind: 'roadside',
    x: 28,
    y: 21,
    faces: 'N',
    label: 'Près du CHU de Kara',
  },
  {
    id: 'kara-prefecture',
    locality: 'kara',
    kind: 'square',
    x: 59,
    y: 21,
    faces: 'N',
    label: 'Devant la préfecture de la Kozah',
  },
  {
    id: 'kara-lycee',
    locality: 'kara',
    kind: 'roadside',
    x: 41,
    y: 43,
    faces: 'E',
    label: 'Près du lycée de Kara',
  },
  {
    id: 'kara-marche-kpewa',
    locality: 'kara',
    kind: 'market',
    x: 31,
    y: 46,
    faces: 'N',
    label: 'Marché de Kpéwa',
  },
]

/** The pilot supports, where FaîtiereHub's own notices run when nobody rents them. */
export const PILOT_SUPPORTS = ['lome-avenue', 'lome-jardin', 'kara-gare', 'kara-marche']

/** FaîtiereHub's own services: always available, offline included. Not sponsored. */
export const INTERNAL_CAMPAIGNS: AdCampaign[] = [
  {
    id: 'internal-marche',
    advertiser: { name: 'FaîtiereHub', kind: 'internal' },
    creative: {
      title: 'Le marché FaîtiereHub',
      body: 'Vendez votre récolte en prévente, entre coopératives et acheteurs.',
      cta: 'Voir le marché',
      href: '/marche',
      palette: ['#0f5132', '#ffffff', '#f5c518'],
    },
    status: 'active',
    locality: 'all',
    placements: PILOT_SUPPORTS,
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2099-01-01T00:00:00Z',
    weight: 1,
    version: 1,
  },
  {
    id: 'internal-haroo',
    advertiser: { name: 'Haroo', kind: 'internal' },
    creative: {
      title: 'Carte Haroo',
      body: 'Votre identité professionnelle agricole, vérifiable par QR code.',
      cta: 'Découvrir la carte',
      href: '/haroo',
      palette: ['#1d3557', '#ffffff', '#e9c46a'],
    },
    status: 'active',
    locality: 'all',
    placements: PILOT_SUPPORTS,
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2099-01-01T00:00:00Z',
    weight: 1,
    version: 1,
  },
]

/** Hosts a creative may link to or load an image from (explicit list, https only). */
export const ALLOWED_HOSTS = ['www.faitierehub.com', 'faitierehub.com']
/** Rotation step: the face changes at most this often (a timer, never the render loop). */
export const ROTATION_MS = 20_000

export function safeHref(href: string): string | null {
  if (/^\/(?!\/)[\w\-./?=&%#]*$/.test(href)) return href
  try {
    const u = new URL(href)
    return u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.hostname) ? u.toString() : null
  } catch {
    return null
  }
}
export function safeImage(src: string | null | undefined): string | null {
  if (!src) return null
  try {
    const u = new URL(src)
    return u.protocol === 'https:' &&
      ALLOWED_HOSTS.includes(u.hostname) &&
      /\.(webp|png|jpe?g)$/i.test(u.pathname)
      ? u.toString()
      : null
  } catch {
    return null
  }
}

/** Running now on this support: active (or approved and started), in its window, its town. */
export function runsOn(c: AdCampaign, p: AdPlacement, now: number): boolean {
  if (c.status !== 'active' && c.status !== 'approved') return false
  if (c.locality !== 'all' && c.locality !== p.locality) return false
  if (c.placements.length && !c.placements.includes(p.id)) return false
  const start = Date.parse(c.startsAt)
  const end = Date.parse(c.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false
  return now >= start && now < end && safeHref(c.creative.href) !== null
}

/**
 * What a support shows at `now`: partner campaigns first share the rotation by weight, internal
 * ones fill in. Deterministic per time slot, so every player sees the same face at once.
 */
export function campaignFor(
  p: AdPlacement,
  campaigns: AdCampaign[],
  now: number,
): AdCampaign | null {
  const running = campaigns.filter((c) => runsOn(c, p, now))
  const partners = running.filter((c) => c.advertiser.kind === 'partner')
  const pool = partners.length
    ? [...partners, ...running.filter((c) => c.advertiser.kind === 'internal').slice(0, 1)]
    : running
  if (!pool.length) return null
  const slots: AdCampaign[] = []
  for (const c of pool)
    for (let i = 0; i < Math.max(1, Math.min(5, Math.round(c.weight))); i++) slots.push(c)
  // Offset by the support so neighbouring panels do not flip in sync.
  let h = 0
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) | 0
  const slot = Math.floor(now / ROTATION_MS) + Math.abs(h)
  return slots[slot % slots.length]
}

/** Sponsored content is labelled « Promotion »; FaîtiereHub's own notices are not ads. */
export const isSponsored = (c: AdCampaign) => c.advertiser.kind === 'partner'
/** A campaign (internal or partner), counted in the statistics; not a player's post or « À louer ». */
export const isAdFace = (c: AdCampaign) =>
  c.advertiser.kind === 'internal' || c.advertiser.kind === 'partner'

/** Allowed status moves in the admin console (with who may do them). */
export const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ['pending'],
  pending: ['approved', 'draft'],
  approved: ['active', 'paused'],
  active: ['paused', 'expired'],
  paused: ['active', 'expired'],
  expired: [],
}
export const canMove = (from: CampaignStatus, to: CampaignStatus) => TRANSITIONS[from].includes(to)

/** Unit vector of the face normal, world cells (z grows southwards). */
export function faceNormal(f: AdPlacement['faces']): { x: number; z: number } {
  return f === 'N'
    ? { x: 0, z: -1 }
    : f === 'S'
      ? { x: 0, z: 1 }
      : f === 'E'
        ? { x: 1, z: 0 }
        : { x: -1, z: 0 }
}

/**
 * Exposure approximation (no occlusion test): the face is in front of the camera, within
 * `maxDist` cells, seen from its front side (not from behind), and inside the horizontal field
 * of view. An impression is counted by the caller after `minMs` of continuous exposure.
 */
export function exposed(
  p: AdPlacement,
  cam: { x: number; z: number; angle: number },
  fovDeg = 70,
  maxDist = 16,
): boolean {
  const dx = p.x - cam.x
  const dz = p.y - cam.z
  const d = Math.hypot(dx, dz)
  if (d > maxDist) return false
  if (d < 0.5) return true
  const n = faceNormal(p.faces)
  // Seen from the front: the viewer stands on the side the face looks at.
  if ((cam.x - p.x) * n.x + (cam.z - p.y) * n.z < 0) return false
  // Camera looks along forward = (−sin a, −cos a) (see player.ts cameraBasis).
  const a = (cam.angle * Math.PI) / 180
  const cos = (dx * -Math.sin(a) + dz * -Math.cos(a)) / d
  return cos >= Math.cos(((fovDeg / 2) * Math.PI) / 180)
}

/** Supports are built within NEAR cells of the player and freed beyond FAR (hysteresis). */
export const NEAR = 26
export const FAR = 34

/** Supports to keep built around the player (`built`: those built so far). Pure. */
export function supportsToBuild(
  here: readonly AdPlacement[],
  pos: { x: number; z: number },
  built: readonly string[],
): string[] {
  return here
    .filter((b) => {
      const d = Math.hypot(b.x - pos.x, b.y - pos.z)
      return built.includes(b.id) ? d <= FAR : d <= NEAR
    })
    .map((b) => b.id)
}

/**
 * Faces seen now, for the exposure counter: the camera's eye is behind its target along its
 * azimuth (see player.ts cameraBasis). Pure.
 */
export function supportsSeen(
  here: readonly AdPlacement[],
  showing: Readonly<Record<string, AdCampaign>>,
  cam: { tx: number; tz: number; distance: number; angle: number },
): { campaign: string; placement: string }[] {
  const a = (cam.angle * Math.PI) / 180
  const back = cam.distance * 0.55
  const eye = { x: cam.tx + Math.sin(a) * back, z: cam.tz + Math.cos(a) * back, angle: cam.angle }
  return here
    .filter((b) => showing[b.id] && isAdFace(showing[b.id]) && exposed(b, eye))
    .map((b) => ({ campaign: showing[b.id].id, placement: b.id }))
}

/** The support the player stands by, on foot, showing a campaign (« Lire l'annonce »). Pure. */
export function supportNear(
  here: readonly AdPlacement[],
  showing: Readonly<Record<string, AdCampaign>>,
  pos: { x: number; z: number },
  driving: boolean,
): AdPlacement | null {
  if (driving) return null
  return here.find((b) => Math.hypot(b.x - pos.x, b.y - pos.z) <= 2.2 && showing[b.id]) ?? null
}
