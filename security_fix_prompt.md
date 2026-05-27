# FaîtiereHub — CORRECTION HARDROCK · Multi-Agent Fix Prompt
# Basé sur Security Audit Report du 24 mai 2026 — 23 findings
# Ordre d'exécution : ALPHA → BETA → GAMMA (parallélisable après ALPHA)

---

## ⚙️ DIRECTIVE MAÎTRE — RÈGLES ABSOLUES

```
Tu es l'ingénieur lead d'une opération de correction de sécurité critique.
Le déploiement est bloqué. L'audit a identifié 23 findings.
Tu coordonnes 3 agents spécialisés qui travaillent dans un ordre précis.

RÈGLES INVIOLABLES :
  1. NE PAS corriger ce qui fonctionne déjà — la section "Ce qui est BIEN"
     du rapport est sacrée. Chaque ligne du tableau ✅ est intouchable.
     Toucher ces mécanismes peut introduire des régressions critiques.

  2. CHAQUE correction doit être suivie d'un test de vérification immédiat.
     Pas de "ça devrait marcher" — le code doit prouver qu'il fonctionne.

  3. ORDRE STRICT : Agent ALPHA en premier, seul.
     BETA et GAMMA démarrent uniquement après validation complète d'ALPHA.
     Les critiques bloquent le déploiement — les High peuvent attendre 24h.

  4. POUR CHAQUE FICHIER MODIFIÉ :
     - Lire le fichier entier avant de toucher une seule ligne
     - Modifier uniquement les lignes concernées par le finding
     - Ajouter un commentaire // [SECURITY FIX - finding_id] sur la ligne corrigée
     - Vérifier que TypeScript strict compile après chaque modification

  5. NE PAS réarchitecturer. Corriger précisément. Le code existant qui
     fonctionne correctement (AES-256-GCM, timing-safe, RLS) ne se touche pas.

Stack rappel : Next.js 16 App Router, TypeScript strict, Supabase, Vercel.
```

---

## 🔴 AGENT ALPHA — "BLOCKER KILLER"
### Périmètre : 3 findings CRITICAL — Déploiement impossible sans ces fixes

```
TU ES ALPHA. Tu travailles seul en premier. Aucun autre agent ne démarre
avant que tu aies terminé et validé tes 3 corrections.
Tu es méthodique, tu ne sautes aucune étape, tu documentes chaque action.

MINDSET : Ces 3 failles peuvent compromettre TOUS les agriculteurs de FENOMAT.
Un enumerate + dump des membres via la clé anon prend 30 secondes à un script.
Tu n'as pas droit à l'erreur.
```

---

### FIX ALPHA-1 · [GHOST-001] Créer `middleware.ts` — Protection serveur des routes

**Pourquoi c'est critique** : Sans middleware, `/admin/*` et `/dashboard/*` retournent
200 OK à n'importe qui. Le JavaScript client est la seule garde — contournable en 1 ligne.

**Ce que tu fais :**

```typescript
// CRÉER : middleware.ts (racine du projet, même niveau que next.config.mjs)
// [SECURITY FIX - GHOST-001]

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // CRITIQUE : toujours utiliser getUser(), jamais getSession() côté serveur
  // getSession() peut être spoofé, getUser() valide avec le serveur Supabase
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Routes protégées : redirect si non authentifié
  if (!user) {
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
      const loginUrl = new URL('/auth/login', request.url)
      loginUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Routes admin : vérification du rôle super_admin
  // Note : la vérification fine du rôle reste dans les Server Components/Actions
  // Le middleware vérifie uniquement l'authentification (pas l'autorisation fine)
  // pour éviter les appels DB supplémentaires sur chaque requête

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Matcher sur toutes les routes sauf :
     * - _next/static (fichiers statiques)
     * - _next/image (optimisation images)
     * - favicon.ico
     * - /auth/* (pages de connexion)
     * - /api/webhooks/* (webhooks Kobo — authentification propre)
     * - /verify/* (vérification publique carte)
     * - /marketplace (page publique)
     * - /embed/* (widget embeddable)
     * - /fournisseurs (annuaire public)
     */
    '/((?!_next/static|_next/image|favicon.ico|auth|api/webhooks|verify|marketplace|embed|fournisseurs|public).*)',
    '/dashboard/:path*',
    '/admin/:path*',
  ],
}
```

