# Guide de Test Global — FaîtiereHub v2.0

## Vue d'ensemble

Ce guide couvre les tests pour les 3 nouvelles fonctionnalités majeures :

| Fonctionnalité | Document de test | Priorité |
|---------------|-----------------|----------|
| Marketplace Ultra-Fluide | [MARKETPLACE-TESTS.md](./MARKETPLACE-TESTS.md) | 🔴 Haute |
| KoboCollect Integration | [KOBO-TESTS.md](./KOBO-TESTS.md) | 🔴 Haute |
| SaaS Embeddable | [EMBED-TESTS.md](./EMBED-TESTS.md) | 🟡 Moyenne |

---

## Environnements de test

| Environnement | URL | Usage |
|--------------|-----|-------|
| Local | `http://localhost:3000` | Développement, tests unitaires |
| Preview | `https://preview-xxx.vercel.app` | Tests d'intégration, QA |
| Production | `https://app.faitierehub.com` | Smoke tests post-deploy |

---

## Pré-requis globaux

### Données de test

```sql
-- Créer des produits marketplace de test
INSERT INTO marketplace_products (cooperative_id, name, category, culture, price, unit, available, region_id, prefecture_id)
SELECT 
  c.id,
  'Produit Test ' || generate_series,
  (ARRAY['produit', 'service', 'intrant', 'semence'])[1 + (random() * 3)::int],
  (ARRAY['Maïs', 'Riz', 'Tomate', 'Soja', 'Manioc'])[1 + (random() * 4)::int],
  (random() * 5000 + 100)::int,
  'kg',
  true,
  (SELECT id FROM regions ORDER BY random() LIMIT 1),
  (SELECT id FROM prefectures ORDER BY random() LIMIT 1)
FROM cooperatives c, generate_series(1, 10);

-- Activer l'embed pour une coopérative de test
INSERT INTO embed_configs (cooperative_id, enabled, widgets, theme)
SELECT id, true, '{marketplace,member_verify,fiches,dashboard}', 
  '{"primaryColor": "#16a34a", "borderRadius": "8px", "fontFamily": "Inter"}'
FROM cooperatives LIMIT 1;
```

### Variables d'environnement requises

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
INTEGRATION_SECRET_KEY=...          # Pour chiffrement API keys Kobo
KOBO_WEBHOOK_SECRET=test-secret-123 # Pour tests webhook
```

### Outils nécessaires

| Outil | Usage | Installation |
|-------|-------|-------------|
| Node.js 18+ | Runtime | `nvm use 18` |
| Playwright | E2E tests | `npx playwright install` |
| KoboCollect | Tests terrain | Google Play Store |
| curl/httpie | Tests API manuels | Système |
| Chrome DevTools | Performance | Navigateur |

---

## Plan de test par sprint

### Sprint 1 : Smoke Tests (30 min)

```
□ npm run typecheck → 0 erreurs
□ npm run build → Build réussi
□ Ouvrir /marketplace → Page s'affiche
□ Ouvrir /embed/widget?cooperative_id=XXX → Widget s'affiche
□ POST /api/webhooks/kobo avec secret → 200 ou 400 (pas 500)
□ GET /api/marketplace → 200 avec JSON valide
□ GET /api/embed?cooperative_id=XXX → 200 ou 404
□ /dashboard/embed → Page accessible (authentifié)
```

### Sprint 2 : Tests fonctionnels (2h)

```
MARKETPLACE
□ Recherche texte → Résultats filtrés
□ Filtre catégorie → Produits de cette catégorie
□ Filtre région → Cascade préfecture/canton
□ Tri par prix → Ordre correct
□ Pagination → Pages fonctionnelles
□ Reset filtres → Retour à l'état initial
□ Mobile → Sheet filtres fonctionne

KOBO
□ Webhook avec données valides → Membre créé
□ Webhook doublon (même phone) → Membre mis à jour
□ Webhook sans secret → 401
□ Sync manuelle → Données importées
□ Queue retry → Erreurs retraitées

EMBED
□ SDK auto-init → Widget créé
□ SDK programmatique → Widget créé
□ Member verify → Validation fonctionne
□ Config admin → Sauvegarde OK
□ Origin validation → Bloqué si non autorisé
```

### Sprint 3 : Tests de charge et sécurité (1h)

```
PERFORMANCE
□ Marketplace: < 200ms pour 20 produits
□ Embed API: < 150ms
□ Kobo sync 100 submissions: < 30s
□ SDK JS: < 3KB

