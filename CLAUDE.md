# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
npm run dev          # Start dev server (Next.js 16 + Turbopack)
npm run build        # Production build
npm run typecheck    # tsc --noEmit (zero errors required)
npm run lint         # Biome check (read-only)
npm run lint:fix     # Biome check --write (auto-fix)
npm run format       # Biome format --write
npm run check        # turbo: typecheck + lint in parallel

# E2E tests (requires .env.e2e and running server)
npm run test:e2e
npm run test:e2e:chromium   # single browser
npm run test:e2e:mobile     # mobile viewport

# Pre-deploy security check (11 automated assertions)
npm run security:check
```

**Linter**: Biome (not ESLint). Config in `biome.json`. Key rules: `noExplicitAny` (error), `noUnusedVariables` (error), `useImportType` (error), `noDangerouslySetInnerHtml` (error). `components/ui/**` is excluded from linting.

**No unit test runner** — validation is TypeScript + Biome + Playwright E2E.

---

## Architecture

### Ecosystem overview

Three services share **one Supabase project** (`hhnswekjgbxckluqnszo`):

| Service | Stack | Host |
|---------|-------|------|
| **FaîtiereHub** (this repo) | Next.js 16, React 19 | Vercel |
| **AgriTogo** (external) | Flask 3.1, 6 AI agents, 5 ML models | Railway |
| **Haroo** (data layer) | Tables in same Supabase DB | — |

FaîtiereHub calls AgriTogo via `AGRITOGO_API_URL` env var for: Haroo profile verification, AI chat (`/api/v1/agent/chat`), forecasting, risk, and irrigation calculations (FAO-56 / AgriSmart).

### Supabase client pattern

Three clients — use the correct one:

- **`lib/supabase/client.ts`** — Browser singleton. Lazy-initialized in `useEffect` to avoid SSR throws when `NEXT_PUBLIC_*` vars are absent in local builds. Import for `'use client'` components.
- **`lib/supabase/server.ts`** — Server client (cookie-based session). Use in Server Components, API routes with user context. `async createClient()`.
- **`lib/supabase/admin.ts`** — Service-role client (bypasses RLS). Marked `server-only`. Use only in webhooks, cron jobs, admin operations. Never in client code.

### Auth & authorization

Auth flows through two layers:

1. **`middleware.ts`** (Vercel Edge) — refreshes Supabase session on every request to prevent stale-JWT loops. Also handles Vercel preview → `www.faitierehub.com` redirect.

2. **`lib/security/assert-access.ts`** — Server-side defense-in-depth on top of RLS. Key functions:
   - `getAccessContext()` → returns `{ userId, role, cooperativeId, cooperativeLevel, supabase }`
   - `assertAuthenticated()`, `assertRole()`, `assertTenant()`
   - Always use these in API routes; RLS is the DB layer, these are the app layer.

Roles live in `app_metadata` ONLY — never trust `user_metadata` for authorization.

### QR card verification flow

`GET /api/verify/[card_number]` is the central public endpoint:

```
Scan → /api/verify/[card_number]
  1. Query member_cards WHERE card_type='FAITIERE' (local Supabase)
  2. If not found → proxy to AgriTogo /api/v1/haroo/verify/[card]
       OUVRIER  → haroo_ouvrier_profiles + haroo_jobs
       ACHETEUR → haroo_acheteur_profiles + haroo_presales
       AGRONOME → haroo_agronome_profiles + haroo_missions
```

The verify page (`app/verify/[card_number]/`) is always `no-store` (see `next.config.mjs` headers — cached QR data would be a security issue).

### Member scoring (Bronze / Silver / Gold)

Computed by `lib/members/score.ts` which calls the SQL function `get_member_score(uuid)`. The hook `hooks/use-member-score.ts` wraps it with auto-refresh. The UI component `components/members/ScoreBadge` renders the level.

Criteria:
- **Bronze**: active + ≥1 cotisation (last 12 months)
- **Silver**: Bronze + ≥1 parcelle + ≥1 production
- **Gold**: Silver + ≥2 consecutive campaigns + ≥2 productions

### Weather module (`lib/weather/open-meteo.ts`)

3-model ensemble (no API key required, all Open-Meteo free endpoints):
- **ECMWF IFS 0.25°** (weight 0.45) — gold standard, 3–10 day accuracy
- **GFS Seamless NOAA** (weight 0.35) — runs 4×/day, good tropical skill
- **ICON Seamless DWD** (weight 0.20) — independent European model

In-memory cache per region (TTL: daily=30 min, hourly=15 min, nowcast=5 min, seasonal=6 h). Fusion: temperature/wind/humidity = weighted avg; precipitation = 70% avg + 30% max (conservative for farmers).

API endpoint: `GET /api/verify/[card_number]/meteo` — fetches 6 data sources in parallel, returns merged daily + hourly + nowcast (15-min) + seasonal (3-month CFS NOAA).

### Multi-tenant hierarchy

```
super_admin
└── Faîtière (level="faitiere")
    └── Union (level="union")
        └── Coopérative (level="cooperative")
            └── Members (Bronze / Silver / Gold)
```

`get_accessible_cooperative_ids()` is a recursive SQL function used in RLS policies and server-side queries to scope data to the current user's organization tree.

### Key architectural patterns

**`'use client'` components with Supabase**: Always initialize `createClient()` inside `useEffect` or event handlers — never at component render time. The browser client is a singleton (`browserClient` module-level var); during SSR it returns a safe placeholder so pages prerender without throwing when `NEXT_PUBLIC_*` vars are absent in the build environment.

**`CooperativeContext` + `AuthContext`**: Both live in the root layout (`app/layout.tsx`). `AuthProvider` defers Supabase initialization to `useEffect` (browser-only). `CooperativeContext` provides the current cooperative and switcher for multi-tenant users.

**Rate limiting**: All public API endpoints use `lib/utils/rate-limit.ts` (in-memory, per-IP) with optional persistent layer via `lib/utils/rate-limit-persistent.ts` (Upstash Redis). The in-memory layer is always active; Redis is used when `UPSTASH_REDIS_REST_URL` is set.

**Leaflet / RainRadar**: Must be imported with `dynamic(() => import('./rain-radar'), { ssr: false })`. Leaflet doesn't support SSR and its CSS must be dynamically imported too.

**PDF generation** (`components/verify/meteo-pdf.ts`): Uses `jsPDF` + `jspdf-autotable`, dynamically imported in `handlePdf()`. Shares via Web Share API (`navigator.share({ files: [pdfFile] })`) → native share sheet (WhatsApp), with `doc.save()` fallback.

### Environment variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # server-only, bypasses RLS

# Required for production features
AGRITOGO_API_URL            # AgriTogo Flask service
INTEGRATION_SECRET_KEY      # AES-256-GCM for integration secrets (openssl rand -base64 32)
KOBO_WEBHOOK_SECRET         # Webhook HMAC validation (openssl rand -hex 32)

# Optional (distributed rate limiting)
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

### Security model

- CSP is configured in `next.config.mjs` headers — `unsafe-eval` is NOT present (removed for security).
- `/verify/*` routes are never cached (`Cache-Control: no-store`).
- `/embed` allows framing; all other pages set `X-Frame-Options: DENY`.
- Webhook endpoint (`/api/webhooks/kobo`) validates HMAC secret with timing-safe comparison.
- Input validation uses Zod at all API boundaries.
- The `lib/security/headers.ts` helper injects rate-limit and security headers on API responses.

### Supabase migrations

Migrations live in `supabase/migrations/`. Apply with the Supabase CLI (`supabase db push`) or via the Supabase MCP tools. Key SQL functions: `get_member_score`, `get_accessible_cooperative_ids`, `search_marketplace`, `get_platform_totals`, `bootstrap_cooperative_admin`.
