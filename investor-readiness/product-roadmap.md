# Feuille de route produit

Principe : terminer ce qui permet de **vendre et d'encaisser** avant d'ajouter des modules. Chaque
ligne : problème, solution minimale, critère de réussite mesurable. Les durées sont des
HYPOTHÈSES d'effort pour une petite équipe.

## Phase 0 — Sécurité, sans délai (bloquant pour toute démonstration)

| Élément | Critère de réussite |
|---|---|
| Changer les mots de passe des 7 comptes publiés, invalider leurs sessions (action fondateur, production) | aucun mot de passe publié ne fonctionne |
| Fusionner la PR de l'audit (page `/demo`, demandes d'accès, redirection, tests en CI) | CI verte, déployé |
| Appliquer la migration `20261012_090000_security_hardening.sql` après relecture | politiques vérifiées en base |
| Activer la protection contre les mots de passe compromis (Supabase Auth) | option active |

## Phase 1 — Prêt à vendre (0 à 3 mois)

| Élément | Problème | Solution minimale | Critère |
|---|---|---|---|
| Facturation d'abonnement | aucune facturation ; le bouton « plan supérieur » est désactivé | plan par organisation, facture mensuelle, paiement FedaPay / mobile money, relance | 1ʳᵉ facture payée |
| Contrat et CGV | pas de cadre contractuel ; le SLA affiché n'existait pas | contrat type faîtière, CGV, niveau de service réel | contrat signé avec FENOMAT ou une autre faîtière |
| Conformité données personnelles | photos, signatures et téléphones de membres sans cadre IPDCP | registre des traitements, consentement à l'inscription, photos en URL signées | dossier IPDCP déposé |
| Activation des organisations | 0 administrateur actif sur 30 jours | parcours de première semaine : import Kobo, 10 cartes, premier scan, relances | 3 organisations actives chaque semaine |
| Fiabilité des cartes | numéros révoqués réutilisés ; coopératives pouvant réactiver une carte | nouveau numéro à chaque renouvellement, réactivation réservée aux opérateurs | test de non-régression |
| Téléphones normalisés | doublons possibles | normalisation à l'écriture + contrainte | 0 doublon détecté par la page Doublons |
| Tests E2E en CI | 46 tests Playwright jamais lancés | environnement de test isolé, exécution sur chaque PR | CI verte |

## Phase 2 — Preuve de traction (3 à 9 mois)

- Tableau de bord de traction interne (organisations actives, scans, encaissements), mensuel.
- Cotisations encaissées via la plateforme (premier flux financier récurrent pour les organisations).
- Opérateurs de zone : émission des cartes depuis leur espace, rémunération suivie.
- Pagination et agrégats côté serveur (au-delà de 1 000 membres, statistiques justes).

## Phase 3 — Croissance (9 à 18 mois)

- Deuxième pays, données multi-devises.
- Offre « bailleurs et projets » : rapports d'impact par organisation (données agrégées).
- Haroo / HarooLife : passage du pilote à un service payant, si l'usage le justifie.

## Hors priorité tant que la phase 1 n'est pas atteinte

Nouvelles fonctionnalités d'IA, 3D, intégrations « bientôt disponibles », blog.
