/**
 * Client HTTP de l'API KoboToolbox v2 — logique PURE (fetch, horloge et pause injectables).
 *
 * Faits d'API respectés (voir la doc officielle KPI) :
 *  - Authentification : `Authorization: Token <clé>` ; 401 = clé absente/invalide,
 *    404 = asset invisible pour ce compte (son existence est masquée), 403 = visible
 *    mais action interdite, 400 = requête/paramètre invalide ou formulaire non déployé.
 *  - Lecture des soumissions : GET /assets/{uid}/data/ (permission « Voir les soumissions »),
 *    `limit` plafonné à 1000, `query` = filtre JSON de type Mongo, `sort` = JSON.
 *  - Aucun quota publié ⚠️ : Kobo a déjà renvoyé 429 pour bloquer des comptes abusifs →
 *    on respecte Retry-After et on reste sous 1000 par page.
 *  - Seuls 429/502/503/504 et les erreurs réseau sont réessayés (comme les REST Services de Kobo).
 *
 * SÉCURITÉ : le token n'apparaît jamais dans un message d'erreur, un log ou une
 * réponse. Un token mal formé (retour à la ligne collé…) est refusé AVANT tout appel
 * réseau, au lieu d'être réessayé en boucle puis recopié dans l'erreur du runtime.
 *
 * Imports relatifs uniquement : ce fichier est chargé tel quel par node:test.
 */
import { koboAccountSecurityUrl, koboApiBase, koboServerLabel } from './server-url'
import type {
  KoboApiDataResponse,
  KoboApiSubmission,
  KoboErrorCode,
  TestConnectionResult,
} from './types'

export const KOBO_REQUEST_TIMEOUT_MS = 30_000
export const KOBO_MAX_RETRIES = 3
/** Kobo plafonne `limit` à 1000 sans erreur ; on reste prudent. */
export const KOBO_PAGE_SIZE = 100
/** Attente maximale d'un Retry-After honoré (au-delà, on rend la main à l'appelant). */
export const KOBO_MAX_RETRY_AFTER_MS = 30_000

/**
 * Un token KoboToolbox est une clé DRF de 40 caractères hexadécimaux (validée à la saisie,
 * lib/validators/kobo.ts). Ici on ne vérifie que ce qui protège l'en-tête HTTP : ni espace,
 * ni retour à la ligne, ni caractère de contrôle.
 */
const TOKEN_HEADER_SAFE_RE = /^[A-Za-z0-9._-]{20,200}$/

export class KoboApiError extends Error {
  readonly code: KoboErrorCode
  readonly status?: number
  readonly retryAfterSec?: number

  constructor(
    code: KoboErrorCode,
    message: string,
    opts: { status?: number; retryAfterSec?: number } = {},
  ) {
    super(message)
    this.name = 'KoboApiError'
    this.code = code
    this.status = opts.status
    this.retryAfterSec = opts.retryAfterSec
  }
}

/** Masque toute occurrence d'un secret (et un motif « Token <hex> ») dans un texte destiné aux logs ou à l'UI. */
export function scrubSecrets(text: string, secrets: Array<string | null | undefined> = []): string {
  let out = text
  for (const secret of secrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join('***')
  }
  return out
    .replace(/Token\s+[A-Za-z0-9._-]{8,}/g, 'Token ***')
    .replace(/\b[0-9a-f]{40}\b/gi, '***')
}

export type KoboHttpScope = 'asset' | 'data'

/**
 * Traduit un statut HTTP de Kobo en code + message français actionnable.
 * `scope` distingue la lecture des métadonnées de l'asset de celle de ses soumissions :
 * un 404 sur /data/ signale le plus souvent l'absence de la permission « Voir les soumissions ».
 */
