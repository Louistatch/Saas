# Plan de Monitoring — FaîtiereHub SaaS (Scale 10M MAU)

Objectif : intercepter les anomalies **avant** les utilisateurs, à un coût maîtrisé
au volume de 10M MAU. Deux outils complémentaires, responsabilités séparées.

## 1. Répartition des responsabilités

| Outil | Capte quoi | Ne capte PAS |
|---|---|---|
| **Sentry** | Erreurs (exceptions front/back), traces de performance, replays sur erreur | Funnels produit, rétention |
| **PostHog** | Funnels (signup → coop → 1ère carte), feature flags, événements produit | Stack traces, erreurs runtime |

## 2. Sentry — configuration scale

### Sampling (déjà appliqué dans `sentry.client.config.ts`)
À 10M MAU, un `tracesSampleRate: 0.1` génère des millions de transactions/jour et
explose le quota. La config utilise désormais un **`tracesSampler`** ciblé :

- `/auth` et `/api/auth` → **50 %** (flux critiques : login, signup, reset)
- `/api/webhooks` → **20 %** (pipeline Kobo, écriture lourde)
- tout le reste → **1 %** (baseline)
- `replaysSessionSampleRate` abaissé à **0,1 %** (les replays ambiants sont le signal le plus cher)
- `replaysOnErrorSampleRate` maintenu à **100 %** (on veut TOUTES les sessions ayant crashé)

### Alertes Sentry à configurer (dashboard)
1. **Spike d'erreurs** : +50 % d'erreurs sur 5 min vs baseline → Slack `#alerts-prod`.
2. **Nouvelle erreur en prod** : toute issue jamais vue → notification immédiate.
3. **Régression de latence p95** : p95 d'une transaction `/api/*` > 2× la médiane 7j.
4. **Échec d'auth anormal** : pic sur les transactions `/api/auth/*` (corrèle avec brute-force).

### Server-side
`sentry.server.config.ts` et `sentry.edge.config.ts` existent déjà. Vérifier qu'ils
utilisent le même `tracesSampler` que le client pour ne pas sur-échantillonner les
Server Components et Route Handlers.

## 3. PostHog — funnels & feature flags

### Funnels prioritaires
1. **Onboarding** : `$pageview /auth/signup` → `signup_submitted` → `cooperative_created` → `first_card_generated`.
   - Point de fuite attendu : confirmation email (AUTH-04). Mesurer le taux de retour après le mail.
2. **Activation membre** : `member_access_login` (par carte) → consultation marketplace.
3. **Sync Kobo** : `kobo_webhook_received` → `kobo_submission_matched` → `kobo_enrollment_completed`.

### Événements à instrumenter (`posthog.capture(...)`)
| Événement | Où | Propriétés |
|---|---|---|
| `signup_submitted` | signup page | `has_cooperative` |
| `cooperative_created` | `/api/auth/complete-signup` succès (côté client après retour) | `cooperative_id` |
| `first_card_generated` | dashboard cards, 1ʳᵉ génération | `cooperative_id`, `bulk` |
| `kobo_sync_triggered` | dashboard integrations | `mode` |

### Coût au scale
- `autocapture: false` et `capture_pageview: false` (manuel) → volume d'événements **prévisible**.
- `disable_session_recording: true` par défaut ; activer le recording **ciblé** (ex. uniquement sur erreurs via une feature flag) si besoin.
- Héberger sur l'instance EU (`eu.i.posthog.com`) pour la conformité RGPD (utilisateurs au Togo + UE).

### Feature flags
Utiliser PostHog pour les rollouts progressifs des corrections critiques :
- `mfa-enabled` (déploiement MFA admin, AUTH-09)
- `new-webhook-pipeline` (bascule progressive vers `waitUntil`)
- Permet un **kill-switch** instantané sans redéploiement si une régression apparaît à charge.

## 4. Variables d'environnement à provisionner

```
# Sentry (déjà partiellement présent)
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_AUTH_TOKEN=...           # upload des source maps au build

# PostHog (nouveau)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

Si `NEXT_PUBLIC_POSTHOG_KEY` est absent, le `PostHogProvider` est un **no-op** —
l'app fonctionne normalement en dev sans clé.

## 5. Corrélation des signaux

Lier Sentry et PostHog par le `user_id` :
- `identifyUser(userId, role, cooperativeId)` côté PostHog (après résolution auth).
- `Sentry.setUser({ id: userId })` côté Sentry (à ajouter dans l'AuthProvider).

Ainsi, une erreur Sentry peut être recoupée avec le parcours produit PostHog du
même utilisateur — essentiel pour diagnostiquer une anomalie à haute charge sans
attendre un ticket de support.

## 6. Health checks & uptime (complément)

- **Vercel** : activer les Web Vitals + Speed Insights (déjà `@vercel/analytics`).
- **Supabase** : surveiller le pool Supavisor (connexions actives vs limite) — au scale
  c'est le premier goulot. Alerte à 80 % de saturation du pool.
- **Upstash Redis** : surveiller le taux de hit du rate-limiter et la latence.
