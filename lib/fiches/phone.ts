/**
 * Numéro Mobile Money de l'acheteur, normalisé AVANT tout enregistrement ou
 * appel à FedaPay. Fonctions pures, partagées par la route d'achat, le client
 * FedaPay (lib/payments/fedapay.ts) et les tests.
 *
 *   - Togo (+228) : 8 chiffres, renvoyés tels quels ;
 *   - Bénin (+229) : forme nationale CANONIQUE à 10 chiffres, « 01 » + les
 *     8 chiffres de l'ancien plan (plan en vigueur depuis le 30/11/2024). Saisi
 *     à 8 chiffres, le numéro reçoit son « 01 » ; saisi à 10 chiffres, il doit
 *     commencer par « 01 » et reste inchangé.
 *
 * FedaPay attend les numéros béninois à 10 chiffres, en live comme en Sandbox
 * (confirmé par son support le 19/10/2026) : envoyés à 8 chiffres, même les
 * numéros de test du Sandbox (0164000001, 0166000001) étaient refusés.
 *
 * Espaces, tirets, points, parenthèses, « + » / « 00 » et indicatif du pays
 * sont retirés. Renvoie le numéro national canonique (chiffres seuls), ou null
 * s'il est invalide : rien n'est alors enregistré ni envoyé à l'opérateur.
 * C'est ce numéro-là, et lui seul, qui part chez FedaPay.
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
  // Bénin à 8 chiffres (ancien plan) : forme canonique à 10 chiffres.
  if (country === 'bj' && s.length === 8) return `01${s}`
  return s
}

/**
 * `phone_number` envoyé à FedaPay (client, transaction, demande de prélèvement) :
 * numéro national canonique et pays. Bénin toujours à 10 chiffres, Togo à 8.
 * null si le numéro est invalide.
 */
export function fedaPayPhoneNumber(
  country: 'tg' | 'bj',
  raw: string,
): { number: string; country: 'tg' | 'bj' } | null {
  const number = normalizeMobileMoneyPhone(country, raw)
  return number ? { number, country } : null
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
 *     de paiement, quelle que soit l'écriture choisie dans chaque onglet. C'est
 *     aussi exactement le numéro envoyé à FedaPay, précédé de +229.
 *
 * `national` : numéro renvoyé par normalizeMobileMoneyPhone pour ce pays (déjà
 * canonique ; un ancien numéro béninois à 8 chiffres reçoit quand même son « 01 »).
 */
export function mobileMoneyPhoneKey(country: 'tg' | 'bj', national: string): string {
  if (country === 'bj') return `+229${national.length === 8 ? `01${national}` : national}`
  return `+228${national}`
}