export function mapKoboHttpError(
  status: number,
  ctx: { scope?: KoboHttpScope; serverUrl: string; bodyHint?: string },
): { code: KoboErrorCode; message: string } {
  const server = koboServerLabel(ctx.serverUrl)
  const scope = ctx.scope ?? 'asset'
  if (status === 401) {
    return {
      code: 'unauthorized',
      message: `Token refusé par ${server} : vérifiez le token et le serveur (Global ou UE). Le token se trouve dans ${koboAccountSecurityUrl(ctx.serverUrl)}.`,
    }
  }
  if (status === 403) {
    return {
      code: 'forbidden',
      message:
        scope === 'data'
          ? "Le compte du token n'a pas la permission « Voir les soumissions » : partagez le projet avec ce compte dans KoboToolbox → Partage."
          : "Le compte du token n'a pas le droit d'utiliser ce formulaire : partagez le projet avec ce compte dans KoboToolbox → Partage.",
    }
  }
  if (status === 404) {
    return {
      code: 'not_found',
      message:
        scope === 'data'
          ? "Les soumissions sont inaccessibles : le compte du token n'a probablement pas la permission « Voir les soumissions » (KoboToolbox → Partage)."
          : `Formulaire introuvable sur ${server} ou non partagé avec le compte du token : vérifiez le Form ID, le serveur et le partage du projet.`,
    }
  }
  if (status === 400) {
    const hint = ctx.bodyHint ?? ''
    if (/\b(query|sort|fields|limit|start)\b/i.test(hint)) {
      return {
        code: 'bad_request',
        message: 'KoboToolbox a refusé la requête (paramètre invalide).',
      }
    }
    return {
      code: 'not_deployed',
      message: 'Formulaire non déployé : déployez-le dans KoboToolbox avant de synchroniser.',
    }
  }
  if (status === 429) {
    return {
      code: 'rate_limited',
      message:
        'KoboToolbox limite temporairement les requêtes (trop de demandes). Réessayez dans quelques minutes.',
    }
  }
  if (status >= 500) {
    return {
      code: 'server_error',
      message: `KoboToolbox est momentanément indisponible (erreur ${status}). Réessayez plus tard.`,
    }
  }
  return { code: 'bad_request', message: `Réponse inattendue de KoboToolbox (HTTP ${status}).` }
}

/** Statuts pour lesquels l'échec vient de la configuration (token, partage, formulaire) et non d'une panne passagère. */
export function isConfigurationError(code: KoboErrorCode): boolean {
  return (
    code === 'unauthorized' ||
    code === 'forbidden' ||
    code === 'not_found' ||
    code === 'not_deployed' ||
    code === 'invalid_token' ||
    code === 'unsafe_host'
  )
}

/** Retry-After : secondes ou date HTTP → millisecondes (null si absent/illisible). */
export function parseRetryAfterMs(value: string | null, nowMs: number): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) * 1000
  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return null
  return Math.max(0, date - nowMs)
}

export interface KoboClientOptions {
  /** Origine du serveur (https://kf.kobotoolbox.org). */
  serverUrl: string
  apiToken: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  requestTimeoutMs?: number
  maxRetries?: number
  /** Date limite absolue (ms epoch) : aucune tentative ni attente ne doit la dépasser. */
  deadlineAt?: number
  /** Contrôle de l'hôte avant le premier appel (résolution DNS publique) ; lève KoboApiError('unsafe_host'). */
  hostGuard?: (host: string) => Promise<void>
}

export interface FetchSubmissionsPageParams {
  formId: string
  /** Ne lire que les soumissions dont l'_id est strictement supérieur (curseur de reprise). */
  afterId?: number | null
  /** Ne lire que les soumissions dont _submission_time >= since. */
  since?: Date | null
  limit?: number
}

export interface SubmissionsPage {
  results: KoboApiSubmission[]
  /** Nombre total de soumissions correspondant au filtre (champ `count`), si fourni. */
  count: number | null
  /** Vrai si Kobo annonce une page suivante. */
  hasMore: boolean
}

