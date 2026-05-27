# FaîtiereHub

**Plateforme SaaS multi-tenant pour faîtières, unions et coopératives agricoles.**

FaîtiereHub digitalise la gestion des organisations agricoles en Afrique de l'Ouest : membres, cartes numériques, comptes d'exploitation, cotisations, marketplace, collecte terrain et annuaire fournisseurs certifiés.

🌐 **Production** : [www.faitierehub.com](https://www.faitierehub.com)

---

## Fonctionnalités

### Gestion des membres
- Enregistrement et profils complets (photo, localisation, parcelles)
- Cartes membres numériques avec QR code vérifiable
- Impression de cartes en batch
- Vérification publique par numéro de carte
- **Système de niveaux Bronze / Argent / Or** calculé à la volée

### Niveaux de carte membre
| Niveau | Critères |
|--------|----------|
| 🥉 Bronze | Membre actif + 1 cotisation payée (12 mois) |
| 🥈 Argent | Bronze + 1 parcelle + 1 production |
| 🥇 Or | Argent + 2 campagnes consécutives + 2 productions |

### Marketplace agricole
- Catalogue de produits, services, intrants, semences, équipements
- Filtres en cascade (région → préfecture → canton, culture, prix, certification, saison)
- Full-text search en français (PostgreSQL)
- Pagination server-side, cache client, URL-synced filters
- API REST publique pour intégrations externes

### Annuaire fournisseurs certifiés
- Page publique `/fournisseurs` listant les membres Argent et Or
- Filtres par culture et localité (cascade région → préfecture)
- Profil public sans données sensibles (pas de phone/email/adresse)
- Formulaire de contact → table `contact_requests`
- SEO dynamique : "Fournisseurs certifiés [culture] au Togo"
- Pagination server-side, rate limiting

### Comptes d'exploitation (Fiches techniques)
- Upload de fiches DOCX/Excel/PDF par les faîtières uniquement
- Localisation en cascade : Région → Préfecture → Canton
- Accès gratuit pour les membres (carte valide)
- Accès payant pour les non-membres (TMoney, Flooz)
- Classement par localité (canton, préfecture, région)

### Vérification QR premium (post-scan)
- Interface mobile ultra-moderne après scan du QR code
- Badge niveau Bronze/Argent/Or à côté du nom
- Section "Profil agriculteur" : cultures, superficie, saisons
- Label "Fournisseur certifié FENOMAT" si Argent/Or
- Menu 8 services (identité, exploitation, prix marché, technicien, parcelles, météo, intrants, cotisation)
- Timer de sécurité 60 secondes avec auto-expiry
- Bouton "Demander un devis" → `/fournisseurs/[memberId]`
- Support ancien format QR JSON legacy

### KoboCollect / KoboToolbox
- Formulaire XLSForm professionnel (8 sections, repeat groups, calculs, GPS, photos)
- Webhook temps réel pour réception des soumissions terrain
- Sync manuelle pull depuis l'API KoboToolbox (bouton "Synchroniser maintenant")
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

### Dashboard membre
- Widget "Votre profil agriculteur" avec barre de progression
- Critères manquants cliquables (liens vers sections concernées)
- Bouton action rapide pour passer au niveau suivant
- Auto-refresh après cotisation payée ou parcelle ajoutée

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
- Switcher faîtières uniquement (pas les coopératives simples)
- Gestion des coopératives (création, hiérarchie)
- Logs d'audit complets
- Paramètres plateforme

### Navigation fluide (style Facebook)
- Overlay de transition instantané lors du logout (pas de flash blanc)
- Overlay de transition lors du login → dashboard
- Pages auth chargent instantanément (zéro appel serveur)
- Timeout 8s avec message clair si serveur lent
- Redirection automatique `*.vercel.app` → `www.faitierehub.com`

---

## Architecture

### Stack technique

| Couche | Technologie |
|--------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript strict |
| UI | shadcn/ui (new-york), Tailwind CSS v4, Lucide icons |
| Backend | Supabase (PostgreSQL, Auth, Storage, RLS) |
| Rate Limiting | Upstash Redis (persistant) + in-memory (fallback) |
| Déploiement | Vercel (Edge + Serverless) |
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
```

### Sécurité

- **3 audits de sécurité** passés (score actuel : 9.2/10)
- RLS (Row Level Security) sur les 28 tables
- Hiérarchie-aware via `get_accessible_cooperative_ids()`
- Rôles dans `app_metadata` uniquement (jamais `user_metadata`)
- Rate limiting sur tous les endpoints publics (in-memory + Upstash Redis persistant)
- Secrets chiffrés AES-256-GCM
- Webhook Kobo avec timing-safe comparison + validation payload (taille + Zod)
- CSP strict-dynamic, HSTS, X-Frame-Options
- Input validation Zod sur toutes les entrées (y compris paramètres de recherche)
- Protection injection PostgREST (échappement ILIKE + séparateurs)
- Bucket `member-photos` privé avec signed URLs
- Vue SQL restrictive pour vérification publique (pas d'accès direct aux données sensibles)
- Forgot-password anti-énumération (message identique)
- Origin validation exacte sur embed (pas de `.includes()`)
- `security.txt` publié (RFC 9116)
- Leaked password protection (HaveIBeenPwned)
- pg_cron pour purge automatique des données obsolètes
- Script pré-déploiement (`npm run security:check`)
- Anti-cache multi-couche sur `/verify/*`
- Domain redirect 301 (vercel.app → faitierehub.com)

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
│   ├── verify/[card_number]/       # Vérification QR (mobile premium)
│   ├── dashboard/                  # Tableau de bord (authentifié)
│   │   ├── members/                # Gestion membres + badge niveau
│   │   ├── cards/                  # Cartes membres
│   │   ├── marketplace/            # Comptes d'exploitation (admin)
│   │   ├── cotisations/            # Cotisations
│   │   ├── parcelles/              # Parcelles agricoles
│   │   ├── analytics/              # Statistiques
│   │   ├── integrations/kobo/      # Configuration KoboCollect + sync
│   │   ├── kobo-setup/             # Guide setup KoboCollect
│   │   ├── embed/                  # Configuration widget embeddable
│   │   └── settings/               # Paramètres coopérative
│   ├── admin/                      # Panel super_admin
│   ├── embed/                      # Widget embeddable (iframe target)
│   └── api/
│       ├── marketplace/            # API marketplace publique
│       ├── fournisseurs/           # API fournisseurs certifiés
│       ├── contact-request/        # API formulaire contact fournisseur
│       ├── embed/                  # API embed (origin-validated)
│       ├── fiches/                 # Catalogue fiches techniques
│       ├── member-access/          # Vérification carte membre
│       ├── verify/[card_number]/   # API vérification carte (vue restrictive, rate limited)
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
│   ├── use-debounced.ts            # Debounce
│   └── use-paginated-query.ts      # Pagination Supabase
├── lib/
│   ├── supabase/                   # Clients Supabase (server + browser)
│   ├── security/                   # Assertions d'accès centralisées
│   ├── kobo/                       # Service de sync KoboCollect
│   ├── members/                    # Score (Bronze/Argent/Or) + public-profile
│   ├── auth/                       # Session, logout (Facebook-style)
│   ├── utils/                      # Crypto, rate-limit, rate-limit-persistent, logger
│   └── validators/                 # Schémas Zod
├── types/                          # Types TypeScript (domain.ts)
├── scripts/
│   └── pre-deploy-security-check.ts # Validation sécurité pré-déploiement
├── public/
│   ├── embed/                      # SDK JavaScript embeddable
│   └── images/partners/            # Logos partenaires (FENOMAT)
└── docs/
    ├── MARKETPLACE-KOBO-EMBED.md   # Architecture détaillée
    ├── kobo/                       # XLSForm documentation
    └── tests/                      # Guides de tests complets
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
UPSTASH_REDIS_REST_URL=           # https://xxx.upstash.io (optionnel, rate limiting persistant)
UPSTASH_REDIS_REST_TOKEN=         # Token Upstash (optionnel)
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
npm run typecheck       # TypeScript strict
npm run lint            # ESLint
npm run security:check  # Validation sécurité pré-déploiement (11 checks)
npm run test:e2e        # Tests Playwright
```

---

## Déploiement

Le projet est déployé automatiquement sur **Vercel** :
- Push sur `main` → déploiement production
- Push sur une branche → déploiement preview
- Toutes les URLs `*.vercel.app` redirigent 301 vers `www.faitierehub.com`

### Domaine

| URL | Usage |
|-----|-------|
| `www.faitierehub.com` | Production |
| `*.vercel.app` | Previews (redirigé en prod) |

---

## Base de données

28 tables PostgreSQL avec RLS, dont :

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
| `contact_requests` | Demandes de contact fournisseurs |
| `audit_logs` | Logs d'audit |
| `regions/prefectures/cantons/villages` | Géographie du Togo |
| `cultures` | Référentiel cultures agricoles |

### Fonctions SQL

| Fonction | Description | Accès |
|----------|-------------|-------|
| `get_member_score(uuid)` | Calcule le niveau Bronze/Argent/Or à la volée | authenticated |
| `get_accessible_cooperative_ids()` | Retourne les IDs accessibles (hiérarchie récursive) | authenticated |
| `search_marketplace(...)` | Recherche full-text avec tous les filtres | authenticated |
| `get_platform_totals()` | Statistiques plateforme (guard super_admin interne) | authenticated (super_admin) |
| `bootstrap_cooperative_admin(...)` | Auto-promotion sécurisée au signup | service_role uniquement |
| `increment_download_count(uuid)` | Compteur atomique de téléchargements | service_role uniquement |

### Vues SQL

| Vue | Description | Accès |
|----|-------------|-------|
| `member_cards_public` | Données carte restrictives pour vérification publique (pas de phone/email/id) | anon, authenticated |

---

## Équipe

| Nom | Rôle |
|-----|------|
| TATCHIDA Louis | Fondateur & CEO |

---

## Licence

Propriétaire — Tous droits réservés © 2025-2026 FaîtiereHub
