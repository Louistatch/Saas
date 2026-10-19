import { createHash } from 'node:crypto'

// Regroupe une erreur : même source, même chemin (identifiants masqués), même message
// (nombres masqués) → même empreinte, donc une seule ligne avec un compteur.
export function errorFingerprint(source: string, route: string, message: string): string {
  const path = route
    .split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:n')
  const text = message.replace(/\d+/g, '#').slice(0, 200)
  return createHash('sha256').update(`${source}|${path}|${text}`).digest('hex').slice(0, 64)
}

/** Enregistre une erreur sans jamais lever : l'observabilité ne doit pas casser une requête. */
export async function recordAppError(input: {
  source: 'serveur' | 'navigateur'
  route: string
  message: string
  digest?: string | null
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return
  try {
    await fetch(`${url}/rest/v1/rpc/record_app_error`, {
      method: 'POST',
      signal: AbortSignal.timeout(3_000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_fingerprint: errorFingerprint(input.source, input.route, input.message),
        p_source: input.source,
        p_route: input.route.split('?')[0].slice(0, 300),
        p_message: input.message.slice(0, 500) || 'Erreur sans message',
        p_digest: input.digest?.slice(0, 100) ?? null,
      }),
    })
  } catch {
    // Ignoré volontairement.
  }
}
