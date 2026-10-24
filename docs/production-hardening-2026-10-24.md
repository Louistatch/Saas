# Corrections après l’audit du 24 octobre 2026

Périmètre autorisé : fiabilité et préparation de FaîtiereHub, **SMS et paiements réels exclus**.
Les travaux Marché/Travail de Claude sont conservés. CE/IT reste désactivé.

## Changements du lot

| Sujet | Correction et preuve |
|---|---|
| Dépendances | Versions corrigées de Next.js, Sentry, Sharp, Zod et dépendances transitives. Audit npm production : zéro vulnérabilité signalée lors du contrôle. La CI refuse les vulnérabilités high/critical. |
| Membres | Recherche et pagination serveur, total exact, ordre unique stable, accès à la coopérative vérifié côté serveur. Test de recherche d’un membre placé après la 1 000e ligne. |
| Rapports, exports, cartes, statistiques | Lectures par pages, erreur explicite si une page échoue ; aucun succès partiel. Borne explicite de 200 000 lignes par export local. Statistiques de surface : utilisation de `surface_ha`. |
| Hiérarchies | Comptage récursif des membres par coopérative enfant et sélection des cartes dans la branche choisie, avec prévention des cycles et règles RLS conservées. |
| Remplacement de carte | Nouveau numéro pour une nouvelle carte ; le numéro d’une carte révoquée n’est plus réutilisé. Aucun débit ni carte réelle émise pour les tests. |
| Carte géographique | Agrégats en base sous SECURITY INVOKER, sans plafond de 1 000 lignes. Test PostgreSQL avec deux réseaux et plus de 1 000 membres chacun : aucun croisement. |
| Prix agricoles | Suppression du repli silencieux sur 1 000 anciennes observations. Filtrage anticipé et étapes d’agrégation calculées une seule fois, mêmes médianes et tendances à marchés appariés. Test public : 121 prix courants sur cinq régions. Mesure SQL limitée à 1,5 s : environ 112 ms. |
| Audience | Aucun chargement des outils de mesure avant accord ; refus, retrait et durée de choix de six mois. URL sans paramètres ni identifiants, aucun identifiant utilisateur/coopérative envoyé à PostHog, pas d’enregistrement de session. Le serveur refuse le suivi sans cookie d’accord. |
| AgriTogo | PR [#25](https://github.com/Louistatch/agritogo/pull/25) fusionnée : historique par session, mémoire d’agent neuve à chaque appel, outils privés réservés à un super_admin vérifié. Tests Flask : 31 réussis, dont 16 de sécurité. Le déploiement Railway doit être confirmé séparément. |

Les migrations appliquées sont suivies sous leurs versions serveur :
`20261024194412`, `20261024194828`, `20261024195114`, `20261024195643`.
Elles ajoutent des agrégats invoker et corrigent les plans des prix sans modifier les observations.

## Vérifications reproductibles

```sh
npm ci
npm run security:audit
npm run typecheck
npm run security:check -- --static
npm run test:production
npm run test:hardening
npm run test:unit
FAITIERE_LOCAL_VERIFY=1 NEXT_TELEMETRY_DISABLED=1 npm run build
npm run test:production:browser
```

Le test navigateur construit une copie locale avec le Supabase fictif fourni dans `e2e/fixtures`.
Il ne reproduit ni un téléphone physique ni une collecte réelle. Il nécessite Chromium installé
par Playwright, ou `PW_CHROMIUM_PATH` pointant vers un binaire compatible.

## Conditions restantes avant une ouverture générale

- Recette terrain Kobo sur Android : téléchargement du formulaire, collecte hors ligne avec consentement/photo, synchronisation, normalisation des variantes de coopérative, reprise d’un doublon, carte imprimée et lecture du QR. Les tests automatisés ne remplacent pas cette recette.
- Restauration d’une sauvegarde des données **et fichiers** dans un environnement isolé ; objectifs de reprise, responsable et alerte de panne éprouvés. Aucun exercice destructif sur la production.
- Revue des anciens comptes privilégiés et décision sur la publication des photos associées aux QR, avec information et consentement appropriés. Aucun compte propriétaire ni fichier existant n’est supprimé par ce lot.
- Validation métier des modèles IA. Les résultats financiers restent expérimentaux et ne constituent pas une validation bancaire ; l’ancien endpoint de rendement synthétique est retiré.
- Recette de charge représentative des clients et des téléphones ciblés. Aucun test de charge n’est envoyé à la production par ce lot.
- Pour chaque pays supplémentaire : référentiels territoriaux, langue, unités/devise, contrats, fiscalité, traitement des données, support et validation agronomique locale à qualifier.

Les SMS, encaissements réels, reversements, recharges commerciales et rapprochements financiers
automatiques restent hors recette. Les volumes actuels du pilote et les tests locaux ne permettent
pas d’annoncer une plateforme entièrement qualifiée à l’échelle nationale ou internationale.
