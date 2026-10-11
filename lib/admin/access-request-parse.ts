// Lecture d'une demande d'accès enregistrée par /api/access-request (texte « Clé : valeur »).
export interface ParsedAccessRequest {
  type: string | null
  organization: string | null
  contact: string | null
  phone: string | null
  existingUserId: string | null
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function parseAccessRequest(message: string | null): ParsedAccessRequest {
  const field = (label: string) => {
    const line = (message ?? '').split('\n').find((l) => l.startsWith(`${label} :`))
    const value = line?.slice(label.length + 2).trim()
    return value ? value : null
  }
  return {
    type: field('Type'),
    organization: field('Organisation'),
    contact: field('Contact'),
    phone: field('Téléphone'),
    existingUserId: field('Compte existant à promouvoir')?.match(UUID)?.[0] ?? null,
  }
}

/** Adresse technique posée quand le demandeur n'a donné qu'un téléphone : pas d'e-mail réel. */
export function isPlaceholderEmail(email: string | null): boolean {
  return !email || email.endsWith('@demande.faitierehub.com')
}
