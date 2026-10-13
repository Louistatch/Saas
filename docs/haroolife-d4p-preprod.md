# HarooLife D4P — préproduction et validation du jalon

Date : 13 octobre 2026. Branche `feat/haroolife-d4p`, PR vers `main` **non fusionnée**, aucun
déploiement en production.

## 1. État Git

Base `origin/main` = `e966467`. Commits du jalon : M0 `566b08c`, M1 `e9db64b`, M2 `98b8d35`,
audit `4e713aa`, puis le commit de préproduction (diagnostic en jeu, joystick, tests, docs).
Vérifié : arbre propre avant commit, aucun fichier `.env*` suivi (`.env.vercel.tatchida` est
ignoré par `.gitignore`), aucune clé : les seuls jetons présents sont des JWT de test factices
(signature `c2ln`, comptes de fixtures), captures ≤ 1 Mo.

## 2. Environnement Supabase de test — bloqué, décision requise

Le projet de production `hhnswekjgbxckluqnszo` est dans l'organisation `qazjyybxarppbytougxz`,
offre **Free** :

- les branches Supabase exigent l'offre Pro (25 $/mois) et chaque branche est facturée à l'heure
  (micro : 0,01344 $/h ≈ 10 $/mois si elle reste ouverte), hors plafond de dépense ;
- un nouveau projet gratuit est impossible : l'organisation a déjà deux projets actifs (limite
  Free), `hhnswekjgbxckluqnszo` et `tilportefolio`.

Je n'ai donc appliqué M1 et M2 **nulle part** en dehors de PGlite. Options, à choisir :

| Option | Coût | Effet |
|---|---|---|
| A. Passer l'organisation en Pro + une branche de test | 25 $/mois + ~0,013 $/h de branche | Copie du schéma de production, migrations M1/M2 appliquées sur la branche seulement. |
| B. Mettre en pause `tilportefolio`, créer un projet gratuit `haroolife-staging` | 0 $ | Projet vide : il faut rejouer toutes les migrations du dépôt avant M1/M2. `tilportefolio` devient inaccessible pendant la pause. |
| C. Nouvelle organisation gratuite (compte séparé) | 0 $ | Comme B sans toucher `tilportefolio` ; clés à placer dans Vercel (préversion seulement). |

**Preuve provisoire (sans dépense)** : `tests/haroolife-d4p-rehearsal.test.mjs` recrée dans
PGlite le schéma de production lu en lecture seule (enum `user_role` avec ses 8 libellés,
`haroo_profile_type`, colonnes exactes de `profiles`, `cantons`, `haroolife_residents`), applique
M1 puis M2, vérifie les salons par rôle, le flux publicitaire et les deux retours arrière (les
résidents restent intacts). Résultat : réussi. Ce n'est pas un Supabase réel : la RLS d'auth,
`auth.uid()` et les rôles Postgres sont simulés.

Lecture seule de la production : aucune table `haroolife_chat_*` ni `haroolife_ad_*` n'existe ;
la migration `haroolife_togo` y est déjà appliquée.

### Migrations du jalon

| Migration | Contenu | Retour arrière |
|---|---|---|
| M1 `supabase/migrations/20261013_120000_haroolife_realtime_chat.sql` | tables `haroolife_chat_messages`, `_reports`, `_blocks` ; fonctions `haroolife_chat_me`, `_send`, `_history`, `_edit`, `_delete`, `_report`, `_block` (contrôle d'appartenance au salon dans chaque fonction) | `supabase/rollbacks/20261013_120000_haroolife_realtime_chat.rollback.sql`, testé : ne retire que les objets `haroolife_chat_*` |
| M2 `supabase/migrations/20261013_130000_haroolife_ads.sql` | tables `haroolife_ad_campaigns`, `_campaign_versions`, `_stats` (agrégées) ; fonctions d'administration réservées au super_admin (validation, déplacement, retour de version) | `supabase/rollbacks/20261013_130000_haroolife_ads.rollback.sql`, testé : ne retire que les objets `haroolife_ad_*` |

Aucune n'altère ni ne supprime de donnée existante.

## 3. Prévisualisation

Vercel ne construit les préversions que si `HAROOLIFE_PREVIEWS=1` (`vercel.json`). J'ai ajouté,
**pour la seule branche `feat/haroolife-d4p` et l'environnement Preview**, les variables
`HAROOLIFE_PREVIEWS=1`, `HAROOLIFE_ENABLED=true`, `NEXT_PUBLIC_HAROOLIFE_ENABLED=true`. La
production n'est pas modifiée.

Ce que la préversion fait réellement :

- le jeu 3D complet (joystick, taxi, portes, intérieurs, panneaux avec les campagnes internes) ;
- **pas de messagerie temps réel** : aucun relais n'est hébergé (voir
  `haroolife-d4p-hosting.md`) et les tables M1 n'existent pas ; le jeu garde les messages de la
  place existants ;
