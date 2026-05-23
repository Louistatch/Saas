# Architecture — FaîtiereHub

## Architecture actuelle (v1.2 — post-audit sécurité renforcé)

```
┌─────────────────────────────────────────────────────────────────┐
│                         VERCEL EDGE                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  proxy.ts (auth gate)                                     │  │
│  │  • getUser() → validate JWT                               │  │
│  │  • Role from app_metadata ONLY (never user_metadata)      │  │
│  │  • No prefetch bypass for protected routes                │  │
│  │  • CSP + HSTS + security headers injected                 │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────┐  ┌───────┴──────┐  ┌─────────────────────┐  │
│  │  App Router   │  │  API Routes  │  │  Webhook Endpoints  │  │
│  │  (RSC + CC)   │  │  /api/widget │  │  /api/webhooks/kobo │  │
│  │               │  │  /api/fiches │  │  (secret mandatory) │  │
│  │               │  │  /api/kobo   │  │  (timing-safe)      │  │
│  └───────┬───────┘  └──────┬───────┘  └──────────┬──────────┘  │
│          │                 │                      │             │
│  ┌───────┴─────────────────┴──────────────────────┴──────────┐  │
│  │  Security Layer (lib/security/)                           │  │
│  │  • assertAuthenticated() / assertRole() / assertTenant()  │  │
│  │  • Rate limiting (per-IP, per-endpoint, all public APIs)  │  │
│  │  • Input validation (Zod schemas)                         │  │
│  │  • UUID format enforcement                                │  │
│  │  • ILIKE injection prevention                             │  │
│  │  • CORS preflight handling                                │  │
│  │  • Open redirect prevention                               │  │
│  └───────────────────────────┬───────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────┐
│                          SUPABASE                                │
│  ┌──────────┐  ┌────────────┴────────────┐  ┌───────────────┐  │
│  │   Auth   │  │       PostgreSQL        │  │    Storage     │  │
│  │ (GoTrue) │  │                         │  │               │  │
│  │          │  │  RLS on ALL 24 tables    │  │ member-photos │  │
│  │ • JWT    │  │  • Hierarchy-aware       │  │  (public)     │  │
│  │ • Roles  │  │    ALL policies use      │  │  path-scoped  │  │
│  │   in     │  │    get_accessible_       │  │               │  │
│  │   app_   │  │    cooperative_ids()     │  │ fiches-tech.  │  │
│  │   meta   │  │  • Locality-based        │  │  (private)    │  │
│  │          │  │    fiches access         │  │  admin-only   │  │
│  │ • sync_  │  │                         │  │  download     │  │
│  │   role   │  │  Security Functions:     │  │               │  │
│  │   trigger│  │  • bootstrap_coop_admin  │  │ templates     │  │
│  │          │  │  • increment_download    │  │  (private)    │  │
│  └──────────┘  │    (auth-only, no anon)  │  │  hierarchy-   │  │
│                │  • get_platform_totals   │  │  scoped       │  │
│                │  • validate_coop_parent  │  │               │  │
│                │                         │  └───────────────┘  │
│                │  Constraints:            │                     │
│                │  • profile.role          │                     │
│                │    NOT self-updatable    │                     │
│                │  • cooperative_id        │                     │
│                │    NOT self-updatable    │                     │
│                └─────────────────────────┘                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Monitoring: pg_stat_statements, Supabase Dashboard       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

External:
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │  Sentry  │  │ Vercel   │  │ Upstash  │
  │  (errors)│  │ Analytics│  │  (Redis)  │
  └──────────┘  └──────────┘  └──────────┘
```

## Modèle de sécurité

### Principes fondamentaux

1. **Defense in depth** — Proxy (serveur) + RLS (DB) + validation (app) + centralized assertions (lib/security/)
2. **Least privilege** — Chaque rôle n'accède qu'à ce qui est nécessaire
3. **Never trust the client** — Rôles dans `app_metadata` uniquement (serveur-controlled)
4. **Tenant isolation** — `get_accessible_cooperative_ids()` avec hiérarchie récursive sur TOUTES les tables
5. **Rate limit everything public** — Tous les endpoints publics sont rate-limités par IP

### Hiérarchie RBAC

