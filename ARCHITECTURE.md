# Architecture — FaîtiereHub

## Architecture actuelle (v1)

```
┌─────────────────────────────────────────────────────────────┐
│                        VERCEL                                │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  proxy.ts   │  │  App Router  │  │  API Routes      │   │
│  │  (auth gate)│  │  (RSC + CC)  │  │  /api/widget     │   │
│  │             │  │              │  │  /api/kobo       │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                │                    │             │
└─────────┼────────────────┼────────────────────┼─────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     SUPABASE                                 │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌────────────┐  │
│  │   Auth   │  │ Postgres │  │ Storage │  │  Realtime  │  │
│  │  (GoTrue)│  │  + RLS   │  │ (photos)│  │  (future)  │  │
│  └──────────┘  └──────────┘  └─────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Architecture cible (v2 — production scale)

```
┌─────────────────────────────────────────────────────────────┐
│                        VERCEL                                │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  proxy.ts   │  │  App Router  │  │  Server Actions  │   │
│  │  (optimized)│  │  (RSC-first) │  │  (mutations)     │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                │                    │             │
│  ┌──────┴────────────────┴────────────────────┴─────────┐   │
│  │              Service Layer (lib/services/)            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │   │
│  │  │ members  │ │  cards   │ │  market  │ │  auth  │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────┴───────────────────────────────┐   │
│  │              Repository Layer (lib/repos/)            │   │
│  │  Typed queries, pagination, caching                  │   │
│  └──────────────────────┬───────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                     SUPABASE                                 │
│  ┌──────────┐  ┌────────┴───┐  ┌─────────┐  ┌──────────┐  │
│  │   Auth   │  │  Postgres  │  │ Storage │  │  Edge Fn │  │
│  │  + MFA   │  │  + Views   │  │  + CDN  │  │  (cron)  │  │
│  └──────────┘  │  + RPC     │  └─────────┘  └──────────┘  │
│                │  + Indexes │                              │
│                └────────────┘                              │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Monitoring: pg_stat_statements, Supabase Dashboard  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘

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

### Pourquoi pas de cache Redis ?
- Supabase PostgREST a un cache HTTP intégré (stale-while-revalidate)
- Les endpoints publics (`/embed`, `/api/widget`) ont `Cache-Control: s-maxage=60`
- Pour v2: Upstash Redis pour le rate-limiting distribué

## Plan de migration v1 → v2

| Phase | Action | Effort | Impact |
|---|---|---|---|
| 1 | Server-side pagination (`.range()`) | 2j | Performance |
| 2 | Server Actions pour mutations critiques | 3j | Sécurité |
| 3 | Sentry integration | 0.5j | Monitoring |
| 4 | Upstash Redis rate-limit | 1j | Sécurité |
| 5 | Edge Function cron (KoboToolbox sync) | 2j | Feature |
| 6 | Supabase Realtime (notifications) | 2j | UX |
| 7 | MFA pour admins | 1j | Sécurité |

## Checklist production

- [x] TypeScript strict
- [x] RLS sur toutes les tables
- [x] Secrets chiffrés (AES-256-GCM)
- [x] Security headers (CSP, X-Frame-Options, etc.)
- [x] Rate limiting sur endpoints publics
- [x] UUID validation sur inputs
- [x] HTML escaping sur embed
- [x] Proxy optimisé (skip auth pour routes publiques)
- [x] Indexes sur toutes les FK
- [x] Partial unique index (1 carte active par membre)
- [x] View avec security_invoker
- [ ] Sentry error tracking
- [ ] Upstash Redis (rate-limit distribué)
- [ ] Server-side pagination
- [ ] Backup automatique vérifié
- [ ] Monitoring latence DB
- [ ] Load testing (k6)
- [ ] Penetration testing

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
