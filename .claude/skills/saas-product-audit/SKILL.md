---
name: saas-product-audit
description: Audit complet d'un produit SaaS multi-organisations (ici FaîtiereHub) — structure, dépendances, CI, modules réellement fonctionnels, sécurité Supabase/RLS, isolation des organisations, dette technique, préparation B2B. À utiliser avant une levée, une vente ou une refonte.
---

# Audit de produit SaaS

Objectif : un état des lieux vérifiable, pas une opinion. Chaque constat cite sa preuve
(`fichier:ligne`, sortie de commande, résultat de requête) et porte une étiquette :
**vérifié**, **déclaré** (par le fondateur), **supposé**, **non vérifiable**.

## Étapes

1. **Inventaire** (lecture seule) : arborescence, `package.json` (scripts, versions, dépendances
   lourdes ou inutilisées), `.github/workflows/*`, `vercel.json`, documentation et toute
   affirmation chiffrée publique (pages marketing, README) à confronter aux données.
2. **Qualité exécutable** : `npm run typecheck`, `npx biome check . --max-diagnostics=0` (séparer
   formatage et vraies règles), `npm run test:unit`, `npm run test:hardening`,
   `npm run security:check -- --static`, `npm run build` (avec `FAITIERE_LOCAL_VERIFY=1`),
   `npm audit --omit=dev`. Noter ce que la CI exécute et ce qu'elle oublie.
3. **Modules** : pour chaque espace (`app/dashboard/*`, `app/admin/*`, `app/operator/*`, Haroo,
   vérification de carte, paiements), classer FONCTIONNEL / PARTIEL / VITRINE avec preuve
   (« bientôt disponible », boutons désactivés, données codées en dur).
4. **Sécurité base** (Supabase MCP, lecture seule) :
   - `get_advisors` sécurité et performance ;
   - tables sans RLS, politiques `true`, droits `anon` sur les tables personnelles ;
   - fonctions `SECURITY DEFINER` sans `search_path` ou exécutables par `anon`/`authenticated` ;
   - tests d'isolation dans un bloc `DO` terminé par `RAISE EXCEPTION` (tout est annulé) :
     `set_config('request.jwt.claims', json_build_object('sub', <id>, 'role','authenticated')::text, true)`
     puis `SET LOCAL ROLE authenticated`, compter ce qu'un administrateur de A voit de B ;
   - buckets de stockage publics contenant des données personnelles.
5. **Parcours critiques** : inscription, connexion, création d'organisation, membres, cartes,
   paiements. Chercher les routes service_role sans garde, les résultats de garde ignorés, les
   redirections ouvertes, les webhooks sans vérification, les sélections sans limite (PostgREST
   s'arrête à 1 000 lignes).
6. **Comptes et secrets** : identifiants publiés (pages, docs, tests) qui existent réellement en
   base — à traiter en priorité absolue.
7. **Préparation B2B** : contrat, facturation, SLA réel, RGPD/loi togolaise sur les données,
   support, onboarding, export des données client.

## Règles

- Aucune écriture en production, aucune migration appliquée, aucun compte de test créé.
- Ne jamais afficher un mot de passe, un jeton ou un numéro de téléphone complet.
- Livrable : `investor-readiness/technical-audit.md` (constats classés Critique → Faible, avec
  scénario de défaillance et correction proposée).