/** Format de date accepté par les filtres _submission_time de Kobo : « 2026-10-08T10:00:00 » (UTC, sans fuseau). */
export function koboQueryDate(date: Date): string {
  return date.toISOString().slice(0, 19)
}

export class KoboApiClient {
  private readonly opts: Required<Pick<KoboClientOptions, 'requestTimeoutMs' | 'maxRetries'>> &
    KoboClientOptions
  private hostChecked = false

  constructor(opts: KoboClientOptions) {
    this.opts = {
      ...opts,
      requestTimeoutMs: opts.requestTimeoutMs ?? KOBO_REQUEST_TIMEOUT_MS,
      maxRetries: opts.maxRetries ?? KOBO_MAX_RETRIES,
    }
  }

  get serverUrl(): string {
    return this.opts.serverUrl
  }

  private now(): number {
    return (this.opts.now ?? Date.now)()
  }

  private async sleep(ms: number): Promise<void> {
    if (this.opts.sleep) return this.opts.sleep(ms)
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private fail(
    code: KoboErrorCode,
    message: string,
    extra: { status?: number; retryAfterSec?: number } = {},
  ): never {
    throw new KoboApiError(code, scrubSecrets(message, [this.opts.apiToken]), extra)
  }

  /**
   * GET avec expiration, nouvelles tentatives et respect de Retry-After.
   * Renvoie la réponse HTTP finale (même 4xx/5xx) ; lève KoboApiError pour les
   * erreurs réseau, l'expiration, la redirection et le token inutilisable.
   */
  async request(path: string, params?: Record<string, string>): Promise<Response> {
    const { apiToken } = this.opts
    if (!TOKEN_HEADER_SAFE_RE.test(apiToken)) {
      this.fail(
        'invalid_token',
        'Token KoboToolbox invalide (format incorrect) : recopiez-le sans espace ni retour à la ligne.',
      )
    }
    if (!this.hostChecked && this.opts.hostGuard) {
      await this.opts.hostGuard(new URL(this.opts.serverUrl).hostname)
      this.hostChecked = true
    }

    const url = new URL(`${koboApiBase(this.opts.serverUrl)}${path}`)
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value)

    const doFetch = this.opts.fetchImpl ?? fetch
    let attempt = 0
    for (;;) {
      const remaining =
        this.opts.deadlineAt === undefined
          ? Number.POSITIVE_INFINITY
          : this.opts.deadlineAt - this.now()
      if (remaining <= 0)
        this.fail('timeout', "KoboToolbox n'a pas répondu dans le temps imparti. Réessayez.")
      const timeoutMs = Math.max(1, Math.min(this.opts.requestTimeoutMs, remaining))

      let response: Response | null = null
      let networkError: unknown = null
      try {
        response = await doFetch(url.toString(), {
          headers: { Authorization: `Token ${apiToken}`, Accept: 'application/json' },
          // Pas de suivi de redirection : un serveur hostile pourrait nous envoyer vers un hôte interne.
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (err: unknown) {
        networkError = err
      }

      if (networkError !== null) {
        const name = networkError instanceof Error ? networkError.name : ''
        const text = networkError instanceof Error ? networkError.message : ''
        // En-tête refusé par le runtime : erreur non transitoire, jamais réessayée ni recopiée.
        if (/header/i.test(text) && /invalid|illegal/i.test(text)) {
          this.fail(
            'invalid_token',
            'Token KoboToolbox invalide (caractères interdits dans un en-tête).',
          )
        }
        const isTimeout = name === 'TimeoutError' || name === 'AbortError'
        if (attempt >= this.opts.maxRetries) {
          if (isTimeout) this.fail('timeout', "KoboToolbox n'a pas répondu à temps. Réessayez.")
          this.fail(
            'network',
            `Impossible de joindre ${koboServerLabel(this.opts.serverUrl)}. Vérifiez l'adresse du serveur.`,
          )
        }
        const delay = Math.min(KOBO_MAX_RETRY_AFTER_MS, 1000 * 2 ** attempt)
        if (!this.canWait(delay)) {
          this.fail(
            isTimeout ? 'timeout' : 'network',
            isTimeout
              ? "KoboToolbox n'a pas répondu à temps. Réessayez."
              : `Impossible de joindre ${koboServerLabel(this.opts.serverUrl)}.`,
          )
        }
        await this.sleep(delay)
        attempt++
        continue
      }

      const res = response as Response
      if (res.status >= 300 && res.status < 400) {
        this.fail(
          'redirect',
          `${koboServerLabel(this.opts.serverUrl)} a répondu par une redirection (non suivie) : vérifiez l'adresse du serveur.`,
          { status: res.status },
        )
      }

      const retriable =
        res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504
      if (!retriable || attempt >= this.opts.maxRetries) return res

      const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'), this.now())
      const delay = Math.min(
        KOBO_MAX_RETRY_AFTER_MS,
        retryAfterMs !== null ? retryAfterMs : 1000 * 2 ** attempt,
      )
      // Retry-After plus long que ce qu'on peut attendre : on rend la réponse à l'appelant, qui
      // arrête proprement (curseur conservé) au lieu de s'acharner.
      if (retryAfterMs !== null && retryAfterMs > KOBO_MAX_RETRY_AFTER_MS) return res
      if (!this.canWait(delay)) return res
      await this.sleep(delay)
      attempt++
    }
  }

  private canWait(delayMs: number): boolean {
    if (this.opts.deadlineAt === undefined) return true
    return this.opts.deadlineAt - this.now() > delayMs + 500
  }

  private async errorFromResponse(res: Response, scope: KoboHttpScope): Promise<KoboApiError> {
    let hint = ''
    if (res.status === 400) hint = (await res.text().catch(() => '')).slice(0, 300)
    const mapped = mapKoboHttpError(res.status, {
      scope,
      serverUrl: this.opts.serverUrl,
      bodyHint: hint,
    })
    const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'), this.now())
    return new KoboApiError(mapped.code, mapped.message, {
      status: res.status,
      retryAfterSec: retryAfterMs !== null ? Math.ceil(retryAfterMs / 1000) : undefined,
    })
  }

  /** GET JSON ; lève KoboApiError (code + message français) pour toute réponse non 2xx ou non JSON. */
  async getJson<T>(
    path: string,
    params: Record<string, string> | undefined,
    scope: KoboHttpScope,
  ): Promise<T> {
    const res = await this.request(path, params)
    if (!res.ok) throw await this.errorFromResponse(res, scope)
    try {
      return (await res.json()) as T
    } catch {
      return this.fail(
        'invalid_response',
        "Ce serveur n'est pas une API KoboToolbox v2 (réponse non JSON). Vérifiez l'adresse du serveur.",
      )
    }
  }

  /**
   * Teste réellement ce que la synchronisation fera : lire l'asset, vérifier qu'il est
   * déployé, puis sonder /data/ (permission « Voir les soumissions »).
   */
  async testConnection(formId: string): Promise<TestConnectionResult> {
    const uid = encodeURIComponent(formId)
    try {
      const asset = await this.getJson<Record<string, unknown>>(
        `/assets/${uid}/`,
        { format: 'json' },
        'asset',
      )
      if (
        !asset ||
        typeof asset !== 'object' ||
        Array.isArray(asset) ||
        typeof asset.uid !== 'string'
      ) {
        return {
          valid: false,
          code: 'invalid_response',
          error:
            "Ce serveur n'est pas une API KoboToolbox v2 (réponse inattendue). Vérifiez l'adresse du serveur.",
        }
      }

      const formTitle = typeof asset.name === 'string' ? asset.name : undefined
      const assetType = typeof asset.asset_type === 'string' ? asset.asset_type : undefined
      if (assetType && assetType !== 'survey') {
        return {
          valid: false,
          formTitle,
          code: 'bad_request',
          error: `Cet identifiant correspond à un élément de type « ${assetType} », pas à un formulaire (survey).`,
        }
      }

      const deploymentStatus =
        typeof asset.deployment_status === 'string' ? asset.deployment_status : undefined
      const hasDeployment = asset.has_deployment !== false
      if (deploymentStatus === 'draft' || !hasDeployment) {
        return {
          valid: false,
          formTitle,
          deploymentStatus: deploymentStatus ?? 'draft',
          code: 'not_deployed',
          error: 'Formulaire non déployé : déployez-le dans KoboToolbox avant de le connecter.',
        }
      }
      const archived = deploymentStatus === 'archived' || asset.deployment__active === false

      // La synchronisation lit /data/ : c'est elle qu'il faut sonder (permission view_submissions).
      const probe = await this.getJson<KoboApiDataResponse | KoboApiSubmission[]>(
        `/assets/${uid}/data/`,
        { format: 'json', limit: '1' },
        'data',
      )
      const count = Array.isArray(probe)
        ? probe.length
        : typeof probe?.count === 'number'
          ? probe.count
          : undefined
      const fallbackCount =
        typeof asset.deployment__submission_count === 'number'
          ? asset.deployment__submission_count
          : 0

      return {
        valid: true,
        formTitle,
        submissionCount: count ?? fallbackCount,
        deploymentStatus,
        canViewSubmissions: true,
        warning: archived
          ? 'Formulaire archivé dans KoboToolbox : aucune nouvelle soumission ne sera reçue.'
          : undefined,
      }
    } catch (err: unknown) {
      if (err instanceof KoboApiError) return { valid: false, code: err.code, error: err.message }
      return { valid: false, code: 'network', error: 'Connexion à KoboToolbox impossible.' }
    }
  }

  /**
   * Une page de soumissions triées par _id croissant, à partir d'un curseur (`_id > afterId`)
   * et/ou d'une date (`_submission_time >= since`). La pagination passe par le curseur, pas
   * par `start`, pour rester correcte si des soumissions arrivent pendant la synchronisation.
   */
  async fetchSubmissionsPage(params: FetchSubmissionsPageParams): Promise<SubmissionsPage> {
    const limit = Math.min(params.limit ?? KOBO_PAGE_SIZE, 1000)
    const query: Record<string, unknown> = {}
    if (params.afterId !== undefined && params.afterId !== null) query._id = { $gt: params.afterId }
    if (params.since) query._submission_time = { $gte: koboQueryDate(params.since) }

    const search: Record<string, string> = {
      format: 'json',
      limit: String(limit),
      start: '0',
      sort: JSON.stringify({ _id: 1 }),
    }
    if (Object.keys(query).length > 0) search.query = JSON.stringify(query)

    const data = await this.getJson<KoboApiDataResponse | KoboApiSubmission[]>(
      `/assets/${encodeURIComponent(params.formId)}/data/`,
      search,
      'data',
    )

    // Selon la version du serveur, la réponse est paginée ou un tableau brut.
    if (Array.isArray(data))
      return { results: data, count: data.length, hasMore: data.length === limit }
    if (!data || typeof data !== 'object' || !Array.isArray(data.results)) {
      return this.fail(
        'invalid_response',
        'Réponse inattendue de KoboToolbox pour la liste des soumissions.',
      )
    }
    return {
      results: data.results,
      count: typeof data.count === 'number' ? data.count : null,
      hasMore: data.next !== null && data.next !== undefined && data.results.length > 0,
    }
  }

  /** Structure du formulaire (survey) pour l'éditeur de correspondances. */
  async getAsset(formId: string): Promise<Record<string, unknown>> {
    return this.getJson<Record<string, unknown>>(
      `/assets/${encodeURIComponent(formId)}/`,
      { format: 'json' },
      'asset',
    )
  }
}
