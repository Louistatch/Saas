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
