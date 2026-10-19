/**
 * Serveur KoboToolbox configurable — logique PURE (aucun import Node/Next).
 *
 * Un token KoboToolbox n'est valable que sur le serveur qui l'a émis : Global
 * (kf.kobotoolbox.org), Union européenne (eu.kobotoolbox.org) ou une instance
 * auto-hébergée. L'URL du serveur fait donc partie de la configuration d'une
 * intégration (config.server_url).
 *
 * SÉCURITÉ (SSRF) : le jeton part dans l'en-tête Authorization vers cet hôte.
 * On n'accepte que :
 *   - https, sans identifiants, sans port explicite ;
 *   - un nom de domaine public (jamais une adresse IP, jamais localhost,
 *     jamais un suffixe réservé .local/.internal/.lan…).
 * La résolution DNS (hôte public qui pointerait vers une IP privée) est
 * contrôlée côté serveur par lib/kobo/host-guard.ts à partir de isPrivateIp().
 *
 * Imports relatifs uniquement : ce fichier est chargé tel quel par node:test.
 */

export type KoboServerKind = 'global' | 'eu' | 'custom'

interface KoboServerPreset {
  label: string
  /** Origine de l'API KPI (/api/v2). */
  origin: string
  /** Origine KoboCAT (pièces jointes anciennes / KoboCollect). */
  kcOrigin: string
}

export const KOBO_SERVER_PRESETS: Record<'global' | 'eu', KoboServerPreset> = {
  global: {
    label: 'KoboToolbox Global (kf.kobotoolbox.org)',
    origin: 'https://kf.kobotoolbox.org',
    kcOrigin: 'https://kc.kobotoolbox.org',
  },
  eu: {
    label: 'KoboToolbox Union européenne (eu.kobotoolbox.org)',
    origin: 'https://eu.kobotoolbox.org',
    kcOrigin: 'https://kc-eu.kobotoolbox.org',
  },
}

/** Serveur utilisé par les intégrations créées avant l'ajout de config.server_url. */
export const DEFAULT_KOBO_SERVER_URL = KOBO_SERVER_PRESETS.global.origin

export type KoboServerUrlResult =
  | { ok: true; origin: string; host: string }
  | { ok: false; error: string }

// Suffixes de noms réservés à un usage local/interne : jamais un serveur Kobo public.
const RESERVED_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.private',
  '.home.arpa',
  '.test',
  '.invalid',
  '.example',
]

