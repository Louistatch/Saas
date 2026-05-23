# FaîtiereHub — Marketplace + KoboCollect + Embed SaaS

## Architecture Globale

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SITES EXTERNES                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │  WordPress   │  │   Webflow    │  │  faitiere-a.org/embed        │  │
│  │  (embed.js)  │  │  (iframe)    │  │  marketplace.faitiere-a.org  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┬───────────────┘  │
│         │                 │                          │                  │
│         └─────────────────┼──────────────────────────┘                  │
│                           │ postMessage + CORS                          │
└───────────────────────────┼─────────────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────────────┐
│                     FAITIEREHUB (Vercel)                                 │
│                           │                                             │
│  ┌────────────────────────┴────────────────────────────────────────┐    │
│  │                    PUBLIC LAYER                                  │    │
│  │  /marketplace          → Public marketplace (SSR + client)      │    │
│  │  /embed/widget         → Embeddable widget (iframe target)      │    │
│  │  /api/marketplace      → REST API (CORS, cached)                │    │
│  │  /api/embed            → Embed data API (origin-validated)      │    │
│  │  /api/fiches           → Fiches catalog (public, cached)        │    │
│  │  /api/member-access    → Card verification (rate-limited)       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    AUTHENTICATED LAYER                           │    │
│  │  /dashboard/embed      → Embed config (admin)                   │    │
│  │  /dashboard/marketplace→ Product management (admin)             │    │
│  │  /dashboard/kobo-setup → KoboCollect config (admin)             │    │
│  │  /api/integrations/kobo/sync → Manual sync trigger              │    │
│  │  /api/webhooks/kobo    → Webhook receiver (secret-auth)         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    SERVICES                                      │    │
│  │  lib/kobo/sync-service.ts  → Pull + process + retry queue       │    │
│  │  hooks/use-marketplace-*   → Client-side filter + data hooks    │    │
│  │  components/marketplace/*  → Reusable UI components             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────────────┐
│                        SUPABASE                                          │
│  ┌────────────────────────┴────────────────────────────────────────┐    │
│  │  marketplace_products  → Full-text search + GIN indexes         │    │
│  │  embed_configs         → Per-tenant embed settings              │    │
│  │  kobo_sync_queue       → Retry queue with exponential backoff   │    │
│  │  search_marketplace()  → Server-side RPC with all filters       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────────────┐
│                     KOBOTOOLBOX                                           │
│  ┌────────────────────────┴────────────────────────────────────────┐    │
│  │  XLSForm: faitierehub_recensement_v1                            │    │
│  │  • 8 sections (identification, localisation, coopérative,       │    │
│  │    parcelles, production, cotisations, équipements, validation) │    │
│  │  • Repeat groups pour parcelles multiples                       │    │
│  │  • Calculs automatiques (superficie totale, rendement, revenu)  │    │
│  │  • Géolocalisation + photos + QR codes                          │    │
│  │  • Offline-first, sync au retour de connexion                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## PARTIE 1 — Marketplace Ultra-Fluide

### Architecture des filtres

```
URL State ←→ useMarketplaceFilters() ←→ useMarketplaceData() ←→ Supabase RPC
     ↕                                        ↕
  Browser History                        Client Cache (30s)
```

### Stratégie de performance

| Technique | Implémentation |
|-----------|---------------|
| URL state sync | `useSearchParams()` + `router.push(url, { scroll: false })` |
| Optimistic filtering | `useTransition()` pour UI non-bloquante |
| Debounced search | 300ms debounce sur le champ texte |
| Skeleton loading | `ProductCardSkeleton` pendant le chargement |
| Server-side filtering | RPC `search_marketplace()` avec tous les filtres |
| Full-text search | `to_tsvector('french', ...)` + `plainto_tsquery` |
| Client cache | Map avec TTL 30s par combinaison de filtres |
| Cascade géographique | Région → Préfecture → Canton (filtré côté client) |
| Pagination | Server-side via `LIMIT/OFFSET` dans le RPC |
| Indexes | GIN (full-text, arrays), B-tree (FK, price, date) |

### Composants

| Composant | Rôle |
|-----------|------|
| `hooks/use-marketplace-filters.ts` | URL sync, debounce, filter state |
| `hooks/use-marketplace-data.ts` | Data fetching, cache, reference data |
| `components/marketplace/filter-bar.tsx` | Filtres en cascade, mobile sheet |
| `components/marketplace/product-card.tsx` | Card produit + skeleton |
| `components/marketplace/product-grid.tsx` | Grid + sort + pagination |
| `app/marketplace/page.tsx` | Page publique marketplace |
| `app/api/marketplace/route.ts` | API REST publique |

### Indexes PostgreSQL

```sql
-- Full-text search (French)
CREATE INDEX idx_marketplace_products_search ON marketplace_products 
  USING gin (to_tsvector('french', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(culture,'')));

-- Filter indexes
CREATE INDEX idx_marketplace_products_category ON marketplace_products(category);
CREATE INDEX idx_marketplace_products_culture ON marketplace_products(culture);
CREATE INDEX idx_marketplace_products_region ON marketplace_products(region_id);
CREATE INDEX idx_marketplace_products_prefecture ON marketplace_products(prefecture_id);
CREATE INDEX idx_marketplace_products_available ON marketplace_products(available) WHERE available = true;
CREATE INDEX idx_marketplace_products_price ON marketplace_products(price);

-- Array indexes (certification, tags)
CREATE INDEX idx_marketplace_products_certification ON marketplace_products USING gin (certification);
CREATE INDEX idx_marketplace_products_tags ON marketplace_products USING gin (tags);
```

---

## PARTIE 2 — KoboCollect

### Architecture de synchronisation

```
KoboCollect (terrain)
       │
       ▼ (connexion retrouvée)
KoboToolbox Cloud
       │
       ├──→ Webhook POST /api/webhooks/kobo (temps réel)
       │         │
       │         ▼
       │    Validation + Mapping + Insert/Update
       │
       └──→ Pull API /api/integrations/kobo/sync (manuel/cron)
                 │
                 ▼
            fetchKoboSubmissions()
                 │
                 ▼
            processKoboSubmissions()
                 │
                 ├──→ members (create/update)
                 ├──→ parcelles (create)
                 ├──→ productions (create)
                 ├──→ kobo_sync_queue (tracking)
                 └──→ audit_logs (traçabilité)
```

### Retry Queue

| Champ | Usage |
|-------|-------|
| `status` | pending → processing → completed/failed |
| `attempts` | Compteur (max 5) |
| `next_retry_at` | Exponential backoff (30s, 60s, 120s, 240s, 300s) |
| `error_message` | Diagnostic |
| `submission_id` | Unique par coopérative (dédupliquation) |

### XLSForm — Résumé

Le formulaire `faitierehub_recensement_v1` couvre :

1. **Identification** : nom, prénom, sexe, âge, téléphone, photo, pièce d'identité
2. **Localisation** : région, préfecture, canton, village, GPS
3. **Coopérative** : appartenance, statut, date adhésion, QR carte existante
4. **Parcelles** : repeat group (nom, superficie, culture, type agriculture, irrigation, tenure, GPS, photo)
5. **Production** : campagne, quantité, rendement, destination, prix vente
6. **Cotisations** : statut, montant, dernière date
7. **Équipements** : possédés, besoins exprimés, accès crédit
8. **Validation** : enquêteur, signature, résumé automatique

### Robustesse terrain

| Contrainte | Solution |
|-----------|----------|
| Mauvaise connexion | Formulaire 100% offline, sync au retour |
| Appareils bas de gamme | Pas de pulldata, listes embarquées, photos compressées |
| Utilisateurs peu techniques | Logique conditionnelle, validations inline, résumé final |
| Doublons | Détection par téléphone + coopérative |
| Corruption données | Validation Zod côté serveur, retry queue |
| Imports massifs | Batch processing, 1000 submissions max par pull |

---

## PARTIE 3 — SaaS Embeddable

### Méthodes d'intégration

| Méthode | Complexité | Cas d'usage |
|---------|-----------|-------------|
| Data attributes (auto-init) | ⭐ Simple | WordPress, HTML statique |
| iFrame direct | ⭐ Simple | Tout site |
| SDK JavaScript | ⭐⭐ Moyen | Contrôle avancé, thème custom |
| API REST | ⭐⭐⭐ Avancé | Apps custom, mobile |

### Sécurité embed

| Mesure | Implémentation |
|--------|---------------|
| Origin validation | `allowed_origins` dans `embed_configs` |
| Sandbox iframe | `allow-scripts allow-same-origin allow-popups allow-forms` |
| Rate limiting | 60 req/min/IP sur `/api/embed` |
| CORS headers | Dynamiques basés sur `allowed_origins` |
| CSP compatible | `X-Frame-Options` non appliqué sur `/embed/*` |
| Communication sécurisée | `postMessage` avec vérification d'origin |

### Widgets disponibles

| Widget | Description | Données |
|--------|-------------|---------|
| `marketplace` | Catalogue produits | Products (available=true) |
| `member_verify` | Vérification carte | Card number → member info |
| `fiches` | Fiches techniques | Published fiches |
| `dashboard` | Stats publiques | Member count, product count |

### White-label

```typescript
// Configuration par tenant
embed_configs {
  theme: {
    primaryColor: '#16a34a',  // Couleur de la faîtière
    borderRadius: '8px',
    fontFamily: 'Inter'
  },
  logo_url: 'https://...',   // Logo personnalisé
  custom_domain: 'marketplace.faitiere-a.org',
  allowed_origins: ['https://faitiere-a.org', 'https://www.faitiere-a.org']
}
```

---

## PARTIE 4 — Performance

### Stratégie RSC / Client Components

| Pattern | Usage |
|---------|-------|
| RSC (Server) | Layout, metadata, static content |
| Client Components | Marketplace filters, forms, interactive UI |
| Streaming | `<Suspense>` sur les pages marketplace/embed |
| Edge caching | `Cache-Control: s-maxage=60` sur APIs publiques |

### Optimisations appliquées

| Technique | Fichier |
|-----------|---------|
| Debounced search (300ms) | `hooks/use-marketplace-filters.ts` |
| Client-side cache (30s TTL) | `hooks/use-marketplace-data.ts` |
| Abort previous requests | `hooks/use-marketplace-data.ts` |
| Skeleton loading | `components/marketplace/product-card.tsx` |
| Lazy loading images | `loading="lazy"` sur les images produit |
| URL state (no re-render) | `useSearchParams()` + `useTransition()` |
| Server-side pagination | RPC `search_marketplace()` |
| Full-text search (French) | GIN index + `plainto_tsquery` |
| Stale-while-revalidate | Headers sur APIs publiques |
| Cascade filtering (client) | Prefectures/cantons filtrés en mémoire |
| ResizeObserver (embed) | Auto-resize iframe sans polling |

---

## PARTIE 5 — Structure des fichiers créés

```
├── app/
│   ├── marketplace/page.tsx          # Page publique marketplace
│   ├── embed/
│   │   ├── layout.tsx                # Layout minimal (pas de sidebar)
│   │   └── widget/page.tsx           # Widget embeddable (iframe target)
│   ├── dashboard/embed/page.tsx      # Config embed (admin)
│   ├── api/
│   │   ├── marketplace/route.ts      # API REST marketplace
│   │   ├── embed/route.ts            # API embed (origin-validated)
│   │   └── integrations/kobo/
│   │       └── sync/route.ts         # Sync manuelle Kobo
├── components/marketplace/
│   ├── index.ts                      # Barrel exports
│   ├── filter-bar.tsx                # Filtres en cascade
│   ├── product-card.tsx              # Card + skeleton
│   └── product-grid.tsx              # Grid + sort + pagination
├── hooks/
│   ├── use-marketplace-filters.ts    # URL-synced filters
│   └── use-marketplace-data.ts       # Data fetching + cache
├── lib/kobo/
│   └── sync-service.ts              # Pull + process + retry
├── public/embed/
│   └── faitierehub-embed.js         # SDK JavaScript embeddable
├── docs/kobo/
│   └── xlsform-recensement.md       # XLSForm complet documenté
└── supabase/migrations/
    └── marketplace_and_embed_tables  # Tables + indexes + RLS + RPC
```

---

## Checklist Production

- [x] Marketplace: filtres en cascade avec URL sync
- [x] Marketplace: full-text search PostgreSQL (French)
- [x] Marketplace: pagination server-side
- [x] Marketplace: client cache 30s
- [x] Marketplace: skeleton loading
- [x] Marketplace: mobile-first (Sheet pour filtres)
- [x] Marketplace: sorting dynamique
- [x] KoboCollect: XLSForm professionnel (8 sections)
- [x] KoboCollect: webhook receiver (timing-safe)
- [x] KoboCollect: sync service avec retry queue
- [x] KoboCollect: duplicate detection (phone)
- [x] KoboCollect: audit logging
- [x] KoboCollect: field mapping configurable
- [x] Embed: SDK JavaScript (auto-init + programmatic)
- [x] Embed: iframe avec auto-resize
- [x] Embed: origin validation
- [x] Embed: theme personnalisable
- [x] Embed: 4 widgets (marketplace, verify, fiches, dashboard)
- [x] Embed: CORS + rate limiting
- [x] Embed: sandbox iframe
- [x] DB: RLS sur toutes les nouvelles tables
- [x] DB: Indexes optimisés (GIN, B-tree, partial)
- [x] DB: RPC search_marketplace() avec tous les filtres
- [x] Security: rate limiting sur tous les endpoints publics
- [x] Security: input validation (Zod)
- [x] Performance: stale-while-revalidate caching
- [x] Performance: abort previous requests
- [x] Performance: lazy loading images
- [x] Build: TypeScript strict ✓
- [x] Build: Next.js build ✓
