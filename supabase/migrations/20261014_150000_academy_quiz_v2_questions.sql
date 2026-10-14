-- AgriAcademy J2 (E2) : chaque quiz passe de 3 à 5 questions, rédigées d'après le texte long de
-- la leçon (academy_lessons.content_body) ; les trois questions à choix multiples dont toutes
-- les options étaient justes reçoivent un distracteur ; limite de 3 tentatives par 24 h.
-- Avec 5 questions à 1 point et un seuil de 70 %, il faut 4 bonnes réponses (80 %) ; le crédit
-- partiel des choix multiples (lib/academy/assessment-policy.ts) s'ajoute.
-- Additive seulement : aucune question ni option existante n'est modifiée ou supprimée.
-- Idempotente : chaque insertion est protégée par la contrainte unique (quiz_id, order_index).

UPDATE academy_quizzes SET max_attempts = 3
WHERE module_id = '2482e523-500e-4178-8102-1018af290c82' AND max_attempts IS NULL;

-- Distracteurs pour les questions « tout est juste » (leçons 4, 7, 11, question 2).
INSERT INTO academy_quiz_options (question_id, label, is_correct, order_index)
SELECT qq.id, v.label, false, 5
FROM academy_quiz_questions qq
JOIN academy_quizzes q ON q.id = qq.quiz_id
JOIN academy_lessons l ON l.id = q.lesson_id
JOIN (VALUES
  (4, 'La couleur de la carte PVC'),
  (7, 'Le nom du bailleur'),
  (11, 'Le recrutement d’autres opérateurs')
) AS v(lesson_order, label) ON v.lesson_order = l.order_index
WHERE l.module_id = '2482e523-500e-4178-8102-1018af290c82' AND qq.order_index = 2
  AND qq.question_type = 'multiple_choice'
ON CONFLICT (question_id, order_index) DO NOTHING;

