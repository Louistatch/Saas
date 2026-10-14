# AgriAcademy Next-Gen : état des jalons

Référence : `docs/agriacademy-next-gen-prompt.md` (prompt maître fourni le 14 octobre 2026).
Audit de départ : `investor-readiness/technical-audit-parcours-operateur.md`. Mis à jour à
chaque jalon livré ; rien n'est fusionné ni déployé sans accord explicite.

## Analyse d'écart (J0) : état des constats de l'audit après PR #37

| Constat | État | Preuve |
|---|---|---|
| C1 progression jamais écrite | **Corrigé** (PR #37, `main` 5d42466) | `lib/academy/operator-training.ts` : `recordLessonOpened`, `evaluateLessonCompletion` ; politique dans `lib/academy/completion-policy.ts` (4 tests) |
| C2 pas de fin de formation automatique | **Corrigé** (PR #37) | `lib/academy/operator-completion.ts` : `settleOperatorTraining` → `markPartnerTrainingCompleted`, e-mails une seule fois ; `candidate` → `training` à la première leçon |
| E1 devoirs non corrigeables | **Corrigé** (J2) | `lib/academy/assignment-review.ts`, `/admin/partners/training/corrections`, retour et reprise côté candidat |
| E2 seuil 70 % = sans-faute | **Corrigé** (J2, migration à appliquer) | crédit partiel documenté (`assessment-policy.ts`), 5 questions par quiz (`20261014_150000_academy_quiz_v2_questions.sql`), 3 tentatives par 24 h |
| E3 12 captures manquantes | Ouvert | `academy_media_assets` tous `pending_capture` (J4) |
| E4 texte long non affiché | Ouvert | `content_body` jamais rendu (J3/J4) |
| M1 quiz vide | **Corrigé** (J2) : une question à la fois, confirmation, explications et bonnes réponses après correction | `quiz-form.tsx` |
| M2 espace opérateur trompeur | **Corrigé** : compteur « x / 12 », statuts réels (PR #37) | `components/operator/journey.tsx` |
| M3 limites par IP | Ouvert (J1 sécurité, à faire) | `register/route.ts:31`, `attempts/route.ts:16` |
| M4 pas d'entrée vers la candidature | Ouvert (J3) | |
| M5 dossier suspendu garde l'accès | Ouvert (J1 sécurité, à faire) | `assert-partner-access.ts` |
| M6 super_admin compté comme candidat | **Corrigé** (PR #37) | routes `attempts`, `submissions`, `progress` |
| F1 ordre aléatoire, limite de tentatives | **Corrigé** (J2) : ordre stable par personne, limite appliquée côté serveur | `assessment-policy.ts` |
| F2 questions ouvertes comptées à 0 | **Corrigé** (J2) : hors total, « en attente » | `gradeQuestion` |
| F3 tarifs figés dans les questions | Ouvert | |
| F4 droits de table trop larges | Ouvert | |
| F5 aucun test sur la formation | **Partiel** : 12 tests unitaires sur les règles ; parcours en base non testé | `tests/academy-*.test.ts` |

Vérification restante de J1 : parcours complet contre une base (ouvrir → quiz → dépôt × 12 →
`exam_pending` → e-mails), sur une branche Supabase ou un compte de test. Marche à suivre dans
`docs/academy-progression-c1-c2.md`.

## Jalons

| Jalon | Contenu (prompt §23) | État |
|---|---|---|
| J0 | Lire l'audit, vérifier `main`, documenter l'état | Fait (ce document) |
| J1 | Progression, règles de validation serveur, transitions, notification admin, sécurité | Fait sauf M3 et M5 |
| J2 | Moteur d'évaluation : quiz, tentatives, seuils, explications, devoirs, correction | Fait (branche `feat/academy-j2-evaluation`) ; migration de contenu à appliquer après fusion |
| J3 | Interface premium : tableau de bord, lecteur de cours, navigation, mobile, mouvement | À faire, spécification d'écrans à soumettre avant code |
| J4 | Contenu : texte long, captures authentiques, schémas, objectifs | À faire |
| J5 | Laboratoire 3D pilote (inscription d'un producteur ou carte membre) | À faire, après J1 à J4 |
| J6 | Gestion de la formation côté admin | Entamé : file de correction ; fiche candidat et alertes à faire |
| J7 | Validation : tests unitaires, intégration, navigateur, sécurité, mobile, accessibilité | Continu |
| J8 | Préparation de mise en production | À faire |

## Décisions prises (14 octobre 2026, à la demande de l'utilisateur : « des décisions intelligentes et stratégiques »)

1. **Validation d'une leçon : cas pratique déposé, pas approuvé.** La correction existe désormais
   mais ne bloque pas la progression : avec deux candidats et une évaluation pratique déjà
   décidée par l'administration, bloquer douze leçons par candidat sur une file de correction
   ralentirait le parcours sans rien sécuriser. La note et le commentaire nourrissent l'évaluation
   pratique ; une reprise demandée produit un nouveau dépôt. Une ligne à changer si l'on veut
   l'inverse (`completion-policy.ts`).
2. **Quiz : 5 questions à 1 point, seuil inchangé à 70 % (donc 4 bonnes réponses), crédit partiel
   sur les choix multiples avec la règle « (bonnes cochées − mauvaises cochées) / bonnes », 3
   tentatives par 24 h, explications après chaque tentative, ordre stable par personne.** Plus
   exigeant que 3 questions à 60 %, sans être un sans-faute ; les 24 questions nouvelles sont
   tirées du texte long des leçons, avec de vrais distracteurs. La migration est additive et
   idempotente (vérifiée deux fois sur PGlite) ; **elle n'est pas appliquée en production** tant
   que la PR n'est pas fusionnée et son application autorisée.
3. **Ordre : J2 avant J3**, comme le prompt le demande. J3 commencera par une spécification
   d'écrans à soumettre avant le code.
