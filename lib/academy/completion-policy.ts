/**
 * Règle de validation d'une leçon et d'un module de formation — pure, sans accès à la base,
 * testée unitairement. Le serveur dérive l'état d'une leçon de ses preuves (tentatives de quiz
 * corrigées côté serveur, dépôts de devoir) ; jamais d'un `status` envoyé par le client.
 *
 * Politique en vigueur (jalon J1, à faire valider avant tout durcissement) :
 *   - quiz obligatoire → au moins une tentative réussie (score ≥ seuil du quiz) ;
 *   - devoir obligatoire → au moins un dépôt. La correction des devoirs n'existe pas encore
 *     (constat E1 de l'audit) : exiger un devoir approuvé bloquerait toute progression. Quand
 *     la correction existera, `assignmentApproved` remplacera `assignmentSubmitted` ici, et
 *     nulle part ailleurs.
 *   - leçon sans quiz ni devoir obligatoire → validée dès son ouverture.
 */

export interface LessonRequirements {
  /** Un quiz obligatoire existe pour la leçon. */
  quizRequired: boolean
  /** Un devoir obligatoire existe pour la leçon. */
  assignmentRequired: boolean
}

export interface LessonEvidence {
  /** Au moins une tentative dont `passed` est vrai (corrigée côté serveur). */
  quizPassed: boolean
  /** Au moins un dépôt de devoir enregistré. */
  assignmentSubmitted: boolean
}

export function isLessonCompleted(req: LessonRequirements, evidence: LessonEvidence): boolean {
  if (req.quizRequired && !evidence.quizPassed) return false
  if (req.assignmentRequired && !evidence.assignmentSubmitted) return false
  return true
}

/** Ce qui manque encore, dans l'ordre où la personne le fera ; vide quand la leçon est validée. */
export function missingForLesson(req: LessonRequirements, evidence: LessonEvidence): string[] {
  const missing: string[] = []
  if (req.quizRequired && !evidence.quizPassed) missing.push('quiz')
  if (req.assignmentRequired && !evidence.assignmentSubmitted) missing.push('assignment')
  return missing
}

/** Un module est terminé quand chacune de ses leçons est validée (toutes sont obligatoires). */
export function isModuleCompleted(lessonsCompleted: number, lessonsTotal: number): boolean {
  return lessonsTotal > 0 && lessonsCompleted >= lessonsTotal
}

/** Score en pourcentage entier, 0 quand le quiz n'a aucun point. */
export function percentScore(earned: number, total: number): number {
  return total > 0 ? Math.round((earned / total) * 100) : 0
}