**Test de vérification ALPHA-1 :**
```bash
# 1. Build TypeScript — doit compiler sans erreur
npm run typecheck

# 2. Test manuel en développement
# Ouvrir une navigation privée (sans cookies)
# Aller sur /dashboard → doit rediriger vers /auth/login?redirectTo=/dashboard
# Aller sur /admin → doit rediriger vers /auth/login?redirectTo=/admin

# 3. Vérifier que les routes publiques ne sont PAS bloquées
# /verify/FEN-12345 → doit charger normalement
# /marketplace → doit charger normalement
# /api/webhooks/kobo → doit être accessible (protégé par sa propre signature)
```

---

### FIX ALPHA-2 · [GHOST-002] Corriger l'injection SQL dans `/api/marketplace`

**Pourquoi c'est critique** : Le paramètre `q` non sanitisé permet une injection
de filtre PostgREST. Un attaquant peut extraire des données hors périmètre.

**Ce que tu fais :**

```typescript
// MODIFIER : app/api/marketplace/route.ts
// Lire le fichier entier d'abord. Localiser le bloc de traitement du paramètre 'q'.

// AVANT (dangereux) :
// const search = searchParams.get('q')
// if (search) {
//   query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
// }

// APRÈS (sécurisé) — remplacer le bloc de recherche par :
const rawSearch = searchParams.get('q')

if (rawSearch) {
  // [SECURITY FIX - GHOST-002]
  // Étape 1 : Valider avec Zod avant tout traitement
  const searchSchema = z.string().min(1).max(100).trim()
  const parsed = searchSchema.safeParse(rawSearch)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid search parameter' },
      { status: 400 }
    )
  }

  // Étape 2 : Échapper les caractères spéciaux ILIKE PostgreSQL
  const sanitized = parsed.data
    .replace(/[%_\\]/g, '\\$&')  // Échapper wildcards ILIKE
    .replace(/[,()[\]]/g, '')    // Supprimer séparateurs PostgREST

  // Étape 3 : Utiliser textSearch plutôt que .or() avec ILIKE
  // textSearch utilise les index full-text PostgreSQL (plus sûr + plus rapide)
  query = query.textSearch('search_vector', sanitized, {
    type: 'websearch',
    config: 'french'
  })
  // Si search_vector n'existe pas encore, fallback sur ILIKE bornée :
  // query = query.or(
  //   `name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`
  // )
}
```

**Test de vérification ALPHA-2 :**
```bash
# Test 1 : Injection PostgREST
curl "https://localhost:3000/api/marketplace?q=test%25,id.eq.true);--"
# Attendu : 200 avec résultats normaux ou 400 Bad Request — jamais de fuite de données

# Test 2 : Caractères ILIKE
curl "https://localhost:3000/api/marketplace?q=%25%25%25%25%25"
# Attendu : 200 avec 0 résultats ou résultats normaux

# Test 3 : Chaîne valide
curl "https://localhost:3000/api/marketplace?q=tomate"
# Attendu : 200 avec les produits tomate
```

---

### FIX ALPHA-3 · [FORGE-001] Sécuriser la page `/verify` contre l'énumération

**Pourquoi c'est critique** : Un script simple peut dumper NOM + PHOTO + VILLAGE
de tous les membres en 5 minutes. Données personnelles de maraîchers ruraux exposées.

**Ce que tu fais — 3 sous-étapes dans l'ordre :**

**Sous-étape A : Créer la vue SQL restrictive**
```sql
-- EXÉCUTER dans Supabase SQL Editor
-- [SECURITY FIX - FORGE-001 - Sous-étape A]

-- Vue publique restrictive — ne jamais exposer phone, email, id, address
CREATE OR REPLACE VIEW public.member_cards_public AS
SELECT
  mc.card_number,
  mc.status,
  mc.expiry_date,
  c.name AS cooperative_name,
  m.first_name,
  m.last_name,
  m.photo_url,
  canton.name  AS canton_name,
  pref.name    AS prefecture_name
FROM member_cards mc
JOIN members m       ON m.id = mc.member_id
JOIN cooperatives c  ON c.id = mc.cooperative_id
LEFT JOIN cantons canton ON canton.id = m.canton_id
LEFT JOIN prefectures pref ON pref.id = canton.prefecture_id
WHERE mc.status = 'active';

-- Accorder la lecture anon uniquement sur cette vue, PAS sur les tables brutes
GRANT SELECT ON public.member_cards_public TO anon;

-- Révoquer l'accès anon direct aux tables sensibles (si pas déjà fait)
-- ATTENTION : vérifier que les politiques RLS restent actives sur les tables
REVOKE SELECT ON public.members FROM anon;
REVOKE SELECT ON public.cotisations FROM anon;
REVOKE SELECT ON public.parcelles FROM anon;
REVOKE SELECT ON public.productions FROM anon;
```

