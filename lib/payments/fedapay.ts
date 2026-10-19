import 'server-only'

/**
 * FedaPay — paiement Mobile Money « direct » (MTN, Moov, Celtiis, Mixx by Yas)
 * pour le Togo et le Bénin. L'acheteur ne quitte JAMAIS le site : ni
 * redirection, ni nouvel onglet, ni iframe FedaPay (createDirectPayment). La
 * page de paiement hébergée (ancien createCheckout) n'est plus utilisée ; les
 * achats déjà créés par elle se règlent comme les autres (getTransaction).
 *
 * Deux règles de sécurité :
 *  - le statut d'un paiement n'est JAMAIS pris dans l'URL de retour ni dans le
 *    corps d'un webhook : on le relit auprès de FedaPay (GET /transactions/{id})
 *    avec notre clé secrète ;
 *  - le montant et la devise relus doivent correspondre à l'achat enregistré.
 *
 * Variables (serveur) : FEDAPAY_SECRET_KEY (obligatoire), FEDAPAY_ENV = sandbox
 * | live (défaut sandbox, pour qu'une clé de test ne parte jamais en production
 * par erreur), FEDAPAY_DISABLED_PROVIDERS (facultatif, opérateurs masqués : voir
 * lib/payments/fedapay-providers.ts).
 */

import {
  FEDAPAY_PROVIDERS,
  FedaPayConfigError,
  type FedaPayEnv,
  type FedaPayProviderId,
  parseDisabledProviders,
  resolveFedaPayMode,
} from '@/lib/payments/fedapay-providers'

const BASES = { sandbox: 'https://sandbox-api.fedapay.com/v1', live: 'https://api.fedapay.com/v1' }

export function isFedaPayConfigured(): boolean {
  return !!process.env.FEDAPAY_SECRET_KEY?.trim()
}

/**
 * Environnement FedaPay, lu UNIQUEMENT depuis FEDAPAY_ENV (sandbox | live).
 * Absent → sandbox (une clé de test ne part jamais en production par erreur).
 * Valeur inconnue → erreur. Les clés FedaPay portent leur environnement dans
 * leur préfixe (sk_sandbox_… / sk_live_…) : si le préfixe est présent et
 * contredit FEDAPAY_ENV, on refuse plutôt que d'appeler la mauvaise API.
 */
export function fedaPayEnv(): FedaPayEnv {
  const raw = process.env.FEDAPAY_ENV?.trim() || 'sandbox'
  if (raw !== 'sandbox' && raw !== 'live')
    throw new FedaPayConfigError(`FEDAPAY_ENV invalide : « ${raw} » (attendu sandbox ou live)`)
  const key = process.env.FEDAPAY_SECRET_KEY?.trim() ?? ''
  if (raw === 'live' && key.startsWith('sk_sandbox_'))
    throw new FedaPayConfigError('Clé sandbox utilisée avec FEDAPAY_ENV=live')
  if (raw === 'sandbox' && key.startsWith('sk_live_'))
    throw new FedaPayConfigError('Clé live utilisée avec FEDAPAY_ENV=sandbox')
  return raw
}

function base(): string {
  return fedaPayEnv() === 'live' ? BASES.live : BASES.sandbox
}

/** Valeur de FEDAPAY_DISABLED_PROVIDERS déjà signalée (une alerte par valeur et par instance). */
let reportedDisabledValue: string | null = null

/**
 * Opérateurs masqués par FEDAPAY_DISABLED_PROVIDERS (ids d'opérateur ou modes
 * FedaPay live, séparés par des virgules, espaces ou points-virgules ; absent
 * → aucun). Lu à chaque appel, côté serveur uniquement. Une valeur non
 * reconnue est signalée en ERREUR, une fois par valeur : l'interrupteur
 * d'urgence ne doit jamais rester sans effet en silence (voir aussi
 * npm run security:check).
 */
export function fedaPayDisabledProviders(): ReadonlySet<FedaPayProviderId> {
  const raw = process.env.FEDAPAY_DISABLED_PROVIDERS ?? ''
  const { disabled, unknown } = parseDisabledProviders(raw)
  if (unknown.length && reportedDisabledValue !== raw) {
    reportedDisabledValue = raw
    console.error(
      `[FedaPay] FEDAPAY_DISABLED_PROVIDERS : valeurs non reconnues, AUCUN opérateur masqué pour elles (${unknown.join(', ')}). Valeurs admises : ${FEDAPAY_PROVIDERS.map((p) => (p.id === p.live ? p.id : `${p.id} ou ${p.live}`)).join(', ')}.`,
    )
  }
  return disabled
}

