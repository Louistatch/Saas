# RAPPORT D'AUDIT FULLSTACK — FAITIEREHUB + AGRITOGO
## God-Mode Engineering Report — Niveau Google / Facebook / Alibaba / Amazon

**Date :** 2026-06-06  
**Auditeurs :** 5 agents spécialisés (Architecture, Database, Frontend, Backend, PWA/Pipeline)  
**Scope :** Audit exhaustif multi-couche — Next.js 16, Supabase PostgreSQL, Flask/AgentScope, PWA, Card Engine  
**Objectif :** Rapport actionnable pour agent externe — corriger l'ensemble comme un ingénieur senior GAFAM

---

## TABLE DES MATIÈRES

1. [Vue d'ensemble du système](#1-vue-densemble-du-système)
2. [Architecture Next.js — Audit complet](#2-architecture-nextjs--audit-complet)
3. [Base de données Supabase — Audit complet](#3-base-de-données-supabase--audit-complet)
4. [Frontend UI/UX — Audit complet](#4-frontend-uiux--audit-complet)
5. [Backend AgriTogo Flask — Audit complet](#5-backend-agritogo-flask--audit-complet)
6. [PWA + Card Pipeline + Intégrations](#6-pwa--card-pipeline--intégrations)
7. [Problèmes critiques consolidés](#7-problèmes-critiques-consolidés)
8. [Plan de corrections priorisé](#8-plan-de-corrections-priorisé)

---

## 1. VUE D'ENSEMBLE DU SYSTÈME

### 1.1 Stack technologique complet

| Couche | Technologie | Version | Déploiement |
|--------|-------------|---------|-------------|
| **Frontend** | Next.js App Router | 16.2.4 | Vercel |
| **UI** | React | 19 | — |
| **Styling** | Tailwind CSS | 4 (OKLCH) | — |
| **Auth + DB** | Supabase | PostgreSQL 17 | Supabase Cloud |
| **Backend IA** | Flask + AgentScope | 3.1.3 + 1.0.19 | Railway |
| **ML Models** | scikit-learn + XGBoost | 1.8 + 3.2 | Railway |
| **LLMs** | Gemini 2.5-Flash + Qwen-Max | — | API cloud |
| **Rate limiting** | Upstash Redis | — | Upstash Cloud |
| **Card rendering** | resvg-wasm (server) + Canvas2D (client) | — | Vercel |
| **PWA** | Service Worker + manifest | — | Vercel |

### 1.2 Architecture macro

```
┌─────────────────────────────────────────────────────────────┐
│                    UTILISATEURS FINAUX                       │
│        Admins coop · Agents terrain · Public verify          │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              NEXT.JS 16 (Vercel Edge + Node)                │
│                                                              │
│  App Router:                                                 │
│  /dashboard/** → Portail coopérative (auth requis)          │
│  /scan/**      → Scanner QR PWA (auth requis, offline-ok)   │
│  /verify/**    → Vérification publique carte membre          │
│  /api/**       → REST: cards, webhook, agrismart proxy       │
│                                                              │
│  Middleware: auth guard + tenant isolation                   │
└──────────┬───────────────────────────┬──────────────────────┘
           │                           │
┌──────────▼──────────┐   ┌────────────▼──────────────────────┐
│   SUPABASE           │   │   AGRITOGO (Railway Flask)        │
│   PostgreSQL 17      │   │   Decision Intelligence Engine    │
│   Auth (JWT)         │   │   6 agents IA multi-modèles       │
│   Storage (photos)   │   │   5 modèles ML (RF, XGB, GARCH)  │
│   RLS policies       │   │   Expert system FAO-56 irrigation │
│   Edge Functions     │   │   KoboCollect integration         │
└─────────────────────┘   └───────────────────────────────────┘
```

### 1.3 Flux de données principaux

**Création carte membre :**
```
Admin → Upload photo (Sharp 600×600 face-crop) → Supabase Storage
     → Génère card_number → INSERT member_cards
     → /api/cards/[memberId] → buildCardSchema → renderToSvgString
     → resvg-wasm → PNG 2360×1480 → download
```

**Vérification sur terrain :**
```
Agent terrain → /scan → Camera QR → URL decode → /verify/[cardNumber]
             → GET member_cards + members + cooperatives (public, no auth)
             → Card3D component (gyroscope, holographic)
             → PWA offline fallback si pas de réseau
```

**Conseil agricole IA :**
```
Fermier → /api/agrismart (Next.js proxy) → AgriTogo /api/v1/agent/chat
       → Router (intent detection) → Agent spécialisé (Gemini/Qwen)
       → Tools: ML models + Supabase market data + NASA POWER
       → Débat multi-modèles si high-stakes → UX agent format → Réponse
```

---

## 2. ARCHITECTURE NEXT.JS — AUDIT COMPLET

### 2.1 Structure App Router

```
app/
├── layout.tsx                    # Root layout — fonts Barlow, metadata, PWA
├── page.tsx                      # Landing page publique
├── globals.css                   # Tailwind 4 OKLCH design tokens
│
├── dashboard/                    # 🔐 Auth requis (middleware)
│   ├── layout.tsx                # Sidebar nav + CooperativeProvider
│   ├── page.tsx                  # Dashboard overview (stats, cartes)
│   ├── members/
│   │   ├── page.tsx              # Liste membres + search + pagination
│   │   ├── [memberId]/
│   │   │   ├── page.tsx          # Détail membre + carte preview
│   │   │   └── edit/page.tsx     # Formulaire édition membre
│   │   └── new/page.tsx          # Création nouveau membre
│   ├── cards/
│   │   ├── page.tsx              # Gestion cartes actives
│   │   └── bulk/page.tsx         # Génération cartes en lot
│   ├── cooperatives/
│   │   ├── page.tsx              # Liste coopératives (super-admin)
│   │   └── [coopId]/page.tsx     # Détail coopérative
│   ├── agrismart/
│   │   └── page.tsx              # Interface conseil agricole IA
│   └── settings/
│       └── page.tsx              # Paramètres compte + coop
│
├── scan/                         # 🔐 Auth requis + PWA offline
│   ├── layout.tsx                # PWA shell, InstallPrompt
│   ├── page.tsx                  # Scanner QR (jsQR, camera)
│   └── offline/page.tsx          # Page offline SW fallback
│
├── verify/                       # 🌐 Public (no auth)
│   └── [cardNumber]/
│       └── page.tsx              # Vérification carte + Card3D
│
└── api/                          # API Routes
    ├── cards/
    │   └── [memberId]/route.ts   # GET → PNG carte (resvg-wasm)
    ├── webhooks/
    │   └── route.ts              # POST → HMAC-SHA256 webhook ingestion
    └── agrismart/
        └── route.ts              # GET/POST → Proxy AgriTogo Flask
```

### 2.2 Middleware (middleware.ts)

**Protection des routes :**
```typescript
// Routes publiques (pas de vérif auth)
const PUBLIC_ROUTES = ['/', '/verify', '/api/webhooks']

// Logique:
// 1. Vérifie session Supabase (cookie JWT)
// 2. Si pas auth + route protégée → redirect /
// 3. Si auth + route publique → pass-through
// 4. Si auth → inject user dans request headers
```

**Points forts :**
- ✅ Session Supabase validée côté middleware (server-side)
- ✅ Routes `/verify/**` publiques (scanning sans compte)
- ✅ Routes `/api/webhooks` exemptées (auth HMAC)

**Lacunes :**
- ❌ Pas de CSRF token middleware sur routes POST
- ❌ Pas de rate limiting dans middleware (délégué à Upstash)
- ❌ Pas de log des tentatives d'accès non-autorisé

### 2.3 Sécurité multi-couche

**Layer 1 — Middleware :** Auth JWT Supabase
**Layer 2 — assertTenantAccess() :** Vérifie que user appartient à la cooperative
**Layer 3 — RLS Supabase :** Policies row-level (incomplet — voir section DB)
**Layer 4 — requireRole() :** RBAC (admin / super_admin)

```typescript
// lib/security/assert-access.ts
export async function assertTenantAccess(cooperativeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Super admin → accès universel
  if (user?.user_metadata?.role === 'super_admin') return { ok: true }
  
  // Vérifie appartenance à la cooperative
  const { data } = await supabase
    .from('cooperative_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('cooperative_id', cooperativeId)
    .single()
  
  if (!data) return { ok: false, response: NextResponse.json({error: 'Forbidden'}, {status: 403}) }
  return { ok: true }
}
```

### 2.4 Rate Limiting (lib/utils/rate-limit-persistent.ts)

**5 buckets distincts :**
| Bucket | Limite | Fenêtre | Usage |
|--------|--------|---------|-------|
| `verify` | 60 req | 60s | `/verify/**` |
| `marketplace` | 100 req | 60s | Routes marchéplace |
| `embed` | 20 req | 60s | `/api/cards/**` (WASM heavy) |
| `auth` | 10 req | 60s | Auth endpoints |
| `webhook` | 30 req | 60s | `/api/webhooks` |

**Implémentation :** Upstash Redis (persistent) + in-memory fallback (si Redis indisponible)

**⚠️ Problème :** En multi-instance Vercel (autoscale), le fallback in-memory est par instance → bypass possible sur spikes (voir SEC-01).

### 2.5 Variables d'environnement requises

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://hhnswekjgbxckluqnszo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Rate limiting
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...

# AgriTogo backend
AGRITOGO_API_URL=https://agritogo-backend-prod.railway.app

# Webhook
WEBHOOK_SECRET=hmac-secret-256bit

# Optionnel: monitoring
SENTRY_DSN=https://...sentry.io
NEXT_PUBLIC_POSTHOG_KEY=phc_...
```

### 2.6 Card Engine (lib/card-engine/)

**Pipeline complet :**

```
buildCardSchema(params) → CardSchema (JSON, source of truth)
        ↓
renderToSvgString(schema, photoDataUri, sigDataUri, fontStyle)
        ↓ (server: resvg-wasm)          ↓ (client: Canvas2D)
PNG 2360×1480 (GET /api/cards/)    PNG download (downloadCard)
```

**Fonts embarquées :** `loadEmbeddedFontStyle()` fetch Google Fonts → woff2 → base64 → @font-face inline SVG. Preview === Export === Print (source of truth unique).

**⚠️ Problème SEC-02 :** Pas de timeout sur fetch Google Fonts. Si fonts.googleapis.com timeout → carte générée sans fonts (Barlow → fallback).

```typescript
// FIX requis dans lib/card-engine/renderer.ts
const cssResp = await fetch(googleFontsUrl, {
  signal: AbortSignal.timeout(5000), // ← AJOUTER
  headers: { 'User-Agent': 'Mozilla/5.0...' },
  cache: 'force-cache'
})
```

### 2.7 Webhook System (app/api/webhooks/route.ts)

**3 méthodes d'auth :**
1. HMAC-SHA256 signature (header `X-Webhook-Signature`) — timing-safe compare
2. Bearer token (header `Authorization`)
3. API key (header `X-API-Key`)

**Protections :**
- ✅ 2MB size cap (reject oversized payloads)
- ✅ Zod schema validation
- ✅ Async processing via `waitUntil()` (Vercel edge)
- ✅ HMAC timing-safe (no timing attack)

---

## 3. BASE DE DONNÉES SUPABASE — AUDIT COMPLET

### 3.1 Schéma des tables

**Tables principales :**

| Table | Colonnes clé | RLS | Notes |
|-------|-------------|-----|-------|
| `cooperatives` | id, name, faitiere_name, level, cooperative_id | ✅ | Level: or/argent/bronze |
| `members` | id, cooperative_id, first_name, last_name, phone, photo_url, signature_url, village, canton, prefecture, region | ✅ | Photo face-crop 600×600 |
| `member_cards` | id, member_id, cooperative_id, card_number, status, expiry_date, created_at | ✅ | Status: active/expired/revoked |
| `cooperative_members` | id, cooperative_id, user_id, role | ✅ | role: admin/super_admin |
| `parcelles` | id, member_id, surface_ha | ❌ **SANS RLS** | Surfaces cultivées |
| `productions` | id, member_id, quantity_kg, campaign_year | ❌ **SANS RLS** | Récoltes |
| `cotisations` | id, member_id, amount, status | ❌ **SANS RLS** | Cotisations paid/pending |
| `purchases` | id, member_id, product_id, amount, created_at | ❌ **SANS RLS** | Achats marketplace |
| `contact_requests` | id, email, message, status | ❌ **SANS RLS** | Formulaire contact |
| `member_access_logs` | id, member_id, accessed_by, accessed_at | ❌ **SANS RLS** | Logs d'accès |
| `ai_conversations` | id, card_number, role, content, created_at | ⚠️ **RLS TROP PERMISSIF** | Chat AgriTogo |
| `fiches_techniques` | id, culture, saison, content | ⚠️ **FK manquante** | Fiches RAG AgriSmart |

### 3.2 Problèmes RLS critiques

**8 tables sans Row Level Security :**

```sql
-- URGENT: Activer RLS sur toutes ces tables
ALTER TABLE parcelles ENABLE ROW LEVEL SECURITY;
ALTER TABLE productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_access_logs ENABLE ROW LEVEL SECURITY;

-- Policies exemples:
CREATE POLICY "members_own_parcelles" ON parcelles
  FOR ALL USING (
    member_id IN (
      SELECT m.id FROM members m
      JOIN cooperative_members cm ON cm.cooperative_id = m.cooperative_id
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "admin_access_cotisations" ON cotisations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM members m
      JOIN cooperative_members cm ON cm.cooperative_id = m.cooperative_id
      WHERE m.id = cotisations.member_id AND cm.user_id = auth.uid()
    )
  );
```

**RLS ai_conversations trop permissif :**
```sql
-- Problème: n'importe quel utilisateur auth peut lire toutes conversations
-- FIX: restreindre par card_number ou cooperative
CREATE POLICY "own_conversations" ON ai_conversations
  FOR SELECT USING (
    card_number IN (
      SELECT mc.card_number FROM member_cards mc
      JOIN members m ON m.id = mc.member_id
      JOIN cooperative_members cm ON cm.cooperative_id = m.cooperative_id
      WHERE cm.user_id = auth.uid()
    )
  );
```

### 3.3 Problème N+1 — Génération en lot

**Code problématique (app/dashboard/cards/bulk/page.tsx) :**
```typescript
// ❌ 300 membres → 300 requêtes Supabase séquentielles
for (const member of members) {
  const { data: card } = await supabase
    .from('member_cards')
    .select(...)
    .eq('member_id', member.id)
    .single()
  cards.push(card)
}
```

**Fix — 1 requête batch :**
```typescript
// ✅ 1 seule requête pour tous les membres
const memberIds = members.map(m => m.id)
const { data: cards } = await supabase
  .from('member_cards')
  .select('card_number, status, expiry_date, member_id, cooperative_id')
  .in('member_id', memberIds)
  .eq('status', 'active')

// Indexer par member_id pour O(1) lookup
const cardsByMember = Object.fromEntries(cards.map(c => [c.member_id, c]))
```

### 3.4 FK manquante

```sql
-- fiches_techniques.culture → pas de FK vers une table cultures
-- Risque: données orphelines, inconsistance

-- Option 1: Ajouter table cultures si elle n'existe pas dans ce schema
ALTER TABLE fiches_techniques
  ADD CONSTRAINT fk_culture FOREIGN KEY (culture)
  REFERENCES cultures(name) ON DELETE CASCADE;

-- Option 2: Enum si liste fixe
ALTER TABLE fiches_techniques
  ADD CONSTRAINT culture_check CHECK (
    culture IN ('Tomate','Piment','Oignon','Chou','Laitue','Carotte',
                'Concombre','Aubergine','Gombo','Pastèque','Maïs','Riz',
                'Igname','Manioc','Arachide','Soja','Sorgho','Mil')
  );
```

### 3.5 Index recommandés

```sql
-- Recherches fréquentes sans index
CREATE INDEX CONCURRENTLY idx_member_cards_member_active 
  ON member_cards(member_id, status) WHERE status = 'active';

CREATE INDEX CONCURRENTLY idx_members_cooperative 
  ON members(cooperative_id);

CREATE INDEX CONCURRENTLY idx_member_cards_card_number 
  ON member_cards(card_number);

CREATE INDEX CONCURRENTLY idx_ai_conversations_card 
  ON ai_conversations(card_number, created_at DESC);

-- Supabase (AgriTogo side)
CREATE INDEX CONCURRENTLY idx_market_prices_product_date
  ON market_prices(culture_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_weather_data_region_date
  ON weather_data(region, date DESC);
```

---

## 4. FRONTEND UI/UX — AUDIT COMPLET

### 4.1 Architecture composants

**80+ composants React organisés en :**

```
components/
├── ui/                    # Design system atoms (Shadcn-like)
│   ├── button.tsx         # Variantes: primary/secondary/ghost/danger
│   ├── input.tsx          # Controlled + validation states
│   ├── card.tsx           # Container générique
│   ├── badge.tsx          # Status badges (OKLCH colors)
│   ├── dialog.tsx         # Modal accessible (focus trap)
│   └── ...25+ composants  
│
├── dashboard/             # Feature composants dashboard
│   ├── member-card-preview.tsx   # Preview carte interactive
│   ├── member-form.tsx           # Formulaire CRUD membre
│   ├── card-canvas.tsx           # Canvas renderer (client-side)
│   ├── stats-overview.tsx        # KPI dashboard widgets
│   └── bulk-card-generator.tsx   # Génération en lot
│
├── verify/                # Vérification publique
│   ├── card-3d.tsx        # Carte 3D holographique (gyroscope)
│   ├── verify-result.tsx  # Layout résultat vérification
│   └── types.ts           # Types VerifyMember, VerifyCard, etc.
│
├── agrismart/             # AgriSmart irrigation wizard
│   └── agrismart-water.tsx  # Wizard multi-étapes FAO-56
│
├── scan/                  # PWA scanner
│   ├── qr-scanner.tsx     # Camera + jsQR decode
│   └── scan-result.tsx    # Affichage résultat scan
│
└── pwa/                   # Progressive Web App
    ├── register-sw.tsx    # Service Worker registration
    └── install-prompt.tsx # A2HS banner (beforeinstallprompt)
```

### 4.2 Design System — Tailwind 4 OKLCH

**Tokens CSS (app/globals.css) :**

```css
:root {
  /* Couleurs primaires OKLCH (perceptuellement uniformes) */
  --color-primary: oklch(0.55 0.18 145);     /* Vert coopérative */
  --color-primary-light: oklch(0.75 0.15 145);
  --color-primary-dark: oklch(0.35 0.18 145);
  
  /* Niveaux coopérative */
  --color-or: oklch(0.75 0.18 85);           /* Or */
  --color-argent: oklch(0.75 0.05 240);      /* Argent */
  --color-bronze: oklch(0.60 0.12 55);       /* Bronze */
  
  /* Sémantiques */
  --color-success: oklch(0.60 0.20 145);
  --color-warning: oklch(0.75 0.18 75);
  --color-error: oklch(0.55 0.22 25);
  
  /* Surfaces */
  --color-surface: oklch(0.98 0.01 145);
  --color-surface-elevated: oklch(1 0 0);
  --radius-card: 1.375rem;
}
```

**Avantages OKLCH :**
- Perceptuellement uniforme (même lightness = même luminosité perçue)
- Gamut P3 supporté (écrans Apple/Samsung récents)
- Transitions fluides sans banding

### 4.3 Composant Card3D (components/verify/card-3d.tsx)

**Fonctionnalités :**
- ✅ Parallax + dynamic light (pointer/gyroscope)
- ✅ Holographic sheen sweeping
- ✅ Embossed chip animation
- ✅ Layered shadows
- ✅ CSS custom properties `--mx`, `--my` pour light source
- ✅ `prefers-reduced-motion` respecté
- ✅ Photo circulaire avec ring holographique

```typescript
// Tilt calculation (hover)
const ry = (px - 0.5) * 22  // Max ±11° horizontal
const rx = (0.5 - py) * 16  // Max ±8° vertical

// Device orientation (gyroscope mobile)
const ry = Math.max(-18, Math.min(18, e.gamma * 0.5))
const rx = Math.max(-14, Math.min(14, (e.beta - 45) * 0.3))
```

### 4.4 AgriSmart Water Wizard (components/agrismart/agrismart-water.tsx)

**Wizard multi-étapes :**
1. Sélection cultures multiples + surfaces (m²)
2. Sélection type sol (5 textures ROSETTA v3)
3. Sélection système irrigation (4 options + efficacité)
4. Résultats FAO-56: besoins mensuels + KPIs + débit pompe

**Features avancées :**
- Multi-cultures simultanées (ex: Tomate 1000m² + Piment 500m²)
- Volume survie + bonus rendement optimal (15% ETM)
- Débit pompe calculé en L/s
- Mois pic identifié
- Graphique besoins combinés
- Export CSV possible

### 4.5 QR Engine (custom — sans lib externe)

**Implémentation pure JS :**
- Reed-Solomon Error Correction Level M (15% erreur)
- Modes: Byte (URL payload)
- Format: `https://www.faitierehub.com/verify/{cardNumber}`
- Rendu Canvas → PNG inline

**⚠️ Problème SEC-04 :** Validation de longueur QR manquante. Un card_number de 50+ caractères peut causer une expansion exponentielle de la matrice QR.

```typescript
// FIX requis dans le QR generator
if (data.length > 500) {
  throw new Error(`QR payload too long: ${data.length} chars (max 500)`)
}
```

### 4.6 Upload photo (Sharp pipeline)

**Traitement serveur :**
```typescript
// Sharp configuration
await sharp(buffer)
  .resize(600, 600, {
    fit: 'cover',
    position: 'attention',  // Face-aware crop (IA détection visage)
  })
  .jpeg({ quality: 88 })
  .toBuffer()
```

**⚠️ Problème SEC-06 :** Pas de limite mémoire/taille sur l'upload. Un fichier de 50MB TIFF pourrait épuiser la mémoire du worker Vercel.

```typescript
// FIX: Valider avant traitement
const MAX_SIZE = 10 * 1024 * 1024  // 10MB
if (file.size > MAX_SIZE) {
  return NextResponse.json({ error: 'Fichier trop volumineux (max 10MB)' }, { status: 400 })
}
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
if (!ALLOWED_TYPES.includes(file.type)) {
  return NextResponse.json({ error: 'Type non supporté' }, { status: 400 })
}
```

---

## 5. BACKEND AGRITOGO FLASK — AUDIT COMPLET

### 5.1 Architecture globale

**Système multi-agents IA (Decision Intelligence Engine) :**

```
AgriTogo Backend (Flask 3.1.3 — Railway)
│
├── 6 Agents spécialisés (AgentScope 1.0.19)
│   ├── Coordinator (Gemini) — Orchestre + arbitre débats
│   ├── Market Intel (Gemini) — Analyse marchés/saisonnalité
│   ├── Quant Forecast (Qwen) — Modèles RF/XGB/GARCH
│   ├── Risk Volatility (Qwen) — VaR, scoring crédit
│   ├── Decision (Gemini) — Recommandations VENDRE/STOCKER/ATTENDRE
│   └── UX Agent (Gemini) — Reformatage par audience (agriculteur/coop/gov)
│
├── 5 Modèles ML
│   ├── Crop Yield — RandomForest + XGBoost (8 features météo)
│   ├── GARCH Volatility — GARCH(1,1) sur prix historiques
│   ├── Financial Risk — RF classifier + SMOTE (scoring crédit)
│   ├── Farmer Segmentation — PCA + KMeans(4) clusters
│   └── KPI Dashboard — Analytics régionales Togo
│
├── Expert System Irrigation
│   ├── FAO-56 bilan hydrique complet (12 mois)
│   ├── 10 cultures (Kc mensuel terrain KARA1.xlsx)
│   ├── 5 profils sol ROSETTA v3
│   ├── NASA POWER climatology (30-yr means) + fallbacks régions Togo
│   └── Boost rendement optimal (15% ETM)
│
└── Data Sources
    ├── Supabase (market_prices, weather_data, members, parcelles)
    ├── NASA POWER API (climatologie)
    ├── Open-Meteo (météo temps réel)
    └── KoboToolbox (collecte terrain)
```

### 5.2 Endpoints API complets

#### Routes Santé

| Route | Méthode | Auth | Retour |
|-------|---------|------|--------|
| `/health` | GET | Non | `{"status":"ok"}` — <1ms |
| `/debug/env` | GET | Non | Nombre clés Gemini, flags ML |

#### Routes AgriSmart Expert System

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/api/v1/agrismart/crops` | GET | Non | 10 cultures + Kc mensuel FAO-56 |
| `/api/v1/agrismart/soil-types` | GET | Non | 5 textures sol ROSETTA v3 |
| `/api/v1/agrismart/calculate` | POST | Non ⚠️ | Bilan hydrique FAO-56 complet |

**POST /api/v1/agrismart/calculate — Corps:**
```json
{
  "crops": [{"name": "Tomate", "area_m2": 1000}, {"name": "Piment", "area_m2": 500}],
  "soil_type": "Limoneux",
  "system": "Goutte à goutte",
  "lat": 8.55,
  "lon": 1.10,
  "region": "Centrale"
}
```

**Réponse — KPIs par culture + combinés (12 mois, volumes m³, débit pompe L/s)**

#### Routes Agent IA

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/api/v1/agent/chat` | POST | Non ⚠️ | Chat agent décision IA |
| `/api/v1/produits` | GET | Non | Liste cultures |
| `/api/v1/marches` | GET | Non | Liste marchés |
| `/api/v1/prix/<produit>` | GET | Non | Prix historiques |
| `/api/v1/forecast` | POST | Non | GARCH 30j forecast |
| `/api/v1/risk` | POST | Non | Scoring risque crédit |
| `/api/v1/segmentation` | POST | Non | KMeans farmer clusters |
| `/api/v1/kpi` | GET | Non | Dashboard KPI régional |
| `/api/v1/stats` | GET | Non | Stats base de données |

### 5.3 Système de débat multi-modèles

**Trigger :** Décision high-stakes (vendre, acheter, investir, montant ≥6 chiffres)

```python
# Détection automatique high-stakes
HIGH_STAKES = ["vendre", "acheter", "investir", "emprunter", "crédit", "prêt"]
def should_debate(query: str) -> bool:
    has_stakes = any(kw in query.lower() for kw in HIGH_STAKES)
    has_large_amount = bool(re.search(r"\d{6,}", query))
    return has_stakes or has_large_amount

# Processus débat:
# 1. Gemini/Decision → Proposition stratégique
# 2. Qwen/Risk → Critique quantitative (GARCH, VaR)
# 3. Gemini/Coordinator → Arbitrage final
```

**Exemple résultat :**
```
User: "Dois-je vendre 500 tonnes de maïs à 220 FCFA/kg maintenant?"
→ HIGH STAKES (vendre + 500 tonnes = 110M FCFA)
→ Gemini: "Vendez 60% maintenant, gardez 40% pour hausse attendue +8% dans 3 semaines"
→ Qwen: "GARCH montre σ=18% annualisé, VaR95=-12%, RSI=52 (neutre), saisonnalité favorable"
→ Coordinator: "DÉCISION: Vendre 50% maintenant à 220, stocker 50% pour semaine 3 (cible 238)"
```

### 5.4 Rotation clés Gemini

**Problème résolu :** Quota Gemini API (429 errors)

```python
# 3-9 clés en rotation circulaire avec cooldown 60s par clé
GEMINI_API_KEY_1=key1
GEMINI_API_KEY_2=key2  
GEMINI_API_KEY_3=key3

# Auto-rotation sur 429:
# 1. mark_key_exhausted() → cooldown 60s
# 2. Tente clés suivantes sans cooldown
# 3. Si toutes épuisées → message d'erreur gracieux
```

### 5.5 Startup optimisé Railway

**Lazy loading ML (background thread) :**
```
t=0s  : Flask bind → /health prêt (<1ms)
t=1s  : Background thread démarre (import scikit-learn, XGBoost, arch, AgentScope)
t=30s : ML fully loaded → tous endpoints opérationnels
```

**Gunicorn config :**
```bash
gunicorn --bind 0.0.0.0:$PORT --workers 2 --timeout 120 app.server:app
```

### 5.6 Intégration KoboToolbox

**Collecte terrain :**
- API KoboToolbox v2 (token auth)
- XLSForm auto-généré pour collecte prix marchés
- 5 marchés Togo: Lomé-Adawlato, Kara, Sokodé, Atakpamé, Dapaong
- 12 cultures trackées
- GPS position collecteur
- Sync Supabase → ML retraining

---

## 6. PWA + CARD PIPELINE + INTÉGRATIONS

### 6.1 Progressive Web App

**Manifest (public/manifest.json) :**
```json
{
  "name": "FaîtiereHub — Scanner",
  "short_name": "Scanner FH",
  "start_url": "/scan",
  "display": "standalone",
  "theme_color": "#16a34a",
  "background_color": "#052e16",
  "icons": [72, 96, 128, 192, 512]
}
```

**Service Worker (public/sw.js) :**
- Cache name: `coopscan-v1`
- API + verify: network-first, fallback 503 JSON
- Navigation: network-first, fallback `/scan/offline`
- Static assets: cache-first

**Install flow :**
1. `beforeinstallprompt` capturé dans `install-prompt.tsx`
2. Bannière A2HS affichée si pas encore installé
3. Service Worker enregistré via `register-sw.tsx`

### 6.2 Card Pipeline complet

**Client-side (preview + download) :**
```
buildCardSchema(params)
  → renderToCanvas(schema, canvas) [Canvas2D]
    → loadEmbeddedFontStyle() [Google Fonts → base64]
    → imageToDataUrl(photo_url) [fetch → base64]
    → imageToDataUrl(signature_url) [fetch → base64]
    → drawCard() [SVG elements via Canvas API]
  → downloadCard() [canvas.toBlob → FileSaver]
```

**Server-side (haute résolution PNG) :**
```
GET /api/cards/[memberId]
  → Rate limit (20 req/min, embed bucket)
  → Auth check (Supabase JWT)
  → assertTenantAccess(cooperative_id)
  → Fetch member + card + cooperative (Supabase)
  → urlToDataUri(photo_url) [Supabase Storage → base64]
  → urlToDataUri(signature_url) [Supabase Storage → base64]
  → loadEmbeddedFontStyle() [Google Fonts → base64 @font-face]
  → buildCardSchema(params)
  → renderToSvgString(schema, photo64, sig64, fontStyle)
  → resvg-wasm.render() [SVG → PNG 2360×1480]
  → Response PNG (Cache-Control: private, max-age=3600)
```

**Garantie Preview === Export === Print :** Le CardSchema JSON est la source de vérité unique. Le même schema produit le même rendu côté client ET serveur.

### 6.3 Intégrations externes

| Service | Usage | Auth | Fallback |
|---------|-------|------|---------|
| **Supabase** | Auth, DB, Storage | JWT + service role | Non (SPOF) |
| **Upstash Redis** | Rate limiting persistent | Token | In-memory (⚠️) |
| **Google Fonts** | Barlow embedded SVG | Aucune | CSS generic font |
| **NASA POWER** | Climatologie FAO-56 | Aucune (public) | Hardcoded 5 régions Togo |
| **Gemini API** | LLM agent Coordinator | API Key (×9 rotation) | Message d'erreur |
| **Qwen/DashScope** | LLM agent Quant | API Key | Fallback Gemini |
| **KoboToolbox** | Collecte terrain | Token | Skip (non-critique) |
| **Railway** | Hébergement Flask | Docker | — |

---

## 7. PROBLÈMES CRITIQUES CONSOLIDÉS

### 7.1 Sécurité — CRITIQUES (P0 — Corriger immédiatement)

#### SEC-01 — Rate Limit Multi-Instance Bypass
**Problème :** Fallback in-memory du rate limiter est par instance Vercel. En autoscale (N instances), chaque instance a son propre compteur → bypass effectif sous load.
**Impact :** DDoS possible sur `/api/cards/**` (WASM $0.5/100 req), `/verify/**` (scraping DB)
**Fix :**
```typescript
// lib/utils/rate-limit-persistent.ts
// S'assurer que Upstash Redis est TOUJOURS utilisé, jamais in-memory en production
if (process.env.NODE_ENV === 'production' && !process.env.UPSTASH_REDIS_REST_URL) {
  throw new Error('FATAL: UPSTASH_REDIS_REST_URL must be set in production')
}
```

#### SEC-02 — Google Fonts Fetch sans Timeout
**Problème :** `loadEmbeddedFontStyle()` dans `lib/card-engine/renderer.ts` n'a pas de timeout. Si Google Fonts est lent → la génération de carte bloque jusqu'au timeout Vercel (10s par défaut).
**Fix :**
```typescript
const cssResp = await fetch(GOOGLE_FONTS_URL, {
  signal: AbortSignal.timeout(5000),
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
  cache: 'force-cache',
})
```

#### SEC-03 — Pas d'Auth sur /api/agrismart
**Problème :** `app/api/agrismart/route.ts` est un proxy vers AgriTogo sans aucune authentification ni rate limit. N'importe qui peut appeler POST /api/agrismart/calculate en boucle → charge NASA POWER API + computation FAO-56.
**Fix :**
```typescript
// app/api/agrismart/route.ts — AJOUTER en haut de chaque handler
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const rateLimited = await applyRateLimit(request, 'agrismart')
if (rateLimited) return rateLimited
```

#### SEC-04 — QR Payload sans Validation Longueur
**Problème :** Le générateur QR custom accepte des payloads de longueur arbitraire. Un card_number très long peut causer une expansion exponentielle de la matrice de modules.
**Fix :**
```typescript
// Dans le QR generator
const MAX_QR_LENGTH = 500
if (data.length > MAX_QR_LENGTH) {
  throw new Error(`QR payload trop long: ${data.length} chars`)
}
```

#### SEC-05 — RLS Manquant sur 8 Tables (voir section 3.2)
**Impact :** Toute requête authentifiée peut lire/écrire parcelles, productions, cotisations, purchases de N'IMPORTE QUELLE coopérative. Fuite de données massique possible.
**Fix :** Appliquer les SQL de la section 3.2.

#### SEC-06 — Upload Photo sans Limite Taille
**Problème :** Pas de vérification de taille avant traitement Sharp. Un fichier 100MB TIFF épuise la mémoire du worker Vercel (512MB limit).
**Fix :** Valider type + taille avant `sharp(buffer)` (voir section 4.6).

#### SEC-07 — AgriTogo API Publique sans Auth
**Problème :** Tous les endpoints Flask AgriTogo sont publics. POST /api/v1/agrismart/calculate peut être appelé directement (bypass même le proxy Next.js).
**Fix :**
```python
# app/api.py — Middleware auth simple
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")

def require_api_key():
    key = request.headers.get("X-Internal-Key", "")
    if not hmac.compare_digest(key, INTERNAL_API_KEY):
        return jsonify({"error": "Unauthorized"}), 401
    return None

@api_bp.before_request
def check_auth():
    # Exemptions: /health, /debug/env
    if request.path in ["/health", "/debug/env"]:
        return
    err = require_api_key()
    if err: return err
```

### 7.2 Performance — IMPORTANTS (P1)

#### PERF-01 — N+1 Bulk Card Generation
**Impact :** 300 membres = 300 Supabase queries. À 100ms/query = 30s bloquées.
**Fix :** Batch query (voir section 3.3).

#### PERF-02 — NASA POWER sans Cache
**Problème :** Chaque requête `/api/v1/agrismart/calculate` peut faire une requête NASA POWER (1-5s). Données changent 1x/mois.
**Fix :**
```python
# Cache Supabase: stocker résultats NASA par (lat_round, lon_round)
@lru_cache(maxsize=500)
def get_climate_normals_cached(lat_r: float, lon_r: float) -> dict:
    return _fetch_nasa_power(lat_r, lon_r)

# Arrondir à 0.5° (≈55km grid)
lat_r = round(lat * 2) / 2
lon_r = round(lon * 2) / 2
return get_climate_normals_cached(lat_r, lon_r)
```

#### PERF-03 — Supabase sans Cache
**Problème :** Listes produits, marchés, coopératives refetchées à chaque requête.
**Fix :** Cache Redis 5 min pour données quasi-statiques.

### 7.3 Qualité — MOYENS (P2)

#### QUAL-01 — AgentScope Fragile au Démarrage
**Problème :** Si agentscope échoue à l'import (compilateurs manquants), agents désactivés. Pas d'alerte claire.
**Fix :** Health check proactif + alert Railway si `_AGENTSCOPE_AVAILABLE = False`.

#### QUAL-02 — Secret Flask par Défaut
**Problème :** `SECRET_KEY=agritogo-secret-key-2026` dans le code source.
**Fix :**
```python
SECRET_KEY = os.environ.get("FLASK_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("FLASK_SECRET_KEY must be set in environment")
```

#### QUAL-03 — ML Training sur Données Synthétiques
**Problème :** Farmer segmentation utilise CSV locaux (archive1/yield_df.csv). Si manquants → synthétique pur → métriques R²/F1 non-représentatives.
**Fix :** Charger depuis Supabase `training_data` table, fallback synthétique explicitement loggé.

#### QUAL-04 — Pas de CSRF sur POST
**Problème :** Les formulaires Next.js (création membre, etc.) n'ont pas de protection CSRF.
**Fix :** Utiliser Next.js Server Actions (CSRF built-in) ou ajouter token CSRF middleware.

#### QUAL-05 — Pas de Tests Automatisés
**Problème :** 0 tests unitaires (AgriTogo) et très peu de tests (Saas).
**Fix :** Ajouter pytest pour endpoints + jest pour composants clés.

---

## 8. PLAN DE CORRECTIONS PRIORISÉ

### Sprint 1 — Sécurité critique (3 jours)

```
[ ] SEC-01: Lever exception si Upstash Redis absent en production
[ ] SEC-02: Ajouter AbortSignal.timeout(5000) sur Google Fonts fetch
[ ] SEC-03: Ajouter auth check + rate limit sur /api/agrismart/*
[ ] SEC-05: Activer RLS + créer policies sur 8 tables Supabase
[ ] SEC-06: Valider type + taille upload photo avant Sharp
[ ] SEC-07: Ajouter INTERNAL_API_KEY sur tous endpoints AgriTogo
```

### Sprint 2 — Performance & Stabilité (3 jours)

```
[ ] PERF-01: Remplacer N+1 par batch query (bulk card generation)
[ ] PERF-02: Cache NASA POWER avec lru_cache + arrondi 0.5°
[ ] PERF-03: Cache Redis 5min sur produits/marchés/cooperatives
[ ] DB-01: Créer index Supabase (member_cards, members, market_prices)
[ ] DB-02: Ajouter FK fiches_techniques.culture → cultures
[ ] RLS-AI: Resserrer policy ai_conversations par cooperative
```

### Sprint 3 — Qualité & Observabilité (3 jours)

```
[ ] QUAL-01: Monitoring AgentScope startup + alert si non-disponible
[ ] QUAL-02: Valider FLASK_SECRET_KEY en var d'env obligatoire
[ ] QUAL-03: ML training depuis Supabase + log si synthétique utilisé
[ ] QUAL-04: CSRF protection (Server Actions ou middleware token)
[ ] QR-04: Validation longueur payload QR (max 500 chars)
[ ] PHOTO-06: Taille max photo 10MB + types MIME whitelist
[ ] LOG-01: Logging centralisé Flask (Sentry ou Railway logs)
```

### Sprint 4 — Tests & Documentation (2 jours)

```
[ ] TEST-01: Tests pytest Flask (health, agrismart/calculate, agent/chat)
[ ] TEST-02: Tests Jest composants critiques (Card3D, AgriSmart wizard)
[ ] TEST-03: Tests Playwright E2E (scan → verify flow)
[ ] DOC-01: OpenAPI/Swagger pour AgriTogo /api/v1/*
[ ] DOC-02: Diagramme RLS Supabase (policies par table)
```

---

## ANNEXES

### A. Checklist Déploiement Production

**Vercel (FaîtiereHub) :**
```bash
✓ NEXT_PUBLIC_SUPABASE_URL
✓ NEXT_PUBLIC_SUPABASE_ANON_KEY
✓ SUPABASE_SERVICE_ROLE_KEY
✓ UPSTASH_REDIS_REST_URL  ← CRITIQUE
✓ UPSTASH_REDIS_REST_TOKEN  ← CRITIQUE
✓ AGRITOGO_API_URL
✓ WEBHOOK_SECRET (256-bit random)
```

**Railway (AgriTogo) :**
```bash
✓ SUPABASE_URL
✓ SUPABASE_SERVICE_KEY
✓ GEMINI_API_KEY_1 (min 3 clés)
✓ GEMINI_API_KEY_2
✓ GEMINI_API_KEY_3
✓ FLASK_SECRET_KEY (nouveau, obligatoire)
✓ INTERNAL_API_KEY (nouveau, pour auth endpoint)
✓ PORT (auto-injecté Railway)
```

### B. Métriques de référence

| Métrique | Valeur actuelle | Cible |
|----------|-----------------|-------|
| Génération carte PNG | ~80ms | <100ms ✅ |
| Startup AgriTogo ML | ~30s | <60s ✅ |
| /verify page load | ~200ms | <500ms ✅ |
| /api/agrismart/calculate | 800-1500ms | <2000ms ✅ |
| /api/v1/agent/chat | 3-8s | <10s ✅ |
| GARCH fitting | 5-12s | <30s ✅ |
| Bulk cards 300 membres | ~30s ❌ | <2s (fix N+1) |

### C. Technologies manquantes recommandées

| Besoin | Solution recommandée | Priorité |
|--------|---------------------|----------|
| Tests E2E | Playwright | P2 |
| Monitoring erreurs | Sentry (SDK déjà installé?) | P1 |
| Analytics | PostHog (config partielle) | P3 |
| ML retraining async | Celery + Redis | P3 |
| Auth mobile farmers | SMS OTP (Twilio/Africa's Talking) | Phase 2 |
| Paiements | Wave/MTN Money API | Phase 3 |
| Multilingual | next-intl (FR/EN/Ewe/Kabyè) | Phase 3 |

---

*Rapport généré par audit parallèle 5 agents — 2026-06-06*  
*Projet: FaîtiereHub (louistatch/saas) + AgriTogo (Railway Flask)*  
*Toutes les références de code incluent chemin de fichier et contexte exact*
