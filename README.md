# FaîtiereHub

**Écosystème SaaS multi-tenant pour faîtières, unions et coopératives agricoles au Togo.**

FaîtiereHub est la plateforme centrale d'un écosystème à trois composants :
- **FaîtiereHub** (ce dépôt) — interface web Next.js, gestion des organisations agricoles
- **AgriTogo** — moteur IA/ML multi-agents (6 agents, 3 modèles LLM) pour l'intelligence décisionnelle agricole
- **Haroo** — données de profils professionnels (Ouvrier, Acheteur, Agronome) intégrées nativement

Les trois partagent **une seule base de données Supabase**.

🌐 **Production** : [www.faitierehub.com](https://www.faitierehub.com)

---

## Fonctionnalités

### Gestion des membres
- Enregistrement et profils complets (photo, localisation, parcelles)
- Cartes membres numériques avec QR code vérifiable
- Impression de cartes en batch
- Vérification publique par numéro de carte (4 types : FAITIERE, OUVRIER, ACHETEUR, AGRONOME)
- **Système de niveaux Bronze / Argent / Or** calculé à la volée

### Niveaux de carte membre
| Niveau | Critères |
|--------|----------|
| 🥉 Bronze | Membre actif + 1 cotisation payée (12 mois) |
| 🥈 Argent | Bronze + 1 parcelle + 1 production |
| 🥇 Or | Argent + 2 campagnes consécutives + 2 productions |

### Vérification QR — 4 types de cartes
| Type | Source | Profil retourné |
|------|--------|-----------------|
| `FAITIERE` | Supabase FaîtiereHub | Membre, coopérative, niveau |
| `OUVRIER` | AgriTogo → Supabase (Haroo) | Compétences, cantons, offres emploi |
| `ACHETEUR` | AgriTogo → Supabase (Haroo) | Type, produits, préventes disponibles |
| `AGRONOME` | AgriTogo → Supabase (Haroo) | Spécialisations, badge, missions actives |

### AgriTogo — Intelligence Décisionnelle
- **6 agents spécialisés** : Market Intel, Quant Forecast, Risk, Decision, Irrigation, UX
- **3 modèles LLM** : Gemini (principal), Qwen (débat), Claude (validation)
- **5 modèles ML** : GARCH volatilité, XGBoost prévisions, K-Means segmentation agriculteurs, risque financier, KPI dashboard
- **Irrigation FAO-56** (AgriSmart) : besoins en eau multi-culture, bilan hydrique complet
- Accessible via `/api/v1/agent/chat`, `/api/v1/forecast`, `/api/v1/risk`, etc.

### Haroo — Professionnels Agricoles
- Profils **Ouvrier** : compétences, cantons de disponibilité, offres d'emploi saisonnier
- Profils **Acheteur** : type, produits recherchés, préventes agricoles disponibles
- Profils **Agronome** : spécialisations, badge validé, missions en cours
- Données hébergées dans Supabase (tables `haroo_*`)

### Marketplace agricole
- Catalogue de produits, services, intrants, semences, équipements
- Filtres en cascade (région → préfecture → canton, culture, prix, certification, saison)
- Full-text search en français (PostgreSQL)
- Pagination server-side, cache client, URL-synced filters
- API REST publique pour intégrations externes

### Annuaire fournisseurs certifiés
- Page publique `/fournisseurs` listant les membres Argent et Or
- Filtres par culture et localité (cascade région → préfecture)
- Profil public sans données sensibles
- Formulaire de contact → table `contact_requests`
- SEO dynamique : "Fournisseurs certifiés [culture] au Togo"

### Comptes d'exploitation (Fiches techniques)
- Upload de fiches DOCX/Excel/PDF par les faîtières uniquement
- Localisation en cascade : Région → Préfecture → Canton
- Accès gratuit pour les membres (carte valide)
- Accès payant pour les non-membres (TMoney, Flooz)

### KoboCollect / KoboToolbox
- Formulaire XLSForm professionnel (8 sections, GPS, photos)
- Webhook temps réel pour réception des soumissions terrain
- Sync manuelle pull depuis l'API KoboToolbox
- Retry queue avec exponential backoff

### Widget embeddable (SaaS White-Label)
- SDK JavaScript pour intégration sur sites externes
- 4 widgets : marketplace, vérification membre, fiches, dashboard
- Theme personnalisable, origin validation, sandbox iframe

### Dashboard membre
- Widget "Votre profil agriculteur" avec barre de progression
- Critères manquants cliquables
- Bouton action rapide pour passer au niveau suivant

---

## Architecture

### Vue d'ensemble de l'écosystème

```
┌─────────────────────────────────────────────────────────────┐
│                    UTILISATEURS                              │
│  Agriculteurs · Coopératives · Acheteurs · Agronomes        │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
┌─────────────▼──────────────┐  ┌────────▼───────────────────┐
│   FAITIEREHUB (Next.js)     │  │   AGRITOGO (Flask)          │
│   Vercel Edge               │  │   Railway                   │
│                             │  │                             │
│  • Gestion coopératives     │  │  • 6 agents IA              │
│  • Cartes membres           │  │  • 5 modèles ML             │
│  • Marketplace              │  │  • Irrigation FAO-56        │
│  • Fiches techniques        │  │  • /api/v1/haroo/verify/*   │
│  • Widget embeddable        │  │  • /api/v1/forecast         │
│  • Vérification QR          │  │  • /api/v1/agent/chat       │
│                             │  │                             │
│  AGRITOGO_API_URL ──────────┼─►│  SUPABASE_URL               │
└──────────────┬──────────────┘  └────────────┬───────────────┘
               │                               │
               └───────────────┬───────────────┘
                               │
              ┌────────────────▼────────────────┐
              │         SUPABASE (Neon PG)       │
              │      Base de données unifiée     │
              │                                  │
              │  Tables FaîtiereHub :            │
              │  member_cards, members,          │
              │  cooperatives, profiles,         │
              │  fiches_techniques, parcelles... │
              │                                  │
              │  Tables Haroo :                  │
              │  haroo_ouvrier_profiles          │
              │  haroo_acheteur_profiles         │
              │  haroo_agronome_profiles         │
              │  haroo_ouvrier_cantons           │
              │  haroo_acheteur_cantons          │
              │  haroo_jobs                      │
              │  haroo_presales                  │
              │  haroo_missions                  │
              │                                  │
              │  Géographie partagée :           │
              │  regions, prefectures, cantons   │
              │  cultures                        │
              └──────────────────────────────────┘
```

### Flux de vérification de carte

```
Scan QR → FaîtiereHub /api/verify/[card]
    │
    ├─► member_cards WHERE card_type='FAITIERE'
    │       └─► Retourne profil membre + coopérative
    │
    └─► Pas trouvé → AgriTogo /api/v1/haroo/verify/[card]
            ├─► card_type='OUVRIER' → haroo_ouvrier_profiles + haroo_jobs
            ├─► card_type='ACHETEUR' → haroo_acheteur_profiles + haroo_presales
            └─► card_type='AGRONOME' → haroo_agronome_profiles + haroo_missions
```

### Stack technique

| Couche | Technologie |
|--------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript strict |
| UI | shadcn/ui (new-york), Tailwind CSS v4, Lucide icons |
| Backend | Supabase (PostgreSQL, Auth, Storage, RLS) |
| AI/ML Engine | AgriTogo — Flask 3.1, 6 agents (Gemini/Qwen/Claude), 5 ML models |
| Rate Limiting | Upstash Redis (persistant) + in-memory (fallback) |
| Déploiement FH | Vercel (Edge + Serverless) |
| Déploiement AI | Railway |
| Collecte terrain | KoboToolbox / KoboCollect |
| Monitoring | Sentry, Vercel Analytics |
| Sécurité | CSP strict-dynamic, HSTS, rate limiting, Zod validation |

### Hiérarchie multi-tenant

```
Super Admin (plateforme)
└── Faîtière (ex: FENOMAT)
    └── Union
        └── Coopérative
            └── Membres (Bronze → Argent → Or)

Professionnels Haroo (carte indépendante) :
  OUVRIER / ACHETEUR / AGRONOME
```

### Sécurité

- **3 audits de sécurité** (score actuel : 9.2/10)
- RLS sur toutes les tables (34 tables dont 8 Haroo)
- Hiérarchie-aware via `get_accessible_cooperative_ids()`
- Rôles dans `app_metadata` uniquement (jamais `user_metadata`)
- Rate limiting sur tous les endpoints publics (in-memory + Upstash Redis)
- Secrets chiffrés AES-256-GCM
- Input validation Zod sur toutes les entrées
- Vue SQL restrictive pour vérification publique
- `security.txt` publié (RFC 9116)
- Leaked password protection (HaveIBeenPwned)

---

## Partenaire

| Organisation | Description |
|-------------|-------------|
| **FENOMAT** | Fédération Nationale des Organisations de Maraîchers du Togo |

---

## Structure du projet

```
├── app/
│   ├── page.tsx                    # Page d'accueil
│   ├── marketplace/                # Marketplace publique
│   ├── fournisseurs/               # Annuaire fournisseurs certifiés
│   │   └── [memberId]/             # Profil public + formulaire contact
│   ├── auth/                       # Login, signup, forgot/reset password
│   ├── verify/[card_number]/       # Vérification QR (FAITIERE + Haroo)
│   ├── dashboard/                  # Tableau de bord (authentifié)
│   │   ├── members/                # Gestion membres + badge niveau
│   │   ├── cards/                  # Cartes membres
│   │   ├── marketplace/            # Comptes d'exploitation (admin)
│   │   ├── cotisations/            # Cotisations
│   │   ├── parcelles/              # Parcelles agricoles
│   │   ├── analytics/              # Statistiques
│   │   ├── integrations/kobo/      # Configuration KoboCollect + sync
│   │   ├── embed/                  # Configuration widget embeddable
│   │   └── settings/               # Paramètres coopérative
│   ├── admin/                      # Panel super_admin
│   ├── embed/                      # Widget embeddable (iframe target)
│   └── api/
│       ├── marketplace/            # API marketplace publique
│       ├── fournisseurs/           # API fournisseurs certifiés
│       ├── embed/                  # API embed (origin-validated)
│       ├── fiches/                 # Catalogue fiches techniques
│       ├── member-access/          # Vérification carte membre
│       ├── verify/[card_number]/   # API vérification carte (tous types)
│       ├── integrations/kobo/      # Config + sync Kobo
│       ├── webhooks/kobo/          # Webhook KoboCollect
│       └── widget/                 # Widget API legacy
├── components/
│   ├── ui/                         # shadcn/ui components
│   ├── shared/                     # Composants partagés
│   ├── marketplace/                # Composants marketplace
│   ├── fournisseurs/               # Carte fournisseur
│   ├── members/                    # ScoreBadge (Bronze/Argent/Or)
│   └── dashboard/                  # AgriScoreWidget
├── hooks/
│   ├── use-marketplace-filters.ts  # Filtres URL-synced
│   ├── use-marketplace-data.ts     # Data + cache marketplace
│   ├── use-member-score.ts         # Hook score avec auto-refresh
│   └── use-paginated-query.ts      # Pagination Supabase
├── lib/
│   ├── supabase/                   # Clients Supabase (server + browser)
│   ├── security/                   # Assertions d'accès centralisées
│   ├── kobo/                       # Service de sync KoboCollect
│   ├── members/                    # Score (Bronze/Argent/Or) + public-profile
│   ├── auth/                       # Session, logout (Facebook-style)
│   └── utils/                      # Crypto, rate-limit, rate-limit-persistent
├── types/                          # Types TypeScript (domain.ts)
├── scripts/
│   └── pre-deploy-security-check.ts
└── public/
    ├── embed/                      # SDK JavaScript embeddable
    └── images/partners/            # Logos partenaires
```

---

## Démarrage rapide

### Pré-requis

- Node.js 18+
- Compte Supabase (projet créé)
- AgriTogo déployé sur Railway (pour Haroo + IA)

### Installation

```bash
git clone https://github.com/Louistatch/Saas.git
cd Saas
npm install
```

### Configuration

```env
# Supabase (base de données unifiée)
NEXT_PUBLIC_SUPABASE_URL=https://hhnswekjgbxckluqnszo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...          # service_role (server-only)

# Sécurité
INTEGRATION_SECRET_KEY=              # openssl rand -base64 32
KOBO_WEBHOOK_SECRET=                 # openssl rand -hex 32

# AgriTogo (IA/ML + Haroo)
AGRITOGO_API_URL=https://agritogo-production.up.railway.app

# Rate limiting distribué (optionnel, recommandé en prod)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=
```

### Développement

```bash
npm run dev
```

### Build production

```bash
npm run build
npm run security:check  # 11 checks pré-déploiement
npm run start
```

---

## Base de données

34 tables PostgreSQL avec RLS dans un seul projet Supabase :

### Tables FaîtiereHub
| Table | Description |
|-------|-------------|
| `profiles` | Utilisateurs (liés à auth.users) |
| `cooperatives` | Coopératives avec hiérarchie parent/enfant |
| `members` | Membres des coopératives |
| `member_cards` | Cartes numériques (FAITIERE/OUVRIER/ACHETEUR/AGRONOME) |
| `marketplace_products` | Produits marketplace |
| `fiches_techniques` | Comptes d'exploitation |
| `parcelles` | Parcelles agricoles |
| `productions` | Données de production |
| `cotisations` | Cotisations membres |
| `integrations` | Configurations intégrations |
| `kobo_sync_queue` | Queue de retry pour sync Kobo |
| `embed_configs` | Configuration widgets |
| `contact_requests` | Demandes de contact fournisseurs |
| `audit_logs` | Logs d'audit |

### Tables géographiques (partagées)
| Table | Description |
|-------|-------------|
| `regions` | 5 régions du Togo |
| `prefectures` | 37 préfectures |
| `cantons` | 38 cantons |
| `cultures` | 27 cultures agricoles |

### Tables Haroo (professionnels agricoles)
| Table | Description |
|-------|-------------|
| `haroo_ouvrier_profiles` | Profils ouvriers agricoles |
| `haroo_acheteur_profiles` | Profils acheteurs |
| `haroo_agronome_profiles` | Profils agronomes |
| `haroo_ouvrier_cantons` | M2M ouvrier ↔ cantons de disponibilité |
| `haroo_acheteur_cantons` | M2M acheteur ↔ cantons d'intervention |
| `haroo_jobs` | Offres d'emploi saisonnier |
| `haroo_presales` | Préventes agricoles |
| `haroo_missions` | Missions agronome |

---

## Déploiement

| Service | Plateforme | URL |
|---------|-----------|-----|
| FaîtiereHub (Next.js) | Vercel | www.faitierehub.com |
| AgriTogo (Flask + IA) | Railway | agritogo-production.up.railway.app |
| Base de données | Supabase | hhnswekjgbxckluqnszo.supabase.co |

### Variables Railway (AgriTogo)
```env
SUPABASE_URL=https://hhnswekjgbxckluqnszo.supabase.co
SUPABASE_SERVICE_KEY=eyJ...   # ← à configurer
GEMINI_API_KEY=...
DASHSCOPE_API_KEY=...
```

---

## Équipe

| Nom | Rôle |
|-----|------|
| TATCHIDA Louis | Fondateur & CEO |

---

## Licence

Propriétaire — Tous droits réservés © 2025-2026 FaîtiereHub
