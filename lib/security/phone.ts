/**
 * Numéros de téléphone : normalisation vers le format E.164 attendu par
 * Africa's Talking (`+22892548838`).
 *
 * Trois formats coexistent dans `members.phone` aujourd'hui, mesurés sur la base :
 *   - `92548838`           8 chiffres, SANS indicatif   (5 membres)
 *   - `+228 92 54 88 38`   avec espaces                 (5 membres)
 *   - `+22892548838`       compact                      (4 membres)
 * Le fournisseur refuse les deux premiers tels quels. Sans normalisation, 5
 * membres sur 14 n'auraient JAMAIS reçu leur code, et sans la moindre erreur
 * visible côté producteur : le SMS est simplement refusé en amont.
 *
 * Aucun import serveur ici : ces fonctions sont pures et testables seules.
 */

/** Indicatif et longueur nationale du Togo : 8 chiffres après +228. */
const TOGO_PREFIX = '+228'
const TOGO_NATIONAL_LENGTH = 8

/**
 * Renvoie le numéro en E.164, ou `null` s'il n'est pas exploitable.
 *
 * Règles, dans l'ordre :
 *  - espaces, points, tirets et parenthèses sont ignorés ;
 *  - `00` en tête vaut `+` (« 00228… ») ;
 *  - 8 chiffres nus sont un numéro togolais ;
 *  - `228` suivi de 8 chiffres est un numéro togolais sans le `+` ;
 *  - un numéro déjà en `+` est accepté s'il a une longueur E.164 plausible
 *    (un membre peut être joignable au Bénin ou au Ghana voisins).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let value = raw.trim().replace(/[\s.\-()]/g, '')
  if (!value) return null

  if (value.startsWith('00')) value = `+${value.slice(2)}`

  if (value.startsWith('+')) {
    return /^\+\d{8,15}$/.test(value) ? value : null
  }

  if (!/^\d+$/.test(value)) return null
  if (value.length === TOGO_NATIONAL_LENGTH) return `${TOGO_PREFIX}${value}`
  if (value.startsWith('228') && value.length === 3 + TOGO_NATIONAL_LENGTH) return `+${value}`
  return null
}
