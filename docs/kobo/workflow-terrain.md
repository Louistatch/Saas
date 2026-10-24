# KoboCollect → FaîtiereHub : collecter, importer et émettre une carte

État vérifié le 24 octobre 2026. Cette branche contient un correctif, pas une preuve de
déploiement en production. Le correctif SQL doit précéder le déploiement applicatif.

## Ce qui a été constaté

La production contient une intégration Kobo connectée, une clé API chiffrée et onze
correspondances. Six collectes anciennes sont traitées et rattachées à six membres portant
une carte active ; cinq de ces membres ont une photo. La dernière collecte enregistrée et
la dernière synchronisation datent du 4 juin 2026. Ces résultats prouvent un fonctionnement
historique, pas la réception actuelle depuis le téléphone d'un technicien. Aucun secret ni
nom de producteur n'a été extrait pour cet audit.

Les tests locaux couvrent la réception HTTP, l'enrôlement, le quota de cartes, la reprise,
les correspondances modifiées et les fonctions SQL réelles dans PostgreSQL embarqué.
Ils ne vérifient ni les identifiants actuels du compte Kobo, ni les paramètres REST de ce
compte, ni une collecte depuis un téléphone physique.

## Le parcours sur le terrain

1. Le technicien télécharge le formulaire déployé dans KoboCollect lorsqu'il dispose d'une
   connexion. Il renseigne un producteur, sa coopérative, sa photo et les données agricoles.
2. Il peut travailler hors connexion. Une fiche enregistrée sur le téléphone n'est pas encore
   arrivée dans FaîtiereHub : elle doit être finalisée puis envoyée au serveur Kobo.
3. KoboToolbox transmet la nouvelle collecte en JSON au webhook FaîtiereHub. Une
   synchronisation manuelle depuis FaîtiereHub permet de récupérer les collectes manquées.
4. Le formulaire configuré détermine la faîtière. Les correspondances traduisent les champs.
   Le membre et sa coopérative sont rapprochés dans cet arbre, jamais dans une autre faîtière.
5. Le système enregistre la fiche et télécharge les pièces jointes à l'aide du jeton côté
   serveur. Une carte est créée si les règles d'émission existantes l'autorisent. L'import
   n'achète aucun crédit PAYG et ne débite pas automatiquement le portefeuille d'un opérateur.
6. Le responsable contrôle la fiche dans Membres, puis la carte dans Cartes, son portrait,
   sa coopérative et l'ouverture du QR. L'impression physique reste une étape distincte.

Un quota atteint donne « Membre enregistré, carte non émise ». Le membre reste rattaché à
la collecte. L'opérateur peut émettre la carte commerciale dans sa console, puis le
responsable utilise **Retenter** : la carte existante est conservée, sans recréer le membre.

## Brancher le compte Kobo

### 1. Préparer le formulaire et les techniciens

Utiliser le formulaire d'enrôlement du dépôt comme référence, en conservant ses noms
techniques ou en renseignant leurs correspondances. Il est prérempli pour FENOMAT : adapter
le code et les libellés si l'organisation change. Une intégration correspond à un formulaire
et à une faîtière ; ne pas partager le même formulaire entre deux faîtières indépendantes.

Les informations nécessaires à la carte comprennent au minimum le nom et prénom, la
coopérative et une photo exploitable. Vérifier également le téléphone, la localisation et le
consentement prévus par le questionnaire. Une collecte sans nom exploitable est bloquée.

Déployer le projet Kobo. Donner aux comptes des techniciens le droit d'ajouter des
soumissions ; ne pas distribuer le compte administrateur ou sa clé API sur les téléphones.
Chaque compte permet de distinguer les collectes via `_submitted_by`.

Le connecteur actuel FaîtiereHub utilise le serveur global :

| Usage | Adresse |
|---|---|
| Compte web et API | `https://kf.kobotoolbox.org` |
| Serveur dans KoboCollect Android | `https://kc.kobotoolbox.org/` |

Pour un compte européen, les adresses sont différentes et le connecteur actuel doit
d'abord être adapté ; remplacer uniquement l'adresse du téléphone ne suffit pas.

### 2. Connecter la faîtière dans FaîtiereHub

Avec un administrateur autorisé, choisir la faîtière dans le tableau de bord et ouvrir
**Intégrations → KoboToolbox** (`/dashboard/integrations/kobo`).

- Renseigner la clé API depuis les réglages du compte Kobo, onglet Security.
- Renseigner l'UID du projet, visible après `#/forms/` dans son adresse Kobo. Ce n'est
  ni le titre du questionnaire ni le nom du fichier XLSX.
- Tester la connexion, puis enregistrer les paramètres et correspondances.
- Activer la réception webhook si l'on veut une arrivée automatique.
- Au premier branchement, lancer une synchronisation complète pour vérifier les anciennes
  collectes. Enregistrer une configuration ne signifie pas que les collectes ont été importées.

La clé est chiffrée avec `INTEGRATION_SECRET_KEY` sur le serveur. Une clé masquée à l'écran
ne doit pas être recopiée comme une nouvelle clé.

### 3. Configurer le service REST dans Kobo

Dans le projet Kobo : **Settings → REST Services → Register a new service**.