-- Deux questions supplémentaires par leçon (ordre 4 et 5), puis leurs options.
WITH q AS (
  SELECT q.id AS quiz_id, l.order_index AS lesson_order
  FROM academy_quizzes q JOIN academy_lessons l ON l.id = q.lesson_id
  WHERE l.module_id = '2482e523-500e-4178-8102-1018af290c82'
), new_questions(lesson_order, order_index, question_type, prompt, explanation) AS (VALUES
  (1, 4, 'single_choice', 'Qui ouvre une organisation sur FaîtiereHub ?', 'Les organisations sont ouvertes par un opérateur certifié ; il n’existe plus de création autonome.'),
  (1, 5, 'true_false', 'L’opérateur est placé au-dessus de la faîtière dans la hiérarchie.', 'Il intervient par mandat de service, hors de la hiérarchie faîtière, union, coopérative.'),
  (2, 4, 'multiple_choice', 'Quels périmètres d’accès un mandat peut-il autoriser ?', 'Le mandat se limite à des périmètres explicites : membres, cartes, Kobo, imports, analyses, rapports, projets, support.'),
  (2, 5, 'single_choice', 'Avant d’exporter des numéros de téléphone pour un partenaire commercial, l’opérateur doit :', 'Vérifier que le mandat et la finalité autorisent cet usage ; les données appartiennent à l’organisation.'),
  (3, 4, 'single_choice', 'Lequel fait partie du livrable minimum d’onboarding ?', 'Le livrable minimum comprend un administrateur organisationnel identifié et un premier lot validé.'),
  (3, 5, 'multiple_choice', 'Quels signes révèlent une mauvaise qualité des données au diagnostic ?', 'Doublons, numéros mal formatés et localités non normalisées sont des signaux typiques ; le nombre de membres n’en est pas un.'),
  (4, 4, 'single_choice', 'Un bailleur demande des indicateurs spécifiques à son projet. Que faire des champs correspondants ?', 'Distinguer les données durables de l’organisation des données propres à un projet.'),
  (4, 5, 'true_false', 'Un remplacement massif et irréversible de valeurs est acceptable s’il fait gagner du temps.', 'Toute correction importante doit rester explicable ; on garde une trace et on évite l’irréversible.'),
  (5, 4, 'single_choice', 'Quelle part du prix pilote d’une carte physique revient au flux commercial de l’opérateur ?', '1 500 FCFA sur 2 000 : impression, consommables, logistique, service et coûts FaîtiereHub.'),
  (5, 5, 'single_choice', 'Un numéro de carte doit être :', 'Les identifiants sont générés par le système ; on ne les réinvente jamais à la main.'),
  (6, 4, 'multiple_choice', 'Que prévoir pour une collecte en zone à faible connexion ?', 'Travail hors connexion, reprises de synchronisation et contrôle des doublons.'),
  (6, 5, 'true_false', 'Corriger silencieusement des centaines de valeurs est acceptable si le résultat est propre.', 'On conserve toujours une trace du traitement.'),
  (7, 4, 'single_choice', 'Une désagrégation par sexe manque dans la base. Le rapport doit :', 'On ne complète jamais une donnée manquante par une estimation non signalée.'),
  (7, 5, 'single_choice', 'Les données utiles collectées pendant un projet financé doivent :', 'Le financement est temporaire ; les données organisationnelles restent exploitables après.'),
  (8, 4, 'single_choice', 'La certification opérateur est prévue à :', '15 000 FCFA, après validation de la formation et de l’évaluation pratique.'),
  (8, 5, 'multiple_choice', 'Que clarifier avant une mission pour une tarification professionnelle ?', 'Périmètre, volume, délai, livrables, déplacements, impression, collecte et support.'),
  (9, 4, 'single_choice', 'Un téléphone contenant un export de membres est perdu. Première action :', 'Arrêter, conserver les références, signaler ; ne jamais masquer.'),
  (9, 5, 'true_false', 'Un opérateur peut modifier un montant PAYG depuis son navigateur.', 'Les montants sont gérés côté serveur ; toute anomalie financière se signale.'),
  (10, 4, 'single_choice', 'Un opérateur mature peut viser environ 20 organisations. Ce chiffre est :', 'Un objectif commercial, pas une limite technique.'),
  (10, 5, 'single_choice', 'Avant une opération importante chez un client, il faut :', 'Expliquer le résultat attendu et les données touchées.'),
  (11, 4, 'single_choice', 'Dans la mission de la coopérative de 120 membres, combien d’indicateurs utiles faut-il définir ?', 'La mise en situation demande cinq indicateurs utiles au projet.'),
  (11, 5, 'true_false', 'La réussite de la mise en situation vaut certification.', 'Elle prépare l’évaluation pratique officielle, qui reste distincte.'),
  (12, 4, 'single_choice', 'L’auto-évaluation conseille de réviser si vous répondez clairement à moins de :', '10 questions sur 12.'),
  (12, 5, 'single_choice', 'Qui valide officiellement l’évaluation pratique ?', 'Un administrateur ou examinateur, jamais le score d’un quiz.')
)
INSERT INTO academy_quiz_questions (quiz_id, question_type, prompt, explanation, points, order_index)
SELECT q.quiz_id, n.question_type, n.prompt, n.explanation, 1, n.order_index
FROM new_questions n JOIN q ON q.lesson_order = n.lesson_order
ON CONFLICT (quiz_id, order_index) DO NOTHING;

