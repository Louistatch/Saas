# HarooLife national : la vie agricole du Togo

Deuxième tranche de HarooLife. Le pilote (équipes et travaux sur un canton) reste intact ; cette
tranche donne à **chaque compte une place sur le territoire** et un **rôle déduit de ses données**.

## Ce que voit une personne connectée (`/haroolife`)

- **Ma maison** : à la première visite, elle choisit sa région, sa préfecture et son canton (suggéré
  quand la plateforme le connaît : canton d'ouvrier, d'acheteur, d'agronome, de fiche membre, ou
  canton où vivent le plus de membres de son organisation), un nom affiché, un pagne (couleur
  d'avatar) et si les autres habitants peuvent la voir.
- **Carte** : le Togo en cinq régions, puis préfectures et cantons, avec le nombre réel d'habitants
  (comptes ayant choisi ce canton). Aucun chiffre n'est estimé ni animé.
- **Ici** : le canton visité (le sien par défaut) : habitants visibles avec leurs rôles, puis les
  lieux : les champs (travaux proposés), la maison des équipes, le marché (derniers prix relevés
  dans la région, `market_prices`), le ciel (prévision régionale Open-Meteo), les coopératives qui
  ont des membres dans le canton, le bureau de l'opérateur.
- **Village** : le canton dessiné en isométrie (SVG, aucun modèle à télécharger). Chaque bâtiment
  est un lieu réel : les champs, la maison des équipes, le marché (panneau avec un vrai prix relevé),
  la coopérative (nom réel), l'école des champs, le bureau de l'opérateur, la place (grand arbre).
  Chaque personnage est un habitant réel, placé près du lieu de son rôle, avec son nom et sa
  dernière parole (dix minutes). Mon personnage marche vers le lieu touché. Il pleut à l'écran
  quand la prévision du jour dépasse 50 % de pluie. Touchez un lieu : actions selon le rôle,
  données réelles, « ici maintenant », « Y aller ».
- **La place** : parler aux habitants du canton (`haroolife_messages`, 200 caractères, une fois par
  20 secondes, réservé aux personnes qui ont une maison ; réponses rapides). Les messages restent
  dans le canton. Le serveur peut en effacer (`deleted_at`).
- **Ma maison** : une pièce en isométrie avec mon personnage, mes rôles, la porte vers le village.
- **Téléphone** : raccourcis vers les services existants (équipes, marché, messages, tableau de
  bord ou espace opérateur / Haroo, académie).
- **Équipes** : le pilote existant, inchangé.

## Rôles

Déduits côté base par `private.haroolife_roles(user)` : `equipe` (super_admin), `faitiere` /
`union` / `admin_coop` (administrateur selon le niveau de son organisation), `producteur` (membre),
`ouvrier` / `acheteur` / `agronome` (couche Haroo), `operateur` (mandat partenaire actif et
certifié). Une personne ne déclare jamais son rôle.

## Vie privée

`haroolife_world` ne renvoie que : nom affiché, pagne, rôles, effectifs, paroles sur la place. Jamais de téléphone,
d'e-mail ni d'identifiant de compte d'autrui. Une personne invisible se voit elle-même seulement.
La table `haroolife_residents` n'est accessible qu'au serveur (RLS, aucun droit client).

## Activation

1. Appliquer `supabase/migrations/20261012_120000_haroolife_togo.sql` (additive). Retour arrière :
   `supabase/rollbacks/20261012_120000_haroolife_togo.rollback.sql`.
2. `HAROOLIFE_ENABLED=true` côté serveur (déjà requis par le pilote). `NEXT_PUBLIC_HAROOLIFE_ENABLED`
   affiche les entrées dans les tableaux de bord.

Le pilote « équipes » reste limité à sa coopérative et son canton configurés dans `haroolife_pilot` :
l'ouverture des équipes à tous les cantons est la tranche suivante.

## Vérification

`node --test tests/haroolife-togo.test.mjs` exécute la migration dans PGlite : rôles, suggestion de
canton, maison, effectifs par région, visibilité, absence de données de contact, paroles sur la
place (cadence, résidence), refus des anonymes. Captures mobiles prises en local contre un faux Supabase (voir la PR).