const HOST_LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/** Vrai si le nom d'hôte est local/réservé/une adresse IP (littérale). */
export function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return true
  if (host === 'localhost') return true
  // IPv6 littérale (entre crochets dans une URL) ou IPv4 littérale (même abrégée :
  // le parseur d'URL normalise 2130706433 ou 0x7f.1 en 127.0.0.1).
  if (host.startsWith('[') || host.includes(':')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true
  if (/^[0-9.]+$/.test(host)) return true
  if (!host.includes('.')) return true
  return RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

/**
 * Valide et normalise l'URL d'un serveur KoboToolbox.
 * Accepte « eu.kobotoolbox.org », « https://eu.kobotoolbox.org/ », ou l'URL
 * complète d'un projet (le chemin et le fragment sont ignorés).
 */
export function parseKoboServerUrl(input: unknown): KoboServerUrlResult {
  if (typeof input !== 'string') return { ok: false, error: 'Adresse du serveur manquante.' }
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Adresse du serveur manquante.' }
  if (raw.length > 300) return { ok: false, error: 'Adresse du serveur trop longue.' }
  if (
    /\s/.test(raw) ||
    [...raw].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)
  ) {
    return {
      ok: false,
      error: "L'adresse du serveur ne doit contenir ni espace ni retour à la ligne.",
    }
  }

  // Schéma absent : « eu.kobotoolbox.org » → https. Tout autre schéma est refusé.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
  if (hasScheme && !/^https:\/\//i.test(raw)) {
    return { ok: false, error: 'HTTPS est obligatoire pour le serveur KoboToolbox.' }
  }

  let url: URL
  try {
    url = new URL(hasScheme ? raw : `https://${raw}`)
  } catch {
    return {
      ok: false,
      error: 'Adresse du serveur invalide (exemple : https://eu.kobotoolbox.org).',
    }
  }

  if (url.protocol !== 'https:') {
    return { ok: false, error: 'HTTPS est obligatoire pour le serveur KoboToolbox.' }
  }
  if (url.username || url.password) {
    return { ok: false, error: "L'adresse du serveur ne doit pas contenir d'identifiants." }
  }
  if (url.port) {
    return {
      ok: false,
      error: 'Les ports personnalisés ne sont pas acceptés pour le serveur KoboToolbox.',
    }
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (isPrivateOrReservedHost(host)) {
    return {
      ok: false,
      error:
        "Adresse de serveur refusée : utilisez un nom de domaine public (pas d'adresse IP, de localhost ni de réseau interne).",
    }
  }
  const labels = host.split('.')
  const tld = labels[labels.length - 1] ?? ''
  if (!labels.every((l) => HOST_LABEL_RE.test(l)) || !/^[a-z]{2,}$/.test(tld)) {
    return {
      ok: false,
      error: 'Nom de domaine du serveur invalide (exemple : eu.kobotoolbox.org).',
    }
  }

  return { ok: true, origin: `https://${host}`, host }
}

/** Famille du serveur : preset connu ou instance personnalisée. */
export function koboServerKind(origin: string): KoboServerKind {
  if (origin === KOBO_SERVER_PRESETS.global.origin) return 'global'
  if (origin === KOBO_SERVER_PRESETS.eu.origin) return 'eu'
  return 'custom'
}

/** Libellé lisible pour les messages d'erreur (« KoboToolbox Global », « mon.serveur.org »…). */
export function koboServerLabel(origin: string): string {
  const kind = koboServerKind(origin)
  if (kind === 'global') return 'KoboToolbox Global (kf.kobotoolbox.org)'
  if (kind === 'eu') return 'KoboToolbox UE (eu.kobotoolbox.org)'
  return origin.replace(/^https:\/\//, '')
}

/** Base de l'API KPI v2 (sans slash final). */
export function koboApiBase(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/v2`
}

/**
 * Hôtes autorisés pour télécharger une pièce jointe : le serveur configuré (KPI,
 * là où pointe `download_url`) et, pour les serveurs publics, son pendant KoboCAT.
 */
export function koboAttachmentHosts(origin: string): string[] {
  const hosts = new Set<string>([new URL(origin).hostname.toLowerCase()])
  for (const preset of Object.values(KOBO_SERVER_PRESETS)) {
    if (preset.origin === origin) hosts.add(new URL(preset.kcOrigin).hostname)
  }
  return [...hosts]
}

/** Page « Clé API » du serveur (Compte → Sécurité). */
export function koboAccountSecurityUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/#/account/security`
}

/** Vrai pour les serveurs publics connus, dispensés du contrôle DNS. */
export function isKoboPresetOrigin(origin: string): boolean {
  return koboServerKind(origin) !== 'custom'
}

// ---------------------------------------------------------------------------
// Adresses IP privées / réservées (résultat d'une résolution DNS)
// ---------------------------------------------------------------------------

function ipv4ToParts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null
}

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b, c] = parts as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 169 && b === 254) return true // link-local, métadonnées cloud
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a >= 224) return true // multicast + réservé + broadcast
  return false
}

/** Développe une IPv6 en 8 groupes de 16 bits ; null si invalide. */
function expandIpv6(ip: string): number[] | null {
  let addr = ip.toLowerCase().replace(/^\[|\]$/g, '')
  const zone = addr.indexOf('%')
  if (zone >= 0) addr = addr.slice(0, zone)
  // Suffixe IPv4 (::ffff:1.2.3.4) → deux groupes hexadécimaux.
  const lastColon = addr.lastIndexOf(':')
  const tail = addr.slice(lastColon + 1)
  if (tail.includes('.')) {
    const v4 = ipv4ToParts(tail)
    if (!v4) return null
    const [a, b, c, d] = v4 as [number, number, number, number]
    addr = `${addr.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = addr.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const groups = [...head, ...(halves.length === 2 ? Array(missing).fill('0') : []), ...rest]
  if (groups.length !== 8) return null
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? Number.parseInt(g, 16) : Number.NaN))
  return out.some(Number.isNaN) ? null : out
}

/** Vrai si l'adresse IP (v4 ou v6) est privée, locale ou réservée. Une IP illisible est refusée. */
export function isPrivateIp(ip: string): boolean {
  const v4 = ipv4ToParts(ip)
  if (v4) return isPrivateIpv4(v4)
  const g = expandIpv6(ip)
  if (!g) return true
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  if (g.every((x) => x === 0)) return true // ::
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1)
    return true // ::1
  // IPv4 mappée/compatible (::ffff:a.b.c.d, ::a.b.c.d) ou NAT64 (64:ff9b::/96)
  const embedded = [g6 >> 8, g6 & 255, g7 >> 8, g7 & 255]
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0xffff || g5 === 0)) {
    return isPrivateIpv4(embedded)
  }
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0)
    return isPrivateIpv4(embedded)
  if ((g0 & 0xfe00) === 0xfc00) return true // fc00::/7 (ULA)
  if ((g0 & 0xffc0) === 0xfe80) return true // fe80::/10 (link-local)
  if ((g0 & 0xffc0) === 0xfec0) return true // fec0::/10 (site-local, obsolète)
  if ((g0 & 0xff00) === 0xff00) return true // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true // documentation
  return false
}
