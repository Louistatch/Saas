/**
 * Normalisation de la saisie « Form ID » — logique PURE.
 *
 * L'admin colle volontiers l'URL du projet (https://kf.kobotoolbox.org/#/forms/<uid>/summary)
 * ou une saisie avec des espaces. L'API KoboToolbox v2 attend l'uid de l'asset
 * (ce qui suit `#/forms/` dans l'URL du projet) : on l'extrait ici, ainsi que le
 * serveur quand l'URL le porte.
 *
 * Imports relatifs uniquement : ce fichier est chargé tel quel par node:test.
 */
import { parseKoboServerUrl } from './server-url'

/** uid d'un asset KPI : 22 caractères alphanumériques (préfixe « a »). Tolérant sur la longueur. */
export const KOBO_FORM_ID_RE = /^[A-Za-z0-9]{20,24}$/

export type KoboFormInputResult =
  | { ok: true; formId: string; serverUrl?: string }
  | { ok: false; error: string }

const ENKETO_HELP =
  "Ce lien est un lien de collecte Enketo : il ne contient pas l'identifiant du formulaire. Ouvrez le projet dans KoboToolbox et copiez l'adresse de la barre du navigateur (…/#/forms/<identifiant>/summary)."

const INVALID_HELP =
  "Form ID invalide : collez l'identifiant (22 caractères) ou l'adresse du projet KoboToolbox (…/#/forms/<identifiant>/summary)."

function extractUidFromUrl(url: URL): string | null {
  // https://kf.kobotoolbox.org/#/forms/aBcD…/summary (cas de loin le plus courant)
  const fromHash = /^#\/?forms\/([^/?#]+)/.exec(url.hash)
  if (fromHash?.[1]) return fromHash[1]
  // https://kf…/api/v2/assets/<uid>/ , /assets/<uid>/ , /forms/<uid>/
  const fromPath = /\/(?:api\/v2\/)?(?:assets|forms)\/([^/?#]+)/.exec(url.pathname)
  return fromPath?.[1] ?? null
}

/**
 * Extrait l'uid (et éventuellement le serveur) d'une saisie libre.
 * Ne touche pas au réseau.
 */
export function parseKoboFormInput(raw: unknown): KoboFormInputResult {
  if (typeof raw !== 'string') return { ok: false, error: INVALID_HELP }
  const input = raw.trim()
  if (!input) return { ok: false, error: 'Form ID requis.' }

  const looksLikeUrl = /^https?:\/\//i.test(input) || input.includes('/')
  if (!looksLikeUrl) {
    if (/\s/.test(input)) return { ok: false, error: INVALID_HELP }
    return KOBO_FORM_ID_RE.test(input)
      ? { ok: true, formId: input }
      : { ok: false, error: INVALID_HELP }
  }

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    return { ok: false, error: INVALID_HELP }
  }

  // Lien Enketo (ee.kobotoolbox.org/x/…) : ne porte pas l'uid de l'asset.
  if (/^ee(-eu)?\./i.test(url.hostname) || /^\/x\//.test(url.pathname)) {
    return { ok: false, error: ENKETO_HELP }
  }

  const uid = extractUidFromUrl(url)
  if (!uid || !KOBO_FORM_ID_RE.test(uid)) return { ok: false, error: INVALID_HELP }

  const server = parseKoboServerUrl(url.origin)
  if (!server.ok) return { ok: false, error: server.error }
  return { ok: true, formId: uid, serverUrl: server.origin }
}