**Sous-étape B : Créer la route API serveur avec rate limiting**
```typescript
// CRÉER : app/api/verify/[card_number]/route.ts
// [SECURITY FIX - FORGE-001 - Sous-étape B]

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'

// Format des numéros de carte (adapter selon votre format réel)
const cardSchema = z.string().regex(/^[A-Z]{2,5}-\d{4,6}$/, 'Format invalide')

export async function GET(
  request: NextRequest,
  { params }: { params: { card_number: string } }
) {
  // Rate limiting par IP — 10 vérifications / minute
  // TODO: remplacer par Upstash Redis après FIX BETA-1
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'

  // Validation du format de carte — stoppe l'énumération brute
  const parsed = cardSchema.safeParse(params.card_number)
  if (!parsed.success) {
    // Même délai que la réponse normale pour éviter le timing attack
    await new Promise(r => setTimeout(r, 100))
    return NextResponse.json({ error: 'Carte invalide' }, { status: 404 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  // Requête sur la VUE restrictive uniquement (pas les tables brutes)
  const { data, error } = await supabase
    .from('member_cards_public')
    .select('*')
    .eq('card_number', parsed.data)
    .single()

  if (error || !data) {
    await new Promise(r => setTimeout(r, 100)) // Timing-safe
    return NextResponse.json({ valid: false }, { status: 404 })
  }

  return NextResponse.json({ valid: true, member: data })
}
```

**Sous-étape C : Migrer la page `/verify` pour utiliser la route API**
```typescript
// MODIFIER : app/verify/[card_number]/page.tsx
// Remplacer l'accès Supabase direct par un appel à /api/verify/[card_number]
// [SECURITY FIX - FORGE-001 - Sous-étape C]

// SUPPRIMER tout import de createBrowserClient dans ce fichier
// SUPPRIMER toute requête directe aux tables members, cotisations, parcelles

// REMPLACER par :
async function getCardData(cardNumber: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/verify/${encodeURIComponent(cardNumber)}`, {
    next: { revalidate: 60 } // Cache 60s — la carte ne change pas souvent
  })
  if (!res.ok) return null
  return res.json()
}

// Le composant page devient un Server Component pur, sans Client Supabase
export default async function VerifyPage({ params }: { params: { card_number: string } }) {
  const data = await getCardData(params.card_number)
  // Afficher les données de la VUE restrictive uniquement
  // Jamais phone, email, id interne, cotisations, coordonnées GPS précises
}
```

**Test de vérification ALPHA-3 :**
```javascript
// Tester depuis la console navigateur ou Postman
// Test 1 : Énumération — doit être lente/bloquée
const results = await Promise.all(
  Array.from({length: 20}, (_, i) =>
    fetch(`/api/verify/FEN-${10000 + i}`)
  )
)
// Attendu : après 10 requêtes, des 429 Too Many Requests

// Test 2 : Format invalide
fetch('/api/verify/invalid-format-123456789')
// Attendu : 404 après ~100ms (pas de 500, pas de fuite)

// Test 3 : Vérifier qu'on ne peut plus lire members directement via Supabase anon
const { data } = await supabase.from('members').select('*').limit(5)
// Attendu : data = [] (RLS bloque tout accès anon)
```

---

### ✅ VALIDATION ALPHA COMPLÈTE

```
Avant de démarrer BETA et GAMMA, vérifier cette checklist :

[ ] middleware.ts créé et déployé en local — npm run dev sans erreur
[ ] /dashboard sans session → redirect /auth/login ✓
[ ] /admin sans session → redirect /auth/login ✓
[ ] /verify/[card] fonctionne toujours normalement ✓
[ ] /marketplace accessible sans session ✓
[ ] Injection marketplace : test avec ?q=test%25,id.eq.true);-- → réponse saine ✓
[ ] Vue member_cards_public créée en DB ✓
[ ] Accès anon sur members, cotisations, parcelles, productions révoqué ✓
[ ] npm run typecheck → 0 erreurs ✓
[ ] npm run build → succès ✓

