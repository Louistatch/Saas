// Garde SSRF pour le téléchargement des pièces jointes Kobo : `_attachments[].download_url`
// vient du payload (donc d'un émetteur non fiable) et on la télécharge AVEC le token API.
// Seules sont acceptées les URL https des hôtes du serveur Kobo CONFIGURÉ pour l'intégration
// (lib/kobo/server-url.ts → koboAttachmentHosts). Sans liste explicite (anciens appelants),
// on retombe sur les hôtes du serveur Global.

const DEFAULT_KOBO_HOSTS = ['kf.kobotoolbox.org', 'kc.kobotoolbox.org']

export function isAllowedKoboAttachmentUrl(rawUrl: unknown, allowedHosts?: string[]): boolean {
  if (typeof rawUrl !== 'string') return false
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  const hosts = allowedHosts && allowedHosts.length > 0 ? allowedHosts : DEFAULT_KOBO_HOSTS
  return hosts.some((h) => h.toLowerCase() === host)
}
