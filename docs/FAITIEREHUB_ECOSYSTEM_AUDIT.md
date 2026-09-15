# Audit de l'écosystème FaîtiereHub

Date : 2026-09-15. Méthode : lecture directe du code (pas de suppositions),
recherche de toute occurrence de Haroo/AgriTogo/FreeCollector/MEAL/ProSMAT/
Academy/LouisFarm, inspection du compte Vercel connecté à cette session,
inspection Supabase (schéma réel).

## Executive Summary

FaîtiereHub n'a **qu'un seul écosystème réel connecté**, pas six :

1. **FaîtiereHub** (ce repo) — Next.js 16, hébergement supposé Vercel
2. **Haroo** — pas une app séparée : des tables dans la **même** base
   Supabase, avec son propre espace `/haroo` dans ce même repo
3. **AgriTogo** — un service Flask externe (Railway, selon la doc), jamais
   appelé directement par l'utilisateur : uniquement via des routes proxy
   serveur (`/api/verify/*`, `/api/agrismart`)

**FreeCollector, MEAL, ProSMAT, LouisFarm n'existent nulle part dans ce
repository** — aucune occurrence de ces noms dans le code, la doc, ou les
variables d'environnement. Ce ne sont pas des services "cassés" ou
"déconnectés" : ils ne sont simplement pas intégrés à ce jour. Je ne les
ai pas fabriqués dans la cartographie ci-dessous — les inventer aurait été
plus dangereux qu'utile.

