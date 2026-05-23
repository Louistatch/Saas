# Guide de Tests — Marketplace Ultra-Fluide

## 1. Tests Unitaires (Hooks)

### `use-marketplace-filters.ts`

| # | Test | Entrée | Résultat attendu |
|---|------|--------|-----------------|
| 1 | Initialisation par défaut | Aucun param URL | Tous les filtres vides, page=1, sort=created_at:desc |
| 2 | Lecture depuis URL | `?q=tomate&cat=produit&page=2` | filters.search='tomate', filters.category='produit', filters.page=2 |
| 3 | Debounce search | Taper "mais" rapidement | URL mise à jour après 300ms seulement |
| 4 | Reset filters | Appeler `resetFilters()` | URL = pathname sans params, localSearch='' |
| 5 | Cascade region→prefecture | Changer region_id | prefecture_id et canton_id remis à '' |
| 6 | Active filter count | 3 filtres actifs | `activeFilterCount === 3` |
| 7 | Page reset on filter change | Changer category en page 3 | page revient à 1 |
| 8 | Sort change | Changer sort_by='price', sort_order='asc' | URL contient `?sort=price&order=asc` |

### `use-marketplace-data.ts`

| # | Test | Entrée | Résultat attendu |
|---|------|--------|-----------------|
| 1 | Chargement initial | Filtres par défaut | isLoading=true puis products=[], total=0 (DB vide) |
| 2 | Cache hit | Même filtres dans les 30s | Pas de requête Supabase, données du cache |
| 3 | Cache miss | Filtres différents | Nouvelle requête Supabase |
| 4 | Abort previous | Changement rapide de filtre | Seule la dernière requête aboutit |
| 5 | Reference data loaded | Au montage | regions, prefectures, cantons, cultures, cooperatives chargés |
| 6 | Filtered prefectures | region_id sélectionné | Seules les préfectures de cette région |
| 7 | Error handling | RPC échoue | error contient le message, products=[] |
| 8 | Pagination | page=2, pageSize=20 | Offset correct dans le RPC |

---

## 2. Tests d'Intégration (API)

### `GET /api/marketplace`

| # | Scénario | Requête | Code | Réponse attendue |
|---|----------|---------|------|-----------------|
| 1 | Liste sans filtres | `GET /api/marketplace` | 200 | `{ products: [], total: 0, page: 1, pageSize: 20 }` |
| 2 | Filtre par catégorie | `?category=produit` | 200 | Seuls les produits de catégorie 'produit' |
| 3 | Recherche texte | `?q=tomate` | 200 | Produits contenant 'tomate' dans name/description/culture |
| 4 | Pagination | `?page=2&limit=5` | 200 | 5 résultats max, offset=5 |
| 5 | Limit max 50 | `?limit=100` | 200 | pageSize plafonné à 50 |
| 6 | Rate limit dépassé | 121 requêtes en 60s | 429 | `{ error: 'Too many requests' }` |
| 7 | CORS headers | Requête OPTIONS | 204 | Headers CORS présents |
| 8 | Cache headers | GET normal | 200 | `Cache-Control: public, s-maxage=30, stale-while-revalidate=120` |

### `GET /api/embed`

| # | Scénario | Requête | Code | Réponse attendue |
|---|----------|---------|------|-----------------|
| 1 | Sans cooperative_id | `GET /api/embed` | 400 | `{ error: 'cooperative_id required' }` |
| 2 | Cooperative sans embed | `?cooperative_id=xxx` | 404 | `{ error: 'Embed not configured...' }` |
| 3 | Origin non autorisée | Origin: evil.com, allowed_origins=['good.com'] | 403 | `{ error: 'Origin not allowed' }` |
| 4 | Widget désactivé | `?widget=dashboard`, widgets=['marketplace'] | 403 | `{ error: 'Widget "dashboard" not enabled' }` |
| 5 | Marketplace widget | `?cooperative_id=xxx&widget=marketplace` | 200 | `{ cooperative, theme, widget, data: { products } }` |
| 6 | Member verify widget | `?widget=member_verify` | 200 | `{ data: { verify_endpoint } }` |
| 7 | Rate limit | 61 requêtes en 60s | 429 | Error |

### `POST /api/integrations/kobo/sync`

