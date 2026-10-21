/**
 * Modèle PAYG de FaîtièreHub — règles pures, testables sans base (tests/payg-model.test.ts).
 *
 * Les prix font foi dans `billing_rules` (migration 20261021_100000_payg_operators.sql) ; les
 * valeurs ci-dessous servent à l'affichage quand la base n'est pas lue (pages publiques) et
 * aux contrôles de cohérence. Une carte commerciale = un crédit = une commission de 250 FCFA.
 */

export const CARD_COMMISSION_FCFA = 250
export const WELCOME_CREDITS = 10
export const MIN_PURCHASE_CREDITS = 20
export const TRAINING_FEE_FCFA = 15_000
export const TRAINING_INSTALLMENT_FCFA = 3_000
export const TRAINING_INSTALLMENTS = TRAINING_FEE_FCFA / TRAINING_INSTALLMENT_FCFA

/** Prix indicatifs d'une carte au producteur : fixés par l'opérateur, commission comprise. */
export const INDICATIVE_CARD_PRICES = [
  { format: 'plastified', label: 'Plastifiée', priceFcfa: 1_200 },
  { format: 'pvc', label: 'PVC', priceFcfa: 2_500 },
] as const

export const CREDIT_PACKS = [
  { code: 'credit_pack_20', credits: 20, priceFcfa: 5_000 },
  { code: 'credit_pack_40', credits: 40, priceFcfa: 10_000 },
  { code: 'credit_pack_100', credits: 100, priceFcfa: 25_000 },
] as const

export type CreditPackCode = (typeof CREDIT_PACKS)[number]['code']
export type CardFormat = 'digital' | 'plastified' | 'pvc'
export type IssueMode = 'commercial' | 'free_allowance'
export type OperatorKind = 'individual' | 'institutional'
export type MembershipRole = 'owner' | 'manager' | 'agent'

export function packByCode(code: string) {
  return CREDIT_PACKS.find((p) => p.code === code) ?? null
}

/** Un pack vaut toujours ses crédits au prix de la commission : jamais de remise cachée. */
export function packIsCoherent(credits: number, priceFcfa: number, commissionFcfa: number) {
  return credits >= MIN_PURCHASE_CREDITS && priceFcfa === credits * commissionFcfa
}

export function formatFcfa(amount: number) {
  return `${new Intl.NumberFormat('fr-FR').format(amount).replace(/ | /g, ' ')} FCFA`
}

/** Montant de formation accepté : un multiple de la tranche, jamais plus que le reste dû. */
export function trainingAmountError(
  amount: number,
  remaining: number,
  installment = TRAINING_INSTALLMENT_FCFA,
): string | null {
  if (remaining <= 0) return 'La formation est déjà réglée.'
  if (!Number.isInteger(amount) || amount <= 0) return 'Montant invalide.'
  if (amount % installment !== 0)
    return `Le montant doit être un multiple de ${formatFcfa(installment)}.`
  if (amount > remaining) return `Il reste ${formatFcfa(remaining)} à régler.`
  return null
}

/** Choix proposés : une tranche, plusieurs tranches, ou le solde. */
export function trainingChoices(remaining: number, installment = TRAINING_INSTALLMENT_FCFA) {
  if (remaining <= 0) return []
  const steps = remaining / installment
  const choices = [{ amount: installment, label: `Payer une tranche (${formatFcfa(installment)})` }]
  if (steps > 1)
    choices.push({ amount: remaining, label: `Payer le solde (${formatFcfa(remaining)})` })
  return choices
}

const RANK: Record<MembershipRole, number> = { agent: 0, manager: 1, owner: 2 }

export function roleAtLeast(role: MembershipRole, min: MembershipRole) {
  return RANK[role] >= RANK[min]
}

/** Ce qu'un compte peut faire au titre d'un opérateur. */
export function capabilities(kind: OperatorKind, role: MembershipRole) {
  const manager = roleAtLeast(role, 'manager')
  return {
    issueCards: true,
    printCards: true,
    seeWallet: true,
    recharge: manager,
    seeLedger: manager,
    manageAgents: kind === 'institutional' && manager,
    exportReports: manager,
    orderFaitierehubPrint: manager,
  }
}

/**
 * Réponses de payg_issue_member_card() (et des autres fonctions PAYG) → statut HTTP et phrase
 * pour l'opérateur. Une seule source pour l'API et l'interface.
 */
export const OUTCOMES: Record<string, { status: number; message: string }> = {
  issued: { status: 200, message: 'Carte émise.' },
  already_issued: { status: 200, message: 'Cette carte a déjà été émise (aucun nouveau débit).' },
  insufficient_credits: {
    status: 402,
    message: 'Crédits épuisés : rechargez le portefeuille (20 crédits minimum) pour émettre.',
  },
  already_has_card: {
    status: 409,
    message: 'Ce producteur a déjà une carte active : aucun crédit n’a été pris.',
  },
  card_number_taken: { status: 409, message: 'Numéro de carte déjà pris, réessayez.' },
  free_allowance_exhausted: {
    status: 409,
    message:
      'Les 10 cartes numériques gratuites de cette coopérative sont utilisées : émettez une carte commerciale (1 crédit).',
  },
  forbidden: {
    status: 403,
    message:
      'Vous n’êtes pas autorisé à émettre pour ce producteur (coopérative non confiée, certification ou mandat manquant).',
  },
  partner_not_active: {
    status: 403,
    message: 'Votre compte opérateur n’est pas encore actif : l’équipe FaîtièreHub doit l’activer.',
  },
  member_not_found: { status: 404, message: 'Producteur introuvable.' },
  partner_not_found: { status: 404, message: 'Opérateur introuvable.' },
  key_reused: {
    status: 409,
    message: 'Requête en double avec d’autres données : rechargez la page.',
  },
  no_active_rule: { status: 503, message: 'Tarif indisponible : contactez FaîtièreHub.' },
  no_wallet: { status: 503, message: 'Portefeuille introuvable : contactez FaîtièreHub.' },
  invalid_mode: { status: 400, message: 'Type de carte invalide.' },
  invalid_key: { status: 400, message: 'Requête invalide.' },
  invalid_format: { status: 400, message: 'Format de carte invalide.' },
  conflict: { status: 409, message: 'Conflit d’écriture : réessayez.' },
}

export function outcomeOf(outcome: string) {
  return OUTCOMES[outcome] ?? { status: 500, message: 'Opération impossible.' }
}

/** CSV lisible par Excel (séparateur « ; », BOM UTF-8, guillemets échappés). */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return `﻿${[headers, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`
}

export const CARD_FORMAT_LABEL: Record<CardFormat, string> = {
  digital: 'Numérique',
  plastified: 'Plastifiée',
  pvc: 'PVC',
}

export const ACTIVITY_LABEL: Record<string, string> = {
  'card.issued': 'Carte émise',
  'card.released': 'Carte annulée, crédit rendu',
  'card.printed': 'Carte imprimée',
  'members.viewed': 'Producteurs consultés',
  'credits.welcome': 'Crédits offerts',
  'credits.purchased': 'Crédits achetés',
  'training.paid': 'Formation payée',
  'agent.invited': 'Agent invité',
  'agent.joined': 'Agent inscrit',
  'agent.revoked': 'Agent retiré',
  'agent.cooperative_assigned': 'Coopérative confiée',
  'agent.cooperative_revoked': 'Coopérative retirée',
  'print_order.created': 'Commande FaîtièreHub Print',
  'rectification.created': 'Demande de rectification',
}
