---
name: financial-modeling
description: Construire ou mettre à jour le modèle financier de FaîtiereHub (revenus, coûts, besoin de financement, scénarios) en séparant strictement faits, déclarations, hypothèses et projections. À utiliser pour un business plan, une levée ou un budget.
---

# Modélisation financière

## Principes

- Étiquette obligatoire sur chaque nombre : **FAIT** (source + date), **DÉCLARATION** (fondateur),
  **HYPOTHÈSE** (justification), **PROJECTION** (formule à partir d'hypothèses nommées),
  **MANQUANT**.
- Les revenus encaissés viennent uniquement des paiements au statut réussi (tables de paiement,
  relevés des prestataires). Un prix catalogue n'est jamais un revenu.
- Devises : XOF et USD ; indiquer le taux et la date (le XOF est arrimé à l'euro : 655,957 XOF/EUR).

## Structure du modèle

1. **Hypothèses** (onglet séparé) : nombre d'organisations par segment (faîtière, union,
   coopérative), membres par organisation, prix (abonnement, carte, frais de transaction),
   conversion gratuite → payante, attrition, coûts variables (SMS, mobile money, impression,
   hébergement Supabase/Vercel), coûts fixes (équipe, opérateurs de zone), délais d'encaissement.
2. **Calculs** : revenus par flux, marge brute, charges, EBITDA, trésorerie mensuelle sur 36 mois.
3. **Scénarios** bas / central / haut et sensibilité aux trois hypothèses les plus fortes.
4. **Utilisation des fonds** : montant, postes, jalons atteints grâce aux fonds, mois de piste.

## Outils

Pour produire un tableur, utiliser le skill officiel `anthropic-skills:xlsx` (formules visibles,
aucune valeur codée en dur dans les calculs). Résultats écrits en Markdown dans
`investor-readiness/financial-model-assumptions.md` et `valuation-scenarios.md`.
