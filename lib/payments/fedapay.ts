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

const BASES = { sandbox: 'https://sandbox-api.fedapay.com/v1', live: 'https://api.fedapay.com/v1' }

export function isFedaPayConfigured(): boolean {
  return !!process.env.FEDAPAY_SECRET_KEY?.trim()
}

function base(): string {
  return process.env.FEDAPAY_ENV === 'live' ? BASES.live : BASES.sandbox
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.FEDAPAY_SECRET_KEY?.trim()
  if (!key) throw new Error('FedaPay non configuré')
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`FedaPay ${res.status}: ${text.slice(0, 200)}`)
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
  customer: { name: string; email?: string | null; phone?: string | null }
}): Promise<{ transactionId: number; url: string }> {
  const [firstname, ...rest] = input.customer.name.trim().split(/\s+/)
  const phone = (input.customer.phone ?? '').replace(/\D/g, '')
  const local = phone.startsWith('228') ? phone.slice(3) : phone
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
        ...(local.length === 8 ? { phone_number: { number: local, country: 'tg' } } : {}),
      },
    }),
  })
  const tx = readTx(created)
  if (!tx.id) throw new Error('FedaPay : transaction non créée')
  const token = await call<{ token?: string; url?: string }>(`/transactions/${tx.id}/token`, { method: 'POST' })
  if (!token.url) throw new Error('FedaPay : lien de paiement absent')
  return { transactionId: tx.id, url: token.url }
}

export async function getTransaction(id: number | string): Promise<FedaTransaction> {
  return readTx(await call(`/transactions/${encodeURIComponent(String(id))}`))
}
