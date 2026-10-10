# HarooLife : première tranche pilote

## Parcours livré

Depuis le tableau de bord FaîtiereHub ou l’espace Haroo, une entrée optionnelle ouvre `/haroolife`. Un village léger propose la maison des équipes, les parcelles et la place commune. Une vue liste utilise exactement les mêmes données.

Un ouvrier disponible dans le canton pilote peut créer ou rejoindre une équipe (objectif initial : 8 personnes). Un membre possédant une parcelle dans la coopérative pilote peut proposer une surface réelle pour une activité et une période (objectif initial : 10 ha). La confirmation est explicite. Les participants peuvent se retirer ; le créateur peut annuler. L’atteinte du seuil indique seulement « Objectif atteint ».

Ce sont des groupes préparatoires, sans réservation définitive, contrat, paiement ni rapprochement automatique entre équipe et travaux. Tous expirent après 48 h au maximum, même si le seuil est atteint, ou au début prévu des travaux. Les actions sont fermées après expiration. Cette règle doit évoluer avec le futur parcours de validation des missions.

## Isolation et sécurité

- Quatre nouvelles tables `haroolife_*`, sans modification des comptes, cartes, annonces, contrats ou règles existantes.
- Session Supabase existante et autorisations relues côté base ; aucune clé privilégiée dans le navigateur.
- Accès direct aux tables refusé aux comptes clients. Les fonctions exposent des groupes et compteurs, sans identité des autres participants.
- Parcelles personnelles vérifiées par le lien membre/compte existant ; une parcelle par participation. La surface doit être positive et ne pas dépasser `superficie_ha`.
- Une même parcelle ou un même ouvrier ne peut contribuer à plusieurs groupes actifs sur des dates qui se chevauchent. Les commandes verrouillent utilisateur, groupe et parcelle ; les reprises réutilisent un identifiant de requête pour éviter les doublons.
- Les administrateurs autorisés peuvent consulter ; leur rôle seul ne permet pas d’engager les parcelles d’un membre.
- Ce pilote exige un compte connecté. L’accès par carte seule, la délégation opérateur et l’inscription accompagnée restent à implémenter.

## Activation progressive

1. Sur une base de développement contenant les migrations FaîtiereHub existantes, appliquer `supabase/migrations/20261010_160000_haroolife_pilot.sql` avec le processus habituel. La configuration créée est désactivée.
2. Choisir une coopérative et un canton réels. Vérifier les comptes ouvriers disponibles, leurs cantons et les parcelles des membres, notamment `superficie_ha` et le lien par email confirmé. Ne pas inventer de surfaces manquantes.
3. Configurer la ligne `public.haroolife_pilot` avec ces deux UUID puis `enabled=true` via un accès administrateur à la base. Ne pas changer de territoire tant que des groupes sont actifs.
4. Mettre `HAROOLIFE_ENABLED=true` dans l’environnement serveur. Garder `NEXT_PUBLIC_HAROOLIFE_ENABLED=false` pour une recette par URL directe.
5. Valider avec deux producteurs et des ouvriers : accès refusé hors zone, création, participation, retrait, annulation, seuils, expiration, actualisation et reprise après coupure réseau. Tester deux dernières places simultanées sur PostgreSQL/Supabase réel.
6. Après recette mobile et validation métier, mettre `NEXT_PUBLIC_HAROOLIFE_ENABLED=true` puis reconstruire pour afficher les entrées dans les deux espaces existants.

Les fonctions SQL restent appelables directement par les utilisateurs éligibles lorsque le pilote en base est actif, même si le serveur masque la page. Le drapeau de base est donc le coupe-circuit faisant autorité.

Pour arrêter : `UPDATE public.haroolife_pilot SET enabled=false WHERE singleton;`, désactiver les deux variables et reconstruire. Conserver les tables pour l’audit. Aucun effacement n’est nécessaire.

Un profil supprimé, un ouvrier devenu indisponible ou un changement de périmètre peut perdre l’accès à ses groupes : prévoir l’accompagnement administrateur avant un élargissement du pilote. Le tableau présente au maximum 100 groupes, avec priorité aux participations personnelles ; pagination et archivage restent à ajouter.

## Vérification et suite

`node --test tests/haroolife.test.mjs` exécute la migration et les véritables fonctions d’appartenance dans PGlite : droits, périmètre, surfaces, seuils, retraits, expiration, annulation et idempotence. Ces tests ne valident pas la concurrence de plusieurs connexions PostgreSQL ni l’intégration à une base de production.

`node --import tsx --test tests/haroolife-core.test.ts` vérifie les commandes et états affichés. Compléter par `npm run typecheck`, `npm run test:hardening` et `npm run build`.

Prochaines tranches : accès carte/délégation avec consentement ; rapprochement équipes/travaux et proposition de mission ; acceptations individuelles avant contrat ; suivi terrain et preuves ; puis présentation 3D progressive. La copie de TogoLife dans `haroo/experiments/haroolife/togolife` reste un prototype visuel : son stockage local ne devient pas la source des engagements réels.

## État de livraison local

Les 11 tests HarooLife (dont le test parent SQL), les 32 tests de durcissement existants et la compilation ont été exécutés. Un contrôle HTTP du build confirme la page de préparation et les réponses GET/POST 503 sans cache lorsque le pilote est désactivé. La recette navigateur/mobile et la concurrence multi-connexion restent à réaliser. Aucune migration distante ni aucun déploiement n’ont été effectués. Le contrôle de pré-déploiement exige également `KOBO_WEBHOOK_SECRET`, absent de cet environnement : le configurer par le canal sécurisé habituel avant déploiement.

## Retour arrière
1. Mettre `HAROOLIFE_ENABLED` et `NEXT_PUBLIC_HAROOLIFE_ENABLED` à `false` (ou les supprimer) : l'API répond 503 et les entrées disparaissent.
2. Optionnel : `UPDATE public.haroolife_pilot SET enabled=false;` (conserve les données).
3. Suppression complète : `supabase/rollbacks/20261010_160000_haroolife_pilot_down.sql` (n'affecte aucune table existante).