| # | Scénario | Requête | Code | Réponse attendue |
|---|----------|---------|------|-----------------|
| 1 | Non authentifié | Pas de session | 401 | `{ error: 'Unauthorized' }` |
| 2 | Mauvais rôle | role=member | 403 | `{ error: 'Forbidden' }` |
| 3 | Kobo non connecté | status='disconnected' | 400 | `{ error: 'KoboToolbox not connected' }` |
| 4 | Sync réussie | Config valide, API Kobo OK | 200 | `{ success: true, sync: { created, updated, ... } }` |
| 5 | API Kobo en erreur | Token invalide | 500 | `{ error: 'Sync failed', details: '...' }` |
| 6 | cooperative_id invalide | `{ cooperative_id: 'not-uuid' }` | 400 | `{ error: 'Invalid cooperative_id' }` |

---

## 3. Tests E2E (Playwright)

### Marketplace publique

```typescript
// e2e/marketplace.spec.ts

test.describe('Marketplace publique', () => {
  test('affiche la page marketplace', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByRole('heading', { name: 'Marketplace Agricole' })).toBeVisible();
  });

  test('recherche avec debounce', async ({ page }) => {
    await page.goto('/marketplace');
    const searchInput = page.getByPlaceholder('Rechercher produits');
    await searchInput.fill('tomate');
    // Attendre le debounce
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/q=tomate/);
  });

  test('filtres en cascade géographique', async ({ page }) => {
    await page.goto('/marketplace');
    // Sélectionner une région
    await page.locator('select').filter({ hasText: 'Région' }).selectOption({ index: 1 });
    await expect(page).toHaveURL(/region=/);
    // Les préfectures doivent être filtrées
  });

  test('pagination fonctionne', async ({ page }) => {
    await page.goto('/marketplace?page=2');
    await expect(page).toHaveURL(/page=2/);
  });

  test('reset filtres', async ({ page }) => {
    await page.goto('/marketplace?cat=produit&culture=Maïs');
    await page.getByText('Tout effacer').click();
    await expect(page).toHaveURL('/marketplace');
  });

  test('tri par prix', async ({ page }) => {
    await page.goto('/marketplace');
    await page.locator('select').last().selectOption('price:asc');
    await expect(page).toHaveURL(/sort=price.*order=asc/);
  });

  test('mobile: filtres dans un sheet', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/marketplace');
    await page.getByRole('button', { name: /Filtres/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('skeleton loading visible', async ({ page }) => {
    await page.goto('/marketplace');
    // Les skeletons doivent apparaître brièvement
    const skeletons = page.locator('.animate-pulse');
    await expect(skeletons.first()).toBeVisible();
  });
});
```

### Widget Embed

```typescript
// e2e/embed.spec.ts

test.describe('Widget Embed', () => {
  test('charge le widget marketplace', async ({ page }) => {
    await page.goto('/embed/widget?cooperative_id=TEST_ID&widget=marketplace');
    await expect(page.getByText('Propulsé par FaîtiereHub')).toBeVisible();
  });

  test('widget member_verify', async ({ page }) => {
    await page.goto('/embed/widget?cooperative_id=TEST_ID&widget=member_verify');
    await expect(page.getByPlaceholder('Numéro de carte membre')).toBeVisible();
  });

  test('vérification carte invalide', async ({ page }) => {
    await page.goto('/embed/widget?cooperative_id=TEST_ID&widget=member_verify');
    await page.getByPlaceholder('Numéro de carte membre').fill('INVALID');
    await page.getByRole('button', { name: 'Vérifier' }).click();
    await expect(page.getByText(/Carte non trouvée|invalide/)).toBeVisible();
  });

  test('widget fiches', async ({ page }) => {
    await page.goto('/embed/widget?cooperative_id=TEST_ID&widget=fiches');
    // Doit afficher la liste ou un état vide
    await page.waitForLoadState('networkidle');
  });

  test('widget dashboard stats', async ({ page }) => {
    await page.goto('/embed/widget?cooperative_id=TEST_ID&widget=dashboard');
    await expect(page.getByText('Membres')).toBeVisible();
    await expect(page.getByText('Produits')).toBeVisible();
  });

  test('theme personnalisé appliqué', async ({ page }) => {
    const theme = encodeURIComponent(JSON.stringify({ primaryColor: '#ff0000' }));
    await page.goto(`/embed/widget?cooperative_id=TEST_ID&widget=marketplace&theme=${theme}`);
    // Vérifier que la CSS variable est appliquée
    const root = page.locator('html');
    await expect(root).toHaveCSS('--primary', '#ff0000');
  });
});
```

### Dashboard Embed Config

