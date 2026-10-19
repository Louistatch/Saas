// Signale une erreur affichée à l'utilisateur au suivi de l'administration. Jamais bloquant.
export function reportClientError(error: Error & { digest?: string }) {
  try {
    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        message: String(error?.message ?? 'Erreur').slice(0, 500),
        digest: error?.digest?.slice(0, 100) ?? null,
        route: window.location.pathname.slice(0, 300),
      }),
    }).catch(() => undefined)
  } catch {
    // Ignoré volontairement.
  }
}
