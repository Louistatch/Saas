# Architecture — Écosystème FaîtiereHub / AgriTogo / Haroo

## Version actuelle : v1.4 — Base de données unifiée Supabase

---

## Vue d'ensemble de l'écosystème

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              UTILISATEURS                                     │
│   Agriculteurs · Acheteurs · Agronomes · Ouvriers · Admins Coopératives       │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
       ┌────────────▼──────────────┐   ┌──────────▼────────────────┐
       │    FAITIEREHUB            │   │      AGRITOGO              │
       │    Next.js 16 / Vercel    │   │   Flask 3.1 / Railway      │
       │                           │   │                            │
       │  Fonctions principales :  │   │  Intelligence décisionnelle│
       │  ▸ Gestion coopératives   │   │                            │
       │  ▸ Cartes membres QR      │◄──┤  ▸ 6 agents IA (LLM)      │
       │  ▸ Marketplace            │   │  ▸ 5 modèles ML            │
       │  ▸ Fiches techniques      │   │  ▸ Irrigation FAO-56       │
       │  ▸ Widget embeddable      │   │  ▸ Haroo verify proxy      │
       │  ▸ KoboCollect sync       │   │                            │
       │  ▸ Vérification QR (×4)   │   │  API : /api/v1/...         │
       │                           │   │    haroo/verify/<card>     │
       │  AGRITOGO_API_URL ────────┼──►│    agent/chat              │
       └────────────┬──────────────┘   │    forecast / risk         │
                    │                  │    agrismart/calculate     │
                    └──────────────────┘
                                   │
                    ┌──────────────▼──────────────────────────┐
                    │                SUPABASE                  │
                    │         (projet : hhnswekjgbxckluqnszo) │
                    │                                          │
                    │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
                    │  │   Auth   │  │PostgreSQL│  │Storage │ │
                    │  │ (GoTrue) │  │  34 tbls │  │ 3 bkts │ │
                    │  └──────────┘  └──────────┘  └────────┘ │
                    └──────────────────────────────────────────┘
```

---

## Couche FaîtiereHub (Next.js 16)

```
┌─────────────────────────────────────────────────────────────────┐
│                         VERCEL EDGE                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  proxy.ts (auth gate)                                     │  │
│  │  • getUser() → validate JWT                               │  │
│  │  • Role from app_metadata ONLY (never user_metadata)      │  │
│  │  • No prefetch bypass for protected routes                │  │
│  │  • CSP + HSTS + security headers injected                 │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │                                      │
│  ┌───────────────┐  ┌────┴─────────┐  ┌─────────────────────┐  │
│  │  App Router   │  │  API Routes  │  │  Webhook Endpoints  │  │
│  │  (RSC + CC)   │  │  /api/widget │  │  /api/webhooks/kobo │  │
│  │               │  │  /api/fiches │  │  (secret mandatory) │  │
│  │               │  │  /api/verify │  │  (timing-safe)      │  │
│  └───────┬───────┘  └──────┬───────┘  └──────────┬──────────┘  │
│          │                 │                      │             │
│  ┌───────┴─────────────────┴──────────────────────┴──────────┐  │
│  │  Security Layer (lib/security/)                           │  │
│  │  • assertAuthenticated() / assertRole() / assertTenant()  │  │
│  │  • Rate limiting (per-IP, per-endpoint, all public APIs)  │  │
│  │  • Rate limiting persistant (Upstash Redis si configuré)  │  │
│  │  • Input validation (Zod schemas)                         │  │
│  │  • UUID format enforcement                                │  │
│  │  • ILIKE injection prevention                             │  │
│  └───────────────────────────┬───────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
```

---

## Couche AgriTogo (Flask 3.1)

```
┌─────────────────────────────────────────────────────────────────┐
│                      AGRITOGO — RAILWAY                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │   Decision Intelligence Engine                          │    │
│  │                                                         │    │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐             │    │
│  │   │ Market   │  │  Quant   │  │   Risk   │             │    │
│  │   │  Intel   │  │ Forecast │  │  Agent   │             │    │
│  │   │ (Gemini) │  │ (Gemini) │  │ (Claude) │             │    │
│  │   └──────────┘  └──────────┘  └──────────┘             │    │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐             │    │
│  │   │Decision  │  │   UX     │  │Irrigation│             │    │
│  │   │  Agent   │  │  Agent   │  │(AgriSmart│             │    │
│  │   │ (debate) │  │  (Qwen)  │  │ FAO-56)  │             │    │
│  │   └──────────┘  └──────────┘  └──────────┘             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │   Modèles ML                                            │    │
│  │   • GARCH volatilité prix          (arch)               │    │
│  │   • XGBoost prévisions             (xgboost)            │    │
│  │   • K-Means segmentation           (scikit-learn)       │    │
│  │   • Risque financier               (statsmodels)        │    │
│  │   • KPI dashboard                  (pandas)             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │   Module Haroo (app/haroo/)                             │    │
│  │   • verify_card() → member_cards + haroo_*_profiles     │    │
│  │   • _build_ouvrier() → compétences + offres emploi      │    │
│  │   • _build_acheteur() → préventes agricoles             │    │
│  │   • _build_agronome() → badge + missions actives        │    │
│  │   Client : supabase-py (même SUPABASE_URL/SERVICE_KEY)  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  API REST :                                                      │
│    GET  /api/v1/health                                           │
│    GET  /api/v1/prix/<produit>                                   │
│    POST /api/v1/forecast                                         │
│    POST /api/v1/risk                                             │
│    POST /api/v1/segmentation                                     │
│    GET  /api/v1/kpi                                              │
│    POST /api/v1/agrismart/calculate                              │
│    POST /api/v1/agent/chat                                       │
│    GET  /api/v1/haroo/verify/<card_number>      ← NEW            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Couche Base de Données (Supabase — 34 tables)

