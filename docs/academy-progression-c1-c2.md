# AgriAcademy : progression enregistrée (C1) et fin de formation automatique (C2)

Date : 14 octobre 2026. Branche `fix/academy-progression-c1-c2` (à partir de `main` 9667ccf).
Rien n'est fusionné ni déployé. Réponse aux constats C1 et C2 de
`investor-readiness/technical-audit-parcours-operateur.md`. Jalon J1 du prompt « AgriAcademy
Next-Gen » : réparer le cycle avant toute refonte visuelle.

## Politique de validation (à faire valider)

Décision documentée dans `lib/academy/completion-policy.ts`, pure et testée :

| Condition | Règle |
|---|---|
| Quiz obligatoire | au moins une tentative réussie, corrigée côté serveur (score ≥ seuil du quiz) |
| Cas pratique obligatoire | au moins un dépôt |
| Leçon sans quiz ni devoir obligatoire | validée à l'ouverture |
| Module terminé | les 12 leçons validées |
| Fin de formation | `training_completed_at` posé une seule fois, dossier `exam_pending`, journal d'audit, e-mail à la personne et aux super_admins |

**Point à trancher** : la correction des devoirs n'existe pas encore (E1). Exiger un devoir
*approuvé* bloquerait toute progression ; la règle retient donc un devoir *déposé*. Le jour où la
correction existe, une seule ligne change (`assignmentSubmitted` → `assignmentApproved`). La
certification n'est jamais accordée ici : l'évaluation pratique et le paiement restent des étapes
distinctes, décidées par l'administration.

## Ce qui change

- **Le client ne peut plus déclarer une leçon terminée.** `POST /api/academy/operator/progress`
  n'accepte plus que « j'ai ouvert cette leçon » (`moduleId`, `lessonId`) ; l'ancien corps
  (`status`, `progressPercent`) est refusé. L'état `completed` est dérivé en base des tentatives
  et des dépôts (`evaluateLessonCompletion`), après chaque quiz et chaque dépôt.
- **Ouverture d'une leçon** : `app/operator/training/[lessonId]/lesson-opened.tsx` envoie un
  signal au montage ; `recordLessonOpened` pose `in_progress`, garde le premier `started_at`,
  met `last_viewed_at` à jour, ne rétrograde jamais une leçon validée. Première leçon ouverte :
  le dossier passe de `candidate` à `training` (`markPartnerTrainingStarted`, nouveau, avec
  journal d'audit) ; le libellé « Formation en cours » existe enfin.
- **Fin de formation** : `settleOperatorTraining` compte les leçons validées ; quand les 12 le
  sont, il appelle la fonction de certification existante `markPartnerTrainingCompleted`
  (validateur = la personne, note « Automatique : 12 leçons sur 12 »), puis `notifyTrainingCompleted`
  envoie les deux e-mails, une seule fois (seulement quand la date vient d'être posée). Le bouton
  admin « Valider formation » reste comme dérogation tracée.
- **Supervision** : un super_admin sans dossier peut lire la formation mais ses tentatives et
  dépôts sont refusés (403) et son ouverture de leçon n'écrit rien (M6).
- **Quiz** : envoi refusé tant qu'une question est sans réponse (M1, partie « vide ») ; après
  réussite, l'écran dit si la leçon est validée, combien restent, ou que la formation est terminée.
- **Liste des leçons** : « x / 12 validées », score du dernier quiz par leçon, règle expliquée.
- **Espace opérateur** : l'étape « Formation en ligne » affiche « x leçon(s) sur 12 validée(s) »
  (`/api/account/partner-status` renvoie `training`).
- Idempotence : double ouverture (clé unique, code 23505 ignoré), double tentative (recalcul sans
  effet), double appel de fin de formation (date déjà posée, pas de second e-mail).

## Ce qui ne change pas

Contenu des 12 leçons, seuils (E2), captures (E3), texte long (E4), correction des devoirs (E1),
limites de débit (M3) : hors de C1/C2, à traiter dans les jalons suivants.

## Validation

| Contrôle | Résultat |
|---|---|
| Typecheck | 0 erreur |
| Biome | 0 alerte sur les 20 fichiers touchés |
| Tests unitaires | 189 / 189, dont 4 nouveaux (`tests/academy-completion-policy.test.ts`) |

**Non vérifié** : le parcours complet contre une base (ouverture → quiz → dépôt → `exam_pending`
→ e-mails). Le faux Supabase local n'a pas les tables de formation et l'audit interdit tout
enregistrement en production. À faire sur une branche Supabase ou un compte de test après
fusion : ouvrir une leçon (statut « En cours »), réussir le quiz et déposer le cas pratique
(« Terminée », compteur 1 / 12), répéter sur les 12, constater `exam_pending` sur le dossier,
l'entrée `partner_training_completed` dans `audit_logs` et les deux e-mails.