```
SUPER_ADMIN (plateforme)
  └── Accès total, gestion cross-tenant

FAITIERE_ADMIN (cooperative_admin + level='faitiere')
  ├── Gère unions + coopératives enfants
  ├── Upload fiches techniques (seul niveau autorisé)
  ├── Génère cartes pour toute la hiérarchie
  └── Voit données de toute sa hiérarchie

UNION_ADMIN (cooperative_admin + level='union')
  ├── Gère coopératives enfants
  └── Génère cartes pour sa hiérarchie

COOPERATIVE_ADMIN (cooperative_admin + level='cooperative')
  ├── Gère membres de sa coopérative uniquement
  └── Génère cartes pour ses membres uniquement

MEMBER (role='member')
  ├── Voit son profil et sa carte
  └── Accès marketplace (gratuit avec carte)

GUEST (role='guest')
  └── Marketplace publique uniquement (accès payant)
```

### Modèle d'accès aux fiches techniques

Les fiches techniques sont **basées sur la localité** (canton, préfecture, région), pas sur la coopérative :

- **Membres** : accès gratuit à toutes les fiches publiées (carte valide = accès)
- **Non-membres** : accès payant via achat
- **Upload** : réservé aux faîtières et super_admin uniquement
- **Visibilité** : toutes les fiches publiées sont visibles publiquement (catalogue)
- **Téléchargement** : nécessite carte membre valide ou achat complété
- **Storage direct** : bloqué pour les non-admins (signed URLs obligatoires via API)

### Protection des routes

| Route | Protection | Rôle minimum |
|-------|-----------|--------------|
| `/dashboard/*` | Proxy + ProtectedRoute | authenticated |
| `/admin/*` | Proxy + ProtectedRoute(super_admin) | super_admin |
| `/api/integrations/kobo` | Auth + assertAccess() | cooperative_admin |
| `/api/webhooks/kobo` | KOBO_WEBHOOK_SECRET (timing-safe) | — |
| `/api/widget` | Rate limit (60/min/IP) + CORS preflight | public |
| `/api/marketplace` | Rate limit (120/min/IP) + CORS | public |
| `/api/embed` | Rate limit (60/min/IP) + origin validation | public |
| `/api/integrations/kobo/sync` | Auth + assertAccess() | cooperative_admin |
| `/api/fiches` | Rate limit (120/min/IP) | public |
| `/api/fiches/[id]/access` | Rate limit (20/min/IP) + card/purchase | member/buyer |
| `/api/member-access` | Rate limit (10/min/IP) | public |
| `/marketplace` | Public | — |
| `/embed/widget` | Public (iframe target) | — |
| `/verify/[card]` | Public (QR scan, no-cache, 60s session) | — |
| `/auth/*` | Public | — |
| `/`, `/a-propos`, `/blog` | Public | — |

### Policies RLS — résumé

| Table | SELECT | INSERT/UPDATE/DELETE |
|-------|--------|---------------------|
| `profiles` | Own + super_admin all | Own (sans role/cooperative_id) + super_admin |
| `cooperatives` | All (public) | Faitiere admins + super_admin |
| `members` | Accessible coops (hierarchy) | Coop admins (accessible coops) |
| `member_cards` | Accessible coops + anon (active only) | Coop admins (accessible coops) |
| `fiches_techniques` | Published=public, all=faitiere | Faitiere admins + super_admin |
| `exploitations` | Accessible coops + public (active) | Coop admins (accessible coops) |
| `integrations` | Accessible coops admins | Coop admins (accessible coops) |
| `documents` | Accessible coops | Coop admins (accessible coops) |
| `productions` | Accessible coops | Coop admins (accessible coops) |
| `parcelles` | Accessible coops | Coop admins (accessible coops) |
| `cotisations` | Accessible coops | Coop admins (accessible coops) |
| `templates` | Accessible coops | Coop admins (accessible coops) |
| `audit_logs` | Own coop admins | Own user_id only |
| `member_access_logs` | Accessible coops | card_number + action validation |
| `platform_settings` | Super_admin | Super_admin |
| `purchases` | Admins (own coop fiches) | Public (pending only, valid fiche) |
| `cooperative_settings` | Accessible coops | Coop admins (accessible coops) |
| `marketplace_products` | Public (available=true) + admins (all) | Coop admins (accessible coops) |
| `embed_configs` | Accessible coops admins | Coop admins (accessible coops) |
| `kobo_sync_queue` | Accessible coops admins | Coop admins (accessible coops) |
| Geo tables | Public read | Super_admin write |
| `cultures` | Public read | Super_admin write |

### Storage buckets

| Bucket | Public | Upload | Download | Scoping |
|--------|--------|--------|----------|---------|
| `member-photos` | ✅ Oui | cooperative_admin, super_admin | Public | Path scoped par `get_accessible_cooperative_ids()` |
| `fiches-techniques` | ❌ Non | Faitiere admins, super_admin | Admins only (signed URLs via API pour membres) | Faitiere-level check |
| `templates` | ❌ Non | Coop admins | Authenticated admins | Path scoped par `get_accessible_cooperative_ids()` |