```
┌─────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                 │
│                  hhnswekjgbxckluqnszo                            │
│                                                                  │
│  ── FaîtiereHub (26 tables) ───────────────────────────────     │
│                                                                  │
│  Identité & Auth           Territoire (partagé)                 │
│  ├── profiles              ├── regions (5)                       │
│  ├── cooperatives          ├── prefectures (37)                  │
│  ├── members               ├── cantons (38)                      │
│  └── member_cards          └── cultures (27)                     │
│       card_type IN                                               │
│       (FAITIERE,OUVRIER,                                         │
│        ACHETEUR,AGRONOME)  Agri                                  │
│                            ├── fiches_techniques                 │
│  Finance                   ├── parcelles                         │
│  ├── cotisations           ├── productions                       │
│  └── purchases             └── marketplace_products              │
│                                                                  │
│  Opérations                Logs & Config                         │
│  ├── integrations          ├── audit_logs                        │
│  ├── kobo_sync_queue       ├── member_access_logs                │
│  ├── embed_configs         ├── platform_settings                 │
│  ├── documents             ├── cooperative_settings              │
│  └── contact_requests      └── templates                         │
│                                                                  │
│  ── Haroo (8 tables) ──────────────────────────────────────     │
│                                                                  │
│  Profils                   Données contextuelles                 │
│  ├── haroo_ouvrier_profiles├── haroo_jobs                        │
│  ├── haroo_acheteur_profiles   (offres emploi saisonnier)        │
│  ├── haroo_agronome_profiles├── haroo_presales                   │
│  ├── haroo_ouvrier_cantons     (préventes agricoles)             │
│  └── haroo_acheteur_cantons├── haroo_missions                    │
│      (M2M)                     (missions agronome)               │
│                                                                  │
│  ── Fonctions SQL ─────────────────────────────────────────     │
│  • get_member_score(uuid)          → Bronze/Argent/Or            │
│  • get_accessible_cooperative_ids() → hiérarchie récursive       │
│  • search_marketplace(...)         → full-text                   │
│  • get_platform_totals()           → super_admin only            │
│  • bootstrap_cooperative_admin()   → service_role only           │
│  • increment_download_count(uuid)  → service_role only           │
│                                                                  │
│  ── Vues SQL ──────────────────────────────────────────────     │
│  • member_cards_public   → vérification publique (sans PII)      │
│                                                                  │
│  ── Storage buckets ───────────────────────────────────────     │
│  • member-photos    : privé, signed URLs, RLS par hiérarchie     │
│  • fiches-techniques: privé, admins only (signed URLs membres)   │
│  • templates        : privé, RLS par coopérative accessible      │
│                                                                  │
│  ── RLS ───────────────────────────────────────────────────     │
│  Toutes les 34 tables ont RLS activé                             │
│  Haroo: lecture publique (verification) + service_role all       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flux de vérification de carte QR

```
Scan QR → /verify/[card_number]
    │
    ▼