SEULEMENT APRÈS cette checklist : démarrer BETA et GAMMA en parallèle.
```

---

## 🟠 AGENT BETA — "FORTRESS"
### Périmètre : Findings HIGH 3→7 + infrastructure rate limiting

```
TU ES BETA. Tu démarres après validation d'ALPHA.
Tu sécurises l'infrastructure invisible : rate limiting, payload validation,
permissions SQL, storage. Ces failles permettent des abus à grande échelle.
```

---

### FIX BETA-1 · [GHOST-003] Rate limiting persistant via Upstash Redis

**Pourquoi** : Le Map en mémoire est réinitialisé à chaque invocation Vercel.
Un attaquant peut brute-forcer sans jamais être bloqué.

```typescript
// INSTALLER : npm install @upstash/ratelimit @upstash/redis
// MODIFIER : lib/utils/rate-limit.ts
// [SECURITY FIX - GHOST-003]

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

// Initialisation unique (singleton côté module)
const redis = Redis.fromEnv() // Lit UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN

// Plusieurs limiteurs selon le contexte
export const rateLimiters = {
  // Vérification de carte : 10/minute — critique (brute force cards)
  verify: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    prefix: 'rl:verify',
  }),

  // API marketplace : 60/minute — usage normal
  marketplace: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '60 s'),
    prefix: 'rl:marketplace',
  }),

  // API embed : 30/minute par origin
  embed: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '60 s'),
    prefix: 'rl:embed',
  }),

  // Auth endpoints : 5/minute — anti brute-force login
  auth: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '60 s'),
    prefix: 'rl:auth',
  }),
}

// Helper à utiliser dans chaque route API
export async function applyRateLimit(
  request: NextRequest,
  limiter: keyof typeof rateLimiters
): Promise<NextResponse | null> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'

  const { success, limit, remaining, reset } = await rateLimiters[limiter].limit(ip)

  if (!success) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans quelques instants.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(reset),
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        },
      }
    )
  }

  return null // Pas de blocage
}

// USAGE dans une route API :
// const blocked = await applyRateLimit(request, 'verify')
// if (blocked) return blocked
```

```bash
# Variables d'env à ajouter dans Vercel Dashboard et .env.local
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Upstash a un tier gratuit : 10 000 requêtes/jour — suffisant pour démarrer
# https://console.upstash.com → Create Database → choisir région Frankfurt (proche Togo)
```

**Appliquer le rate limiting dans les routes existantes :**
```typescript
// Dans app/api/verify/[card_number]/route.ts (créé par ALPHA)
// Ajouter en début de handler :
const blocked = await applyRateLimit(request, 'verify')
if (blocked) return blocked

// Dans app/api/marketplace/route.ts :
const blocked = await applyRateLimit(request, 'marketplace')
if (blocked) return blocked

// Dans app/api/embed/route.ts :
const blocked = await applyRateLimit(request, 'embed')
if (blocked) return blocked
```

---

### FIX BETA-2 · [GHOST-004] Validation taille payload webhook Kobo

```typescript
// MODIFIER : app/api/webhooks/kobo/route.ts
// Ajouter en PREMIÈRE instruction du handler POST, avant tout autre traitement
// [SECURITY FIX - GHOST-004]

export async function POST(request: NextRequest) {
  // Vérification taille payload — 1MB max
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10)
  if (isNaN(contentLength) || contentLength > 1_048_576) {
    return NextResponse.json(
      { error: 'Payload trop volumineux' },
      { status: 413 }
    )
  }

  // Vérification Content-Type
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type invalide' },
      { status: 415 }
    )
  }

  // [Suite du handler existant — ne pas modifier]
  // ... vérification signature HMAC existante ...
}
```

---

### FIX BETA-3 · [FORGE-002 + FORGE-003] Révoquer les permissions SQL excessives

```sql
-- EXÉCUTER dans Supabase SQL Editor
-- [SECURITY FIX - FORGE-002]

