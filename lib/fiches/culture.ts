/**
 * Culture d'une fiche : comparée sans accent ni casse. Le référentiel
 * (`cultures.name`) écrit « Mais », un vendeur tape « Maïs » : les deux doivent
 * désigner la même culture, à l'enregistrement comme dans le filtre acheteur.
 * Fonctions pures, sans `server-only`.
 */

/** Clé de comparaison : minuscules, sans diacritique, espaces resserrés. */
export function normalizeCulture(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nom du référentiel qui correspond à la saisie, ou null si aucun. */
export function matchCulture(input: string, referential: readonly string[]): string | null {
  const key = normalizeCulture(input)
  if (!key) return null
  return referential.find((name) => normalizeCulture(name) === key) ?? null
}

const ACCENT_CLASSES: Record<string, string> = {
  a: '[aàâäáã]',
  c: '[cç]',
  e: '[eéèêë]',
  i: '[iîïíì]',
  o: '[oôöóòõ]',
  u: '[uùûüú]',
  y: '[yÿý]',
}

/**
 * Expression régulière ANCRÉE, insensible aux accents, pour l'opérateur
 * PostgREST `imatch` (~* : la casse est déjà ignorée). Chaque voyelle devient
 * une classe d'accents ; tout autre caractère spécial est échappé, si bien
 * qu'une saisie ne peut jamais injecter de motif.
 *   « Mais » → ^m[aàâäáã][iîïíì]s$  (trouve « Maïs »)
 */
export function accentInsensitivePattern(input: string): string {
  const base = normalizeCulture(input)
  let out = ''
  for (const ch of base) {
    if (ACCENT_CLASSES[ch]) out += ACCENT_CLASSES[ch]
    else if (ch === ' ') out += '\\s+'
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return `^${out}$`
}

/** Longueur utile d'une recherche de la boutique ; au-delà, le texte est coupé (pas refusé). */
export const SEARCH_MAX = 100

/**
 * Texte cherché dans la boutique → motif ILIKE sûr dans un filtre `or` de
 * PostgREST (GET /api/fiches/public). Jokers `%` `_` `\` échappés ; les
 * séparateurs réservés `,` `(` `)` `[` `]` `"` deviennent `_` (un caractère
 * quelconque) au lieu d'être retirés : « Maïs, 1 hectare » retrouve le titre
 * qui porte ses virgules. Coupé à SEARCH_MAX caractères.
 */
export function searchLikePattern(q: string): string {
  const text = q.trim().slice(0, SEARCH_MAX)
  return `%${text.replace(/[%_\\]/g, '\\$&').replace(/[,()[\]"]/g, '_')}%`
}

/** Sous-ensemble du client Supabase utilisé pour lire le référentiel. */
export interface CultureReader {
  from(table: 'cultures'): {
    select(columns: 'name'): PromiseLike<{
      data: Array<{ name: string }> | null
      error: { message: string } | null
    }>
  }
}

export type CultureResolution =
  | { ok: true; name: string; checked: boolean }
  | { ok: false; error: string }

/**
 * Culture saisie → nom exact du référentiel (`cultures.name`). Inconnue → refus.
 * Référentiel illisible (panne) → la saisie est gardée telle quelle
 * (`checked: false`) : un incident de lecture ne bloque pas une publication.
 */
export async function resolveCulture(
  client: CultureReader,
  input: string,
): Promise<CultureResolution> {
  const { data, error } = await client.from('cultures').select('name')
  if (error || !data) return { ok: true, name: input.trim(), checked: false }
  const name = matchCulture(
    input,
    data.map((c) => c.name),
  )
  return name
    ? { ok: true, name, checked: true }
    : { ok: false, error: `Culture inconnue : « ${input.trim()} ». Choisissez-la dans la liste.` }
}
