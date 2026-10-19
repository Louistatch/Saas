/**
 * Numéro Mobile Money de l'acheteur, normalisé AVANT tout enregistrement ou
 * appel à FedaPay. Fonctions pures, partagées par la route d'achat et les tests.
 *
 *   - Togo (+228) : 8 chiffres ;
 *   - Bénin (+229) : 8 chiffres (ancien plan) ou 10 chiffres commençant par
 *     « 01 » (plan en vigueur depuis le 30/11/2024 : « 01 » + l'ancien numéro).
 *
 * Espaces, tirets, points, parenthèses, « + » / « 00 » et indicatif du pays
 * sont retirés. Renvoie le numéro national (chiffres seuls), tel que saisi,
 * ou null s'il est invalide : rien n'est alors enregistré ni envoyé à
 * l'opérateur. C'est ce numéro-là qui part chez FedaPay.
 */
export function normalizeMobileMoneyPhone(country: 'tg' | 'bj', raw: string): string | null {
  let s = String(raw ?? '')
    .trim()
    .replace(/[\s\-.()]/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  else if (s.startsWith('00')) s = s.slice(2)
  if (!/^\d+$/.test(s)) return null

  const prefix = country === 'bj' ? '229' : '228'
  const lengths = country === 'bj' ? [8, 10] : [8]
  if (s.startsWith(prefix) && lengths.includes(s.length - prefix.length)) s = s.slice(prefix.length)
  if (!lengths.includes(s.length)) return null
  // Bénin à 10 chiffres : toujours « 01 » suivi de l'ancien numéro.
  if (s.length === 10 && !s.startsWith('01')) return null
  return s
}

/**
 * Clé d'UNE ligne Mobile Money, au format international (E.164) :
 * « +22890123456 » au Togo, « +2290197000001 » au Bénin.
 *
 * C'est elle qui est enregistrée dans purchases.buyer_phone, et sur elle que
 * portent l'index unique purchases_one_pending_request_uidx, la reprise d'un
 * paiement, le refus d'un 2e paiement en cours et la limite par numéro
 * (POST /api/fiches/[id]/purchase). Donc :
 *   - le pays en fait partie : 97 00 00 03 au Togo et au Bénin sont deux
 *     lignes, deux acheteurs différents ;
 *   - au Bénin, l'ancienne écriture à 8 chiffres et la nouvelle à 10 chiffres
 *     d'une même ligne donnent la même clé (« 01 » ajouté) : une seule demande
 *     de paiement, quelle que soit l'écriture choisie dans chaque onglet.
 *
 * `national` : numéro renvoyé par normalizeMobileMoneyPhone pour ce pays.
 */
export function mobileMoneyPhoneKey(country: 'tg' | 'bj', national: string): string {
  if (country === 'bj') return `+229${national.length === 8 ? `01${national}` : national}`
  return `+228${national}`
}
