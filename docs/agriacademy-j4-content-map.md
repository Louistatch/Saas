# AgriAcademy J4 : carte pédagogique des 12 leçons

Cadrage : `AGRIACADEMY_J3_J4_PROMPT_CLAUDE.md`, passe C. Pour chaque leçon, la chaîne
**objectif → explication → démonstration → exercice → quiz → devoir**, avec ce qui vient de la
base (inchangé) et ce qui vient du code (J4, relu en PR). Aucun barème modifié, personne n'est
certifié par un contenu ; les quiz (5 questions, 70 %, 3 tentatives par 24 h) et les cas
pratiques corrigés restent la seule validation.

## Où vit chaque maillon

| Maillon | Source | Affiché dans |
|---|---|---|
| Objectif | diapositive `objective` ou section « Objectifs » du texte (base) ; reformulé en verbe d'action dans `lib/academy/lesson-enrichment.ts` (`outcome`) | Cours, en tête ; Vue d'ensemble |
| Explication | diapositives `concept` (points clés) + `content_body` rendu en sections (base) | Cours |
| Démonstration | capture du produit (`public/academy/captures`, catalogue `lib/academy/media-catalogue.ts`) + « À observer » (`demoFocus`) ; une capture de production dans `academy_media_assets` prime si elle existe | Cours |
| Exemple de terrain | `example` (coopérative fictive, chiffres fictifs, étiqueté comme tel) | Cours |
| Exercice | laboratoire 2D (`lib/academy/lab-missions.ts`, J5 pour la 3D) + auto-vérification `selfCheck` (3 questions, non notées) | Exercice, Cours |
| Quiz | `academy_quizzes` / questions / options (base, PR #38) | Salle d'évaluation |
| Devoir | `academy_assignments` + énoncé (diapositive `case`) + correction (base, PR #38) | Salle d'évaluation |

## Leçons de référence éditoriale

Deux leçons ont servi de gabarit, puis le même système a été appliqué aux dix autres.

**Leçon 4, Gestion des membres et qualité des données.** Objectif : créer, importer et corriger
des membres sans doublon ni incohérence, en gardant une trace. Explication : chaîne qualité
(diapositive) puis six sections du texte (avant l'import, données minimales, déduplication,
traçabilité, données de projet, contrôle qualité). Démonstration : page Membres (recherche,
filtres, création, import, actions), à observer : où apparaît un doublon de téléphone à la
saisie. Exemple : import de 120 membres à Agbélé (7 doublons, 11 téléphones incomplets,
3 localités variables), protocole et compte avant/après. Auto-vérification : doublon de nom,
champ de bailleur, contrôles de livraison. Quiz : 5 questions de la base. Devoir : protocole de
nettoyage et d'import pour 120 membres (barème exactitude 30, gouvernance 25, maîtrise 25,
clarté 20).

**Leçon 8, Modèle économique de l'opérateur et PAYG.** Objectif : gagner sa vie sans rendre
l'organisation dépendante. Explication : sept sections (cœur gratuit, qui paie, revenus,
wallet, certification à 15 000 FCFA, pas de MLM, tarification). Démonstration : espace
Opérateur certifié avec le portefeuille, à observer : solde, rechargement, historique.
Exemple : opérateur suivant 8 organisations avec un solde insuffisant, ce qui est bloqué et ce
qui ne l'est pas. Auto-vérification : qui paie, blocage, certification. Quiz et devoir : base.

## Les douze leçons

| Leçon | Objectif (verbe d'action) | Démonstration (écran du produit) | Exemple de terrain | Devoir (base) |
|---|---|---|---|---|
| 1 Comprendre FaîtiereHub et le rôle de l'opérateur | expliquer FaîtiereHub en deux minutes | `/operator` : statut, parcours | coopérative Agbélé, « combien coûte le logiciel ? » | cas de la personne admin + agronome + opérateur |
| 2 Gouvernance et propriété des données | intervenir sans casser la gouvernance | `/dashboard` : sélecteur d'organisation | union de Tchamba, export de téléphones | vérifications avant export |
| 3 Diagnostic et onboarding | transformer une rencontre en diagnostic daté | `/admin/cooperatives` | maraîchers de Dapaong, trois fichiers | ordre de traitement |
| 4 Membres et qualité des données | importer sans doublon, avec trace | `/dashboard/members` | Agbélé, 120 membres | protocole 120 membres |
| 5 Cartes numériques, QR, cartes physiques | distinguer identité et support | `/dashboard/cards` (+ vérification publique) | riz de l'Oti, « pas de membre sans PVC » | distinction numérique / physique |
| 6 KoboToolbox, collecte, importation | organiser une collecte propre | `/dashboard/integrations`, onglet Disponibles | 300 producteurs à Sotouboua | test pilote, hors ligne, contrôles |
| 7 Suivi de projets, MEAL, rapports | produire des indicateurs vérifiables | `/dashboard/analytics` | 1 200 annoncés, 1 126 validés (Kara) | formulation du rapport |
| 8 Modèle économique et PAYG | gagner sa vie sans dépendance | `/operator` certifié : portefeuille | 8 organisations, solde insuffisant | bloqué / non bloqué |
| 9 Sécurité et incidents | protéger et réagir | `/operator` : identité, partenaire actif | téléphone perdu avec un export | actions immédiates et documentation |
| 10 Service client et professionnalisme | vendre et livrer un résultat | `/operator` : organisations suivies | fonction « en développement » | réponse disponible / pilote / prévu |
| 11 Mise en situation | mobiliser toutes les compétences | `/dashboard/members` puis Cartes, Kobo, Statistiques | mission complète 120 membres | mission pratique |
| 12 Auto-évaluation | mesurer sa préparation | `/operator` : étapes jusqu'à la certification | plan de révision après 8/12 | décision de préparation |

## Ce que J4 ne fait pas

- Aucune modification des textes, quiz, options ou barèmes en base ; aucune migration.
- Les captures sont celles du produit avec une coopérative fictive (COOMARA-Kpalimé du mock),
  étiquetées « Capture du produit, données d'exemple ». Les captures de production restent à
  fournir (`docs/agriacademy-j4-captures.md`) et prendront la place dès que
  `academy_media_assets.storage_path` sera renseigné.
- Les schémas interactifs et la prise de notes ne sont pas dans ce jalon.