- les panneaux affichent les campagnes internes : l'API publicitaire répond sans campagne tant
  que M2 n'est pas appliquée, sans erreur visible ;
- elle utilise les clés Supabase **de production** déjà configurées pour Preview : un compte
  connecté y joue sur ses vraies données HarooLife, comme sur le site actuel.

Diagnostic : ajouter `?diag=1` à l'adresse (mémorisé sur le téléphone), ou Téléphone → « Diagnostic
images/s et réseau ». Une ligne compacte (images/s, p95, réseau, messagerie) ; toucher pour le
détail (appels de rendu, triangles, qualité, pixels, mémoire, tâches longues, débit et RTT estimés
par Android, latence d'une requête réelle, reconnexions, messages en attente, cause de la dernière
coupure). `?diag=0` le retire.

## 4. Motorola via le PC Windows (même Wi-Fi)

Pour tester la messagerie ou mesurer sans passer par Internet.

```powershell
# Une fois, dans PowerShell lancé en administrateur : ouvrir les ports sur le réseau privé
New-NetFirewallRule -DisplayName 'HarooLife LAN' -Direction Inbound -Protocol TCP -LocalPort 3000,3001 -Action Allow -Profile Private

# À la racine du dépôt
git fetch origin feat/haroolife-d4p
git checkout feat/haroolife-d4p
npm ci
powershell -ExecutionPolicy Bypass -File scripts\haroolife-lan.ps1            # build + service
powershell -ExecutionPolicy Bypass -File scripts\haroolife-lan.ps1 -NoBuild    # sans rebuild
powershell -ExecutionPolicy Bypass -File scripts\haroolife-lan.ps1 -Realtime   # + relais :3001
```

Le script affiche l'adresse à ouvrir sur le téléphone, par exemple
`http://192.168.1.20:3000/haroolife?diag=1`. Le Wi-Fi du PC doit être en profil « Privé ».

Mesures détaillées : câble USB, débogage USB activé sur le Motorola, `chrome://inspect` sur le
PC, puis dans la console : `__LOME_PERF_RESET()`, jouer 60 s, `copy(JSON.stringify(__LOME_PERF))`.

Limite : avec `-Realtime` et le `.env.local` de production, le relais vérifie les comptes réels
mais les tables M1 n'existent pas en production : la messagerie répondra « indisponible » tant que
l'environnement de test (§2) n'est pas créé et pointé.

## 5. Joystick, coupures réseau, permissions

| Vérification | Résultat |
|---|---|
| Relâchement si l'application passe en arrière-plan (notification, appel, changement d'app) | Corrigé : `blur` et `visibilitychange` relâchent le stick. Test e2e : stick tenu, perte de focus → vitesse 0, puis stick de nouveau utilisable. |
| Doigt perdu sans `pointerup` (geste système Android) | Corrigé : un nouvel appui reprend la main si le précédent n'a plus la capture. |
| Bulle de statut ou panneau diagnostic sur le joystick (412 et 360 px, statut de 95 caractères sur 3 lignes) | Aucun recouvrement : les 6 points testés du joystick répondent au joystick ; la bulle est sous le stick, le diagnostic au-dessus à gauche. |
| Échec intermittent « vitesse 0 stick plein » vu une fois | Non reproduit (4 + 2 exécutions, dont CPU ×4). Le test indique désormais l'élément sous le doigt en cas d'échec. Cause non établie. |
| Coupure réseau du téléphone | e2e : hors ligne, message mis en file, retour réseau → envoyé une seule fois, rattrapage dans l'ordre. |
| Arrêt brutal du relais (`kill -9`) | Hors ligne en 0,3 s, tentatives visibles dans le diagnostic, retour en ligne automatique après relance, « Reconnexions 1 ». |
| Jeton expiré | `auth_expired` puis reconnexion avec jeton rafraîchi (test relais). |
| Permissions des messages | Test relais : un membre du même salon ne peut ni modifier ni supprimer le message d'autrui ; une personne hors du salon ne peut ni écrire, ni lire l'historique, ni modifier, ni supprimer, ni signaler, ni émettre « en train d'écrire » ; le texte reste inchangé ; l'auteur peut modifier et supprimer. Répétition sur schéma de production : rôles `member`, `none` + `ouvrier`, `cooperative_admin` sans maison. |

## 6. Validation complète

Voir le compte rendu de la PR pour les chiffres de la dernière exécution (typecheck, Biome,
tests unitaires, suite Lomé sur les profils bureau et Android, CI).

Hors périmètre, volontairement : la maquette Figma de sélection du personnage avant lancement
n'est pas intégrée ; elle sera validée séparément.