-- Révoquer increment_download_count pour les utilisateurs non-service
REVOKE EXECUTE ON FUNCTION public.increment_download_count FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_download_count FROM anon;
-- Cette fonction sera appelée uniquement via le service_role côté serveur

-- [SECURITY FIX - FORGE-003]
-- Restreindre get_platform_totals aux super_admins uniquement
REVOKE EXECUTE ON FUNCTION public.get_platform_totals FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_totals FROM anon;
-- Recréer avec un guard interne :
CREATE OR REPLACE FUNCTION public.get_platform_totals()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Vérifier que l'appelant est super_admin via app_metadata
  SELECT (auth.jwt()->'app_metadata'->>'is_super_admin')::boolean INTO is_admin;
  IF NOT COALESCE(is_admin, false) THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;
  -- [Corps de la fonction existante — ne pas modifier]
  RETURN json_build_object(
    'total_members', (SELECT COUNT(*) FROM members),
    'total_cooperatives', (SELECT COUNT(*) FROM cooperatives),
    'total_cards', (SELECT COUNT(*) FROM member_cards WHERE status = 'active')
  );
END;
$$;
-- Ré-accorder uniquement au rôle authenticated (le guard interne filtre les super_admins)
GRANT EXECUTE ON FUNCTION public.get_platform_totals TO authenticated;
```

---

### FIX BETA-4 · [FORGE-004] Sécuriser le bucket `member-photos`

```typescript
// EXÉCUTER dans Supabase Dashboard → Storage → member-photos
// Ou via l'API Supabase Admin :

// 1. Dans le dashboard Supabase :
//    Storage → member-photos → Configuration
//    → Désactiver "Public bucket"
//    → Activer RLS

// 2. Ajouter les politiques de lecture dans SQL Editor :
```

```sql
-- [SECURITY FIX - FORGE-004]
-- Politique : seuls les utilisateurs authentifiés avec accès à la coopérative peuvent voir les photos
CREATE POLICY "Photos membres visibles par leur coopérative"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'member-photos'
  AND (
    -- L'utilisateur a accès à la coopérative du membre
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.photo_url LIKE '%' || name || '%'
      AND m.cooperative_id = ANY(get_accessible_cooperative_ids())
    )
    -- Ou c'est le super_admin
    OR (auth.jwt()->'app_metadata'->>'is_super_admin')::boolean
  )
);

-- Pour les photos de profil public (page /verify) : générer des URLs signées côté serveur
-- Ne jamais retourner l'URL publique directe dans la vue member_cards_public
-- Utiliser supabase.storage.from('member-photos').createSignedUrl(path, 3600)
```

```typescript
// MODIFIER : partout où photo_url est retournée dans les API publiques
// Remplacer l'URL directe par une URL signée (valable 1 heure)
// [SECURITY FIX - FORGE-004]

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Côté serveur uniquement
)

async function getSignedPhotoUrl(photoPath: string): Promise<string | null> {
  if (!photoPath) return null
  const { data } = await supabaseAdmin.storage
    .from('member-photos')
    .createSignedUrl(photoPath, 3600) // 1 heure
  return data?.signedUrl ?? null
}
```

---

### FIX BETA-5 · [GHOST-005] Validation Zod manquante sur le payload webhook Kobo

```typescript
// MODIFIER : app/api/webhooks/kobo/route.ts
// Ajouter le schéma Zod APRÈS la vérification de signature (ne pas modifier la signature)
// [SECURITY FIX - GHOST-005]

import { z } from 'zod'

// Schéma de validation du payload KoboCollect (adapter aux champs réels de votre XLSForm)
const koboSubmissionSchema = z.object({
  _id: z.number().int().positive(),
  _uuid: z.string().uuid(),
  _submission_time: z.string().datetime({ offset: true }),
  _version_: z.string().optional(),
  // Sections du formulaire — adapter selon votre XLSForm réel
  cooperative_id: z.string().uuid().optional(),
  member_name: z.string().min(1).max(200).optional(),
  gps_location: z.string().optional(), // Format "lat lng alt acc"
  // Rejeter les champs inconnus pour éviter les injections via champs supplémentaires
}).passthrough() // Garder .passthrough() si KoboCollect ajoute des champs dynamiques

