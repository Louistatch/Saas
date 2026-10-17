# SEO FaîtiereHub — audit et corrections du 17 octobre 2026

Base du diff : `d95fdc5fd638a6ed5faad6ed83538b565d92d8b3` (main lors de l’audit).

## Décision d’architecture

Garder Next.js App Router, Supabase et Vercel. Les pages de présentation et leurs
métadonnées doivent fonctionner sans base de données ; les espaces métier restent
authentifiés. Railway exécute une petite sonde externe, pas un second serveur web.
Aucun changement du moteur HarooLife, des rôles ou de l’architecture des cartes.

## Constats vérifiés avant correction

| Élément | Observation | Correction |
| --- | --- | --- |
| `/robots.txt`, `/sitemap.xml` | HTTP 404 en production | Fichier robots public et route metadata Next |
| Domaine | L’apex répond **307 vers www**, qui répond 200. Le middleware ajoutait également une redirection apex → www | Origine canonique unique `https://faitierehub.com`, suppression de cette redirection applicative ; bascule Vercel à coordonner ci-dessous |
| Métadonnées | Pas de `metadataBase` ni de canonical sur les pages commerciales | Registre de 16 pages publiques, titres/descriptions distincts, canonical absolue et Open Graph |
| Espaces applicatifs | Nombreux écrans héritant des métadonnées générales | `noindex` par défaut, opt-in public explicite, `X-Robots-Tag` sur routes privées, API, documents et redirections |
| Spécimens Haroo | PNG générés à la demande via API/WASM sur accueil, fonctionnalités et produit | WebP fictifs générés à partir du même moteur, imports statiques et `next/image` |
| Carte premium | `<img>` sans dimensions ni déclinaisons responsive | Import statique, tailles explicites, WebP, blur natif et lazy loading |
| Marché et catalogue | Présentation à l’intérieur de frontières client/Suspense | Titres et présentations serveur ; filtres, achats et annonces restent interactifs |
| Supabase | Projet `ACTIVE_HEALTHY` ; pas de RPC dédiée | RPC SQL `SELECT 1`, permissions serveur uniquement ; sonde REST + RPC |

Un sitemap énumère des URL canoniques dans ses éléments `<loc>`. La balise
`rel="canonical"` appartient au HTML de chaque page, pas au format XML sitemap.
Les deux sont construits depuis `lib/seo.ts`. Aucune date de modification inventée
n’est publiée à chaque requête. Le sitemap est régénéré/caché par Next, avec une
revalidation horaire, sans interroger Supabase.

L’annuaire `/fournisseurs` dépend de la session/RLS et n’est pas ajouté au sitemap.
Les fiches individuelles, tokens QR, rapports, commandes, comptes et variantes du
jeu ne sont pas énumérés. Les paramètres de recherche sont exclus du crawl ; les
pages publiques de recherche gardent une canonical sans paramètres. Les ressources
`/_next/` et `/images/` restent explicitement autorisées, y compris le paramètre
`q` de l’optimiseur d’images. Les previews Vercel portent `noindex`.

## Fichiers et comportement

- `lib/seo.ts`, `app/layout.tsx`, métadonnées des pages publiques et
  `app/sitemap.ts` : origine, politique d’indexation et sitemap cohérents.
- `public/robots.txt`, `next.config.mjs` : exclusions réelles (`/operator`, `/haroo`,
  `/dashboard`, etc.) et alias demandés (`/espace-operateur`, `/mon-espace-haroo`).
- `app/marche/page.tsx` et `app/marketplace/page.tsx` : introductions SSR ; code
  interactif déplacé dans `market-content.tsx` / `marketplace-content.tsx`.
- `components/marketing/haroo-card-specimen.tsx` et `public/images/cards/` : quatre
  spécimens 1180 × 740, environ 43–47 Ko chacun, servis en résolutions adaptées.
  `npm run generate:marketing-cards` les régénère sans base ni identités réelles.
- Accueil, pages produit/fonctionnalités/à propos, logo et visuel de connexion :
  images Next avec dimensions et tailles responsive ; placeholders blur pour les
  imports statiques principaux. Le hero reste prioritaire et son animation
  d’apparition est supprimée pour éviter de retarder son affichage.
- L’optimiseur privilégie WebP, sans encodage AVIF au premier accès. La négociation
  HTTP conserve un format compatible si un navigateur n’accepte pas WebP.
- `components/marketing/agricultural-context.tsx` : **557 mots**, visibles en bas
  de l’accueil avant le footer, un `h2`, quatre `h3`, références métier et liens
  vers le marché et les comptes d’exploitation. Aucun texte SEO masqué.

Les cartes nominatives délivrées, QR de vérification, SVG de rendu et exports PNG
d’impression conservent leur qualité et leurs règles d’accès. Ils ne passent pas
par le cache public de l’optimiseur. Les anciens QR imprimés avec www restent
valides grâce à la future redirection Vercel.

## Supervision Supabase et Railway

**Un ping ne garantit pas l’absence de pause sur Supabase Free.** La documentation
Supabase réserve explicitement cette garantie au forfait Pro. La sonde vérifie
l’accessibilité et exerce une activité SQL ; elle ne réveille pas un projet déjà
suspendu et ne constitue pas un SLA. Les pages marketing statiques et le sitemap
restent servis par le CDN si la base devient indisponible.

Migration : `supabase/migrations/20261017180000_infrastructure_healthcheck.sql`.
Fonction `public.infrastructure_healthcheck()`, `SECURITY INVOKER`, stable,
`search_path` vide ; elle exécute réellement `SELECT 1;`. Exécution révoquée pour
PUBLIC, anon et authenticated, accordée à service_role.