/api/verify/[card_number]   (FaîtiereHub — Next.js API Route)
    │
    ├── 1. Rate limit (10/min/IP, Upstash Redis)
    ├── 2. Format validation (Zod regex ^[A-Z0-9]{2,5}-\d{4,6}$)
    ├── 3. Expansion variantes O↔0, I↔1 (confusion visuelle)
    │
    ├── Lookup Supabase : member_cards WHERE card_number IN variants
    │       AND status = 'active'
    │
    │   ┌─ TROUVÉ (card_type = 'FAITIERE') ──────────────────────┐
    │   │  SELECT members + cooperatives                          │
    │   │  Retourne : {source:'faitierehub', member, cooperative} │
    │   └──────────────────────────────────────────────────────── ┘
    │
    └── PAS TROUVÉ → Fallback AgriTogo
            │
            ▼
        fetch AGRITOGO_API_URL/api/v1/haroo/verify/[card]
            │
            ├── Lookup member_cards WHERE card_type IN
            │   ('OUVRIER','ACHETEUR','AGRONOME')
            │
            ├─ OUVRIER ──────────────────────────────────────────┐
            │  haroo_ouvrier_profiles + haroo_ouvrier_cantons    │
            │  + haroo_jobs (canton match, statut OUVERTE)       │
            │  Retourne : {source:'haroo', ouvrier, offres}      │
            └────────────────────────────────────────────────────┘
            ├─ ACHETEUR ─────────────────────────────────────────┐
            │  haroo_acheteur_profiles + haroo_acheteur_cantons  │
            │  + haroo_presales (filtre par prefecture)          │
            │  Retourne : {source:'haroo', acheteur, preventes}  │
            └────────────────────────────────────────────────────┘
            └─ AGRONOME ─────────────────────────────────────────┐
               haroo_agronome_profiles (avec canton/prefecture)  │
               + haroo_missions (DEMANDE|EN_COURS)               │
               Retourne : {source:'haroo', agronome, missions}   │
               └────────────────────────────────────────────────┘