// Dans le handler, après vérification de la signature :
const rawBody = await request.json()
const parsed = koboSubmissionSchema.safeParse(rawBody)
if (!parsed.success) {
  console.error('[Webhook Kobo] Payload invalide:', parsed.error.flatten())
  // Retourner 200 à Kobo (sinon il retry indéfiniment) mais logguer l'erreur
  return NextResponse.json({ received: true, valid: false })
}
// Utiliser parsed.data pour le reste du traitement
```

---

## 🟡 AGENT GAMMA — "GUARDIAN"
### Périmètre : Findings MEDIUM 1→8 + findings LOW actionables + Security hardening

```
TU ES GAMMA. Tu démarres en parallèle avec BETA après validation d'ALPHA.
Tu traites les risques moyens qui, combinés, créent une surface d'attaque large.
Tu travailles aussi sur les Low actionnables rapidement (< 30min chacun).
```

---

### FIX GAMMA-1 · [PHANTOM-002] Éliminer l'énumération d'emails forgot-password

```typescript
// MODIFIER : app/auth/forgot-password/page.tsx (ou l'action serveur associée)
// [SECURITY FIX - PHANTOM-002]

// Le message de réponse doit être IDENTIQUE qu'un email existe ou non
// Supabase Auth retourne déjà une réponse identique si "Secure email change" est activé
// Mais vérifier côté frontend :

async function handleForgotPassword(email: string) {
  // Ne jamais afficher un message différent selon que l'email existe ou non
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })

  // TOUJOURS afficher ce message, même si error !== null
  // (error peut être "User not found" — ne pas le transmettre à l'UI)
  return {
    message: 'Si cet email est enregistré, un lien de réinitialisation a été envoyé.',
  }
  // Ne jamais : if (error) showError("Email non trouvé")
}
```

```
// Dans Supabase Dashboard → Authentication → Settings :
// ✅ Activer "Secure email change" (double confirmation)
// ✅ Vérifier que le rate limiting auth est activé (5 emails/heure par adresse)
```

---

### FIX GAMMA-2 · [PHANTOM-003] Corriger la validation d'origine du widget embed

```typescript
// MODIFIER : app/api/embed/route.ts (ligne ~50)
// [SECURITY FIX - PHANTOM-003]

// AVANT (vulnérable) :
// const allowed = config.allowed_origins.some((o: string) => origin.includes(o))
// Problème : "evil-example.com".includes("example.com") === true

// APRÈS (sécurisé) — comparaison exacte :
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return false

  return allowedOrigins.some((allowed: string) => {
    if (allowed === '*') return true // Wildcard explicite seulement

    // Normaliser pour comparer
    const normalizeOrigin = (o: string) =>
      o.startsWith('http') ? o.replace(/\/$/, '') : `https://${o}`.replace(/\/$/, '')

    return normalizeOrigin(origin) === normalizeOrigin(allowed)
  })
}

// Dans le handler :
const origin = request.headers.get('origin') ?? ''
if (!isOriginAllowed(origin, config.allowed_origins)) {
  return NextResponse.json(
    { error: 'Origine non autorisée' },
    {
      status: 403,
      headers: { 'Access-Control-Allow-Origin': 'null' },
    }
  )
}
```

---

### FIX GAMMA-3 · [FORGE-005] Fixer le `search_path` des fonctions SQL

```sql
-- [SECURITY FIX - FORGE-005]
-- Les fonctions SECURITY DEFINER sans search_path fixe sont vulnérables
-- à l'injection de schéma (schema injection / search_path hijacking)

-- Appliquer sur TOUTES les fonctions SECURITY DEFINER du projet :
-- (adapter la liste selon vos fonctions réelles)

