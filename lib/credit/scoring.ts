export interface CreditInput {
  atsScore: number
  membershipMonths: number
  cotisationsPaidPct: number
  parcellesCount: number
  totalSurfaceHa: number
  previousLoansRepaid: number
  previousLoansDefaulted: number
}

export interface CreditResult {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  maxLoanFcfa: number
  interestRatePct: number
  breakdown: {
    atsComponent: number
    seniorityComponent: number
    cotisationComponent: number
    parcelleComponent: number
    historyComponent: number
  }
  reasons: string[]
}

export function computeCreditScore(input: CreditInput): CreditResult {
  const atsComponent = Math.round((input.atsScore / 1000) * 35)
  const seniorityComponent = Math.round(Math.min(input.membershipMonths / 24, 1) * 20)
  const cotisationComponent = Math.round((input.cotisationsPaidPct / 100) * 25)
  const parcelleComponent = Math.round(Math.min(input.parcellesCount / 3, 1) * 10)
  const rawHistory = input.previousLoansDefaulted > 0
    ? Math.max(0, 10 - input.previousLoansDefaulted * 5)
    : input.previousLoansRepaid >= 1 ? 10 : 5
  const historyComponent = rawHistory

  const score = Math.min(100, atsComponent + seniorityComponent + cotisationComponent + parcelleComponent + historyComponent)

  const grade: 'A' | 'B' | 'C' | 'D' | 'F' =
    score >= 80 ? 'A' :
    score >= 65 ? 'B' :
    score >= 50 ? 'C' :
    score >= 35 ? 'D' : 'F'

  const maxLoanFcfa = grade === 'A' ? 500000 : grade === 'B' ? 300000 : grade === 'C' ? 150000 : grade === 'D' ? 75000 : 0
  const interestRatePct = grade === 'A' ? 6 : grade === 'B' ? 8 : grade === 'C' ? 10 : grade === 'D' ? 14 : 0

  const reasons: string[] = []
  if (input.atsScore >= 700) reasons.push('Score ATS excellent')
  else if (input.atsScore >= 400) reasons.push('Score ATS satisfaisant')
  else reasons.push('Score ATS faible — améliorer les cotisations et productions')
  if (input.cotisationsPaidPct >= 90) reasons.push('Excellente historique de paiement des cotisations')
  else if (input.cotisationsPaidPct < 60) reasons.push('Retards fréquents sur les cotisations')
  if (input.parcellesCount >= 2) reasons.push(`${input.parcellesCount} parcelles enregistrées`)
  if (input.previousLoansRepaid > 0) reasons.push(`${input.previousLoansRepaid} crédit(s) remboursé(s) avec succès`)
  if (input.previousLoansDefaulted > 0) reasons.push(`${input.previousLoansDefaulted} défaut(s) de paiement`)

  return {
    score,
    grade,
    maxLoanFcfa,
    interestRatePct,
    breakdown: { atsComponent, seniorityComponent, cotisationComponent, parcelleComponent, historyComponent },
    reasons,
  }
}