**Découverte critique** : le compte Vercel connecté à cette session
n'héberge **pas** FaîtiereHub — il contient un seul projet ("portefolio",
repo `Louistatch/portefolio`, sans rapport). Je n'ai donc **aucune
visibilité sur le déploiement de production réel** (variables
d'environnement effectives, logs runtime, erreurs 500) de ce repo. Tout ce
qui suit sur AgriTogo est déduit du code, pas observé en production.

## Architecture actuelle (BEFORE)

```
FAÎTIEREHUB (Next.js, ce repo)
├── Core (auth, multi-tenant, RLS)
├── Coopératives / Membres / Cartes QR   — natif
├── AgriMarket / AgriCredit / AgriAcademy / Carnet / Matching — natif
├── Widget Embed (embed_configs)          — natif
├── Haroo (/haroo)                        — connecté (même Supabase, espace séparé)
└── AgriTogo (jamais d'URL directe)       — externe, proxifié
    ├── /api/haroo/auth/register  → AGRITOGO_API_URL/api/v1/haroo/auth/register
    ├── /api/verify/[card]        → AGRITOGO_API_URL/api/v1/haroo/verify/[card]
    ├── /api/agrismart            → AGRITOGO_API_URL/api/v1/agrismart/*
    └── /api/haroo/insights       → météo + prix (Open-Meteo + market_prices, PAS AgriTogo)
```

Point important déjà identifié et corrigé dans une session précédente :
`/api/verify/[card_number]/route.ts` appelait deux endpoints AgriTogo
différents pour la même opération (`/api/cards/verify/.../ ` vs le bon
`/api/v1/haroo/verify/[card]`) — corrigé.

## Cartographie des services

| Service | Type | Hébergement | Frontend | Backend | Auth | Intégration | Statut | Action |
|---|---|---|---|---|---|---|---|---|
| FaîtiereHub Core | Native | Ce repo (Vercel supposé) | ✅ dans le repo | ✅ Next.js API routes | Supabase Auth | — | **HEALTHY** | Aucune |
| Coopératives/Membres/Cartes | Native | Ce repo | ✅ | ✅ | Supabase Auth | RLS + `assertTenant` | **HEALTHY** | Aucune |
| AgriMarket/AgriCredit/AgriAcademy/Carnet | Native | Ce repo | ✅ | ✅ | Supabase Auth | RLS | **HEALTHY** | Aucune |
| Widget Embed | Native | Ce repo | ✅ | ✅ | Public (lecture) | `embed_configs` (table créée récemment — n'existait pas avant, cf. commit `dce7e52`) | **HEALTHY** | Aucune |
| Haroo | Connected | Même Supabase, même repo | ✅ `/haroo` | ✅ tables `haroo_*` | Supabase Auth (`app_metadata.role`) | Directe (même DB) | **HEALTHY** | Aucune |
| AgriTogo — inscription/vérif carte | External | Railway (déclaré, non vérifié) | ❌ aucun (proxy serveur only) | Flask, hors repo | Aucune (service_role côté proxy) | `AGRITOGO_API_URL` | **UNKNOWN** — jamais testé contre une instance réelle depuis cet environnement (pas d'accès réseau sortant) | Confirmer en prod que `AGRITOGO_API_URL` répond |
| AgriTogo — AgriSmart (irrigation) | External | Railway (déclaré) | ❌ aucune route dédiée | Flask | — | `AGRITOGO_API_URL` | **UNKNOWN** + **pas de point d'entrée navigable** (voir ci-dessous) | Créer une vraie route ou l'assumer comme fonctionnalité embarquée |
| Météo (ensemble 3 modèles) | Native | Ce repo | via `/verify/[card]` | Open-Meteo (gratuit, sans clé) | Aucune | Directe HTTP | **HEALTHY** | Aucune |
| FreeCollector | — | **Inexistant** | — | — | — | — | **N/A** | Aucune trace dans le repo |
| MEAL | — | **Inexistant** | — | — | — | — | **N/A** | Aucune trace dans le repo |
| ProSMAT | — | **Inexistant** | — | — | — | — | **N/A** | Aucune trace dans le repo |
| LouisFarm | — | **Inexistant** | — | — | — | — | **N/A** | Aucune trace dans le repo |

## Incohérence détectée (Phase 4)

Il n'y a **pas** de cas où l'interface actuelle donne l'impression d'un
module intégré alors qu'il s'agit en réalité d'une ancienne application
externe séparée — je n'ai trouvé aucune ancienne URL Vercel/Render/Railway
codée en dur pointant vers un "FaîtiereHub v1" ou une autre app. Le seul
sous-domaine géré est le redirect `*.vercel.app` → `www.faitierehub.com`
dans `middleware.ts` (protection contre les previews Vercel indexées),
ce qui est une bonne pratique, pas une incohérence.

**Vraie zone grise** : AgriTogo n'a **aucun point d'entrée utilisateur
navigable**. Son assistant IA et son module AgriSmart n'existent que comme
onglets à l'intérieur du flux dynamique `/verify/[card_number]` (après scan
d'une carte précise), pas comme une route `/assistant` ou `/agrismart`
générique. Un utilisateur du dashboard ne peut PAS "ouvrir AgriTogo"
directement aujourd'hui. C'est pourquoi le Service Launcher (ci-dessous) ne
liste pas AgriTogo comme entrée cliquable — le lister aurait créé un lien
mort.

## Décision architecturale (Phase 4, A–F)

**Haroo → option D partiellement déjà en place (identité partagée)**,
correctement : même base Supabase, même `app_metadata.role`, redirection
automatique côté middleware et sidebar. Rien à changer.

**AgriTogo → option B (intégration via API), déjà le choix fait** et le
bon choix : c'est un service Python/ML qui n'a aucune raison d'être
réécrit en Next.js. Le garder externe, proxifié, est correct. Ce qui manque
n'est pas l'intégration mais un **point d'entrée navigable** — c'est une
lacune UX, pas un problème d'architecture.

## Authentification (Phase 8)

Une seule identité aujourd'hui : Supabase Auth, `app_metadata.role` fait
autorité (jamais `user_metadata` — respecté partout dans le code vérifié).
Haroo n'a pas besoin de SSO : c'est la même session. AgriTogo n'a pas de
notion d'utilisateur final côté FaîtiereHub — les appels serveur→serveur
n'authentifient pas l'utilisateur final auprès d'AgriTogo (à confirmer côté
AgriTogo lui-même, hors du périmètre de ce repo). Aucune action requise
maintenant ; pas de SSO improvisé à construire.

## Ce qui a été livré (Phase 6/11)

- `lib/services/registry.ts` — Service Registry centralisé, typé
  (`native` / `connected` / `external`), filtré par rôle. Les 17 entrées
  natives viennent directement des `NAV_SECTIONS` réelles du dashboard
  (aucune invention) + Haroo.
- `components/shared/service-launcher.tsx` — bouton **"+ Services"**,
  construit sur le composant `Command` (cmdk) déjà présent dans le repo :
  recherche instantanée, navigation clavier, catégories, Escape/clic
  extérieur — tout ça vient gratuitement de cmdk, pas réinventé.
  Raccourci `Cmd+K` / `Ctrl+K` en plus du clic.
- Câblé dans `app/dashboard/layout.tsx`, dans la barre du haut, sans
  toucher au reste de la navigation existante (sidebar, sheet mobile,
  sélecteur de coopérative intacts).

## Ce qui n'a pas été fait (honnêteté sur les limites)

- **Pas de test live contre AgriTogo** : aucun accès réseau sortant vers
  un service externe depuis ce sandbox (confirmé à plusieurs reprises dans
  les sessions précédentes — Supabase et CinetPay ont eu le même blocage).
  Le statut `unknown` dans la table ci-dessus reflète ça honnêtement plutôt
  que de prétendre à un test qui n'a pas eu lieu.
- **Pas de vérification de la config Vercel réelle** : le compte Vercel
  connecté n'héberge pas ce projet.
- **AgriTogo n'a toujours pas de route dédiée** — décision volontairement
  laissée à l'utilisateur plutôt que de créer une route au jugé (Phase 5 :
  ne pas casser/inventer sans validation).

## Build & vérifications exécutées

- `npm run typecheck` → 0 erreur
- Le serveur de dev démarre sans crash ; `/dashboard` redirige proprement
  (307) vers `/auth/login` pour un visiteur non authentifié — confirme que
  `ServiceLauncher` et le registre compilent et s'intègrent sans casser le
  middleware ou le layout existants
- Pas de test de connexion réelle effectué (pas d'identifiants de test
  disponibles dans ce sandbox) — la palette elle-même (ouverture, recherche,
  clic, Escape) n'a donc pas été vérifiée à l'écran, seulement à la
  compilation/lint. À vérifier manuellement avant mise en production.

## AFTER

```
FAÎTIEREHUB
     │
"+ Services" (Cmd+K)
     │
┌────┴────┬──────────┬─────────┬──────────┬────────┐
Coopérative Agricole  Analyse   Gestion  Écosystème
│           │          │         │          │
Membres   AgriMarket  Stats   Templates    Haroo
Cartes    Carnet      Carte   Techniciens  (AgriTogo :
Cotisations Matching  Academy Intégrations  pas de point
Parcelles  Credit               Kobo/Embed  d'entrée navigable
                                             — non listé)
```

Rien n'a été supprimé, aucune route cassée, aucun schéma Supabase modifié,
aucun secret touché.
