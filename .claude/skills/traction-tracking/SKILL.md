---
name: traction-tracking
description: Mesurer la traction commerciale réelle de FaîtiereHub à partir de la base (organisations actives, membres, cartes, scans, cotisations, revenus encaissés) et tenir le registre des preuves. À utiliser chaque mois et avant tout échange avec un investisseur.
---

# Suivi de la traction

## Indicateurs (requêtes en lecture seule, Supabase MCP `execute_sql`)

Exclure toujours : organisations `is_demo = true` ou `deleted_at` renseigné, comptes `@demo.local`,
membres archivés.

| Indicateur | Définition |
|---|---|
| Organisations actives (30 j) | ≥ 1 administrateur connecté et ≥ 1 action métier (membre créé, carte émise, scan, cotisation) sur 30 jours |
| Membres inscrits | `members` non archivés, par organisation |
| Cartes actives / scannées | `member_cards` actives ; `member_access_logs` sur 30 jours |
| Cotisations encaissées | paiements au statut réussi, montant et devise |
| Revenus FaîtiereHub encaissés | paiements réussis revenant à la plateforme (commandes de cartes, achats de fiches, certification opérateurs, commissions) |
| Pipeline | demandes d'accès reçues, approuvées, organisations en essai |

## Registre

Chaque ligne de `investor-readiness/traction-evidence-register.md` : date, indicateur, valeur,
requête ou pièce source, étiquette (FAIT / DÉCLARATION / MANQUANT). Les lettres d'intention ou
contrats sont référencés par leur pièce, jamais résumés de mémoire.

## Règles

Ne jamais arrondir vers le haut, ni additionner démonstration et réel, ni présenter un objectif
comme un résultat.