/**
 * Journal détaillé autorisé ? Seulement quand l'environnement est Sandbox de
 * façon CERTAINE : FEDAPAY_ENV lu comme fedaPayEnv() (valeur nettoyée, donc
 * « live\n » vaut live) ; configuration invalide → rien n'est journalisé.
 */
function verboseLogs(): boolean {
  try {
    return fedaPayEnv() === 'sandbox'
  } catch {
    return false
  }
}

/** Journal sans secret : jamais de clé, de jeton ni de numéro complet. */
function trace(level: 'info' | 'error', fields: Record<string, unknown>) {
  const line = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  if (level === 'error') console.error(`[FedaPay Error] ${line}`)
  else if (verboseLogs()) console.info(`[FedaPay] ${line}`)
}

/**
 * Diagnostic Sandbox UNIQUEMENT : journal détaillé d'un échange avec FedaPay.
 * Jamais en live (ni si l'environnement est douteux), jamais la clé ni
 * l'en-tête Authorization ; le jeton de paiement est tronqué.
 */
function sandboxLog(tag: string, fields: Record<string, unknown>) {
  if (!verboseLogs()) return
  const line = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ')
  console.info(`[${tag}] ${line}`)
}

const maskToken = (t: string) => (t.length > 8 ? `${t.slice(0, 4)}…${t.slice(-4)}` : '…')

/** Réponse HTTP en erreur de l'API FedaPay. */
export class FedaPayHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/**
 * La demande au téléphone (POST /v1/{mode}) a été REFUSÉE par FedaPay : réponse
 * 4xx, la requête n'a pas été traitée, rien n'est parti au téléphone. (408 et
 * 409 exclus : délai ou conflit, la demande a pu partir.) Un délai dépassé, une
 * coupure réseau ou un 5xx ne lèvent PAS cette erreur : la demande a pu
 * arriver.
 */
export class FedaPaySendRejectedError extends Error {
  constructor(readonly status: number) {
    super(`FedaPay a refusé la demande de paiement (${status})`)
  }
}

const isRejection = (status: number) =>
  status >= 400 && status < 500 && status !== 408 && status !== 409

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.FEDAPAY_SECRET_KEY?.trim()
  if (!key) throw new Error('FedaPay non configuré')
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) {
    trace('error', {
      environment: fedaPayEnv(),
      path: path.replace(/\d+/g, ':id'),
      status: res.status,
      message: text.slice(0, 200).replace(/\s+/g, ' '),
    })
    throw new FedaPayHttpError(`FedaPay ${res.status}: ${text.slice(0, 200)}`, res.status)
  }
  return (text ? JSON.parse(text) : {}) as T
}

/**
 * Transaction FedaPay relue côté serveur, normalisée. Champs tirés du schéma
 * officiel de GET /v1/transactions/{id} (api-reference/openapi.json du dépôt
 * github.com/fedapay/docs, commit 5e9d2f6) — aucun champ inventé :
 *   - `amount_debited` « Amount debited from the payer » et `fees`
 *     « Transaction fees » : montant réellement débité (frais inclus quand
 *     ils sont à la charge de l'acheteur, ex. 1000 → 1042) et frais. Null tant
 *     que FedaPay ne les a pas calculés (transaction sans mode : les
 *     exemples des SDK officiels montrent null avant le choix de l'opérateur) ;
 *   - `last_error_code` « Last error code encountered during the transaction »
 *     (ex. `API_ERROR` dans les exemples des SDK) ;
 *   - `custom_metadata` : les données que NOUS avons envoyées à la création
 *     (purchase_id, fiche_id), relues pour vérifier le rattachement.
 */
