# Objectif : 1 000 000 FCFA net/mois à partir de décembre

Contexte figé à la date de rédaction (session du 2026-09-03). À mettre à jour à
chaque itération plutôt que de le refaire de zéro — c'est le rôle du skill
`monetization-plan`.

## 1. Où en est le produit (audité en profondeur cette session)

- Plans réels : Starter (gratuit, 500 membres) / Professional (99 000 XOF/mois)
  / Enterprise (sur devis) — `app/pricing/page.tsx`
- Partenaire réel déjà en place : **FENOMAT** (Fédération Nationale des
  Organisations de Maraîchers du Togo) — mentionné en dur sur `/a-propos`,
  logo réel intégré
- Fonctionnalités payantes crédibles : AgriMarket, AgriCredit, AgriAcademy,
  widget embeddable (`embed_configs`, corrigé cette session — la table
  n'existait pas avant), carte agricole, cartes membres QR
- Haroo (ouvriers/acheteurs/agronomes) : gratuit, levier d'adoption et de
  réseau, pas un revenu direct pour l'instant

## 2. Le vrai blocage : la collecte de paiement — ✅ CORRIGÉ (code)

**Statut : intégration CinetPay livrée** (`lib/payments/cinetpay.ts`,
`app/api/payments/cinetpay-callback/route.ts`). TMoney et Flooz sont
maintenant des options actives sur `/dashboard/cotisations/payment`
(elles étaient marquées "Prochainement" et désactivées avant). Il reste
à **créer un compte marchand CinetPay réel** et renseigner
`CINETPAY_API_KEY` / `CINETPAY_SITE_ID` en production — le code n'a pas pu
être testé contre un compte CinetPay réel depuis cet environnement (pas
d'accès réseau sortant vers l'API CinetPay dans ce sandbox), seulement
vérifié pour ne pas planter en l'absence de credentials.

Avant, le code n'avait **qu'Orange Money** (`lib/payments/orange-money.ts`,
`ORANGE_MONEY_API_KEY`). Or au Togo (recherche web, sept. 2026) :
- TMoney (Togocom/Yas) : ~60% du marché mobile money
- Flooz (Moov Africa) : ~40%
- Orange Money : quasi absent du Togo (fort en Côte d'Ivoire/Sénégal, pas ici)

**Conséquence concrète** : même un client convaincu ne peut probablement pas
payer facilement aujourd'hui. C'est la priorité technique n°1 avant toute
poussée commerciale — sans quoi le reste du plan ne convertit pas en cash.

Options d'intégration à évaluer (par ordre de rapidité probable) :
1. Agrégateur multi-opérateurs (CinetPay, PayGate Global, Semoa) — une seule
   intégration couvre Flooz + TMoney + Orange
2. API directe Togocom (TMoney) et Moov Africa (Flooz) séparément — plus de
   travail mais pas de commission d'agrégateur

## 3. Canaux de revenu identifiés, par vitesse d'exécution

| Canal | Délai réaliste | Effort | Notes |
|---|---|---|---|
| Convertir FENOMAT en payant | Immédiat | Faible | Relation déjà établie, zéro prospection |
| Programme GIZ (115 coopératives, Maison des Coopératives) | Semaines-mois | Moyen | Candidature à déposer maintenant, bailleur paie pour plusieurs coops d'un coup |
| Cap-Bio Togo (UE/GIZ, 36 500 producteurs, volet numérique explicite) | Mois | Moyen-élevé | Cible institutionnelle, pas des coops isolées |
| Vente B2B directe à d'autres coopératives/faîtières | Continu | Élevé | ~11 clients à 99 000 XOF pour couvrir seul l'objectif — trop lent seul sur 3 mois |
| Frais d'installation ponctuel (setup + import Kobo + formation) | Immédiat | Faible | Cash rapide, indépendant du récurrent |
| Commission AgriMarket / origination AgriCredit | Mois+ | Élevé | Nécessite du volume de transactions, peu probable avant décembre |

## 4. Prochaines actions (à cocher / mettre à jour à chaque session)

- [ ] Chiffrer une proposition Enterprise pour FENOMAT (ce qu'ils ont déjà vs.
      ce qu'un abonnement payant débloquerait)
- [ ] Identifier le point de contact GIZ / Maison des Coopératives et préparer
      le dossier de candidature au programme 115 coopératives
- [x] Choisir et intégrer un moyen de paiement Flooz/TMoney réel — CinetPay,
      code livré ; reste à ouvrir le compte marchand et renseigner les clés
      en production
- [ ] Définir le tarif du "frais d'installation" et l'ajouter à `/pricing`
- [ ] Suivre chaque piste dans un tableau simple (nom, canal, statut, montant
      potentiel, prochaine action, date)

## 5. Suivi des pistes (mettre à jour à chaque check-in)

| Piste | Canal | Statut | Montant potentiel/mois | Prochaine action | Date |
|---|---|---|---|---|---|
| FENOMAT | Conversion directe | À qualifier | — | Chiffrer proposition | — |
| GIZ Maison des Coopératives | Institutionnel | À qualifier | — | Identifier contact | — |

---
Sources (recherche web, à re-vérifier périodiquement — les programmes ont des
fenêtres de candidature qui expirent) :
- Togo First — GIZ 115 cooperatives support program
- IFAD ProMIFA Togo supervision report
- World Bank — $100M Togo digital transformation (déc. 2024)
- Togo First — Flooz/TMoney market share
- Riverpe/Kolonell — guides d'intégration paiement mobile Togo 2026
