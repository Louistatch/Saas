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
| E3 12 captures manquantes | **Partiel** (J4) : 12 captures du produit avec données d'exemple, étiquetées ; captures de production à fournir | `public/academy/captures`, `lib/academy/media-catalogue.ts` |
| E4 texte long non affiché | **Corrigé** (J3) : section « Lire la leçon complète » | `components/academy/lesson-player.tsx` |
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
| J4 | Contenu : texte long, captures authentiques, schémas, objectifs | Fait (branche `feat/academy-j4-content`) : captures du produit (données d'exemple) pour 12 leçons, carte pédagogique, exemples de terrain, auto-vérifications ; captures de production à fournir (`docs/agriacademy-j4-captures.md`) ; schémas interactifs non faits |
| J5 | Laboratoire 3D pilote (inscription d'un producteur ou carte membre) | À faire ; le cadre (scène, missions, vue 2D) existe depuis J3 |
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

## J3 livré (14 octobre 2026)

Design validé par l'utilisateur (accès libre aux 12 leçons, courriel à l'équipe, scène
« bureau de coopérative »). Écarts par rapport à la spécification, assumés :

- Position de diapositive mémorisée sur l'appareil (`localStorage`), pas en base : aucune
  migration ; la leçon à reprendre, elle, vient du serveur (`last_viewed_at`).
- Les trois étapes sont dans une seule PR (commits séparés 1/3, 2/3, 3/3) plutôt que trois PR
  à fusionner l'une après l'autre.
- La vue 3D du laboratoire est annoncée « bientôt » (J5) ; rien n'est chargé.

Vérifié sur la pile locale (mock Supabase alimenté par le contenu réel de la formation,
`e2e/fixtures/academy-content.json`) : aucune erreur de page, aucun chunk Three.js chargé sur
l'accueil, le lecteur et le laboratoire ; position de diapositive conservée au rechargement ;
cas pratique indisponible avant le quiz ; mouvement réduit respecté. Captures PC 1440×900 et
Android 390×844. Non mesuré : Motorola réel, poids exact des chunks (à lire dans le build Vercel).

## J3 mis à jour (cadrage `AGRIACADEMY_J3_J4_PROMPT_CLAUDE.md`, 14 octobre 2026)

Spécification : `docs/agriacademy-j3-experience-spec.md` (six écrans, correspondance ancien →
nouveau, auto-critique). Réalisé sur la même PR #39 :

- Écran 1 « Mes formations » : une action « Reprendre », prochains devoirs (cas pratiques à
  déposer, reprises), scores connus, lien vers la vue d'ensemble, autres formations publiées
  comptées sans lien.
- Écran 2 « Vue d'ensemble » (`/operator/training/cursus`) : objectif, débouché, prérequis,
  durée étiquetée « estimée », programme avec état réel, évaluations requises, critères.
- Écrans 3 et 4 : lecture continue (objectif une seule fois, points clés, démonstration ou
  « Média à fournir », `content_body` rendu en h2 / p / listes / cases sans HTML injecté,
  « À retenir ») ; plus de pile de cartes ni de badges de type ; sommaire en tiroir sur
  téléphone ; fil d'Ariane ; trois espaces Cours / Exercice / Évaluation sur une barre basse.
- Écran 5 « Salle d'évaluation » : page dédiée, bulle de support masquée, règles affichées
  depuis les données, quiz J2 inchangé, cas pratique dans sa section, fermé avant le quiz.
- Écran 6 : pages admin existantes, raffinements J6.

Vérifié localement (mock alimenté par le contenu réel) : 24 tests unitaires AgriAcademy,
7 tests Playwright (`e2e/academy.spec.ts`, workflow `academy-browser.yml`) : reprise en deux
actions, états réels, texte long, média à fournir, quiz une question à la fois, cas pratique
fermé, retour sans perte, tiroir Android, aucun défilement horizontal à 390 et 320 px, aucun
chunk Three.js. Captures avant/après PC 1440 et Android 390 jointes à la PR. Non mesuré :
LCP/INP sur appareil réel, Motorola.

## J4 livré (14 octobre 2026)

- 24 captures du produit (12 écrans × bureau et Android), prises par Playwright sur le produit
  construit depuis le dépôt contre le mock : vrais écrans, données d'exemple, étiquetées ainsi
  sous l'image. Une capture de production (`academy_media_assets.storage_path`) prime dès
  qu'elle existe ; demandes détaillées dans `docs/agriacademy-j4-captures.md`.
- Carte pédagogique objectif → explication → démonstration → exercice → quiz → devoir pour les
  12 leçons (`docs/agriacademy-j4-content-map.md`), leçons 4 et 8 comme référence éditoriale.
- Par leçon, dans le code (`lib/academy/lesson-enrichment.ts`, relu en PR, sans écriture en
  base) : résultat attendu, « À observer » sur la capture, exemple de terrain togolais fictif,
  trois questions d'auto-vérification non notées. Quiz et cas pratiques inchangés.
- Vérifié : 29 tests unitaires AgriAcademy, 7 tests Playwright, captures PC et Android du cours.
- Non fait : schémas interactifs, prise de notes, captures de production.
