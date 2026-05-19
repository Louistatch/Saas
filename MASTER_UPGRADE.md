# Master Upgrade — Summary

This document describes the comprehensive upgrade applied to the FaîtiereHub
codebase. **Production build is clean (0 warnings, 0 errors)** and the strict
TypeScript compiler passes.

## At a glance

- 30 routes building, all type-safe
- Real QR codes everywhere (no more placeholder boxes)
- Toast notifications, validation, and confirm dialogs across every CRUD page
- Pagination + debounced search on every list
- Server-side encrypted secrets for integrations
- Rate limiting + UUID validation on public widget/embed endpoints
- Per-cooperative settings persisted in `cooperative_settings`
- New `cooperative_stats` view + `get_platform_totals()` RPC + `platform_settings`
- ESLint config, `typecheck` script, security headers
- Migrated `middleware.ts` → `proxy.ts` for Next 16 compat
- Mounted `ThemeProvider` (was an orphan)
- Fixed `useToast` (was holding toasts for 16 minutes)

## What changed by area

### Foundation (new)
- `types/domain.ts` — single source of truth for `Member`, `Exploitation`,
  `MemberCard`, `Profile`, `Cooperative`, `CardTemplate`, `CardSettings`,
  `UserRole`, etc. Replaces ~10 duplicated local interfaces.
- `lib/validators/schemas.ts` — Zod schemas for every form
  (login, signup, member, exploitation, cooperative, card template/settings,
  profile updates) with a `flattenZodErrors` helper.
- `lib/utils/logger.ts` — prefixed logger replacing `[v0]`/`[auth]`/ad-hoc
  console calls.
- `lib/utils/errors.ts` — `normalizeError` / `errorMessage` translates
  Postgres/Zod errors into safe user-facing strings.
- `lib/utils/permissions.ts` — `isAdmin`, `isSuperAdmin`, `canManage*` helpers.
- `lib/utils/rate-limit.ts` — in-memory token-bucket rate limiter + UUID guard.
- `lib/utils/qr.ts` — dependency-free QR encoder (Reed-Solomon, byte mode,
  selectable ECC). Returns matrices, SVG strings, or data URLs.
- `lib/utils/csv.ts` — RFC 4180 parser, header-aware row mapper, CSV writer,
  `downloadCsv()` helper.
- `lib/utils/card-image.ts` — high-DPI canvas renderer for printable cards
  with a real QR.
- `lib/utils/crypto.ts` — AES-256-GCM `encryptSecret` / `decryptSecret` using
  `INTEGRATION_SECRET_KEY`. Marked `server-only`.

### Shared UI (new)
- `components/shared/page-header.tsx`
- `components/shared/empty-state.tsx`
- `components/shared/loading.tsx` (`Spinner`, `LoadingBlock`)
- `components/shared/status-badge.tsx` (`CardStatusBadge`, `MemberStatusBadge`,
  `RoleBadge`, `PublishedBadge`)
- `components/shared/confirm-dialog.tsx` + `useConfirm()` — replaces native
  `confirm()` calls everywhere.
- `components/shared/pagination.tsx` — accessible page-bar.
- `components/shared/qr-image.tsx` — memoized inline QR `<img>`.

### Hooks
- `hooks/use-debounced.ts` — for search inputs.
- `hooks/use-toast.ts` — fixed `TOAST_REMOVE_DELAY` from 16 minutes → 5 s,
  `TOAST_LIMIT` from 1 → 3.

### Auth & multi-tenancy
- `app/context/auth-context.tsx` — fully typed `AuthUser`, removed `[v0]` log
  prefix, `refreshProfile()` helper, signup no longer puts `role` into JWT
  metadata before the DB trigger validates it (closes a privilege-escalation
  vector), waits up to 8×400 ms for the trigger.
- `app/context/cooperative-context.tsx` — typed via shared `Cooperative` /
  `CooperativeRow`, persists last-selected cooperative for super_admins,
  uses an explicit column list (no more `select('*')`).
- `proxy.ts` (was `middleware.ts`) — admin role-gating, redirect-back support
  via `?redirect=`.

### Public widget / embed surface
- `app/embed/route.ts` — UUID validation, rate-limit (60 req/min/IP),
  HTML-escaping, hex-color sanitization, friendly error pages.
- `app/api/widget/route.ts` — same controls plus typed responses.

### Dashboard pages (rewritten)
- `app/dashboard/page.tsx` — overview, typed activity merge, accessible icons.
- `app/dashboard/members/page.tsx` — pagination, debounced search,
  Zod-validated form, **real CSV import with preview** + CSV export, toasts,
  confirm dialog.
- `app/dashboard/marketplace/page.tsx` — pagination, debounced search,
  Zod-validated form, toasts, publish toggle with feedback.
- `app/dashboard/cards/page.tsx` — **real QR codes (canvas + preview)**, bulk
  generate with filter & "select shown", **download all**, persisted template
  & settings (validated server-side), reset-to-defaults button, pagination,
  debounced search.
- `app/dashboard/analytics/page.tsx` — accessible progress bars, no `any`.
- `app/dashboard/integrations/page.tsx` — "Coming soon" markers for stubs,
  toggle for `kobo` redirects to its setup page, toast feedback.
- `app/dashboard/integrations/kobo/page.tsx` — credentials submitted to a new
  server route (`/api/integrations/kobo`); tokens are encrypted server-side
  before hitting the database. Existing tokens are masked with `••••••••••••`
  and only rotated when the user types a new one.
