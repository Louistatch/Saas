# AgriAcademy Next-Gen : état des jalons

Référence : `docs/agriacademy-next-gen-prompt.md` (prompt maître fourni le 14 octobre 2026).
Audit de départ : `investor-readiness/technical-audit-parcours-operateur.md`. Mis à jour à
chaque jalon livré ; rien n'est fusionné ni déployé sans accord explicite.

## Analyse d'écart (J0) : état des constats de l'audit après PR #37

| Constat | État | Preuve |
|---|---|---|
| C1 progression jamais écrite | **Corrigé** (PR #37, `main` 5d42466) | `lib/academy/operator-training.ts` : `recordLessonOpened`, `evaluateLessonCompletion` ; politique dans `lib/academy/completion-policy.ts` (4 tests) |
| C2 pas de fin de formation automatique | **Corrigé** (PR #37) | `lib/academy/operator-completion.ts` : `settleOperatorTraining` → `markPartnerTrainingCompleted`, e-mails une seule fois ; `candidate` → `training` à la première leçon |
| E1 devoirs non corrigeables | Ouvert | règle provisoire « déposé » ; correction à livrer (J2) |
| E2 seuil 70 % = sans-faute | Ouvert | 3 questions à 1 point, `passing_score 70` (J2) |
| E3 12 captures manquantes | Ouvert | `academy_media_assets` tous `pending_capture` (J4) |
| E4 texte long non affiché | Ouvert | `content_body` jamais rendu (J3/J4) |
| M1 quiz vide | **Partiel** : envoi refusé sans réponse (PR #37) ; explications toujours absentes (J2) | `quiz-form.tsx` |
| M2 espace opérateur trompeur | **Corrigé** : compteur « x / 12 », statuts réels (PR #37) | `components/operator/journey.tsx` |
| M3 limites par IP | Ouvert (J1 sécurité, à faire) | `register/route.ts:31`, `attempts/route.ts:16` |
| M4 pas d'entrée vers la candidature | Ouvert (J3) | |
| M5 dossier suspendu garde l'accès | Ouvert (J1 sécurité, à faire) | `assert-partner-access.ts` |
| M6 super_admin compté comme candidat | **Corrigé** : écritures refusées en supervision (PR #37) | routes `attempts`, `submissions`, `progress` |
| F1 à F5 | Ouverts | |

Vérification restante de J1 : parcours complet contre une base (ouvrir → quiz → dépôt × 12 →
`exam_pending` → e-mails), sur une branche Supabase ou un compte de test. Marche à suivre dans
`docs/academy-progression-c1-c2.md`.

## Jalons

| Jalon | Contenu (prompt §23) | État |
|---|---|---|
| J0 | Lire l'audit, vérifier `main`, documenter l'état | Fait (ce document) |
| J1 | Progression, règles de validation serveur, transitions, notification admin, sécurité | Fait sauf M3 et M5 |
| J2 | Moteur d'évaluation : quiz, tentatives, seuils, explications, devoirs, correction | À faire |
| J3 | Interface premium : tableau de bord, lecteur de cours, navigation, mobile, mouvement | À faire, spécification d'écrans à soumettre avant code |
| J4 | Contenu : texte long, captures authentiques, schémas, objectifs | À faire |
| J5 | Laboratoire 3D pilote (inscription d'un producteur ou carte membre) | À faire, après J1 à J4 |
| J6 | Gestion de la formation côté admin | À faire |
| J7 | Validation : tests unitaires, intégration, navigateur, sécurité, mobile, accessibilité | Continu |
| J8 | Préparation de mise en production | À faire |

## Décisions en attente de l'utilisateur

1. Politique de validation d'une leçon : cas pratique **déposé** (en vigueur) ou **approuvé** par un
   correcteur (dès que J2 livre la correction).
2. Seuil des quiz (E2) : 5 questions avec seuil 70 %, ou 3 questions avec seuil 60 %, ou crédit
   partiel documenté.
3. Ordre entre J2 et J3 : le prompt demande J2 avant toute refonte visuelle ; confirmer.
