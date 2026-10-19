/**
 * Cibles autorisées des correspondances de champs (kobo_field_mappings) — logique PURE et sûre
 * pour le navigateur (aucun import Node) : partagée par le validateur, le pipeline et l'éditeur.
 *
 * Ce que le pipeline APPLIQUE réellement :
 *   - le champ marqué « Clé » : colonne `card_number` (numéro de carte) ou `phone` (téléphone) ;
 *   - les colonnes de la fiche `members` ci-dessous, qui remplacent le champ par défaut.
 * Ce qu'il n'applique PAS, et que la configuration refuse donc au lieu de le promettre :
 *   - parcelles (S5) et productions (S6) : lues du formulaire standard, avec leur propre logique ;
 *   - cotisations (S4) : le formulaire ne déclare ni date ni preuve de paiement.
 */

/** Colonnes de `members` qu'une correspondance de champs peut alimenter. */
export const MEMBER_MAPPABLE_COLUMNS = [
  'first_name',
  'last_name',
  'phone',
  'email',
  'region',
  'prefecture',
  'canton',
  'village',
  'date_of_birth',
  'faitiere',
] as const
export type MemberMappableColumn = (typeof MEMBER_MAPPABLE_COLUMNS)[number]

/** Colonnes qui font d'un champ la CLÉ de rapprochement du membre. */
export const KEY_TARGET_COLUMNS = ['card_number', 'phone'] as const

/** null si la cible est prise en charge, sinon le motif (français) du refus. */
export function mappingTargetError(
  table: string,
  column: string,
  isKeyField: boolean,
): string | null {
  const col = column.trim().toLowerCase()
  if (table === 'cotisations') {
    return 'Les cotisations (bloc S4) ne sont pas prises en charge : le formulaire ne déclare ni date ni preuve de paiement.'
  }
  if (table !== 'members') {
    return `Les ${table} ne sont pas alimentées par une correspondance : parcelles (S5) et productions (S6) sont lues du formulaire standard.`
  }
  if (isKeyField) {
    return (KEY_TARGET_COLUMNS as readonly string[]).includes(col)
      ? null
      : 'Le champ clé doit viser « card_number » (numéro de carte) ou « phone » (téléphone).'
  }
  return (MEMBER_MAPPABLE_COLUMNS as readonly string[]).includes(col)
    ? null
    : `Colonne « ${column} » non prise en charge. Colonnes possibles : ${MEMBER_MAPPABLE_COLUMNS.join(', ')}.`
}
