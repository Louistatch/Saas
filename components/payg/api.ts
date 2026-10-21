// Appels JSON des écrans PAYG : un seul format d'erreur lisible, jamais d'exception non gérée.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

export async function api<T>(url: string, init?: { method?: string; body?: unknown }) {
  try {
    const res = await fetch(url, {
      method: init?.method ?? (init?.body ? 'POST' : 'GET'),
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          (data as { error?: string; message?: string }).message ??
          (data as { error?: string }).error ??
          'Action impossible pour le moment.',
      } as ApiResult<T>
    }
    return { ok: true, data: data as T } as ApiResult<T>
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'Pas de connexion. Vérifiez votre internet puis réessayez.',
    } as ApiResult<T>
  }
}

/** Ajoute partner_id à une URL d'API (le compte peut servir plusieurs opérateurs). */
export function withPartner(url: string, partnerId: string | undefined) {
  if (!partnerId) return url
  return `${url}${url.includes('?') ? '&' : '?'}partner_id=${partnerId}`
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function newIdempotencyKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