**Cette migration a été appliquée au projet partagé et enregistrée dans
`supabase_migrations.schema_migrations` sous la version `20261017180000`.** Les
permissions ont été vérifiées en production (anon=false, authenticated=false,
service_role=true). La sonde complète a renvoyé HTTP 200 pour REST et SQL=1.
Le cache PostgREST a été rechargé. Une nouvelle application de la migration est
idempotente.

Service Railway préparé, **pas encore créé/déployé** :

1. Créer un service lié au même dépôt GitHub, avec racine `/`.
2. Choisir le fichier de configuration `/ops/supabase-monitor/railway.toml`.
   Il désigne le Dockerfile dédié ; son fichier `.dockerignore` spécifique ne
   laisse entrer que le programme de la sonde, sans dépendances ni secrets.
3. Définir uniquement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans les
   variables sécurisées du service. Réutiliser les valeurs serveur existantes ;
   ne jamais les préfixer `NEXT_PUBLIC_`, les inscrire dans Git ou les afficher.
4. Déployer. Le cron `*/5 * * * *` lance le programme toutes les cinq minutes.
   Chaque exécution termine ; Railway saute une exécution si la précédente tourne
   encore. Aucun port HTTP ni healthcheck de serveur n’est nécessaire.
5. Contrôler les journaux et configurer une notification Railway/monitoring pour
   les exécutions en échec. Le programme sort avec 1 si REST ou SQL échoue,
   y compris lorsqu’une réponse 200 ne contient pas le résultat SQL attendu.

Le programme effectue `HEAD /rest/v1/` et `POST
/rest/v1/rpc/infrastructure_healthcheck`. Chaque opération dispose d’un délai de
huit secondes. Les redirections sont refusées pour ne pas transmettre de clé à un
autre hôte. Les journaux ne contiennent que statut, durée et catégorie d’erreur.
288 exécutions par jour, deux petites requêtes par exécution ; coût réel à suivre
dans Railway. La création du service nécessite un accès Railway de déploiement,
qui n’est pas disponible dans cette session.

Exécution ponctuelle sur un serveur disposant des variables sécurisées :

```bash
node ops/supabase-monitor/main.mjs
```

Dans cet environnement cloud doté d’un proxy HTTP, le test utilise le runtime Node
24 et `node --use-env-proxy ops/supabase-monitor/main.mjs`. Railway n’a pas besoin
de cet argument : le conteneur Node 22 sort normalement sur Internet.

## Ordre de mise en production du domaine

Le code est préparé pour l’apex demandé. **Le réglage Vercel reste à faire** ; aucun
accès Vercel permettant de changer Domains n’est disponible dans cette session.

1. Déployer ce code qui retire l’ancienne redirection middleware apex → www.
2. Dans le projet Vercel qui sert réellement `faitierehub.com`, faire servir
   l’apex en production et configurer **www → apex** en redirection permanente.
   Ne pas inverser cet ordre : l’ancien middleware créerait une boucle.
3. Vérifier : apex `/` = 200, www `/` = 301/308 vers apex, un seul saut ; même
   comportement sur `/produit`, `/robots.txt`, `/sitemap.xml` et un lien QR.
4. Vérifier les URL de retour autorisées Supabase/Vercel si elles dépendent du
   domaine d’authentification. Les URL de callback des paiements ne sont pas
   modifiées par ce patch.
5. Soumettre `https://faitierehub.com/sitemap.xml` dans Search Console, inspecter
   l’accueil et les deux catalogues, puis suivre couverture, canonical retenue
   et erreurs serveur. Le crawl et l’indexation restent des décisions de Google.

Une URL déjà indexée puis interdite dans robots.txt ne permet plus à Google de
lire sa consigne `noindex`. Pour ces URL, faire lire temporairement `noindex`
en levant l’exclusion concernée, ou utiliser les outils de suppression Search
Console selon le besoin. Robots.txt n’est jamais un contrôle d’accès : les gardes
serveur, sessions et RLS restent en place.

## Validation effectuée

- Build Next de production réussi ; TypeScript sans erreur.
- `npm run test:unit` : **390 tests réussis** (34 Node/SQL et 356 TypeScript),
  dont les 7 nouveaux tests SEO/sonde. Hardening : 32 tests réussis.
- Permissions SQL de la sonde testées dans PostgreSQL/PGlite.
- Contrôles de sécurité statiques réussis.
- 4 tests HTTP/navigateur sur le build de production : canonical/indexation des
  16 pages, headers privés, images WebP responsive sans API de spécimens,
  présentations du marché lisibles JavaScript désactivé.
- Capture mobile et vérification de l’absence de débordement horizontal.
- Sonde réelle Supabase : REST 200 et RPC 200/1, permissions contrôlées.

Les temps réseau locaux ne mesurent pas les Core Web Vitals de vrais téléphones
au Togo. Mesurer après déploiement LCP, INP et CLS au 75e percentile via les
données terrain disponibles, puis ajuster les budgets. Aucun score Lighthouse
ni gain de classement n’est annoncé sans mesure.

## Références primaires consultées

- [Supabase — mise en production et pause Free/garantie Pro](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase — facturation et projets payants](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Railway — Cron jobs](https://docs.railway.com/guides/cron-jobs)
- [Railway — configuration comme code](https://docs.railway.com/reference/config-as-code)
- [Next.js — Image](https://nextjs.org/docs/app/api-reference/components/image)
- [Google — noindex et robots.txt](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google — URL canoniques](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
