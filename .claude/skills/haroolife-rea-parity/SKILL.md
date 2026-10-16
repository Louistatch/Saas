---
name: haroolife-rea-parity
description: Reconstruire les mécaniques observables d'un simulateur de vie urbain (référence Lagos Life) dans HarooLife sans copier ses actifs ni son code. À utiliser pour audit de parcours, comparaison, implémentation et tests.
---

# HarooLife × REA — observation -> preuve -> code -> jeu jouable

## Objectif

Livrer **Lomé Life / HarooLife** dans `Louistatch/Saas` : simulateur de vie 3D original centré sur Lomé puis sur les villes du Togo. Utiliser REA (morluto/rea, MIT) pour COMPRENDRE le comportement observable des fonctions publiques de référence, et le moteur déjà présent dans HarooLife pour implémenter des mécaniques indépendantes. Ne pas créer un menu factice, une image statique, un nouveau moteur concurrent ou une démo séparée.

**La présence de ce skill ne signifie pas que REA est installé ou qu'une analyse a été réalisée.** Ne jamais inventer captures, preuves ou tests.

## Installation (PC, terminal, confirmation humaine)

1. Vérifier `node --version` : REA exige Node >=22.19, ou >=24.11, ou 26+. Vérifier `npx --version`.
2. Examiner la documentation officielle de REA : https://github.com/morluto/rea et https://github.com/morluto/rea/blob/main/docs/browser-observation.md.
3. Depuis le dépôt local, lancer `npx rea-agents@latest setup --client claude_code` ; relire puis approuver **les modifications proposées**. Cette action installe un serveur MCP pour Claude Code et le skill de REA ; elle ne s'exécute pas automatiquement via ce dépôt. Redémarrer Claude Code.
4. Lancer `npx rea-agents@latest doctor --client claude_code --skill --json`. Ne pas considérer un serveur absent comme fonctionnel.

**Sécurité** : commencer par l'observation passive d'un site public auquel l'utilisateur a légitimement accès. Ne jamais contourner authentification, anti-bot, licence, achats, autorisations ni explorer d'API privées. Ne pas collecter des données d'autres joueurs. Les traces contenant des jetons/URL sensibles doivent rester locales et non commit. Ne pas importer scripts, meshes, voix, marques, captures ou textures propriétaires de la référence. Préférer les ressources Kenney CC0 déjà dans le projet et OpenStreetMap/ODbL avec attribution appropriée pour la géographie.

## REA — parcours de collecte reproductible

À réaliser **avec le navigateur local de l'utilisateur**, pas dans un environnement sans accès ni compte, et uniquement dans le périmètre autorisé :

- Ouvrir un Chrome/Chromium séparé avec `--remote-debugging-port=9222` et `--user-data-dir` temporaire, limité à l'interface loopback ; ouvrir soi-même la page de référence (vérifier l'URL officielle, notamment https://lagoslife.app).
- Avec le MCP REA, découvrir l'onglet par `list_browser_targets`, puis utiliser `inspect_web_page`, `capture_web_screenshot`, `observe_web_session` et `analyze_web_bundle` **uniquement si autorisé**. Le navigateur CDP de REA est passif : Claude ne doit jamais prétendre qu'il clique à la place de l'utilisateur via cet outil.
- Pour chaque action, noter : état AVANT, geste de l'utilisateur, état APRÈS, capture/ID Evidence REA si disponible, résultat visible, latence et exception.
- Parcours prioritaires : première visite/invité; choix personnage et conservation; carte/lieux; avatar + marcher/suivre; entrer/sortir de la maison; six besoins; travail, carrière, salaire et progression; portefeuille/achat/logement; téléphone et messages; panneaux sponsorisés; sessions mobile et PC.
- Comparer la référence avec **HarooLife**, avec 2 profils navigateur de test et mêmes dimensions mobiles. Les différences non observées restent `INCONNU`, jamais `VALIDÉ`.
- Consigner le tableau dans `docs/haroolife/rea-parity-matrix.md` : `parcours | référence observée | Evidence | HarooLife actuel | écart | priorité | implémentation | tests | statut`.

Pour une observation 100 % passive via la CLI (après découverte du TARGET_ID) :
```bash
rea list-browser-targets http://127.0.0.1:9222 --json
rea inspect-web-page http://127.0.0.1:9222 TARGET_ID --observation-ms 1000 --json
rea capture-web-screenshot http://127.0.0.1:9222 TARGET_ID --json
```
Ne pas envoyer des captures REA brutes dans GitHub sans revue de confidentialité.

