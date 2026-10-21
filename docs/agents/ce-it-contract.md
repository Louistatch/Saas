# Contrat CE / itinéraires techniques — Codex et Claude

Version proposée le 21 octobre 2026. Ce contrat accompagne une PR documentaire
avant le code. Il ne vaut ni réponse de Claude ni validation du déploiement.

## Audit et coordination

- Base examinée : `origin/main` à `df671d45` ; branche Claude publiée la plus récente :
  `claude/magical-wright-iP5e8`, au même commit. Seule PR ouverte observée : #42,
  ancien chantier HarooLife. Les modifications locales non poussées de Claude ne sont
  pas visibles : le périmètre protégé ci-dessous reste réservé par précaution.
- Le moteur historique `lib/fiches/member-scope.ts` autorise actuellement la gratuité
  de fiches de plateforme pour certaines cartes actives. La nouvelle demande exclut
  cette gratuité pour les CE opérateur et administration. Codex ne changera pas ce
  moteur en parallèle : le module isolé applique les nouvelles règles ; le basculement
  du catalogue historique sera une intégration explicite avec Claude.
- La publication historique est aujourd'hui limitée au super-admin. Aucun opérateur
  ne reçoit de nouveau droit par simple rôle, déclaration du navigateur ou carte.

## Répartition et fichiers

| Codex : nouveaux fichiers réservés | Claude : fichiers et domaines protégés |
| --- | --- |
| `lib/ce-it/**`, `components/ce-it/**`, `app/ce-it/**`, `app/api/ce-it/**` | opérateurs institutionnels, partenaires, capacités, PAYG et facturation |
| nouvelles tables / RPC `ceit_*`, migrations `20261021_*_ceit_*.sql` | `lib/payments/**`, `app/api/payments/**`, `lib/partners/**`, `app/api/partner/**`, `app/operator/**` |
| `tests/ce-it-*`, `e2e/ce-it-*`, `.github/workflows/ce-it.yml`, `docs/ce-it/**` | `lib/fiches/**`, `components/marketplace/**`, `app/api/fiches/**`, `app/marketplace/**`, parcours admin / dashboard CE existants |

Les trois fichiers de coordination (`CLAUDE.md`, ce contrat et le registre) ne
reçoivent que des ajouts ciblés. `package.json`, les layouts, la navigation et les
types Supabase partagés ne sont pas modifiés dans le lot isolé. Les tests disposent
d'une commande et d'une CI dédiées. Les autres modules sont consommés en lecture.

Chaque agent annonce les nouveaux fichiers avant de les toucher. Si un fichier
nécessaire est réservé à l'autre, il prépare un adaptateur isolé et documente le
branchement attendu. Absence de réponse ne vaut pas accord pour modifier la zone.

## Propriété et accès

Un produit CE/IT forme un ensemble versionné : compte d'exploitation et itinéraire
technique de la même culture et du même contexte, avec références scientifiques.
Le public filtre et acquiert les documents ; la saisie est réservée aux producteurs
de documents autorisés et aux contributeurs scientifiques, jamais aux acheteurs.

| Propriétaire | Dépôt / gestion | Accès |
| --- | --- | --- |
| Faîtière | opérateur habilité avec mandat explicite, actif, limité à cette faîtière | gratuit pour son producteur titulaire d'une carte agricole active de son arbre, après vérification de la carte **et du PIN secret** ; 1 500 XOF pour les autres |
| Opérateur | opérateur ayant un droit CE/IT explicite et actif | 1 500 XOF, aucune gratuité de carte |
| Administration FaîtièreHub | super-admin autorisé | 1 500 XOF, aucune gratuité de carte |

La chaîne faîtière → union → coopérative est relue côté serveur. Carte professionnelle
Haroo, carte expirée, révoquée, suspendue, membre inactif, mauvais arbre ou mauvais
PIN ne donnent aucun accès gratuit. Un compte administrateur lisant une carte ne
remplace pas le PIN. Le PIN ne figure ni dans les journaux ni dans les nouvelles tables.
Un document non publié n'est pas téléchargé par un acheteur, même muni d'une carte.

## Habilitations et paiement : interfaces proposées à Claude

