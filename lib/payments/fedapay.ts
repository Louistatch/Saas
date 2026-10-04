import 'server-only'

/**
 * FedaPay — paiement Mobile Money (Moov, TMoney, cartes) pour l'Afrique de l'Ouest.
 *
 * Deux règles de sécurité :
 *  - le statut d'un paiement n'est JAMAIS pris dans l'URL de retour ni dans le
 *    corps d'un webhook : on le relit auprès de FedaPay (GET /transactions/{id})
 *    avec notre clé secrète ;
 *  - le montant et la devise relus doivent correspondre à l'achat enregistré.
 *
 * Variables : FEDAPAY_SECRET_KEY (obligatoire), FEDAPAY_ENV = sandbox | live
 * (défaut sandbox, pour qu'une clé de test ne parte jamais en production par erreur).
 */

import {
  FedaPayConfigError,
  type FedaPayEnv,
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

/** Journal sans secret : jamais de clé, de jeton ni de numéro complet. */
function trace(level: 'info' | 'error', fields: Record<string, unknown>) {
  const line = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  if (level === 'error') console.error(`[FedaPay Error] ${line}`)
  else if (process.env.FEDAPAY_ENV !== 'live') console.info(`[FedaPay] ${line}`)
}

/**
 * Diagnostic Sandbox UNIQUEMENT : journal détaillé d'un échange avec FedaPay.
 * Jamais en live, jamais la clé ni l'en-tête Authorization ; le jeton de
 * paiement est tronqué.
 */
function sandboxLog(tag: string, fields: Record<string, unknown>) {
  if (process.env.FEDAPAY_ENV === 'live') return
  const line = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ')
  console.info(`[${tag}] ${line}`)
}

const maskToken = (t: string) => (t.length > 8 ? `${t.slice(0, 4)}…${t.slice(-4)}` : '…')

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
    throw new Error(`FedaPay ${res.status}: ${text.slice(0, 200)}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

export interface FedaTransaction {
  id: number
  status: 'pending' | 'approved' | 'declined' | 'canceled' | 'refunded' | 'transferred' | string
  amount: number
  currencyIso: string | null
}

// biome-ignore lint/suspicious/noExplicitAny: réponse JSON FedaPay, normalisée ici
function readTx(raw: any): FedaTransaction {
  const t = raw?.['v1/transaction'] ?? raw?.transaction ?? raw
  return {
    id: Number(t?.id),
    status: String(t?.status ?? ''),
    amount: Number(t?.amount),
    currencyIso: t?.currency?.iso ?? (typeof t?.currency_id === 'number' ? null : null),
  }
}

export async function createCheckout(input: {
  amount: number
  description: string
  callbackUrl: string
  customer: { name: string; email?: string | null; phone?: string | null; country?: 'tg' | 'bj' }
}): Promise<{ transactionId: number; url: string }> {
  const [firstname, ...rest] = input.customer.name.trim().split(/\s+/)
  const phone = (input.customer.phone ?? '').replace(/\D/g, '')
  const country = input.customer.country ?? 'tg'
  const prefix = country === 'bj' ? '229' : '228'
  const local = phone.startsWith(prefix) && phone.length > 8 ? phone.slice(3) : phone
  const created = await call('/transactions', {
    method: 'POST',
    body: JSON.stringify({
      description: input.description.slice(0, 250),
      amount: Math.round(input.amount),
      currency: { iso: 'XOF' },
      callback_url: input.callbackUrl,
      customer: {
        firstname: firstname || 'Client',
        lastname: rest.join(' ') || '-',
        ...(input.customer.email ? { email: input.customer.email } : {}),
        // Le pays choisi par l'acheteur fixe le drapeau du checkout FedaPay
        // (Togo ou Bénin). Les numéros de test sandbox (64000001) sont béninois.
        ...(local.length >= 8 ? { phone_number: { number: local, country } } : {}),
      },
    }),
  })
  const tx = readTx(created)
  if (!tx.id) throw new Error('FedaPay : transaction non créée')
  const token = await call<{ token?: string; url?: string }>(`/transactions/${tx.id}/token`, {
    method: 'POST',
  })
  if (!token.url) throw new Error('FedaPay : lien de paiement absent')
  return { transactionId: tx.id, url: token.url }
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
 * (POST /v1/{mode}, cf. SDK FedaPay sendNowWithToken). Le mode est résolu par
 * resolveFedaPayMode : momo_test en Sandbox, vrai opérateur en live.
 * Le paiement reste « pending » ; seul GET /transactions/{id} fait foi ensuite.
 */
export async function createDirectPayment(input: {
  amount: number
  description: string
  callbackUrl: string
  provider: string
  customer: { name: string; email?: string | null; phone: string; country: 'tg' | 'bj' }
}): Promise<{ transactionId: number; mode: string }> {
  const environment = fedaPayEnv()
  const mode = resolveFedaPayMode({
    environment,
    selectedProvider: input.provider,
    country: input.customer.country,
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