- `app/dashboard/settings/page.tsx` — single canonical settings page with
  validation + per-tab save buttons, branding preview, billing usage bar.
- `app/dashboard/settings/cooperative/page.tsx` — now redirects to
  `/dashboard/settings` (legacy duplicate retired).

### Admin pages (rewritten)
- `app/admin/page.tsx` — uses `cooperative_stats` view + `get_platform_totals`
  RPC, falls back to per-table counts if either is missing.
- `app/admin/cooperatives/page.tsx` — pagination, debounced search,
  Zod-validated form, confirm dialog, prefers the stats view to remove N+1.
- `app/admin/users/page.tsx` — typed via shared `Profile`, pagination,
  Zod-validated update, accessible role badges.
- `app/admin/analytics/page.tsx` — single-query stats view, no N+1.
- `app/admin/settings/page.tsx` — actually persists to `platform_settings`,
  drops fake "Test Connection" / "Reset Settings" UI, points at the real
  Supabase backup/email config docs.

### Auth pages
- `app/auth/login/page.tsx` — Suspense boundary, Zod validation, password
  visibility toggle, `?redirect=` honored.
- `app/auth/signup/page.tsx` — Zod validation, terms acceptance enforced,
  password visibility toggle.

### Server / config
- `next.config.mjs` — security headers (`X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) on the
  app surface, narrower headers on `/embed` since it must be iframe-able.
- `app/layout.tsx` — mounts `ThemeProvider`, wires Geist as CSS variables,
  `suppressHydrationWarning` on `<html>` to play nice with `next-themes`.
- `.eslintrc.json` — sensible defaults extending `next/core-web-vitals`.
- `package.json` — added `typecheck` script (`tsc --noEmit`).

### Database (new migrations)
- `supabase_migrations/001_cooperative_settings.sql` — moved from the project
  root; unchanged contents.
- `supabase_migrations/002_platform_objects.sql` — adds:
  - Indexes on every `cooperative_id`-filtered table.
  - `cooperative_stats` view (`security_invoker = true`, so RLS still
    applies).
  - `get_platform_totals()` `SECURITY DEFINER` RPC restricted to super_admin.
  - `platform_settings` key/value table with super-admin-only RLS and an
    `updated_at` trigger.
- `supabase_migrations/README.md` — apply order and required env vars.

### Environment
- `.env.example` documents `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the new
  `INTEGRATION_SECRET_KEY` (base64-encoded 32 bytes).

## Notable bugs fixed

| Severity | Bug | Fix |
| --- | --- | --- |
| High | KoboToolbox API token written to DB in plaintext | `lib/utils/crypto.ts` + `/api/integrations/kobo` enforce server-side AES-256-GCM encryption |
| High | Signup put `role: 'cooperative_admin'` into JWT metadata before the DB trigger validated it (privilege-escalation surface) | `auth-context.tsx` no longer sends `role` in `user_metadata`, role is derived from the trigger |
| High | `/embed` and `/api/widget` had no input validation, no rate-limit, no allow-list | UUID validation, IP-keyed rate limiter, HTML-escaping |
| High | Native `confirm()` for destructive actions; no AlertDialog | `useConfirm()` hook + shadcn AlertDialog everywhere |
| Medium | "Save Settings" / "Save Template" buttons were no-ops on cooperative settings tab | Connected to `cooperative_settings` upsert with validation + toast |
| Medium | "Save Template" rendered a placeholder QR | Real QR via `lib/utils/qr.ts` |
| Medium | "Import Members" tab was a non-functional dropzone | Real CSV parser, preview, validation, batch insert |
| Medium | Toasts persisted ~16 minutes (`TOAST_REMOVE_DELAY = 1_000_000`) | 5 s |
| Medium | N+1 queries in `/admin/cooperatives` and `/admin/analytics` | `cooperative_stats` view |
| Medium | `iframe onLoadStart` (not a valid React event) | Proper `onLoad` lifecycle with overlay spinner |
| Medium | Cooperative settings duplicated across two pages | Consolidated; legacy route redirects |
| Medium | "Sync Now" / "Test Connection" / "Request Custom Integration" / "Reset Platform Settings" were silent no-ops | Removed or replaced with real behavior / explanatory copy |
| Low | Mixed log prefixes (`[auth]` vs `[v0]`) | Unified `createLogger` |
| Low | `<select>` for cooperative switcher had no accessible name | Added `aria-label`s; status badges promoted to a real `role="status"` |
| Low | Hard-coded `interface` redeclarations in every file | Shared `types/domain.ts` |
| Low | `recharts` was a 100kB dependency, never imported | Charts replaced by accessible CSS bars |

## How to run

```bash
# 1) Install
npm install        # or pnpm install

# 2) Configure
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# and INTEGRATION_SECRET_KEY (openssl rand -base64 32)

# 3) Apply migrations (Supabase SQL editor)
#    1. supabase_migrations/001_cooperative_settings.sql
#    2. supabase_migrations/002_platform_objects.sql

# 4) Verify locally
npm run typecheck
npm run build
npm run dev
```

## Suggested next steps

- Wire CSV import error reporting per-row (currently silent for invalid rows).
- Generate Supabase types via `supabase gen types typescript` and replace the
  remaining hand-written rows in `types/domain.ts`.
- Move the in-memory `rateLimit` to Upstash / Redis for multi-instance deploys.
- Add a real KoboToolbox sync runner (e.g. Supabase Edge Function on a cron).
- Add Playwright smoke tests covering signup → create coop → add member →
  generate card → download.
