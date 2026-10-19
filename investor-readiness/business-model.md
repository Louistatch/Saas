# Modèle économique

Étiquettes : **FAIT** (code ou base), **DÉCLARATION**, **HYPOTHÈSE**, **PROJECTION**, **MANQUANT**.

## Clients et utilisateurs

- **Clients payeurs visés** : faîtières, unions et coopératives agricoles (Togo d'abord). HYPOTHÈSE :
  la faîtière décide et entraîne ses unions et coopératives.
- **Utilisateurs** : administrateurs d'organisation, opérateurs de zone certifiés, membres
  producteurs (carte à QR), professionnels Haroo (ouvriers, acheteurs, agronomes).

## Sources de revenus présentes dans le code

| Flux | Prix codé | Étiquette | Encaissé à ce jour |
|---|---|---|---|
| Impression de cartes physiques | 2 000 FCFA par carte, dont 500 FCFA reversés à l'organisation | FAIT (`app/dashboard/cards/print-orders/page.tsx`, `lib/cards/print-orders.ts`) | 0 |
| Certification d'un opérateur | 15 000 XOF | FAIT (`app/operator/page.tsx`) | 0 |
| Achat de fiche technique (compte d'exploitation) par un non-membre | prix fixé par fiche (`price_non_member`) ; 500 FCFA cité dans l'ancienne page de démonstration | FAIT (`app/api/fiches/[id]/purchase/route.ts`) | 0 |
| Cotisations des membres payées par mobile money | montant fixé par l'organisation ; commission éventuelle MANQUANTE | FAIT (flux), commission MANQUANT | 0 |
| Abonnement « Professionnel » | 99 000 XOF par mois **affiché**, aucune facturation dans le code | FAIT (affiché seulement) | 0 |
| Offre gratuite | 10 cartes numériques par coopérative, appliquée en base | FAIT | — |

## Surfaces de monétisation dans HarooLife Lomé 3D (HYPOTHÈSE, 0 encaissé)

Le quartier 3D (`/haroolife/territoire/lome`, PR #23 à #28) expose deux inventaires
publicitaires, codés dans `lib/haroolife/lome-sponsors.ts`. Ce sont des tarifs affichés et des
emplacements, pas des ventes : **aucun annonceur, aucune facture, 0 FCFA encaissé**.

| Surface | Inventaire | Tarif affiché | Occupé aujourd'hui | Étiquette |
|---|---|---|---|---|
| Panneaux publicitaires 3D (un par quartier, vus à chaque passage) | 5 | 15 000 à 25 000 FCFA / 7 jours selon le quartier | 2 par les services FaîtiereHub (marché, carte Haroo), 3 libres | HYPOTHÈSE |
| Applis partenaires dans le téléphone du jeu | 3 libres (+ 3 services maison gratuits) | 50 000 FCFA / mois | 0 | HYPOTHÈSE |

Plafond si tout était réservé au tarif affiché : 50 000 FCFA par semaine de panneaux et
150 000 FCFA par mois d'applis, soit environ **600 USD par mois pour une ville**. PROJECTION,
conditionnée à une audience que le jeu n'a pas encore (voir `traction-evidence-register.md`).
Cibles plausibles : banques et microfinance, assureurs agricoles, vendeurs d'intrants,
opérateurs télécom. Toute réservation passe par la page contact ; rien n'est automatisé.

## Ce que le modèle doit prouver (dans l'ordre)

1. **Usage récurrent** : des administrateurs qui reviennent chaque semaine. Aujourd'hui : non
   démontré.
2. **Volonté de payer** : un premier encaissement, même modeste (impression de cartes,
   certification d'opérateurs). Aujourd'hui : 0.
3. **Revenu récurrent** : un abonnement facturé à une faîtière ou une union. Aujourd'hui : la
   facturation n'existe pas.

## Questions ouvertes (MANQUANT)

- Qui paie l'abonnement : la faîtière, l'union, chaque coopérative, ou un bailleur (projet de
  développement) ? La réponse change tout le modèle de vente.
- Prix acceptable mesuré auprès de 5 organisations (entretiens, lettres d'intention).
- Coût d'acquisition d'une organisation (temps terrain, opérateurs de zone).
- Part des revenus reversée aux opérateurs et aux organisations.
