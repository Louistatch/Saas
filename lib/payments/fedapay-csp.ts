/**
 * Contrôle FEDAPAY-1 (scripts/pre-deploy-security-check.ts) : aucune directive `frame-src`
 * de la CSP n'autorise un cadre FedaPay — le paiement ne sort jamais du site.
 *
 * La directive est capturée ENTIÈRE, guillemets compris (« "frame-src 'self' … " ») : elle
 * contient elle-même des apostrophes ('self'), où s'arrêtait l'ancienne expression, qui ne
 * voyait donc jamais FedaPay. Aucune directive trouvée = échec (contrôle aveugle). Pur.
 */
export interface FrameSrcCheck {
  pass: boolean
  directives: string[]
  detail: string
}

const FRAME_SRC_RE = /"frame-src[^"]*"|`frame-src[^`]*`/g

export function frameSrcDirectives(config: string): string[] {
  return [...config.matchAll(FRAME_SRC_RE)].map((m) => m[0])
}

export function checkNoFedapayFrame(config: string): FrameSrcCheck {
  const directives = frameSrcDirectives(config)
  if (directives.length === 0)
    return {
      pass: false,
      directives,
      detail: 'Aucune directive frame-src trouvée dans next.config.mjs : contrôle impossible',
    }
  const withFedapay = directives.filter((d) => /fedapay/i.test(d))
  if (withFedapay.length > 0)
    return {
      pass: false,
      directives,
      detail: `Retirer FedaPay de frame-src dans next.config.mjs (${withFedapay.join(' ; ')}) : le paiement ne sort jamais du site`,
    }
  return { pass: true, directives, detail: '' }
}
