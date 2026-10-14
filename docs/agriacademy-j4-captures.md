# AgriAcademy J4 : captures du produit et demandes de captures de production

## Ce qui est fourni (dans ce dépôt)

`public/academy/captures/lesson-NN-{desktop,mobile}.webp` : 12 écrans × 2 formats (1440×900 et
390×844), produits par Playwright sur le produit construit depuis ce dépôt, contre le mock
Supabase (`e2e/fixtures/mock-supabase.mjs`, coopérative fictive COOMARA-Kpalimé, 120 membres,
60 cartes). Bulle de support masquée, mouvement réduit. Poids total : 1,4 Mo, de 29 à 88 ko par
image. Ce sont les vrais écrans de FaîtiereHub, pas des maquettes ; les données sont des
données d'exemple, et l'interface le dit sous chaque image.

Script : `scratchpad/j4-captures.mjs` de la session (à verser dans `scripts/` si l'on veut le
rejouer : il suppose la pile locale sur 127.0.0.1:3000).

| Leçon | Écran | État montré |
|---|---|---|
| 1, 9, 12 | `/operator` | dossier en formation (3 leçons sur 12), parcours de certification |
| 2 | `/dashboard` | tableau de bord COOMARA-Kpalimé, sélecteur d'organisation |
| 3 | `/admin/cooperatives` | liste des organisations (super-admin) |
| 4, 11 | `/dashboard/members` | 120 membres, recherche, import/export, actions |
| 5 | `/dashboard/cards` | 60 cartes, génération, impression, commande physique |
| 6 | `/dashboard/integrations` | onglet Disponibles : KoboToolbox non connecté, Setup, Connecter |
| 7 | `/dashboard/analytics` | statistiques de la coopérative |
| 8, 10 | `/operator` | opérateur actif, portefeuille PAYG 12 500 FCFA, rechargement, historique |

## Demandes de captures de production (à produire par l'équipe, jamais par le code)

Pour remplacer une capture d'exemple par une capture authentique : prendre l'écran sur
www.faitierehub.com avec un compte réel et **des données anonymisées à l'écran** (aucun numéro
de téléphone complet, aucun nom réel sans accord), 1440×900 en WebP, puis renseigner
`academy_media_assets.storage_path` et `status = 'ready'` (migration ou back-office J6). Le
lecteur l'affichera à la place de la capture d'exemple.

| Leçon | Écran à capturer | État attendu | À faire apparaître | Masquer |
|---|---|---|---|---|
| 1 | `/operator` | compte candidat, dossier enregistré | statut, parcours en 5 étapes, bouton formation | nom complet |
| 2 | `/dashboard` | compte opérateur mandaté sur une coopérative | sélecteur d'organisation ouvert | chiffres sensibles |
| 3 | `/admin/cooperatives` ou fiche organisation | une union et ses coopératives | niveau, rattachement | contacts |
| 4 | `/dashboard/members` | saisie d'un membre avec téléphone existant | message de doublon | téléphones |
| 5 | `/dashboard/cards` puis `/verify/[card]` | une carte générée | statut, aperçu, page de vérification | numéro de carte complet |
| 6 | `/dashboard/integrations` → Kobo | intégration connectée | formulaire choisi, flux d'import | jeton Kobo |
| 7 | `/dashboard/analytics` | période avec données | indicateurs, écarts | montants |
| 8 | `/operator` | opérateur certifié | portefeuille, historique | solde réel si confidentiel |
| 9 | espace connecté | n'importe quel compte | identité, organisation active, navigation | e-mail |
| 10 | `/operator` | opérateur actif | organisations suivies, actions en attente | noms des organisations si confidentiels |
| 11 | parcours Membres → Cartes → Kobo → Statistiques | 4 captures enchaînées | les 4 écrans | idem |
| 12 | `/operator` | compte en attente d'évaluation | étapes formation → évaluation → paiement → certification | nom |