WITH qq AS (
  SELECT qq.id AS question_id, l.order_index AS lesson_order, qq.order_index
  FROM academy_quiz_questions qq
  JOIN academy_quizzes q ON q.id = qq.quiz_id
  JOIN academy_lessons l ON l.id = q.lesson_id
  WHERE l.module_id = '2482e523-500e-4178-8102-1018af290c82' AND qq.order_index IN (4, 5)
), new_options(lesson_order, question_order, option_order, label, is_correct) AS (VALUES
  (1,4,1,'Un opérateur certifié',true),(1,4,2,'N’importe quel visiteur du site',false),(1,4,3,'L’imprimeur de cartes',false),(1,4,4,'Un membre, en s’inscrivant seul',false),
  (1,5,1,'Vrai',false),(1,5,2,'Faux',true),
  (2,4,1,'Gestion des membres',true),(2,4,2,'Impression des cartes',true),(2,4,3,'Gestion Kobo',true),(2,4,4,'Modification du mot de passe de l’administrateur',false),
  (2,5,1,'Vérifier le mandat et la finalité',true),(2,5,2,'Exporter puis prévenir',false),(2,5,3,'Refuser dans tous les cas',false),(2,5,4,'Demander un paiement',false),
  (3,4,1,'Un administrateur organisationnel identifié',true),(3,4,2,'Toutes les cartes imprimées',false),(3,4,3,'Un rapport annuel complet',false),(3,4,4,'Un abonnement payé',false),
  (3,5,1,'Doublons de noms ou de téléphones',true),(3,5,2,'Numéros mal formatés',true),(3,5,3,'Localités non normalisées',true),(3,5,4,'Un grand nombre de membres',false),
  (4,4,1,'Les distinguer des données durables du membre',true),(4,4,2,'Les fusionner avec l’identité permanente',false),(4,4,3,'Les supprimer à la fin du projet',false),(4,4,4,'Les envoyer au bailleur sans contrôle',false),
  (4,5,1,'Vrai',false),(4,5,2,'Faux',true),
  (5,4,1,'500 FCFA',false),(5,4,2,'1 000 FCFA',false),(5,4,3,'1 500 FCFA',true),(5,4,4,'2 000 FCFA',false),
  (5,5,1,'Généré par le système',true),(5,5,2,'Choisi par le membre',false),(5,5,3,'Recopié du cahier papier',false),(5,5,4,'Modifié à chaque réimpression',false),
  (6,4,1,'Le travail hors connexion',true),(6,4,2,'Les reprises de synchronisation',true),(6,4,3,'Le contrôle des doublons',true),(6,4,4,'Un formulaire deux fois plus long',false),
  (6,5,1,'Vrai',false),(6,5,2,'Faux',true),
  (7,4,1,'Dire que la donnée manque',true),(7,4,2,'Estimer et présenter comme observé',false),(7,4,3,'Reprendre la cible du projet',false),(7,4,4,'Supprimer l’indicateur',false),
  (7,5,1,'Rester exploitables après le projet',true),(7,5,2,'Être effacées à la clôture',false),(7,5,3,'Appartenir au bailleur',false),(7,5,4,'Être transférées à l’opérateur',false),
  (8,4,1,'Gratuite',false),(8,4,2,'5 000 FCFA',false),(8,4,3,'15 000 FCFA',true),(8,4,4,'50 000 FCFA',false),
  (8,5,1,'Le périmètre et le volume',true),(8,5,2,'Les livrables et le délai',true),(8,5,3,'Les déplacements et l’impression',true),(8,5,4,'Le nombre d’opérateurs à recruter',false),
  (9,4,1,'Arrêter, conserver les références, signaler',true),(9,4,2,'Attendre de retrouver le téléphone',false),(9,4,3,'Ne rien dire pour ne pas inquiéter',false),(9,4,4,'Supprimer l’export côté serveur',false),
  (9,5,1,'Vrai',false),(9,5,2,'Faux',true),
  (10,4,1,'Un objectif commercial',true),(10,4,2,'Une limite technique',false),(10,4,3,'Une obligation contractuelle',false),(10,4,4,'Le minimum pour être certifié',false),
  (10,5,1,'Expliquer le résultat attendu et les données touchées',true),(10,5,2,'Demander le mot de passe de l’administrateur',false),(10,5,3,'Promettre la fonction suivante',false),(10,5,4,'Imprimer les cartes d’abord',false),
  (11,4,1,'Trois',false),(11,4,2,'Cinq',true),(11,4,3,'Dix',false),(11,4,4,'Douze',false),
  (11,5,1,'Vrai',false),(11,5,2,'Faux',true),
  (12,4,1,'6 sur 12',false),(12,4,2,'8 sur 12',false),(12,4,3,'10 sur 12',true),(12,4,4,'12 sur 12',false),
  (12,5,1,'Un administrateur ou examinateur',true),(12,5,2,'Le score du quiz',false),(12,5,3,'Le candidat lui-même',false),(12,5,4,'L’imprimeur de cartes',false)
)
INSERT INTO academy_quiz_options (question_id, label, is_correct, order_index)
SELECT qq.question_id, o.label, o.is_correct, o.option_order
FROM new_options o JOIN qq ON qq.lesson_order = o.lesson_order AND qq.order_index = o.question_order
ON CONFLICT (question_id, order_index) DO NOTHING;