### Headers de sécurité

```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; ...
```

Note : `unsafe-eval` supprimé du CSP. `unsafe-inline` reste nécessaire pour Next.js (migration vers nonce-based CSP prévue en v2).

### Secrets & encryption

| Secret | Usage | Stockage |
|--------|-------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client Supabase | .env (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client Supabase | .env (public) |
| `INTEGRATION_SECRET_KEY` | AES-256-GCM pour API keys Kobo | .env (server-only) |
| `KOBO_WEBHOOK_SECRET` | Auth webhook KoboCollect | .env (server-only) |
| `SENTRY_AUTH_TOKEN` | Upload source maps | .env (server-only) |

### Couche d'autorisation centralisée (`lib/security/`)

```typescript
// Utilisation dans les API routes :
import { assertAuthenticated, assertRole, assertTenantAccess, assertFaitiereAccess } from '@/lib/security/assert-access'

// Vérifier l'authentification
const result = await assertAuthenticated()
if (!result.ok) return result.response

// Vérifier un rôle minimum
const result = await assertRole('cooperative_admin')
if (!result.ok) return result.response

// Vérifier l'accès à un tenant spécifique (hiérarchie-aware)
const result = await assertTenantAccess(cooperativeId)
if (!result.ok) return result.response

// Vérifier l'accès faitiere (pour upload fiches)
const result = await assertFaitiereAccess()
if (!result.ok) return result.response
```

## Architecture cible (v2 — production scale)

```
┌─────────────────────────────────────────────────────────────────┐
│                         VERCEL                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  proxy.ts   │  │  App Router  │  │  Server Actions      │   │
│  │  (hardened) │  │  (RSC-first) │  │  (mutations)         │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────────┘   │
│         │                │                    │                 │
│  ┌──────┴────────────────┴────────────────────┴─────────────┐   │
│  │              Service Layer (lib/services/)                │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │   │
│  │  │ members  │ │  cards   │ │  market  │ │  auth      │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────┴───────────────────────────────────┐   │
│  │              Repository Layer (lib/repos/)                │   │
│  │  Typed queries, pagination, caching                      │   │
│  └──────────────────────┬───────────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────────┐
│                      SUPABASE                                    │
│  ┌──────────┐  ┌────────┴───┐  ┌─────────┐  ┌──────────────┐  │
│  │   Auth   │  │  Postgres  │  │ Storage │  │  Edge Fn     │  │
│  │  + MFA   │  │  + Views   │  │  + CDN  │  │  (cron sync) │  │
│  └──────────┘  │  + RPC     │  └─────────┘  └──────────────┘  │
│                │  + Indexes │                                  │
│                └────────────┘                                  │
└────────────────────────────────────────────────────────────────┘

External:
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │  Sentry  │  │ Vercel   │  │ Upstash  │
  │  (errors)│  │ Analytics│  │  (Redis)  │
  └──────────┘  └──────────┘  └──────────┘
```

## Décisions architecturales

### Pourquoi pas de Server Actions partout ?
- Les pages sont `'use client'` pour l'interactivité (formulaires, dialogs, tabs)
- Server Actions ajouteraient de la complexité sans gain majeur pour un SaaS B2B
- Le proxy + RLS Supabase fournissent déjà la sécurité côté serveur

### Pourquoi pagination client-side ?
- Pour v1, les coopératives ont < 500 membres typiquement
- Migration vers server-side pagination (Supabase `.range()`) quand nécessaire
- Le code est déjà structuré pour (composant `PaginationBar` séparé)

### Pourquoi pas de cache Redis (v1) ?
- Supabase PostgREST a un cache HTTP intégré (stale-while-revalidate)
- Les endpoints publics (`/embed`, `/api/widget`) ont `Cache-Control: s-maxage=60`
- Pour v2: Upstash Redis pour le rate-limiting distribué (serverless-compatible)

### Pourquoi les fiches sont par localité et non par coopérative ?
- Les comptes d'exploitation sont des documents techniques liés à une zone géographique
- Une coopérative dans une zone donnée peut consulter les fiches de sa zone
- Si aucune fiche n'existe pour sa zone, elle peut voir les autres zones
- Seules les faîtières produisent et uploadent les fiches (pas les coopératives)

### Pourquoi `bootstrap_cooperative_admin` est un RPC SECURITY DEFINER ?
- Au signup, l'utilisateur crée sa coopérative puis doit devenir admin
- La policy RLS interdit la modification du `role` par l'utilisateur lui-même
- Le RPC vérifie : même user, pas déjà bootstrappé, coopérative créée < 60s
- C'est le seul chemin autorisé pour l'auto-promotion au signup

### Pourquoi `get_accessible_cooperative_ids()` sur toutes les tables ?
- Cohérence : un admin de faîtière doit voir les données de toute sa hiérarchie
- Avant v1.2, certaines tables utilisaient `get_my_cooperative_id()` (coopérative directe uniquement)
- Corrigé dans la migration `security_hardening_phase1` pour : documents, exploitations, productions, integrations, member_access_logs

### Pourquoi le storage `fiches-techniques` est restreint aux admins en SELECT ?
- Le modèle économique repose sur l'accès payant pour les non-membres
- Si tout utilisateur authentifié pouvait télécharger directement via l'API Storage, le paiement serait contourné
- Les téléchargements légitimes passent par `/api/fiches/[id]/access` qui génère des signed URLs temporaires (1h)

## Historique des audits de sécurité

### Audit #2 — 23 mai 2026 (v1.2)

**Score : 8.5/10**

#### Vulnérabilités corrigées (migration `security_hardening_phase1`)

| # | Sévérité | Problème | Correction |
|---|----------|----------|-----------|
| 1 | 🟠 HIGH | `increment_download_count` callable par anon | REVOKE EXECUTE FROM anon |
| 2 | 🟠 HIGH | Storage `member-photos` cross-tenant upload | Path scoped par `get_accessible_cooperative_ids()` |
| 3 | 🟠 HIGH | Storage `fiches-techniques` bypass modèle payant | SELECT restreint aux admins |
| 4 | 🟡 MEDIUM | 6 tables avec `get_my_cooperative_id()` au lieu de hiérarchie | Migré vers `get_accessible_cooperative_ids()` |
| 5 | 🟡 MEDIUM | `member_cards` anon SELECT `USING (true)` | Restreint à `status = 'active'` |
| 6 | 🟡 MEDIUM | CSP avec `unsafe-eval` | Supprimé |
| 7 | 🟡 MEDIUM | Open redirect via `//` dans login redirect | Validation ajoutée |
| 8 | 🟡 MEDIUM | `/api/fiches` sans rate limiting | 120/min/IP ajouté |
| 9 | 🟡 MEDIUM | `/api/widget` sans CORS preflight | Handler OPTIONS ajouté |

#### Nouveaux modules créés

| Fichier | Rôle |
|---------|------|
| `lib/security/assert-access.ts` | Couche d'autorisation centralisée (assertRole, assertTenantAccess, assertFaitiereAccess) |
| `lib/security/headers.ts` | Configuration headers de sécurité centralisée |

### Audit #1 — 23 mai 2026 (v1.1)

**Score : 8/10**

#### Vulnérabilités corrigées

| # | Sévérité | Problème | Correction |
|---|----------|----------|-----------|
| 1 | 🔴 CRITICAL | Privilege escalation via `update_own_profile` | Policy bloque modification role/cooperative_id |
| 2 | 🔴 CRITICAL | Webhook Kobo sans auth si secret non configuré | Secret obligatoire + timing-safe compare |
| 3 | 🔴 CRITICAL | SQL injection via ilike (wildcard `%`) | Échappement des caractères spéciaux |
| 4 | 🔴 CRITICAL | Cross-tenant storage access (fiches) | Policies scoped par path + faitiere-only |
| 5 | 🟠 HIGH | Proxy bypass via `purpose: prefetch` header | Supprimé le bypass pour routes protégées |
| 6 | 🟠 HIGH | Rôle lu depuis user_metadata (manipulable) | Uniquement app_metadata |
| 7 | 🟠 HIGH | Absence de CSP/HSTS | Headers ajoutés dans next.config.mjs |
| 8 | 🟠 HIGH | Open redirect via x-forwarded-host | Callback utilise nextUrl.origin |
| 9 | 🟡 MEDIUM | Pas de rate limiting sur endpoints critiques | Rate limit sur member-access + fiches access |
| 10 | 🟡 MEDIUM | audit_logs INSERT sans restriction | Policy restreinte à user_id = auth.uid() |
| 11 | 🟡 MEDIUM | member_access_logs INSERT ouvert au public | Policy avec validation card_number + action |
| 12 | 🟡 MEDIUM | purchases INSERT sans restriction | Policy exige fiche publiée + status pending |
| 13 | 🟡 MEDIUM | Fonctions trigger appelables via API | REVOKE EXECUTE FROM anon/authenticated |
| 14 | 🟡 MEDIUM | Race condition download_count | RPC atomique `increment_download_count` |

## Points restants (roadmap sécurité)

| # | Sévérité | Action | Effort | Status |
|---|----------|--------|--------|--------|
| 1 | 🟡 MEDIUM | Migrer rate limiter vers Upstash Redis | 1j | À faire |
| 2 | 🟡 MEDIUM | Activer leaked password protection (Supabase Dashboard) | 5min | À faire |
| 3 | 🟢 LOW | CAPTCHA après N échecs de login | 2h | À faire |
| 4 | 🟢 LOW | MFA pour les admins (faîtière + super_admin) | 1j | À faire |
| 5 | 🟢 LOW | Nonce-based CSP (supprimer unsafe-inline) | 2j | À faire |
| 6 | 🟢 LOW | Monitoring alertes (bulk downloads, rate limit hits) | 1j | À faire |
| 7 | 🟢 LOW | Penetration testing externe | — | À planifier |

## Plan de migration v1.2 → v2

| Phase | Action | Effort | Impact |
|---|---|---|---|
| 1 | Upstash Redis rate-limit distribué | 1j | Sécurité |
| 2 | Server-side pagination (`.range()`) | 2j | Performance |
| 3 | Server Actions pour mutations critiques | 3j | Sécurité |
| 4 | MFA pour admins (faîtière + super_admin) | 1j | Sécurité |
| 5 | Edge Function cron (KoboToolbox sync) | 2j | Feature |
| 6 | Supabase Realtime (notifications) | 2j | UX |
| 7 | Service layer abstraction | 3j | Maintenabilité |
| 8 | Nonce-based CSP | 2j | Sécurité |

## Checklist production

- [x] TypeScript strict (no ignoreBuildErrors)
- [x] RLS sur toutes les tables (24 tables)
- [x] Toutes les policies utilisent `get_accessible_cooperative_ids()` (hiérarchie)
- [x] Secrets chiffrés (AES-256-GCM pour API keys)
- [x] Security headers (CSP sans unsafe-eval, HSTS, X-Frame-Options, X-Content-Type-Options)
- [x] Rate limiting sur TOUS les endpoints publics
- [x] UUID validation sur tous les inputs
- [x] HTML escaping sur embed
- [x] Proxy hardened (no prefetch bypass, app_metadata only)
- [x] Indexes sur toutes les FK + lookups critiques
- [x] Partial unique index (1 carte active par membre)
- [x] View avec security_invoker
- [x] Profile role non-modifiable par l'utilisateur
- [x] Webhook secret obligatoire + timing-safe
- [x] Storage policies scoped par tenant/hiérarchie
- [x] Storage fiches-techniques: download restreint aux admins (signed URLs pour membres)
- [x] Fiches access locality-based (pas cooperative-based)
- [x] Trigger functions non-appelables via API
- [x] `increment_download_count` non-callable par anon
- [x] Purchases INSERT restreint (pending + valid fiche)
- [x] Open redirect prevention (callback + login redirect)
- [x] CORS preflight handling sur endpoints publics
- [x] Sentry error tracking
- [x] Couche d'autorisation centralisée (`lib/security/assert-access.ts`)
- [ ] Upstash Redis (rate-limit distribué)
- [ ] Server-side pagination
- [ ] MFA pour admins
- [ ] Leaked password protection activée
- [ ] Nonce-based CSP
- [ ] Backup automatique vérifié
- [ ] Monitoring latence DB
- [ ] Load testing (k6)
- [ ] Penetration testing externe

## Estimation coûts (production)

| Service | Plan | Coût/mois |
|---|---|---|
| Vercel | Pro | $20 |
| Supabase | Pro (8GB) | $25 |
| Sentry | Team | $0 (free tier) |
| Upstash Redis | Pay-as-you-go | ~$5 |
| Domain | .com | ~$1 |
| **Total** | | **~$51/mois** |

Scalable jusqu'à ~10,000 membres et 50 coopératives sans changement d'architecture.

## Historique des audits

| Date | Type | Score | Version | Auditeur |
|------|------|-------|---------|----------|
| 23/05/2026 | Audit sécurité complet | 8/10 | v1.1 | Interne (Kiro) |
| 23/05/2026 | Audit sécurité renforcé + corrections DB/Storage | 8.5/10 | v1.2 | Interne (Kiro) |