export interface FedaTransaction {
  id: number
  status: 'pending' | 'approved' | 'declined' | 'canceled' | 'refunded' | 'transferred' | string
  amount: number
  currencyIso: string | null
  /** Montant débité de l'acheteur (frais inclus), ou null s'il n'est pas connu. */
  amountDebited: number | null
  /** Frais de la transaction, ou null s'ils ne sont pas connus. */
  fees: number | null
  /** Dernier code d'erreur FedaPay (motif d'un échec), ou null. */
  lastErrorCode: string | null
  /** Mode (opérateur) utilisé, ex. `mtn_open`, ou null. */
  mode: string | null
  /** custom_metadata relu chez FedaPay (objet), ou null s'il est absent. */
  customMetadata: Record<string, unknown> | null
}

/** Entier positif ou nul (montant, frais), sinon null : jamais NaN ni chaîne. */
function amountOrNull(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

function metadataOrNull(v: unknown): Record<string, unknown> | null {
  let m = v
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m)
    } catch {
      return null
    }
  }
  return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : null
}

// biome-ignore lint/suspicious/noExplicitAny: réponse JSON FedaPay, normalisée ici
export function readTx(raw: any): FedaTransaction {
  const t = raw?.['v1/transaction'] ?? raw?.transaction ?? raw
  const code = t?.last_error_code
  return {
    id: Number(t?.id),
    status: String(t?.status ?? ''),
    amount: Number(t?.amount),
    currencyIso: typeof t?.currency?.iso === 'string' ? t.currency.iso : null,
    amountDebited: amountOrNull(t?.amount_debited),
    fees: amountOrNull(t?.fees),
    lastErrorCode: typeof code === 'string' && code.trim() ? code.trim().slice(0, 120) : null,
    mode: typeof t?.mode === 'string' && t.mode ? t.mode : null,
    customMetadata: metadataOrNull(t?.custom_metadata),
  }
}

export async function getTransaction(id: number | string): Promise<FedaTransaction> {
  const raw = await call(`/transactions/${encodeURIComponent(String(id))}`)
  // biome-ignore lint/suspicious/noExplicitAny: diagnostic Sandbox
  const t: any = (raw as any)?.['v1/transaction'] ?? raw
  sandboxLog('FedaPay Final', {
    transaction_id: t?.id,
    status: t?.status,
    reason: t?.last_error_code ?? t?.last_error_message ?? null,
    last_error_message: t?.last_error_message,
    payment_method: t?.mode,
    payment_method_id: t?.payment_method_id,
    customer_id: t?.customer_id,
    amount: t?.amount,
    fees: t?.fees,
    approved_at: t?.approved_at,
    declined_at: t?.declined_at,
    created_at: t?.created_at,
    raw: JSON.stringify(t).slice(0, 1500),
  })
  return readTx(raw)
}

/**
 * Paiement Mobile Money DIRECT (sans quitter le site) : crée la transaction,
 * génère son jeton puis demande le prélèvement sur le téléphone de l'acheteur
 * (POST /v1/{mode} avec { token, phone_number: { number, country } }, cf.
 * section « No-Redirect » de la documentation et SDK sendNowWithToken). Le mode
 * est résolu par resolveFedaPayMode : momo_test en Sandbox, vrai opérateur en
 * live, opérateur masqué refusé. Le paiement reste « pending » ; seul
 * GET /transactions/{id} fait foi ensuite. Envoi refusé net par FedaPay (4xx) :
 * FedaPaySendRejectedError (rien n'est parti au téléphone) ; toute autre
 * erreur de l'envoi laisse la demande incertaine.
 */
