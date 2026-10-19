/**
 * Rapprochement des noms d'organisations et de membres saisis à la main (KoboCollect, formulaires).
 *
 * Les mêmes noms arrivent sous plusieurs graphies : accents (Kpèlèwouaï / KPELEWAÏ), transcriptions
 * locales (« ou » / « w »), lettres doublées, mots génériques (« Coopérative », « de », « SCOOPS »),
 * prénom et nom inversés. On compare une forme « pliée » de chaque mot, mot à mot, avec une
 * distance d'édition : un nom court contenu dans un nom long (« Kpelouwai » dans « Espoir de
 * Kpelewaï ») est reconnu, deux villages différents (« Espoir de Kara » / « Espoir de Kpalimé ») non.
 */

/** Mots qui ne distinguent pas une organisation d'une autre. */
const ORG_STOPWORDS = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'l',
  'd',
  'et',
  'a',
  'au',
  'aux',
  'en',
  'cooperative',
  'cooperatives',
  'coop',
  'coopec',
  'scoop',
  'scoops',
  'sca',
  'scaa',
  'ca',
  'societe',
  'ste',
  'simplifiee',
  'simplifie',
  'groupement',
  'gpt',
  'gie',
  'association',
  'asso',
])

/** Repli phonétique d'un mot : même valeur pour les graphies courantes d'un même son. */
export function foldWord(word: string): string {
  let w = word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  w = w
    .replace(/ph/g, 'f')
    .replace(/qu/g, 'k')
    .replace(/c(?=[aou]|$)/g, 'k')
    .replace(/ck/g, 'k')
    .replace(/ou/g, 'w')
    .replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1')
  if (w.length > 3) w = w.replace(/e$/, '')
  return w
}

function tokens(name: string, stopwords: Set<string> | null): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !stopwords?.has(t))
    .map(foldWord)
    .filter(Boolean)
}

/** Distance de Levenshtein (petites chaînes : noms de lieux et de personnes). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Ressemblance de 0 (rien à voir) à 1 (identique). */
export function ratio(a: string, b: string): number {
  const len = Math.max(a.length, b.length)
  return len === 0 ? 1 : 1 - levenshtein(a, b) / len
}

/** Chaque mot de `small` retrouve-t-il un mot proche dans `large` ? Moyenne des meilleures paires. */
function containment(small: string[], large: string[]): number {
  if (small.length === 0 || large.length === 0) return 0
  let total = 0
  for (const s of small) {
    const best = Math.max(...large.map((l) => ratio(s, l)))
    if (best < 0.8) return 0
    total += best
  }
  return total / small.length
}

function tokenSimilarity(ta: string[], tb: string[]): number {
  if (ta.length === 0 || tb.length === 0) return 0
  // Mots communs (« Union Régionale », « COOPEMA ») : seuls les mots qui restent départagent.
  const shared = ta.filter((t) => tb.includes(t))
  if (shared.length > 0) {
    const ra = ta.filter((t) => !shared.includes(t))
    const rb = tb.filter((t) => !shared.includes(t))
    if (ra.length === 0 && rb.length === 0) return 1
    if (ra.length > 0 && rb.length > 0) return tokenSimilarity(ra, rb)
    // L'un est inclus dans l'autre (« COOPEMA » / « COOPEMA Kara ») : proche, sans certitude.
    return 0.75
  }
  const whole = ratio(ta.join(''), tb.join(''))
  const sorted = ratio([...ta].sort().join(''), [...tb].sort().join(''))
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  // Un nom réduit à un mot très court (« Ika ») ne suffit pas à affirmer une inclusion.
  const contained =
    small.join('').length >= 5
      ? containment(small, large) * (small.length === large.length ? 1 : 0.95)
      : 0
  return Math.max(whole, sorted, contained)
}

/** Ressemblance entre deux noms d'organisation. */
export function organizationSimilarity(a: string, b: string): number {
  return tokenSimilarity(tokens(a, ORG_STOPWORDS), tokens(b, ORG_STOPWORDS))
}

/** Seuils : au-dessus de MATCH on rattache sans créer ; entre REVIEW et MATCH on signale. */
export const ORG_MATCH = 0.8
export const ORG_REVIEW = 0.65

export function bestOrganizationMatch<T extends { name: string }>(
  name: string,
  candidates: T[],
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null
  for (const c of candidates) {
    const score = organizationSimilarity(name, c.name)
    if (!best || score > best.score) best = { item: c, score }
  }
  return best
}

/** Téléphone réduit à ses 8 derniers chiffres (numéros togolais, avec ou sans +228). */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? digits.slice(-8) : null
}

export interface PersonLike {
  first_name: string | null
  last_name: string | null
  phone?: string | null
  date_of_birth?: string | null
}

/** Ressemblance entre deux noms de personne, quel que soit l'ordre prénom / nom. */
export function personNameSimilarity(a: PersonLike, b: PersonLike): number {
  const ta = tokens(`${a.first_name ?? ''} ${a.last_name ?? ''}`, null)
  const tb = tokens(`${b.first_name ?? ''} ${b.last_name ?? ''}`, null)
  return tokenSimilarity(ta, tb)
}

/**
 * Même personne ? Même téléphone et nom proche, ou nom quasi identique et même date de naissance.
 * Deux personnes d'une même famille partagent parfois un téléphone : le nom doit aussi concorder.
 */
export function samePerson(a: PersonLike, b: PersonLike): { same: boolean; score: number } {
  const name = personNameSimilarity(a, b)
  const pa = phoneKey(a.phone)
  const samePhone = pa !== null && pa === phoneKey(b.phone)
  const sameBirth = !!a.date_of_birth && a.date_of_birth === b.date_of_birth
  if (samePhone && name >= 0.75) return { same: true, score: name }
  if (sameBirth && name >= 0.9) return { same: true, score: name }
  if (name >= 0.97 && (samePhone || sameBirth || (!pa && !phoneKey(b.phone)))) {
    return { same: true, score: name }
  }
  return { same: false, score: name }
}

/** Clé de regroupement d'un nom de personne, indépendante de l'ordre prénom / nom. */
export function personKey(p: PersonLike): string {
  return tokens(`${p.first_name ?? ''} ${p.last_name ?? ''}`, null)
    .sort()
    .join(' ')
}
