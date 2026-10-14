# Audit : parcours Opérateur (et autres acteurs) jusqu'à la formation

Date : 14 octobre 2026. Base : `main` 9667ccf (après PR #36). Périmètre : inscription et
candidature opérateur, arrivée dans l'espace, formation (12 leçons, quiz, devoirs), validation de
la formation par l'administration. Hors périmètre : évaluation pratique, paiement, activation,
console de validation.

Chaque constat porte une étiquette : **vérifié** (code lu, requête exécutée ou test lancé),
**déclaré**, **supposé**, **non vérifiable**. Aucune écriture en production, aucun compte créé,
aucune migration appliquée. Les requêtes sur la base sont en lecture seule.

## Résumé

La formation existe et son contenu est sérieux (12 leçons, 36 questions corrigées côté serveur,
12 cas pratiques), mais **le parcours ne se boucle pas** : rien n'enregistre qu'une leçon est
suivie, aucun seuil ne fait avancer le dossier, l'administration ne peut pas corriger les
devoirs ni voir l'avancement réel, et les 12 illustrations annoncées n'existent pas. Un
candidat qui termine tout voit toujours « À commencer » sur chaque leçon et « Candidature
enregistrée » sur son espace, jusqu'à ce qu'un super_admin clique « Valider formation » sans
indicateur pour le décider.

État réel en production (vérifié, requête du 14 octobre) :

| Mesure | Valeur |
|---|---|
| Dossiers opérateur | 2, tous au statut `candidate` |
| Formations validées, examens, certifications | 0, 0, 0 |
| Lignes de progression de formation | 0 |
| Tentatives de quiz | 0 |
| Devoirs déposés | 0 |
| Candidats sans aucune activité de formation | 2 sur 2 |

Les deux candidats réels n'ont donc jamais ouvert une leçon avec effet enregistré. Le bug
d'arrivée corrigé ce matin (PR #36) en est une cause plausible, pas démontrée.

## Constats classés

### Critique

**C1. La progression de formation n'est jamais écrite : les leçons restent « À commencer » pour toujours.** Vérifié.
- La page de la formation lit `academy_profile_progress` pour afficher l'état de chaque leçon (`app/operator/training/page.tsx:64-65`).
- La seule écriture possible est `POST /api/academy/operator/progress` (`app/api/academy/operator/progress/route.ts`). **Aucun composant ne l'appelle** : `grep` sur `app`, `components`, `lib` ne trouve que la route elle-même. La page de leçon (`app/operator/training/[lessonId]/page.tsx`) n'écrit rien à l'ouverture, la réussite d'un quiz n'écrit rien non plus (`submitQuizAttempt` insère seulement une tentative, `lib/academy/operator-training.ts:239-275`).
- Conséquence : 0 ligne de progression en base ; la vue admin `/admin/partners/training` compte `lessons_completed` à partir de ces lignes (`app/api/admin/academy/operator/candidates/route.ts:68-70`) et affichera « 0 / 12 » pour tout le monde, même pour un candidat qui a réussi les 12 quiz.
- Scénario : un candidat finit la formation, revient sur son espace, voit toujours « Suivez la formation » ; l'administration ne voit personne à valider.
- Correction : à l'ouverture d'une leçon, écrire `in_progress` ; à la réussite du quiz (et dépôt du devoir si requis), écrire `completed` avec le score, depuis les routes serveur existantes (`upsertProgress` est déjà écrit et testé par personne). Afficher le résultat du dernier quiz dans la liste des leçons.

**C2. Aucun passage automatique « formation terminée » ni signal à l'administration.** Vérifié.
- `training_completed_at` n'est posé que par `markPartnerTrainingCompleted` (`lib/partners/certification.ts:103-153`), appelée uniquement par la route admin `POST /api/admin/partners/[partnerId]/certification` (bouton « Valider formation », `app/admin/partners/page.tsx:397-406`).
- Aucune règle ne relie les 12 quiz réussis à ce bouton ; aucun e-mail, aucune entrée dans la boîte admin quand un candidat termine (les notifications existantes concernent la candidature, `app/api/account/apply-partner/route.ts:129-152`).
- Le statut `training` du dossier n'est jamais écrit par le code (seuls `candidate` → `exam_pending` existent) : le libellé « Formation en cours » de l'espace opérateur ne peut jamais apparaître.
- Correction : quand toutes les leçons requises sont `completed`, poser `training_completed_at` et passer le dossier à `exam_pending` via la fonction existante (avec l'identifiant système comme validateur), et prévenir les super_admins. Garder le bouton admin comme dérogation tracée.

### Élevé

**E1. Les devoirs (12 « cas pratiques », tous `is_required`) ne peuvent être ni corrigés ni vus.** Vérifié.
- Dépôt possible et répétable sans limite (`submitAssignment` insère à chaque appel, `lib/academy/operator-training.ts:281-301`).
- Aucune route, aucune page n'écrit `status='reviewed'`, `score`, `feedback` ou `reviewed_by` (`grep` sur `app` : seule la route de dépôt touche la table). La vue admin n'affiche qu'un compteur de dépôts, pas le texte.
- La grille (`rubric`, 4 critères pondérés) est stockée mais jamais utilisée.
- Scénario : le candidat écrit un compte rendu d'une page, personne ne le lit ; il ne saura jamais s'il est accepté.
- Correction : soit retirer `is_required` et présenter le cas pratique comme exercice de préparation à l'évaluation orale, soit livrer la lecture et la notation dans `/admin/partners/training`.

**E2. Le seuil de réussite de 70 % impose en pratique un sans-faute.** Vérifié.
- Chaque quiz a 3 questions à 1 point, `passing_score = 70` (requête : 12 quiz, `points_total = 3`). Deux bonnes réponses donnent 67 %, donc « Non atteint ». Le seuil réel est 100 %.
- Trois questions à choix multiples (leçons 4, 7, 11) ont **toutes leurs options correctes** ; la correction exige l'ensemble exact, sans crédit partiel (`lib/academy/operator-training.ts:256-262`). Une case oubliée vaut 0.
- Tentatives illimitées (`max_attempts` NULL sur les 12 quiz, et de toute façon jamais contrôlé par le code) : le sans-faute s'obtient par essais successifs, ce qui vide le quiz de sa valeur.
- Correction : 5 questions par quiz ou seuil à 60 %, crédit partiel sur les choix multiples, limite de tentatives appliquée côté serveur, et au moins une option fausse par question à choix multiples.

**E3. Les 12 illustrations de la formation n'existent pas.** Vérifié.
- `academy_media_assets` : 12 lignes, toutes `pending_capture`, `storage_path` NULL.
- Chaque leçon a une diapositive de type « capture d'écran » dont le texte demande d'« observer l'écran réel » ; l'écran rendu affiche un cadre en pointillés avec le texte alternatif (`app/operator/training/[lessonId]/page.tsx:68-72`).
- Scénario : un candidat sans accès au dashboard (c'est le cas d'un candidat : aucune organisation) ne peut pas « observer /dashboard/members » ; la diapositive est vide de sens.
- Correction : produire les 12 captures (routes listées dans `source_route`) ou retirer ces diapositives jusque-là.

**E4. Le texte long de chaque leçon n'est jamais affiché.** Vérifié.
- `academy_lessons.content_body` contient 1 000 à 1 600 caractères par leçon (listes de périmètres d'accès, checklists, auto-évaluation en 12 questions pour la leçon 12), plus complet que les 5 diapositives.
- La page de leçon ne rend que les diapositives (`app/operator/training/[lessonId]/page.tsx:54-75`). La leçon 12 (type `quiz`) perd ainsi son auto-évaluation, qui est tout son objet.
- Correction : afficher `content_body` sous les diapositives (ou le découper en diapositives).

### Moyen

**M1. Un quiz peut être soumis vide et sans confirmation.** Vérifié. `quiz-form.tsx` n'exige aucune réponse ; une tentative à 0 % est enregistrée et le bouton reste actif après le résultat (nouvelle tentative immédiate). Les explications (`explanation`, présentes pour les 36 questions, `show_feedback = true`) ne sont jamais montrées. Correction : bloquer l'envoi tant qu'une question est sans réponse, afficher les explications après soumission.

**M2. L'espace opérateur promet des étapes que rien ne déclenche.** Vérifié. Le nouvel écran (PR #36) dit « Terminez les leçons pour passer à l'évaluation pratique » et « Un opérateur de l'équipe vous contacte » ; au vu de C1 et C2, la première phrase n'a aucun effet mesurable et la seconde dépend d'un clic admin sans indicateur. À corriger avec C1 et C2, sinon reformuler.

**M3. Limites de débit par adresse IP inadaptées à une formation en salle.** Vérifié. Inscription : 5 par 10 minutes et par IP (`app/api/operator/auth/register/route.ts:31`) en plus de la limite partagée `auth` ; tentatives de quiz : 20 par minute et par IP. Au Togo, un groupe de candidats sur le même Wi-Fi ou derrière le NAT d'un opérateur mobile partage une IP : le sixième inscrit en dix minutes reçoit « Trop de tentatives ». Correction : limite par adresse e-mail pour l'inscription, par compte pour les quiz.

**M4. Aucune porte d'entrée vers la candidature depuis les espaces existants.** Vérifié. Le formulaire « Devenir Opérateur » n'apparaît que sur `/operator` pour un compte sans dossier ; ni le dashboard (`app/dashboard/layout.tsx`, navigation) ni l'espace Haroo (`app/haroo`) n'y mènent ; seule la console admin a le lien. Un membre de coopérative ou un agronome Haroo ne découvre le parcours que par l'URL. Correction : une entrée « Devenir opérateur » dans les deux espaces.

**M5. Un dossier suspendu ou révoqué garde l'accès à la formation et aux dépôts.** Vérifié. `assertOperatorCandidate` ne vérifie que l'adhésion active et la ligne de certification (`lib/security/assert-partner-access.ts:68-105`), pas `partners.status`. Faible impact aujourd'hui (aucun dossier dans ces états), à corriger avant l'ouverture.

**M6. Les super_admins qui consultent la formation apparaissent comme candidats.** Vérifié. L'exception de supervision laisse un super_admin soumettre quiz et devoirs en son nom (`assert-partner-access.ts:70-75`) ; la vue admin agrège toute activité par profil. Correction : refuser les écritures sans dossier opérateur.

### Faible

**F1. Options de quiz non utilisées.** Vérifié. `randomize_questions = true` sur les 12 quiz, jamais appliqué ; `max_attempts` jamais lu. Soit implémenter, soit retirer les colonnes de l'interface d'édition.

**F2. Questions à réponse ouverte (`case`) non notées mais comptées dans le total.** Vérifié dans le code (`lib/academy/operator-training.ts:254`), aucune question de ce type en base aujourd'hui : latent. Si on en ajoute, un quiz devient impossible à réussir.

**F3. Faits chiffrés figés dans les questions.** Vérifié. Trois questions testent des montants « prévus » (2 000 FCFA, 500 FCFA pour l'organisation, seuil 70 %) qui sont des réglages (`platform_settings.partner_exam_passing_score`) ou des décisions commerciales. Une modification de tarif rendra ces réponses fausses sans que personne ne le voie.

**F4. Droits de table plus larges que nécessaire.** Vérifié. `anon` et `authenticated` ont INSERT, UPDATE, DELETE au niveau table sur les 9 tables `academy_*` ; la RLS (aucune politique d'écriture, aucune politique pour `anon`) bloque tout en pratique. La clé de correction `is_correct` est bien retirée du SELECT de `authenticated` (migration du 20 septembre, confirmée par `test:hardening`, 16 / 16). Hygiène : révoquer les droits d'écriture inutiles.

**F5. Aucun test automatique sur la formation.** Vérifié. Ni la correction des quiz, ni la progression, ni le parcours candidat n'ont de test (`tests/`, `e2e/` : seuls le partage WhatsApp, la règle d'accueil et la révocation de `is_correct` sont couverts).

## Ce qui fonctionne (vérifié)

- Inscription opérateur : compte créé confirmé ou avec e-mail de confirmation, dossier `partners` + adhésion + ligne de certification, annulation complète en cas d'échec (`app/api/operator/auth/register/route.ts`).
- Arrivée dans l'espace après confirmation d'e-mail (corrigé par PR #36, en production depuis ce matin ; le clic réel sur un e-mail reste à faire avec un compte de test).
- Candidature depuis un compte existant, idempotente, avec accusé de réception et alerte admin (`apply-partner`).
- Accès à la formation réservé aux dossiers opérateur (`assertOperatorCandidate`), corrections de quiz côté serveur, clé de correction inaccessible au client.
- Contenu : 12 leçons cohérentes avec le modèle (mandat, propriété des données, pas de MLM, qualité des données, Kobo, MEAL, PAYG, sécurité), 36 questions avec une et une seule bonne réponse pour les choix uniques, explications rédigées.
- Vue admin des candidats et bouton « Valider formation » (mais sans indicateur fiable, voir C1).

## Ordre de correction proposé

1. C1 puis C2 (une journée) : écrire la progression depuis les routes existantes, boucler vers `exam_pending`, prévenir l'admin. Sans cela, aucune métrique de formation n'est vraie.
2. E2 et M1 (une demi-journée) : seuil atteignable, envoi contrôlé, explications.
3. E3 et E4 (une journée) : captures des 12 écrans, affichage du texte long.
4. E1 : décision produit (devoir noté ou exercice libre) avant tout développement.
5. M3 à M6, F1 à F5 : avant l'ouverture à une promotion de candidats.

## Non vérifié

- Le clic réel sur l'e-mail « Confirmez votre compte » en production (pas de compte de test créé, conformément aux règles de l'audit).
- La réception effective des e-mails de candidature par les super_admins (dépend de Resend, non testé ici).
- Le rendu de la formation sur un téléphone réel (les pages sont des composants serveur simples, risque faible).