```typescript
// e2e/dashboard-embed.spec.ts

test.describe('Dashboard Embed Config', () => {
  test.beforeEach(async ({ page }) => {
    // Login as cooperative_admin
    await loginAsAdmin(page);
  });

  test('affiche la page de configuration', async ({ page }) => {
    await page.goto('/dashboard/embed');
    await expect(page.getByText('Widget Embeddable')).toBeVisible();
  });

  test('activer/désactiver embed', async ({ page }) => {
    await page.goto('/dashboard/embed');
    const toggle = page.getByRole('switch').first();
    await toggle.click();
    // Sauvegarder
    await page.getByRole('button', { name: 'Sauvegarder' }).click();
    await expect(page.getByText('Configuration sauvegardée')).toBeVisible();
  });

  test('copier le code embed', async ({ page }) => {
    await page.goto('/dashboard/embed');
    // Cliquer sur le bouton copier
    await page.locator('button').filter({ has: page.locator('svg') }).last().click();
    // Le clipboard devrait contenir le code
  });

  test('ajouter une origine autorisée', async ({ page }) => {
    await page.goto('/dashboard/embed');
    await page.getByPlaceholder('https://votre-site.com').fill('https://test.com');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByText('https://test.com')).toBeVisible();
  });
});
```

---

## 4. Tests de Performance

### Marketplace

| # | Métrique | Seuil acceptable | Comment mesurer |
|---|----------|-----------------|-----------------|
| 1 | First Contentful Paint | < 1.5s | Lighthouse |
| 2 | Time to Interactive | < 3s | Lighthouse |
| 3 | Temps de réponse RPC (20 produits) | < 200ms | Supabase Dashboard |
| 4 | Temps de réponse RPC (1000 produits, filtré) | < 500ms | pg_stat_statements |
| 5 | Debounce effectif | 300ms exactement | DevTools Network |
| 6 | Cache hit (même filtres) | 0ms réseau | DevTools Network |
| 7 | Bundle size page marketplace | < 150KB gzipped | `next build` output |

### Embed Widget

| # | Métrique | Seuil acceptable | Comment mesurer |
|---|----------|-----------------|-----------------|
| 1 | Temps de chargement iframe | < 2s | Performance API |
| 2 | Taille du SDK JS | < 3KB | `ls -la public/embed/` |
| 3 | Auto-resize latence | < 100ms | postMessage timing |
| 4 | API embed response time | < 150ms | Vercel Analytics |

### Kobo Sync

| # | Métrique | Seuil acceptable | Comment mesurer |
|---|----------|-----------------|-----------------|
| 1 | Sync 100 submissions | < 30s | API response time |
| 2 | Sync 1000 submissions | < 5min | Logs |
| 3 | Retry queue processing | < 60s pour 50 items | Logs |
| 4 | Duplicate detection | < 50ms par check | pg_stat_statements |

---

## 5. Tests de Sécurité

| # | Test | Méthode | Résultat attendu |
|---|------|---------|-----------------|
| 1 | Rate limit marketplace | 121 GET en 60s | 429 après 120 |
| 2 | Rate limit embed | 61 GET en 60s | 429 après 60 |
| 3 | CORS origin validation | Origin: evil.com | 403 si non dans allowed_origins |
| 4 | SQL injection via search | `?q='; DROP TABLE--` | Pas d'erreur, résultat vide |
| 5 | XSS dans product name | `<script>alert(1)</script>` | Échappé dans le rendu |
| 6 | RLS marketplace_products | Anon user, available=false | Pas de résultats |
| 7 | Embed config access | User d'une autre coopérative | 403 via RLS |
| 8 | Kobo sync sans auth | POST sans session | 401 |
| 9 | Kobo sync mauvais tenant | Admin coop A sync coop B | 403 |
| 10 | iframe sandbox | Script malveillant dans iframe | Bloqué par sandbox |

---

## 6. Tests de Régression

| # | Scénario | Vérification |
|---|----------|-------------|
| 1 | Marketplace existante (dashboard) | `/dashboard/marketplace` fonctionne toujours |
| 2 | Widget API existant | `/api/widget` retourne les mêmes données |
| 3 | Webhook Kobo existant | `/api/webhooks/kobo` accepte toujours les submissions |
| 4 | Auth flow | Login/signup/logout inchangés |
| 5 | Dashboard layout | Nouveau lien "Widget Embed" visible pour admins |
| 6 | Member access | `/api/member-access` fonctionne identiquement |
| 7 | Fiches API | `/api/fiches` retourne les mêmes données |

---

## 7. Commandes de test

```bash
# TypeScript check
npm run typecheck

# Build complet
npm run build

# E2E tests
npm run test:e2e

# E2E tests spécifiques
npx playwright test e2e/marketplace.spec.ts
npx playwright test e2e/embed.spec.ts

# E2E mobile
npm run test:e2e:mobile

# Lint
npm run lint
```
