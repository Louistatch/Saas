/**
 * Garde SSRF côté serveur : un serveur Kobo « personnalisé » est un nom de domaine
 * public (voir server-url.ts), mais rien n'empêche ce nom de pointer vers une
 * adresse interne (127.0.0.1, 169.254.169.254, réseau privé…). On résout donc le
 * nom avant le premier appel et on refuse si UNE des adresses est privée.
 *
 * Limite connue : la résolution est faite avant la connexion de fetch (fenêtre de
 * « DNS rebinding » théorique). La redirection est par ailleurs désactivée dans
 * api-client.ts, ce qui supprime la voie de contournement la plus simple.
 *
 * Les serveurs publics connus (kf/eu.kobotoolbox.org) sont dispensés du contrôle.
 */
import { lookup } from 'node:dns/promises'
import { KoboApiError } from './api-client'
import { isKoboPresetOrigin, isPrivateIp } from './server-url'

export type DnsResolver = (host: string) => Promise<Array<{ address: string }>>

const defaultResolver: DnsResolver = (host) => lookup(host, { all: true, verbatim: true })

/** Renvoie la fonction de contrôle à passer à KoboApiClient({ hostGuard }). */
export function createKoboHostGuard(
  serverUrl: string,
  resolver: DnsResolver = defaultResolver,
): ((host: string) => Promise<void>) | undefined {
  if (isKoboPresetOrigin(serverUrl)) return undefined
  return async (host: string) => {
    let addresses: Array<{ address: string }>
    try {
      addresses = await resolver(host)
    } catch {
      throw new KoboApiError(
        'network',
        `Serveur ${host} introuvable : vérifiez l'adresse du serveur KoboToolbox.`,
      )
    }
    if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
      throw new KoboApiError(
        'unsafe_host',
        'Adresse de serveur refusée : le nom de domaine pointe vers un réseau interne ou privé.',
      )
    }
  }
}