| Paramètre | Valeur |
|---|---|
| Nom | FaîtiereHub |
| Endpoint URL | `https://www.faitierehub.com/api/webhooks/kobo` |
| Format | JSON |
| Champs envoyés | Tous les champs, métadonnées et pièces jointes comprises |
| En-tête HTTP personnalisé, Name | `X-Kobo-Secret` |
| En-tête HTTP personnalisé, Value | Le secret serveur `KOBO_WEBHOOK_SECRET` |

Ne pas appliquer de wrapper autour du JSON. `_uuid`, `_id`, `_xform_id_string` et
`_submission_time` sont nécessaires. Le secret webhook est distinct de la clé API Kobo ;
il doit être configuré côté serveur et compter au moins 32 caractères. Il ne figure pas
dans le formulaire ou dans son URL.

Les services REST Kobo transmettent les nouvelles soumissions. La documentation Kobo
précise que la modification d'une soumission ne déclenche pas ce même envoi : une correction
d'une fiche déjà importée exige donc un parcours de mise à jour explicite. Une synchronisation
complète de ce connecteur dédoublonne les collectes ; elle ne remplace pas automatiquement les
informations déjà traitées.

### 4. Configurer le téléphone

Installer KoboCollect, choisir la saisie manuelle des paramètres du projet, puis renseigner
l'adresse KoboCollect ci-dessus, le nom d'utilisateur et le mot de passe du compte collecteur.
Télécharger le formulaire déployé. Le QR de configuration KoboCollect contient des
identifiants : le générer avec un compte de collecte, pas avec celui d'administration.

## Si le formulaire change

Le correctif conserve toujours `raw_payload` et produit une représentation interne dans
`processed_payload.normalized_payload`. Les réponses supplémentaires restent consultables
dans le détail de la collecte, sans modification automatique du code ou du schéma de base.

| Modification | Comportement |
|---|---|
| Libellé ou ordre des questions | Compatible si les noms techniques restent identiques |
| Nouvelle question | Réponse conservée dans le JSON ; un usage métier nécessite une correspondance ou une fonctionnalité prévue |
| Nom technique modifié | Mettre à jour sa correspondance ; les collectes en erreur peuvent être retraitées |
| Groupe de parcelles déplacé ou renommé | Adapter les chemins des champs de parcelle dans les correspondances |
| Nom essentiel supprimé | Import bloqué ; corriger le formulaire ou la correspondance |
| Nouveau concept, par exemple vaccination ou assurance | Donnée brute conservée ; définir son traitement métier avant d'en déduire une action |

Exemples de correspondances utilisables :

| Champ Kobo | Table cible | Colonne cible |
|---|---|---|
| `identite/nom_et_prenoms` | `members` | `full_name` |
| `identite/prenom` | `members` | `first_name` |
| `identite/nom` | `members` | `last_name` |
| `contact/mobile` | `members` | `phone` |
| `identite/portrait` | `members` | `photo_url` |
| `organisation/cooperative` | `members` | `cooperative_name` |
| `terrain/parcelles/culture` | `parcelles` | `culture_principale` |
| `terrain/parcelles/surface` | `parcelles` | `superficie_ha` |
| `recoltes/quantite` | `productions` | `quantity_kg` |
| `recoltes/campagne` | `productions` | `campaign_year` |

Pour un nom complet, choisir `full_name` plutôt que `first_name`. Les colonnes ci-dessus
sont des destinations connues de l'adaptateur ; taper une autre colonne ne crée pas un champ
SQL. Un nombre de cotisations déclaré n'est jamais transformé automatiquement en paiement.

## Recette minimale avant d'envoyer toute l'équipe

Avec une personne de test et une organisation autorisée :

1. Collecter une fiche complète avec photo, une parcelle et une production.
2. Finaliser hors connexion : rien ne doit apparaître dans le SaaS tant qu'elle n'est pas envoyée.
3. Envoyer après retour du réseau ; vérifier la réception dans Kobo et le journal du service REST.
4. Vérifier la soumission dans l'onglet Soumissions FaîtiereHub : état traité, membre lié,
   carte réellement présente, photo visible, parcelle et production dans la bonne coopérative.
5. Renvoyer la même soumission : pas de deuxième membre, carte ou données agricoles.
6. Corriger une correspondance sur une collecte en erreur, puis utiliser Retenter.
7. Vérifier un QR avec et sans accès privé ; exporter ou imprimer la carte depuis l'interface.

Une réception HTTP 200 n'est pas une preuve suffisante : le traitement et la carte doivent
être vérifiés. En cas de blocage, le JSON brut reste disponible ; ne pas recréer le membre
manuellement sans examiner le lien déjà enregistré.

## Livraison technique

Appliquer uniquement `20261024140645_kobo_workflow_integrity.sql`, puis déployer les changements
applicatifs de cette branche. Ne pas appliquer en bloc les autres migrations en attente.
La migration remplace deux fonctions existantes ; elle ne réimporte pas les collectes
historiques, ne modifie pas les quotas et ne déclenche pas de message.

Validation locale :

```bash
node --import tsx --test tests/kobo-workflow.test.ts
node --test tests/kobo-workflow-sql.test.mjs
npm run typecheck
```

## Documentation officielle consultée

- [Configuration de KoboCollect](https://support.kobotoolbox.org/kobocollect_on_android_latest.html)
- [API, clé et identifiant du projet](https://support.kobotoolbox.org/api)
- [Services REST et comportement lors des modifications](https://support.kobotoolbox.org/rest_services.html)
- [Exemple officiel d'en-têtes HTTP personnalisés](https://support.kobotoolbox.org/kobotoolbox_monday_integration.html)
