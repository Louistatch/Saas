/**
 * HarooLife billboards (D4+, M2): physical supports placed in the 3D towns, campaigns that may
 * run on them, and the rules deciding what a support shows right now. Pure and testable.
 *
 * Nothing here is a sale. Internal campaigns promote FaîtiereHub's own services; a partner
 * campaign exists only after a commercial validation outside the game (status `approved`
 * by an admin), and the panel is then marked « Promotion ». List prices stay in
 * lib/haroolife/lome-sponsors.ts as HYPOTHÈSES.
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
export interface AdCampaign {
  id: string
  advertiser: { name: string; kind: 'internal' | 'partner' }
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

/** Pilot supports: two per town, beside a street near where the player arrives. */
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
]

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
    placements: [],
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
    placements: [],
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
    .filter((b) => showing[b.id] && exposed(b, eye))
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
