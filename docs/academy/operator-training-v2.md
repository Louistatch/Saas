# AgriAcademy V2 — Opérateur certifié FaîtiereHub

## État appliqué en Supabase

Migration distante : `20260919140639_academy_operator_training_v2`

Module concerné : **Opérateur certifié FaîtiereHub — Pilote V1**

La V2 étend AgriAcademy sans remplacer les tables historiques :

- `academy_media_assets`
- `academy_lesson_slides`
- `academy_quizzes`
- `academy_quiz_questions`
- `academy_quiz_options`
- `academy_quiz_attempts`
- `academy_assignments`
- `academy_assignment_submissions`
- `academy_profile_progress`

Le dernier point permet à un candidat Opérateur de progresser avec `profiles.id`, même s'il n'a pas de `members.id` ni de coopérative.

## Contenu seedé

- 12 leçons existantes enrichies
- 60 slides pédagogiques
- 12 Knowledge Checks
- 36 questions
- 122 options
- 12 cas pratiques / assignments
- seuil quiz : 70 %
- feedback pédagogique prévu
- progression candidate indépendante de `academy_progress.member_id`

## Style pédagogique

Chaque leçon suit la logique :

1. objectif ;
2. concept clé ;
3. écran réel FaîtiereHub ;
4. cas pratique ;
5. synthèse ;
6. quiz type WQU ;
7. mini-soumission.

Les quiz couvrent :
- single choice ;
- multiple choice ;
- true/false ;
- cas contextualisés.

## Captures réelles du SaaS

Les images ne sont **pas inventées**.

`academy_media_assets` contient des assets `screenshot` avec `status='pending_capture'` et la route exacte à capturer.

Routes actuellement référencées :

- `/operator`
- `/dashboard`
- `/admin/cooperatives`
- `/dashboard/members`
- `/dashboard/cards`
- `/dashboard/kobo-setup`
- `/dashboard/analytics`

Claude/Playwright doit capturer le produit réel connecté, uploader les fichiers dans le stockage approprié puis renseigner `storage_path` et passer l'asset à `ready`.

Ne jamais remplacer ces captures par des mockups générés.

## Travail applicatif restant pour Claude

### 1. Route dédiée

Construire :

`/operator/training`

Elle doit fonctionner pour un candidat Opérateur même sans couche Organisation.

### 2. API de lecture

Créer des routes serveur pour retourner :
- module ;
- leçons ;
- slides ;
- asset média ;
- quiz ;
- options sans exposer directement `is_correct` au navigateur avant soumission ;
- assignments ;
- progression.

### 3. Quiz sécurisé

Ne jamais envoyer les bonnes réponses au client avant la soumission.

Le scoring doit être fait côté serveur.

À la soumission :
- calculer score ;
- stocker `academy_quiz_attempts` ;
- fournir feedback ;
- valider à partir de 70 %.

### 4. Progression

Écrire dans `academy_profile_progress`, pas `academy_progress`, pour les candidats Opérateur.

La table historique `academy_progress` reste utilisable pour les membres de coopérative.

### 5. Soumissions pratiques

Utiliser `academy_assignment_submissions`.

La notation finale peut rester manuelle par super_admin pour le pilote.

### 6. Certification

Lorsque toutes les leçons/quiz/assignments requis sont complétés selon la règle produit, appeler le service de certification déjà introduit dans PR 2.1 plutôt que d'écrire directement `training_completed_at`.

L'examen pratique final reste distinct du Knowledge Check automatique.

### 7. UI

Suivre le Figma **FaîtiereHub — Design System No AI Look**.

La page cible doit montrer :
- progression globale ;
- 12 leçons ;
- slide reader ;
- capture réelle de l'écran ;
- quiz ;
- cas pratique ;
- état de certification ;
- prochaine étape.

## Important

Cette migration est additive. Elle ne modifie pas le moteur historique AgriAcademy et ne touche pas PR3 cartes physiques.