- Codex prévoit des habilitations CE/IT explicites, révocables et bornées dans le
  temps, ainsi que des mandats de faîtière. Leur absence refuse le dépôt. Elles ne
  modifient pas les capacités, rôles, institutions ni factures PAYG existants.
  Claude indiquera le futur adaptateur de capacités institutionnelles ; aucun lien
  implicite à une certification ou à une recharge de portefeuille.
- Le montant d'une acquisition payante est fixé côté serveur à **1 500 XOF**.
  Le navigateur n'envoie ni montant de confiance, ni propriétaire de confiance,
  ni état « payé ». Il ne peut pas créer un droit de téléchargement par un callback.
- L'adaptateur de confirmation future reçoit un identifiant produit / version,
  un identifiant d'achat, l'identité du bénéficiaire, le montant et la devise **déjà
  vérifiés côté serveur par Claude**. L'attribution doit être idempotente, liée à
  l'achat et à la version, contrôlée en transaction et impossible avec le rôle anon.
- Codex ne crée aucune transaction FedaPay, ne modifie aucun webhook / retour,
  achat existant, portefeuille ni facture. Le bouton de paiement du module neuf
  reste indisponible tant que cet adaptateur n'est pas accepté et branché.
- **250 FCFA : cartes agricoles uniquement.** Aucune retenue CE/IT de ce montant.
  Les règles de commission numérique sont séparées, configurables et soumises à une
  validation explicite. Reversements désactivés par défaut ; aucune tâche ne verse
  de fonds et aucun taux implicite n'est créé par ce lot.

## Circuit scientifique et agronomes Haroo

1. Auteur habilité : brouillon versionné, sources et droits de reproduction,
   données CE, itinéraire technique, localisation, documents privés.
2. Agronome Haroo vérifié : contribution traçable, avec culture, compétences et zone.
3. Soumission à une revue scientifique indépendante : le contributeur ne valide
   pas sa propre contribution. Refus et corrections restent historisés ; une
   modification après soumission exige une nouvelle version / nouvelle revue.
4. Publication uniquement après validation scientifique et autorisation éditoriale.
   Un changement de fichier ne doit pas conserver l'approbation d'un ancien fichier.
5. Après accès gratuit autorisé ou achat confirmé, recherche de candidats vérifiés
   et disponibles : culture, compétences et proximité. Une proposition ne vaut
   jamais affectation ; l'agronome doit accepter. Re-vérifier sa disponibilité et
   empêcher les acceptations concurrentes pour une même demande.

L'achat de 1 500 FCFA couvre les documents, **pas une consultation personnalisée
illimitée**. La mission précise son périmètre et, le cas échéant, fait l'objet
d'un accord séparé. Aucun message externe automatique, aucune coordonnée privée
publiée dans le catalogue ou la liste anonyme des candidats.

## Sécurité et livraison

- Migrations additives seulement ; pas d'ALTER destructif, de réécriture du schéma
  institutionnel ni des tables `fiches_techniques` / `purchases` existantes.
- Stockage privé, chemins par produit et version, liens signés après contrôle.
  RLS par propriétaire / contributeur / bénéficiaire ; contrôles serveur sur les
  transitions sensibles. Le rôle navigateur n'écrit ni paiement ni approbation.
- Vérifier localement droits croisés, carte + PIN, mandat expiré, auto-validation,
  téléchargement avant validation, falsification d'achat, double confirmation,
  doubles acceptations, révocation, archivage et commissions désactivées.
- Développement dans un worktree indépendant ; PR technique en brouillon basée
  sur la branche documentaire tant que celle-ci n'est pas intégrée. Aucune fusion
  dans `main`, aucun déploiement volontaire et aucune modification de base de
  production sans validation explicite du DG.
- Avant PR technique : relire les dernières branches / PR et le registre, comparer
  les fichiers touchés à la zone Claude, signaler les interfaces non branchées.

## Réponse de Claude attendue dans le registre

Indiquer sa branche institutionnelle / PAYG, les fichiers réservés supplémentaires,
l'identifiant stable d'un opérateur habilité et le point d'entrée de confirmation
de paiement. Un accord financier sur les commissions est une validation distincte.
