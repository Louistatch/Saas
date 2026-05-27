# Security Audit Report — FaîtiereHub

**Date** : 24 mai 2026  
**Auditeurs** : GHOST, FORGE, PHANTOM, SHIELD, SENTINEL  
**Périmètre exclu** : Aucun module non développé identifié (pas de TODO/501 dans les routes actives). Les services marqués "Bientôt" dans la page /verify sont des liens UI désactivés, pas des endpoints.

---

## Résumé exécutif

| Niveau | Count | Action |
|--------|-------|--------|
| **Critical** | 3 | ⛔ Bloquer le déploiement |
| **High** | 7 | Corriger dans les 48h |
| **Medium** | 8 | Corriger dans la semaine |
| **Low** | 5 | Backlog |
| **Total** | **23** | |

---

## 🔴 FINDINGS CRITIQUES — Bloquer le déploiement

### [GHOST-001] CRITICAL | Absence de middleware serveur — Aucune protection serveur des routes

**Fichier(s)** : `middleware.ts` (ABSENT)  
**Vecteur** : Un attaquant peut accéder directement aux pages `/dashboard/*` et `/admin/*` via le navigateur. La seule protection est le composant client `<ProtectedRoute>` qui s'exécute APRÈS le chargement de la page. Les données sont déjà récupérées côté client via Supabase (protégées par RLS), mais le HTML/JS de l'interface admin est servi sans vérification.  
**PoC** :
```
// Désactiver JavaScript dans le navigateur → la page admin se charge sans garde
// Ou : intercepter la réponse avant que ProtectedRoute ne redirige
curl https://faitierehub.com/admin → 200 OK (HTML complet servi)
```
**Fix** :
```typescript
// middleware.ts (racine du projet)
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  if (!user && request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  return response
}

export const config = { matcher: ['/dashboard/:path*', '/admin/:path*'] }
```
**Effort** : S (2h)

---

### [GHOST-002] CRITICAL | Injection SQL via paramètre `search` dans /api/marketplace

**Fichier(s)** : `app/api/marketplace/route.ts` (ligne ~45)  
**Vecteur** : Le paramètre `q` (search) est injecté directement dans un `.or()` Supabase sans échappement des caractères spéciaux ILIKE (`%`, `_`, `\`). Plus grave : la construction de la chaîne `.or()` permet potentiellement une injection de filtre PostgREST.  
**PoC** :
```
GET /api/marketplace?q=test%25,id.eq.true);--
// La chaîne construite devient :
// name.ilike.%test%,id.eq.true);--%,description.ilike.%...
// PostgREST peut interpréter les virgules comme séparateurs de filtres
```
**Fix** :
```typescript
// Échapper les caractères spéciaux ILIKE ET les virgules/parenthèses PostgREST
if (search) {
  const sanitized = search
    .replace(/[%_\\]/g, '\\$&')  // Échapper ILIKE wildcards
    .replace(/[,()]/g, '')        // Supprimer les séparateurs PostgREST
    .slice(0, 100)                // Limiter la longueur
  query = query.or(
    `name.ilike.%${sanitized}%,description.ilike.%${sanitized}%,culture.ilike.%${sanitized}%`
  )
}
```
**Effort** : S (1h)

---

### [FORGE-001] CRITICAL | La clé anon peut lire les données membres via la page /verify

**Fichier(s)** : `app/verify/[card_number]/page.tsx`, politique RLS `Public can view member info for card verification`  
**Vecteur** : La page de vérification utilise `createBrowserClient` avec la clé anon et fait des requêtes directes aux tables `member_cards`, `members`, `cotisations`, `parcelles`, `productions`. La politique RLS sur `members` autorise la lecture anon pour tout membre ayant une carte active. Un attaquant peut énumérer les numéros de carte (format prévisible `XXX-NNNNN`) et extraire les données personnelles de TOUS les membres.  
**PoC** :
```javascript
// Script d'énumération
for (let i = 10000; i < 99999; i++) {
  const { data } = await supabase
    .from('member_cards')
    .select('*, member:members(*)')
    .eq('card_number', `FEN-${i}`)
    .eq('status', 'active')
    .single()
  if (data) console.log(data.member) // Nom, téléphone, village, photo...
}
```
**Fix** :
1. Remplacer l'accès direct Supabase par un appel API serveur avec rate limiting
2. Restreindre la politique RLS anon pour ne retourner que les champs non-sensibles
3. Ajouter un hash de vérification dans le QR code (HMAC du card_number)

```sql
-- Restreindre les colonnes visibles via une vue
CREATE VIEW public.member_cards_public AS
SELECT mc.card_number, mc.status, mc.expiry_date, mc.cooperative_id,
       m.first_name, m.last_name, m.photo_url, m.village, m.canton, m.prefecture