SÉCURITÉ
□ Rate limiting actif sur tous les endpoints publics
□ RLS: pas d'accès cross-tenant
□ Injection SQL: pas d'erreur, résultat vide
□ XSS: données échappées
□ CORS: origins validées
□ Webhook: timing-safe comparison
```

---

## Matrice de tests par rôle

| Test | super_admin | cooperative_admin | member | guest/anon |
|------|:-----------:|:-----------------:|:------:|:----------:|
| Voir marketplace publique | ✅ | ✅ | ✅ | ✅ |
| Créer produit marketplace | ✅ | ✅ | ❌ | ❌ |
| Configurer embed | ✅ | ✅ | ❌ | ❌ |
| Voir widget embed | ✅ | ✅ | ✅ | ✅ |
| Configurer Kobo | ✅ | ✅ | ❌ | ❌ |
| Lancer sync Kobo | ✅ | ✅ (sa coop) | ❌ | ❌ |
| Vérifier carte (widget) | ✅ | ✅ | ✅ | ✅ |

---

## Tests de régression

Après chaque déploiement, vérifier que les fonctionnalités existantes ne sont pas cassées :

| # | Fonctionnalité existante | Route | Test |
|---|-------------------------|-------|------|
| 1 | Login/Signup | /auth/login | Connexion réussie |
| 2 | Dashboard overview | /dashboard | Stats affichées |
| 3 | Membres | /dashboard/members | Liste chargée |
| 4 | Cartes membres | /dashboard/cards | Génération OK |
| 5 | Fiches techniques (admin) | /dashboard/marketplace | Upload/list OK |
| 6 | Intégrations | /dashboard/integrations | Page chargée |
| 7 | KoboCollect setup | /dashboard/kobo-setup | Config sauvegardée |
| 8 | Widget API existant | /api/widget | Réponse identique |
| 9 | Member access API | /api/member-access | Vérification OK |
| 10 | Webhook Kobo | /api/webhooks/kobo | Création membre OK |
| 11 | Admin panel | /admin | Accessible super_admin |
| 12 | Cotisations | /dashboard/cotisations | CRUD fonctionne |

---

## Automatisation

### Scripts de test

```bash
# Test complet (CI/CD)
npm run typecheck && npm run build && npm run test:e2e

# Tests rapides (dev)
npm run typecheck

# Tests E2E spécifiques
npx playwright test e2e/marketplace.spec.ts --headed
npx playwright test e2e/embed.spec.ts --headed
npx playwright test e2e/kobo.spec.ts --headed

# Tests mobile
npx playwright test --project=mobile-chrome

# Tests API manuels
curl -s http://localhost:3000/api/marketplace | jq .
curl -s "http://localhost:3000/api/embed?cooperative_id=XXX&widget=marketplace" | jq .
curl -X POST http://localhost:3000/api/webhooks/kobo \
  -H "Content-Type: application/json" \
  -H "x-kobo-secret: test-secret-123" \
  -d '{"first_name":"Test","last_name":"User","phone":"90000000","cooperative":"Espoir"}'
```

### CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

---

## Critères d'acceptation

### Marketplace

- [ ] Filtres instantanés (< 300ms perçu)
- [ ] URL synchronisée (partage de lien avec filtres)
- [ ] Mobile-first (sheet pour filtres)
- [ ] Skeleton loading visible
- [ ] Pagination fonctionnelle
- [ ] Full-text search en français
- [ ] 0 erreur TypeScript
- [ ] Build Next.js réussi

### KoboCollect

- [ ] Webhook reçoit et traite les soumissions
- [ ] Sync manuelle fonctionne
- [ ] Retry queue gère les échecs
- [ ] Doublons détectés (pas de duplication)
- [ ] Audit trail complet
- [ ] XLSForm validé dans KoboToolbox
- [ ] Offline fonctionne sur Android

### Embed SaaS

- [ ] SDK JS < 3KB, auto-init fonctionne
- [ ] 4 widgets fonctionnels
- [ ] Theme personnalisable
- [ ] Origin validation active
- [ ] Rate limiting actif
- [ ] Responsive dans l'iframe
- [ ] Compatible WordPress/Webflow/HTML
- [ ] Sandbox iframe sécurisé

---

## Contacts

| Rôle | Responsabilité |
|------|---------------|
| Dev Lead | Architecture, code review |
| QA | Exécution tests, rapports bugs |
| Product | Validation UX, critères d'acceptation |
| DevOps | CI/CD, monitoring |
| Terrain | Tests KoboCollect sur Android |