export async function createDirectPayment(input: {
  amount: number
  description: string
  callbackUrl: string
  provider: string
  customer: { name: string; email?: string | null; phone: string; country: 'tg' | 'bj' }
  /**
   * Rattachement envoyé en `custom_metadata` (champ de POST /v1/transactions
   * dans le schéma officiel) et revérifié au règlement : une transaction qui
   * dirait une autre fiche ou un autre achat n'ouvre rien.
   */
  metadata?: { purchase_id: string; fiche_id: string }
  /**
   * Appelé dès que la transaction existe chez FedaPay et que son jeton est
   * émis, juste AVANT la demande de prélèvement : l'appelant enregistre l'id
   * tout de suite, si bien qu'un échec de l'envoi (délai, 5xx) ne laisse jamais
   * une transaction introuvable. (Sans jeton, la transaction ne peut pas être
   * payée : l'achat peut alors être marqué en échec.) Une erreur levée ici
   * interrompt le paiement avant tout envoi au téléphone.
   */
  onCreated?: (transactionId: number) => Promise<void> | void
}): Promise<{ transactionId: number; mode: string }> {
  const environment = fedaPayEnv()
  const mode = resolveFedaPayMode({
    environment,
    selectedProvider: input.provider,
    country: input.customer.country,
    disabled: fedaPayDisabledProviders(),
  })
  const [firstname, ...rest] = input.customer.name.trim().split(/\s+/)
  const prefix = input.customer.country === 'bj' ? '229' : '228'
  const digits = input.customer.phone.replace(/\D/g, '')
  const local = digits.startsWith(prefix) && digits.length > 8 ? digits.slice(3) : digits
  const phone_number = { number: local, country: input.customer.country }

  const created = await call('/transactions', {
    method: 'POST',
    body: JSON.stringify({
      description: input.description.slice(0, 250),
      amount: Math.round(input.amount),
      currency: { iso: 'XOF' },
      callback_url: input.callbackUrl,
      ...(input.metadata ? { custom_metadata: input.metadata } : {}),
      customer: {
        firstname: firstname || 'Client',
        lastname: rest.join(' ') || '-',
        ...(input.customer.email ? { email: input.customer.email } : {}),
        phone_number,
      },
    }),
  })
  const tx = readTx(created)
  if (!tx.id) throw new Error('FedaPay : transaction non créée')
  // biome-ignore lint/suspicious/noExplicitAny: diagnostic Sandbox
  const createdTx: any = (created as any)?.['v1/transaction'] ?? created
  sandboxLog('FedaPay Create', {
    transaction_id: tx.id,
    environment,
    raw_phone: input.customer.phone,
    normalized_phone: local,
    country: input.customer.country,
    country_code: prefix,
    customer_phone_sent: phone_number,
    fedapay_status: createdTx?.status,
    fedapay_customer_id: createdTx?.customer_id,
  })
  trace('info', {
    environment,
    user_provider: input.provider,
    resolved_provider: mode,
    transaction_creation: 'success',
    transaction_id: tx.id,
  })
  const token = await call<{ token?: string }>(`/transactions/${tx.id}/token`, { method: 'POST' })
  if (!token.token) throw new Error('FedaPay : jeton de paiement absent')
  await input.onCreated?.(tx.id)
  const sendPayload = { token: token.token, phone_number }
  let sendResponse: unknown
  try {
    sendResponse = await call(`/${mode}`, { method: 'POST', body: JSON.stringify(sendPayload) })
  } catch (e) {
    sandboxLog('FedaPay Send', {
      transaction_id: tx.id,
      environment,
      requested_provider: input.provider,
      resolved_provider: mode,
      endpoint: `POST /v1/${mode}`,
      payload: { ...sendPayload, token: maskToken(token.token) },
      result: 'http_error',
      error: (e as Error).message.slice(0, 300),
    })
    if (e instanceof FedaPayHttpError && isRejection(e.status))
      throw new FedaPaySendRejectedError(e.status)
    throw e
  }
  // Statut relu juste après l'envoi (immédiat), pour le diagnostic.
  // biome-ignore lint/suspicious/noExplicitAny: diagnostic Sandbox
  let after: any = null
  if (environment === 'sandbox') {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: diagnostic Sandbox
      const raw: any = await call(`/transactions/${tx.id}`)
      after = raw?.['v1/transaction'] ?? raw
    } catch {
      after = null
    }
  }
  sandboxLog('FedaPay Send', {
    transaction_id: tx.id,
    environment,
    requested_provider: input.provider,
    resolved_provider: mode,
    endpoint: `POST /v1/${mode}`,
    raw_phone: input.customer.phone,
    normalized_phone: local,
    country: input.customer.country,
    country_code: prefix,
    payload: { ...sendPayload, token: maskToken(token.token) },
    http_status: 200,
    fedapay_response: JSON.stringify(sendResponse).slice(0, 600),
    status_after_send: after?.status,
    mode_after_send: after?.mode,
    last_error_code: after?.last_error_code,
    last_error_message: after?.last_error_message,
  })
  trace('info', { environment, resolved_provider: mode, send: 'requested', transaction_id: tx.id })
  return { transactionId: tx.id, mode }
}