## Code existant à RÉUTILISER (main, octobre 2026)

- Entrée et monde vivant : `app/haroolife/layout.tsx`, `components/haroolife/lome-life-immersive.tsx`.
- Scènes 3D / LOD / mouvement / intérieurs : `components/haroolife/city/city-world.tsx`, `components/haroolife/engine-three/interior-three.tsx`, `lib/haroolife/city/player.ts`, `lib/haroolife/city/quality.ts`.
- Carte, bâtiments, portes et cheminement : `lib/haroolife/city/world.ts`, `lib/haroolife/city/navigation.ts`, `lib/haroolife/city/interaction.ts`, `lib/haroolife/city/life.ts`.
- Personnage/tenues : `lib/haroolife/city/avatar.ts`, kits CC0 sous `public/haroolife/vendor/`.
- Besoins, métiers et économie fictive : `lib/haroolife/lome-life-engine.ts`.
- Chat : `components/haroolife/live-chat.tsx`, `lib/haroolife/realtime/`, `realtime/`.
- FaîtiereHub (Haroo ouvrier/acheteur/agronome/cooperatives) : `lib/haroolife/domain/`. Ne pas confondre monnaies fictives et paiements/avoirs réels.

## Exécution en tranches VERTICALES

**P0** : démarrer comme invité sans boucle de connexion, choisir personnage, rejoindre le monde, se déplacer sur téléphone/PC, frapper à une porte, entrer, sortir, sauvegarder et reprendre. Réparer avant de créer de nouveaux lieux. Doit fonctionner avec WebGL indisponible (message exploitable et mode alternatif).

**P1** : six besoins réellement décroissants; métiers avec lieu, service, compétences, progression et salaire fictif; loger/se reposer/se nourrir; navigation vers sa maison avec marqueur unique. Chaque bouton change un état visible, persistant et testable.

**P2** : carte et quartiers réalistes du Togo (OpenStreetMap avec attribution, coordonnées lat/lon -> repère monde), transport et retour, PNJ animés, événements, téléphone, messages temps réel sûrs, publicité/monétisation avec consentement.

**P3** : continuité entre sessions et appareils pour les utilisateurs connectés sans fuite inter-tenant; immobilier et économie multijoueur transactionnelle côté serveur; performance mobile mesurée, modération, crash recovery.

Chaque tranche : ticket/hypothèse -> observation REA sourcée -> test d'acceptation -> composant/domain action -> intégration dans monde persistant -> test Playwright sur mobile + desktop -> rapports de performance -> PR. Ne passer à la suivante que si la précédente marche réellement dans le jeu.

## Contraintes techniques

- Aucun import de code propriétaire de Lagos Life, ni récupération de ses assets privés. Reproduire le **comportement générique**, pas l'expression protégée.
- Ne pas rebâtir PlayCanvas, Three.js ou les déplacements existants. Une seule instance du monde du layout; pas de route qui démonte le jeu.
- Préserver strictement les variables et contrôles Supabase, `profiles.role`, `profiles.haroo_type`, RLS et le domaine de la production réelle. Ne pas effectuer de migrations en production depuis ce workflow.
- Ne pas modifier `main` ni déployer sans revue. Branches de travail, PR, CI verte, déploiement de prévisualisation seulement.
- Ne pas expliquer « REA a analysé Lagos Life » sans Evidence ID horodaté provenant d'une capture réelle.
- Attribuer OpenStreetMap si utilisé; consulter licence de chaque asset avant ajout.

## Définition de terminé

Le joueur ouvre /haroolife, choisit son avatar, marche, entre chez lui, mange/dort, réalise un travail, gagne des FCFA fictifs, passe à un autre jour, conserve son état et lit/envoie des messages de manière sûre. **Tous les contrôles affichés fonctionnent** sur Android et desktop; typecheck, lint, tests et E2E passent. Une vidéo ou un gif issus d'un navigateur de test démontre le parcours, sinon statut `non vérifié`.

Réponse attendue de Claude à chaque livraison : numéro PR, liens preview, commits, preuves REA ou `non collectées`, erreurs de test, parcours réellement exécutés, risques non résolus.