FROM member_cards mc
JOIN members m ON m.id = mc.member_id
WHERE mc.status = 'active';
-- NE PAS exposer : phone, email, address, id exact
```
**Effort** : M (1 jour)

---

## 🟠 FINDINGS HIGH — Corriger dans les 48h

### [GHOST-003] HIGH | Rate limiter in-memory — inefficace en production Vercel

**Fichier(s)** : `lib/utils/rate-limit.ts`  
**Vecteur** : Le rate limiter utilise un `Map` en mémoire. Sur Vercel Serverless, chaque invocation peut être une nouvelle instance. Le rate limiting est donc inefficace : un attaquant peut brute-forcer les numéros de carte sans être bloqué.  
**Fix** : Utiliser Upstash Redis (gratuit pour les petits volumes) ou Vercel KV.
```typescript
// Alternative rapide : utiliser les headers Vercel Edge
// Ou intégrer @upstash/ratelimit
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
const ratelimit = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(10, '60 s') })
```
**Effort** : M (1 jour)

---

### [GHOST-004] HIGH | Pas de validation de taille du payload webhook Kobo

**Fichier(s)** : `app/api/webhooks/kobo/route.ts`  
**Vecteur** : Aucune vérification de `Content-Length`. Un payload de 50MB peut crasher la fonction serverless ou causer un déni de service.  
**Fix** :
```typescript
// En début de handler
const contentLength = parseInt(request.headers.get('content-length') ?? '0')
if (contentLength > 1_048_576) { // 1MB max
  return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
}
```
**Effort** : S (30min)

---

### [FORGE-002] HIGH | `increment_download_count` callable par tout utilisateur authentifié

**Fichier(s)** : Fonction SQL `increment_download_count`  
**Vecteur** : Cette fonction SECURITY DEFINER est exposée via `/rest/v1/rpc/increment_download_count`. N'importe quel utilisateur authentifié peut l'appeler avec n'importe quel `fiche_id` pour gonfler artificiellement les compteurs de téléchargement.  
**Fix** :
```sql
REVOKE EXECUTE ON FUNCTION public.increment_download_count FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_download_count FROM anon;
-- Seul le service_role (utilisé côté serveur) pourra l'appeler
```
**Effort** : S (30min)

---

### [FORGE-003] HIGH | `get_platform_totals` expose les statistiques à tout utilisateur authentifié

**Fichier(s)** : Fonction SQL `get_platform_totals`  
**Vecteur** : Tout utilisateur authentifié (même un simple `member`) peut appeler `/rest/v1/rpc/get_platform_totals` et obtenir les statistiques globales de la plateforme (nombre total de coopératives, membres, etc.). Information concurrentielle sensible.  
**Fix** :
```sql
-- Ajouter une vérification de rôle dans la fonction OU révoquer l'accès
REVOKE EXECUTE ON FUNCTION public.get_platform_totals FROM authenticated;
-- Seul le service_role (API routes serveur) l'appellera
```
**Effort** : S (30min)

---

### [PHANTOM-001] HIGH | Page /verify expose trop d'informations personnelles

**Fichier(s)** : `app/verify/[card_number]/page.tsx`  
**Cible humaine** : Agriculteur / Acheteur malveillant  
**Scénario** :
1. **Setup** : L'attaquant obtient un numéro de carte (visible sur la carte physique, ou deviné)
2. **Action** : Il accède à `/verify/FEN-12345` et obtient : nom complet, photo, téléphone (via cotisations), village exact, cultures, superficie
3. **Impact** : Profilage pour arnaques ciblées, vol d'identité, harcèlement  
**Vraisemblance** : Haute (les cartes sont physiques, les numéros sont séquentiels)  
**Fix UX + Code** :
- Masquer le téléphone (ne jamais l'exposer publiquement)
- Tronquer le village à la préfecture uniquement
- Ajouter un timer de 30s (déjà fait : 60s) et un CAPTCHA avant affichage
- Rendre le format de numéro non-séquentiel (UUID court ou hash)
**Effort** : M (1 jour)

---

### [SHIELD-001] HIGH | CSP contient 'unsafe-inline' et 'unsafe-eval'

**Fichier(s)** : `next.config.mjs`  
**Vecteur** : `'unsafe-inline'` et `'unsafe-eval'` dans `script-src` annulent la protection CSP contre les attaques XSS. Un attaquant qui trouve un point d'injection peut exécuter du JavaScript arbitraire.  
**Fix** : Migrer vers un CSP basé sur des nonces. Next.js 16 supporte les nonces via `next/headers`.
```javascript
// Remplacer 'unsafe-inline' 'unsafe-eval' par :
"script-src 'self' 'strict-dynamic' 'nonce-${nonce}'",
// Et configurer le nonce dans le layout
```
**Note** : `'strict-dynamic'` est déjà présent, ce qui ignore `'unsafe-inline'` dans les navigateurs modernes. Mais les vieux Android (cible Togo) ne supportent pas `strict-dynamic` et tombent sur `'unsafe-inline'`.  
**Effort** : M (1 jour)

---

### [SHIELD-002] HIGH | Bucket `member-photos` est public avec listing autorisé

**Fichier(s)** : Storage Supabase, politique `Public can view member photos`  
**Vecteur** : N'importe qui peut lister TOUS les fichiers du bucket `member-photos` via l'API Storage. Les photos des membres sont accessibles sans authentification.  
**Fix** :
```sql
-- Supprimer la politique de listing public
DROP POLICY "Public can view member photos" ON storage.objects;
-- Créer une politique qui n'autorise que l'accès par URL signée (via le serveur)
CREATE POLICY "Authenticated users view own coop photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'member-photos' AND (storage.foldername(name))[1] IN (
  SELECT id::text FROM get_accessible_cooperative_ids()
));
```
**Effort** : S (2h)

---

## 🟡 FINDINGS MEDIUM — Corriger dans la semaine

### [GHOST-005] MEDIUM | Kobo sync route ne vérifie pas la hiérarchie coopérative

**Fichier(s)** : `app/api/integrations/kobo/sync/route.ts` (ligne ~35)  
**Vecteur** : La vérification d'accès compare `profile.cooperative_id === cooperativeId` directement, sans utiliser `get_accessible_cooperative_ids()`. Un admin de faîtière ne peut pas sync ses coopératives enfants via cette route (bug fonctionnel), mais surtout la logique est incohérente avec le reste du système.  
**Fix** : Utiliser `assertTenantAccess(cooperativeId)` de `lib/security/assert-access.ts`.  
**Effort** : S (1h)

---

### [GHOST-006] MEDIUM | Pas de validation Zod sur le body du webhook Kobo

**Fichier(s)** : `app/api/webhooks/kobo/route.ts`  
**Vecteur** : Le body JSON est parsé et utilisé directement sans schéma Zod. Des champs inattendus ou des types incorrects pourraient causer des erreurs non gérées ou des insertions malformées.  
**Fix** : Ajouter un schéma Zod minimal pour valider la structure attendue.  
**Effort** : S (2h)

---

### [FORGE-004] MEDIUM | `contact_requests` INSERT policy est `WITH CHECK (true)`

**Fichier(s)** : Politique RLS `contact_requests_insert_public`  
**Vecteur** : N'importe qui (anon ou authenticated) peut insérer dans `contact_requests` sans restriction. Bien que la route API ait un rate limit, un attaquant peut contourner l'API et insérer directement via l'API REST Supabase avec la clé anon.  
**Fix** :
```sql
DROP POLICY "contact_requests_insert_public" ON contact_requests;
CREATE POLICY "contact_requests_insert_public" ON contact_requests
FOR INSERT TO anon, authenticated
WITH CHECK (
  member_id IN (SELECT id FROM members WHERE status = 'active')
  AND char_length(buyer_name) >= 2
  AND char_length(message) >= 10
);
```
**Effort** : S (30min)

---

### [FORGE-005] MEDIUM | Fonctions `search_marketplace` et `get_member_score` sans search_path fixe

**Fichier(s)** : Fonctions SQL  
**Vecteur** : Sans `SET search_path TO 'public'`, ces fonctions sont vulnérables à une attaque par manipulation du search_path si un utilisateur peut créer des objets dans un schéma prioritaire.  
**Fix** :
```sql
ALTER FUNCTION public.search_marketplace SET search_path TO 'public';
ALTER FUNCTION public.get_member_score SET search_path TO 'public';
```
**Effort** : S (15min)

---

### [PHANTOM-002] MEDIUM | Énumération d'emails via forgot-password

**Fichier(s)** : `app/auth/forgot-password/page.tsx` (utilise Supabase Auth)  
**Vecteur** : Par défaut, Supabase Auth retourne des réponses différentes selon que l'email existe ou non. Un attaquant peut déterminer quels emails sont enregistrés.  
**Fix** : Activer l'option "Double confirm email changes" dans Supabase Auth settings et s'assurer que la réponse est toujours identique ("Si cet email existe, un lien a été envoyé").  
**Effort** : S (30min)

---

### [PHANTOM-003] MEDIUM | Widget embed sans validation stricte d'origine

**Fichier(s)** : `app/api/embed/route.ts` (ligne ~50)  
**Vecteur** : La validation d'origine utilise `origin.includes(o)` ce qui est trop permissif. Si `allowed_origins` contient `"example.com"`, alors `"evil-example.com"` passe aussi.  
**Fix** :
```typescript
const allowed = config.allowed_origins.some((o: string) =>
  o === '*' || origin === o || origin === `https://${o}` || origin === `http://${o}`
)
```
**Effort** : S (30min)

---

### [SHIELD-003] MEDIUM | Pas de header X-Frame-Options sur les routes /embed et /api/widget

**Fichier(s)** : `next.config.mjs` (headers config)  
**Vecteur** : Les routes embed sont exclues des security headers (intentionnel pour l'embedding), mais elles n'ont aucune protection contre le clickjacking par des sites non autorisés. La validation d'origine côté API ne protège pas le rendu HTML.  
**Fix** : Ajouter `frame-ancestors` dynamique basé sur `allowed_origins` dans les réponses embed.  
**Effort** : S (2h)

---

### [SHIELD-004] MEDIUM | Leaked Password Protection désactivée

**Fichier(s)** : Configuration Supabase Auth  
**Vecteur** : Les utilisateurs peuvent s'inscrire avec des mots de passe compromis (présents dans les fuites de données HaveIBeenPwned).  
**Fix** : Activer "Leaked Password Protection" dans le dashboard Supabase → Authentication → Settings.  
**Effort** : S (5min)

---

### [FORGE-006] MEDIUM | Pas de purge automatique de `kobo_sync_queue`

**Fichier(s)** : Table `kobo_sync_queue`  
**Vecteur** : Les entrées `completed` ne sont jamais supprimées. Sur le long terme, la table peut grossir indéfiniment et dégrader les performances.  
**Fix** : Ajouter un cron Supabase (pg_cron) pour purger les entrées complétées de plus de 30 jours.
```sql
SELECT cron.schedule('purge-kobo-queue', '0 3 * * 0', $$
  DELETE FROM kobo_sync_queue WHERE status = 'completed' AND processed_at < now() - interval '30 days';
$$);
```
**Effort** : S (1h)

---

## 🟢 FINDINGS LOW — Backlog

### [GHOST-007] LOW | Pas de CSRF protection explicite sur les actions admin

**Fichier(s)** : `app/admin/*`  
**Vecteur** : Les actions admin (suppression de coopérative, modification de rôle) n'ont pas de token CSRF explicite. Supabase Auth cookies + SameSite atténuent le risque, mais une protection explicite est recommandée.  
**Effort** : M

---

### [PHANTOM-004] LOW | QR code contient uniquement le card_number sans hash de sécurité

**Fichier(s)** : Génération de cartes (dashboard)  
**Vecteur** : Un faux QR code avec un numéro de carte valide redirige vers la vraie page de vérification. Pas de moyen de distinguer un QR authentique d'un QR copié.  
**Fix** : Encoder un HMAC dans le QR : `/verify/FEN-12345?sig=abc123`  
**Effort** : M

---

### [SHIELD-005] LOW | Pas de fichier `security.txt` sur le domaine

**Fichier(s)** : `public/.well-known/security.txt` (absent)  
**Fix** : Créer le fichier avec un contact de sécurité.  
**Effort** : S (15min)

---

### [SHIELD-006] LOW | Geolocation policy trop restrictive

**Fichier(s)** : `next.config.mjs` — `Permissions-Policy: geolocation=()`  
**Vecteur** : La politique bloque la géolocalisation même pour le site lui-même. Si une future feature nécessite le GPS (localisation de parcelles), elle sera bloquée.  
**Fix** : Changer en `geolocation=(self)`.  
**Effort** : S (5min)

---

### [FORGE-007] LOW | `bootstrap_cooperative_admin` exposée via REST API

**Fichier(s)** : Fonction SQL  
**Vecteur** : Bien que la fonction ait des gardes internes (vérifie `auth.uid()`, profil non bootstrappé, coopérative créée < 60s), son exposition via l'API REST est un risque de surface inutile.  
**Fix** : `REVOKE EXECUTE ON FUNCTION public.bootstrap_cooperative_admin FROM anon;` (déjà fait pour anon, mais vérifier).  
**Effort** : S (15min)

---

## ✅ Ce qui est BIEN (ne pas casser)

| Mécanisme | Évaluation |
|-----------|-----------|
| **AES-256-GCM pour les secrets** | ✅ IV aléatoire par chiffrement, format versionné, clé serveur-only |
| **Timing-safe comparison webhook** | ✅ `crypto.timingSafeEqual` correctement implémenté |
| **RLS activé sur TOUTES les tables** | ✅ 27/27 tables ont RLS enabled |
| **Rôles lus depuis `app_metadata`** | ✅ `is_super_admin()` et `is_coop_admin()` lisent `auth.jwt() -> 'app_metadata'` (non modifiable par l'utilisateur) |
| **Hiérarchie coopérative récursive** | ✅ `get_accessible_cooperative_ids()` utilise un CTE récursif correct |
| **Profil non auto-modifiable (rôle/coop)** | ✅ La politique `update_own_profile` empêche de changer `role` ou `cooperative_id` |
| **Auth callback sécurisé** | ✅ Utilise `request.nextUrl.origin` (pas `x-forwarded-host`) pour les redirections |
| **Logout cross-tab** | ✅ BroadcastChannel + localStorage fallback |
| **Pagination bornée** | ✅ `Math.min(limit, 50)` sur marketplace et fiches |
| **Erreurs normalisées** | ✅ `normalizeError()` ne leak pas les détails SQL |
| **HSTS avec preload** | ✅ `max-age=63072000; includeSubDomains; preload` |
| **Zod validation sur les routes authentifiées** | ✅ Kobo integration, contact-request, fiches |
| **Session destruction complète** | ✅ Cookies, localStorage, sessionStorage, BroadcastChannel |

---

## 📋 Plan d'action séquencé

### Jour 1 (Avant déploiement) — Critiques
1. ⛔ Créer `middleware.ts` pour protéger `/dashboard/*` et `/admin/*` côté serveur
2. ⛔ Corriger l'injection dans `/api/marketplace` (échapper le paramètre `search`)
3. ⛔ Migrer la page `/verify` vers un appel API serveur avec rate limiting (ou restreindre la politique RLS anon)

### Jour 2-3 — High
4. Intégrer Upstash Redis pour le rate limiting (ou Vercel KV)
5. Ajouter la validation de taille du payload webhook
6. Révoquer `EXECUTE` sur `increment_download_count` et `get_platform_totals` pour les rôles non-admin
7. Restreindre le bucket `member-photos` (supprimer le listing public)
8. Réduire les données exposées sur `/verify`
9. Planifier la migration CSP vers nonces

### Semaine 2 — Medium
10. Corriger la validation d'origine du widget embed
11. Activer Leaked Password Protection
12. Ajouter un cron de purge pour `kobo_sync_queue`
13. Fixer les `search_path` des fonctions SQL
14. Ajouter la validation Zod sur le webhook Kobo
15. Corriger la politique RLS `contact_requests`

---

## Checklist de go/no-go production

- [ ] Zéro finding Critical ouvert
- [ ] `middleware.ts` déployé et testé
- [ ] Injection marketplace corrigée
- [ ] Variables d'env vérifiées sur Vercel (`INTEGRATION_SECRET_KEY`, `KOBO_WEBHOOK_SECRET`)
- [ ] Headers HTTP vérifiés sur prod (CSP, HSTS, X-Frame-Options)
- [ ] Rate limiting fonctionnel en serverless
- [ ] Bucket `member-photos` en mode privé
- [ ] Leaked Password Protection activée
- [ ] Logs Sentry filtrés (zéro PII)
- [ ] Backup Supabase configuré (Point-in-Time Recovery)
- [ ] Contact `security.txt` publié

---

## Questions de fond — Réponses

| Question | Réponse |
|----------|---------|
| Rôles lus depuis `user_metadata` ? | ❌ Non — correctement lus depuis `app_metadata` via JWT |
| Webhook Kobo idempotent ? | ✅ Oui — vérifie `kobo_sync_queue` avant insertion |
| Que peut faire la clé anon ? | ⚠️ Lire les membres avec carte active, les fiches publiées, les produits marketplace, les coopératives, les régions/préfectures/cantons |
| Données prod en dev ? | ✅ `.env.local` dans `.gitignore`, `.env.example` sans valeurs réelles |
| Ex-employé malveillant ? | ⚠️ Pas de procédure documentée de révocation de session/clés |
| Supabase down pendant webhook ? | ✅ Queue de retry avec backoff exponentiel (max 5 tentatives) |

---

*Signature orchestrateur : Audit automatisé — 24 mai 2026*
