# Hypothèses du modèle financier

> **Aucun chiffre de ce document n'est un résultat.** Les revenus encaissés à ce jour sont de
> **0** (FAIT, voir `traction-evidence-register.md`). Tout le reste est HYPOTHÈSE ou PROJECTION.

Convention de change (HYPOTHÈSE de travail, à mettre à jour) : 1 USD ≈ 600 XOF. Le XOF est arrimé à
l'euro (655,957 XOF = 1 EUR, FAIT).

## 1. Hypothèses de revenus (à valider sur le terrain)

| Hypothèse | Bas | Central | Haut | Justification / preuve à obtenir |
|---|---|---|---|---|
| Faîtières clientes à 24 mois | 2 | 5 | 10 | Togo : nombre de faîtières agricoles à recenser (MANQUANT) |
| Coopératives par faîtière | 10 | 20 | 40 | FENOMAT : 5 unions et 10 coopératives enregistrées (FAIT), taille réelle MANQUANTE |
| Membres par coopérative | 30 | 60 | 120 | 15 membres inscrits aujourd'hui sur 4 organisations (FAIT) |
| Abonnement mensuel par faîtière ou union | 30 000 XOF | 60 000 XOF | 99 000 XOF | 99 000 XOF affiché (FAIT) ; consentement à payer MANQUANT |
| Cartes physiques par membre et par an | 0,2 | 0,5 | 0,8 | prix 2 000 FCFA, 1 500 FCFA nets (FAIT) |
| Conversion gratuit → payant | 10 % | 25 % | 40 % | aucune donnée (MANQUANT) |
| Attrition annuelle | 30 % | 20 % | 10 % | aucune donnée (MANQUANT) |

## 2. Hypothèses de coûts

| Poste | Hypothèse | Étiquette |
|---|---|---|
| Hébergement (Supabase, Vercel), supervision | 100 à 400 USD par mois selon l'offre | HYPOTHÈSE (factures MANQUANTES) |
| SMS et notifications | coût unitaire opérateur | MANQUANT |
| Frais de paiement mobile money | 1 à 3 % par transaction | HYPOTHÈSE (contrats MANQUANTS) |
| Impression des cartes | coût unitaire | MANQUANT |
| Équipe (produit, développement, terrain, ventes) | voir `fundraising-strategy.md` | HYPOTHÈSE |
| Opérateurs de zone | rémunération à la performance | MANQUANT |

## 3. Exemple de calcul (PROJECTION, scénario central, mois 24)

5 faîtières × 20 coopératives × 25 % de conversion = 25 organisations payantes.
25 × 60 000 XOF = 1 500 000 XOF par mois d'abonnements (≈ 2 500 USD).
Cartes : 5 × 20 × 60 membres × 0,5 carte × 1 500 XOF nets = 4 500 000 XOF par an (≈ 7 500 USD).
**Revenu annualisé projeté ≈ 37 500 USD**, à mettre en regard d'une levée de 500 000 USD.
Le modèle d'abonnement seul ne justifie donc pas ce montant : il faut une thèse de croissance plus
large (plusieurs pays, flux financiers des cotisations, services aux bailleurs) **à démontrer**.

## 4. À produire

Tableur complet (skill `financial-modeling` + `anthropic-skills:xlsx`) : 36 mois, trois scénarios,
sensibilité, plan de trésorerie, utilisation des fonds. Il n'est pas produit ici : les hypothèses
centrales ne sont pas encore validées par le terrain.