```

---

## Modèle de sécurité

### Principes

1. **Defense in depth** — Proxy (serveur) + RLS (DB) + validation (app) + assertions centralisées
2. **Least privilege** — Chaque rôle n'accède qu'au strict nécessaire
3. **Never trust the client** — Rôles dans `app_metadata` uniquement
4. **Tenant isolation** — `get_accessible_cooperative_ids()` sur toutes les tables
5. **Rate limit everything public** — Tous les endpoints publics limités par IP

### Hiérarchie RBAC (FaîtiereHub)

```
SUPER_ADMIN          → accès total, cross-tenant
FAITIERE_ADMIN       → hiérarchie complète, upload fiches, génération cartes
UNION_ADMIN          → unions + coopératives enfants
COOPERATIVE_ADMIN    → coopérative seule, membres, cartes
MEMBER               → profil + carte + marketplace
GUEST                → marketplace publique (accès payant fiches)
```

### Protection des routes

| Route | Protection | Rôle minimum |
|-------|-----------|--------------|
| `/dashboard/*` | Proxy + ProtectedRoute | authenticated |
| `/admin/*` | Proxy + ProtectedRoute(super_admin) | super_admin |
| `/api/verify/[card]` | Rate limit (10/min/IP) + Zod + timing-safe | public |
| `/api/marketplace` | Rate limit (120/min/IP) + CORS | public |
| `/api/fiches` | Rate limit (120/min/IP) | public |
| `/api/integrations/kobo` | Auth + assertAccess() | cooperative_admin |
| `/api/webhooks/kobo` | KOBO_WEBHOOK_SECRET timing-safe | — |
| `/verify/[card]` | Public (QR scan, no-cache, 60s session) | — |

### Policies RLS — résumé

| Table | SELECT | INSERT/UPDATE/DELETE |
|-------|--------|---------------------|
| `profiles` | Own + super_admin | Own (sans role/coop_id) + super_admin |
| `cooperatives` | Public | Faitiere admins + super_admin |
| `members` | Accessible coops (hierarchy) | Coop admins |
| `member_cards` | Accessible coops + anon (active only) | Coop admins |
| `fiches_techniques` | Published=public | Faitiere admins + super_admin |
| `haroo_*_profiles` | Public (lecture vérification) | service_role |
| `haroo_jobs/presales/missions` | Public (lecture vérification) | service_role |
| Geo tables + cultures | Public read | Super_admin write |

---

## Variables d'environnement

### FaîtiereHub (Vercel)

```env
NEXT_PUBLIC_SUPABASE_URL=https://hhnswekjgbxckluqnszo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...          # server-only
INTEGRATION_SECRET_KEY=              # AES-256-GCM pour API keys Kobo
KOBO_WEBHOOK_SECRET=                 # timing-safe compare
AGRITOGO_API_URL=https://agritogo-production.up.railway.app
UPSTASH_REDIS_REST_URL=              # optionnel — rate limiting persistant
UPSTASH_REDIS_REST_TOKEN=
```

### AgriTogo (Railway)

```env
SUPABASE_URL=https://hhnswekjgbxckluqnszo.supabase.co
SUPABASE_SERVICE_KEY=eyJ...          # ← CRITIQUE : même clé que FaîtiereHub
GEMINI_API_KEY=
GEMINI_API_KEY_1=
GEMINI_API_KEY_2=
GEMINI_API_KEY_3=
DASHSCOPE_API_KEY=                   # Qwen pour débat multi-modèle
PORT=8000
FLASK_ENV=production
```

---

## Historique des versions

| Version | Date | Changement principal |
|---------|------|---------------------|
| v1.0 | 22/05/2026 | Lancement — coopératives, membres, cartes |
| v1.1 | 23/05/2026 | Audit sécurité #1 — 14 findings corrigés (score 8/10) |
| v1.2 | 23/05/2026 | Audit sécurité #2 — hiérarchie RLS, storage privé (8.5/10) |
| v1.3 | 24/05/2026 | Audit sécurité #3 — 23 findings ALPHA/BETA/GAMMA (9.2/10) |
| v1.4 | 06/06/2026 | **Base de données unifiée** — Haroo intégré (8 tables), AgriTogo sur Supabase FaîtiereHub |

---

## Estimation coûts (production)

| Service | Plan | Coût/mois |
|---------|------|-----------|
| Vercel | Pro | $20 |
| Supabase | Pro (8GB) | $25 |
| Railway | Starter | ~$10 |
| Sentry | Free tier | $0 |
| Upstash Redis | Pay-as-you-go | ~$5 |
| Domaine | .com | ~$1 |
| **Total** | | **~$61/mois** |

Scalable jusqu'à ~10 000 membres et 50 coopératives sans changement d'architecture.

---

## Checklist production (v1.4)

- [x] TypeScript strict (no ignoreBuildErrors)
- [x] RLS sur toutes les tables (34 tables)
- [x] Toutes les policies utilisent `get_accessible_cooperative_ids()`
- [x] Secrets chiffrés (AES-256-GCM pour API keys)
- [x] Security headers (CSP sans unsafe-eval, HSTS, X-Frame-Options)
- [x] Rate limiting sur TOUS les endpoints publics
- [x] Validation Zod sur toutes les entrées
- [x] Vue SQL restrictive pour vérification publique
- [x] Webhook secret obligatoire + timing-safe + Zod
- [x] Storage privé + signed URLs
- [x] Proxy hardened (no prefetch bypass, app_metadata only)
- [x] pg_cron purge automatique
- [x] security.txt publié (RFC 9116)
- [x] Leaked password protection activée
- [x] Upstash Redis module prêt
- [x] Script pré-déploiement (`npm run security:check`)
- [x] Haroo tables créées dans Supabase avec RLS
- [x] AgriTogo connecté à Supabase FaîtiereHub (base unifiée)
- [x] Vérification 4 types de cartes (FAITIERE/OUVRIER/ACHETEUR/AGRONOME)
- [ ] `SUPABASE_SERVICE_KEY` configuré sur Railway (AgriTogo)
- [ ] Upstash Redis configuré en production (env vars)
- [ ] MFA pour admins faîtière + super_admin
- [ ] Nonce-based CSP (supprimer unsafe-inline)
- [ ] Backup automatique vérifié
- [ ] Load testing (k6)
- [ ] Penetration testing externe
