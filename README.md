# FaîtiereHub

**Plateforme SaaS multi-tenant pour faîtières, unions et coopératives agricoles.**

FaîtiereHub digitalise la gestion des organisations agricoles en Afrique de l'Ouest : membres, cartes numériques, comptes d'exploitation, cotisations, marketplace et collecte terrain.

🌐 **Production** : [www.faitierehub.com](https://www.faitierehub.com)

---

## Fonctionnalités

### Gestion des membres
- Enregistrement et profils complets (photo, localisation, parcelles)
- Cartes membres numériques avec QR code vérifiable
- Impression de cartes en batch
- Vérification publique par numéro de carte

### Marketplace agricole
- Catalogue de produits, services, intrants, semences, équipements
- Filtres en cascade (région → préfecture → canton, culture, prix, certification, saison)
- Full-text search en français (PostgreSQL)
- Pagination server-side, cache client, URL-synced filters
- API REST publique pour intégrations externes

### Comptes d'exploitation (Fiches techniques)
- Upload de fiches DOCX/Excel/PDF par les faîtières
- Accès gratuit pour les membres (carte valide)
- Accès payant pour les non-membres (TMoney, Flooz)
- Classement par localité (canton, préfecture, région)

### KoboCollect / KoboToolbox
- Formulaire XLSForm professionnel (8 sections, repeat groups, calculs, GPS, photos)
- Webhook temps réel pour réception des soumissions terrain
- Sync manuelle pull depuis l'API KoboToolbox
- Retry queue avec exponential backoff
- Détection de doublons, audit trail complet
- Fonctionne offline sur appareils bas de gamme

### Widget embeddable (SaaS White-Label)
- SDK JavaScript pour intégration sur sites externes
- 4 widgets : marketplace, vérification membre, fiches, dashboard
- Auto-init via data attributes ou API programmatique
- Theme personnalisable (couleurs, border-radius, font)
- Origin validation, sandbox iframe, auto-resize
- Compatible WordPress, Webflow, HTML statique

### Cotisations
- Suivi des cotisations par membre et campagne
- Types : cotisation, crédit, remboursement, amende, don
- Statuts : pending, paid, overdue, cancelled

### Statistiques
- Dashboard avec métriques clés
- Membres actifs, cartes générées, téléchargements
- Filtrage par coopérative et période

### Administration
- Panel super_admin pour gestion cross-tenant
- Gestion des coopératives (création, hiérarchie)
- Logs d'audit complets
- Paramètres plateforme

---

## Architecture

### Stack technique

| Couche | Technologie |
|--------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| UI | shadcn/ui (new-york), Tailwind CSS v4, Lucide icons |
| Backend | Supabase (PostgreSQL, Auth, Storage, RLS) |
| Déploiement | Vercel (Edge + Serverless) |
| Collecte terrain | KoboToolbox / KoboCollect |
| Monitoring | Sentry, Vercel Analytics |

### Hiérarchie multi-tenant

```
Super Admin (plateforme)
└── Faîtière (ex: FENOMAT)
    └── Union
        └── Coopérative
            └── Membres
```

### Sécurité

- RLS (Row Level Security) sur les 27 tables
- Hiérarchie-aware via `get_accessible_cooperative_ids()`
- Rôles dans `app_metadata` uniquement (jamais `user_metadata`)
- Rate limiting sur tous les endpoints publics
- Secrets chiffrés AES-256-GCM
- Webhook Kobo avec timing-safe comparison
- CSP, HSTS, X-Frame-Options
- Input validation Zod sur toutes les entrées

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
│   ├── auth/                       # Login, signup, forgot/reset password
│   ├── dashboard/                  # Tableau de bord (authentifié)
│   │   ├── members/                # Gestion membres
│   │   ├── cards/                  # Cartes membres
│   │   ├── marketplace/            # Comptes d'exploitation (admin)
│   │   ├── cotisations/            # Cotisations
│   │   ├── analytics/              # Statistiques
│   │   ├── integrations/           # Intégrations (Kobo, etc.)
│   │   ├── embed/                  # Configuration widget embeddable
│   │   └── kobo-setup/             # Configuration KoboCollect
│   ├── admin/                      # Panel super_admin
│   ├── embed/                      # Widget embeddable (iframe target)
│   └── api/                        # API Routes
│       ├── marketplace/            # API marketplace publique
│       ├── embed/                  # API embed (origin-validated)
│       ├── fiches/                 # Catalogue fiches techniques
│       ├── member-access/          # Vérification carte membre
│       ├── integrations/kobo/      # Config + sync Kobo
│       ├── webhooks/kobo/          # Webhook KoboCollect
│       └── widget/                 # Widget API legacy
├── components/
│   ├── ui/                         # shadcn/ui components
│   ├── shared/                     # Composants partagés (logo, loading, etc.)
│   └── marketplace/                # Composants marketplace
├── hooks/                          # React hooks custom
├── lib/
│   ├── supabase/                   # Clients Supabase (server + browser)
│   ├── security/                   # Assertions d'accès centralisées
│   ├── kobo/                       # Service de sync KoboCollect
│   ├── auth/                       # Session, logout
│   ├── utils/                      # Crypto, rate-limit, logger, etc.
│   └── validators/                 # Schémas Zod
├── types/                          # Types TypeScript (domain.ts)
├── public/
│   ├── embed/                      # SDK JavaScript embeddable
│   └── images/partners/            # Logos partenaires
└── docs/
    ├── MARKETPLACE-KOBO-EMBED.md   # Architecture détaillée
    ├── kobo/                       # XLSForm documentation
    └── tests/                      # Guides de tests
```

---

## Démarrage rapide

### Pré-requis

- Node.js 18+
- Compte Supabase (projet créé)
- Git

### Installation

```bash
git clone https://github.com/Louistatch/Saas.git
cd Saas
npm install
```

### Configuration

Copier `.env.example` vers `.env.local` et remplir :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
INTEGRATION_SECRET_KEY=           # openssl rand -base64 32
KOBO_WEBHOOK_SECRET=              # openssl rand -hex 32
```

### Développement

```bash
npm run dev
```

### Build production

```bash
npm run build
npm run start
```

### Vérifications

```bash
npm run typecheck    # TypeScript strict
npm run lint         # ESLint
npm run test:e2e     # Tests Playwright
```

---

## Déploiement

Le projet est déployé automatiquement sur **Vercel** :
- Push sur `main` → déploiement production
- Push sur une branche → déploiement preview

### Domaine

| URL | Usage |
|-----|-------|
| `www.faitierehub.com` | Production |
| `*.vercel.app` | Previews |

---

## Base de données

27 tables PostgreSQL avec RLS, dont :

| Table | Description |
|-------|-------------|
| `profiles` | Utilisateurs (liés à auth.users) |
| `cooperatives` | Coopératives avec hiérarchie parent/enfant |
| `members` | Membres des coopératives |
| `member_cards` | Cartes numériques avec QR |
| `marketplace_products` | Produits marketplace |
| `fiches_techniques` | Comptes d'exploitation |
| `parcelles` | Parcelles agricoles |
| `productions` | Données de production |
| `cotisations` | Cotisations membres |
| `integrations` | Configurations intégrations (Kobo, etc.) |
| `kobo_sync_queue` | Queue de retry pour sync Kobo |
| `embed_configs` | Configuration widgets embeddables |
| `audit_logs` | Logs d'audit |
| `regions/prefectures/cantons/villages` | Géographie du Togo |
| `cultures` | Référentiel cultures agricoles |

---

## Équipe

| Nom | Rôle |
|-----|------|
| TATCHIDA Louis | Fondateur & CEO |

---

## Licence

Propriétaire — Tous droits réservés © 2025-2026 FaîtiereHub
