// SSRF guard for Kobo attachment downloads: payload `_attachments[].download_url`
// is attacker-controllable (webhook body), and we fetch it with the Kobo API
// token. Only allow https URLs on known KoboToolbox hosts.

const ALLOWED_KOBO_HOSTS = new Set(['kf.kobotoolbox.org', 'kc.kobotoolbox.org'])

export function isAllowedKoboAttachmentUrl(rawUrl: unknown, extraHosts: string[] = []): boolean {
  if (typeof rawUrl !== 'string') return false
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return ALLOWED_KOBO_HOSTS.has(host) || extraHosts.some((h) => h.toLowerCase() === host)
}