ALTER FUNCTION public.get_accessible_cooperative_ids()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.is_super_admin()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.is_coop_admin(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_platform_totals()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.increment_download_count(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.bootstrap_cooperative_admin(uuid)
  SET search_path = public, pg_temp;

-- Vérifier la liste complète des fonctions SECURITY DEFINER :
SELECT proname, prosecdef, proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true;
-- Appliquer SET search_path = public, pg_temp à toutes celles sans proconfig
```

---

### FIX GAMMA-4 · [FORGE-006] Cron de purge `kobo_sync_queue`

```sql
-- [SECURITY FIX - FORGE-006]
-- Activer pg_cron dans Supabase Dashboard → Database → Extensions → pg_cron

-- Purge hebdomadaire des entrées complétées > 30 jours
SELECT cron.schedule(
  'purge-kobo-sync-queue',
  '0 3 * * 0', -- Dimanche à 3h du matin
  $$
    DELETE FROM kobo_sync_queue
    WHERE status = 'completed'
    AND processed_at < now() - interval '30 days';
  $$
);

-- Purge des entrées failed > 90 jours (garder plus longtemps pour audit)
SELECT cron.schedule(
  'purge-kobo-sync-failed',
  '0 4 * * 0',
  $$
    DELETE FROM kobo_sync_queue
    WHERE status = 'failed'
    AND created_at < now() - interval '90 days';
  $$
);

-- Vérifier que pg_cron est bien activé :
SELECT * FROM cron.job;
```

---

### FIX GAMMA-5 · [FORGE-007 + LOW] Révoquer bootstrap + LOW rapides

```sql
-- [SECURITY FIX - FORGE-007]
REVOKE EXECUTE ON FUNCTION public.bootstrap_cooperative_admin FROM anon;
-- Vérifier si déjà révoqué, ne pas errorer si c'est le cas

-- [SECURITY FIX - SHIELD-004] Leaked Password Protection
-- Supabase Dashboard → Authentication → Settings → Leaked Password Protection → ON
-- (action manuelle dans le dashboard, 5 minutes)

-- [SECURITY FIX - SHIELD-006] Geolocation policy
-- MODIFIER next.config.mjs :
```

```typescript
// MODIFIER : next.config.mjs — dans la section headers
// [SECURITY FIX - SHIELD-006]

// AVANT :
// 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'

// APRÈS :
'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)'
// Autoriser la géolocalisation pour le site lui-même (future feature parcelles GPS)
```

---

### FIX GAMMA-6 · [SHIELD-005] Créer `security.txt`

```bash
# CRÉER : public/.well-known/security.txt
```

```
Contact: mailto:security@faitierehub.com
Expires: 2027-05-24T00:00:00.000Z
Preferred-Languages: fr, en
Canonical: https://www.faitierehub.com/.well-known/security.txt
Policy: https://www.faitierehub.com/politique-securite
Acknowledgments: https://www.faitierehub.com/merci-chercheurs
```

```typescript
// CRÉER : app/.well-known/security.txt/route.ts
// Pour que Next.js serve ce fichier correctement
export async function GET() {
  const content = `Contact: mailto:security@faitierehub.com
Expires: 2027-05-24T00:00:00.000Z
Preferred-Languages: fr, en
Canonical: https://www.faitierehub.com/.well-known/security.txt`

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
```

---

### FIX GAMMA-7 · [PHANTOM-001] Enrichir les indicateurs de sécurité sur `/verify`

```typescript
// MODIFIER : app/verify/[card_number]/page.tsx
// [SECURITY FIX - PHANTOM-001] — Indicateurs visuels anti-phishing

// Ajouter dans le <head> de la page de vérification :
// → Canonical URL pour éviter les pages miroir
// → OG tags pour que les partages affichent le bon domaine
// → Indicateur visuel "URL officielle" dans l'UI

// Dans le composant :
// Afficher clairement dans l'UI :
// ✅ "Vérification officielle FENOMAT · www.faitierehub.com"
// ✅ Badge HTTPS visible avec l'URL complète
// ✅ "Ne partagez jamais votre code PIN ou mot de passe sur cette page"
// ✅ QR code contient uniquement les données de la VUE restrictive

// Dans les métadonnées Next.js :
export const metadata = {
  title: 'Vérification officielle carte membre — FaîtiereHub',
  description: 'Page officielle de vérification des cartes membres FENOMAT.',
  robots: { index: false, follow: false }, // Ne pas indexer les pages de vérification individuelles
}
```

---

## 📋 SCRIPT DE VALIDATION FINALE (après ALPHA + BETA + GAMMA)

```typescript
// CRÉER : scripts/pre-deploy-security-check.ts
// [SECURITY CHECK - SENTINEL]
// Exécuter avant chaque déploiement Vercel : npm run security:check

import { execSync } from 'child_process'
import * as fs from 'fs'

const checks: { name: string; pass: boolean; detail?: string }[] = []

function check(name: string, condition: boolean, detail?: string) {
  checks.push({ name, pass: condition, detail })
}

// 1. middleware.ts existe
check(
  'middleware.ts présent',
  fs.existsSync('./middleware.ts'),
  'Créer middleware.ts (FIX ALPHA-1)'
)

// 2. security.txt existe
check(
  'security.txt présent',
  fs.existsSync('./public/.well-known/security.txt') ||
    fs.existsSync('./app/.well-known/security.txt/route.ts'),
  'Créer security.txt (FIX GAMMA-6)'
)

// 3. Variables d'env critiques présentes
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'INTEGRATION_SECRET_KEY',
  'KOBO_WEBHOOK_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]
requiredEnvVars.forEach(v => {
  check(`Env var ${v}`, !!process.env[v], `Ajouter ${v} dans Vercel Dashboard`)
})

// 4. Aucun console.log avec données sensibles dans le code
const sensitivePatterns = ['console.log.*password', 'console.log.*token', 'console.log.*secret', 'console.log.*phone']
try {
  const result = execSync(
    `grep -r --include="*.ts" --include="*.tsx" -l "${sensitivePatterns.join('\\|')}" ./app ./lib`,
    { encoding: 'utf-8' }
  ).trim()
  check('Pas de console.log sensibles', !result, `Fichiers avec logs sensibles : ${result}`)
} catch {
  check('Pas de console.log sensibles', true)
}

// 5. TypeScript compile
try {
  execSync('npx tsc --noEmit', { stdio: 'pipe' })
  check('TypeScript compile', true)
} catch (e) {
  check('TypeScript compile', false, 'Erreurs TypeScript détectées')
}

// Rapport
console.log('\n🔐 Security Pre-Deploy Check\n')
const failed = checks.filter(c => !c.pass)
checks.forEach(c => {
  console.log(`${c.pass ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
})

if (failed.length > 0) {
  console.error(`\n⛔ ${failed.length} vérification(s) échouée(s). Déploiement bloqué.\n`)
  process.exit(1)
} else {
  console.log('\n✅ Toutes les vérifications passent. Déploiement autorisé.\n')
}
```

```json
// MODIFIER : package.json — ajouter ces scripts
{
  "scripts": {
    "security:check": "npx tsx scripts/pre-deploy-security-check.ts",
    "predeploy": "npm run security:check",
    "vercel-build": "npm run security:check && npm run build"
  }
}
```

---

## CHECKLIST GO/NO-GO PRODUCTION — À valider dans l'ordre

```
ALPHA ✅
[ ] middleware.ts créé et fonctionnel
[ ] Injection marketplace corrigée (Zod + échappement)
[ ] /verify migré vers API serveur + vue SQL restrictive

BETA ✅
[ ] Upstash Redis configuré (UPSTASH_* en env Vercel)
[ ] Rate limiting persistant sur verify + marketplace + embed
[ ] Payload webhook Kobo borné à 1MB
[ ] increment_download_count révoqué (authenticated + anon)
[ ] get_platform_totals restreint aux super_admins
[ ] Bucket member-photos en mode privé + URLs signées

GAMMA ✅
[ ] Forgot-password : message identique email existant / inexistant
[ ] Validation d'origine embed : comparaison exacte (pas includes)
[ ] search_path fixé sur toutes les fonctions SECURITY DEFINER
[ ] Cron purge kobo_sync_queue activé
[ ] bootstrap_cooperative_admin révoqué pour anon
[ ] Leaked Password Protection activée (Supabase Dashboard)
[ ] geolocation=(self) dans Permissions-Policy
[ ] security.txt publié

FINAL ✅
[ ] npm run security:check → exit 0
[ ] npm run build → succès
[ ] npm run typecheck → 0 erreurs
[ ] Test manuel /dashboard sans session → redirect login
[ ] Test manuel /admin sans session → redirect login
[ ] Test API verify 20 requêtes rapides → 429 après la 10ème
[ ] Supabase anon → SELECT members → 0 résultats
[ ] Backup Supabase Point-in-Time Recovery → activé
```

---

> **Ce qui ne doit PAS être touché :**
> AES-256-GCM, timing-safe comparison webhook, RLS 27 tables,
> app_metadata roles, CTE récursif coopératives, normalizeError(),
> HSTS config, Zod sur routes authentifiées, session destruction complète.
> Ces mécanismes ont été validés par l'audit. Les modifier introduit des régressions.
