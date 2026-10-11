---
name: feature-validation
description: Vérifier qu'une fonctionnalité de FaîtiereHub fonctionne réellement de bout en bout (test qui échoue avant, passe après), sans toucher à la production. À utiliser avant de déclarer une fonctionnalité « opérationnelle » ou de livrer un correctif.
---

# Validation de fonctionnalité

Une fonctionnalité n'est « opérationnelle » que si un parcours a été exécuté et observé.

## Méthode

1. **Énoncer le critère** : qui fait quoi, résultat attendu, cas limites (rôle sans droit,
   autre organisation, téléphone mal formé, 1 001ᵉ ligne).
2. **Reproduire** avant de corriger :
   - logique pure → test `node --test` dans `tests/` (ajouté à `npm run test:unit`) ;
   - SQL / RLS → test PGlite comme `tests/launch-hardening.test.mjs`, ou bloc `DO … RAISE EXCEPTION`
     en lecture seule sur la base réelle ;
   - interface → Playwright avec Chromium `/opt/pw-browsers/chromium`, application locale
     (`next dev`) contre un faux Supabase (serveur Node qui simule `/auth/v1/*` et `/rest/v1/*`),
     contexte `bypassCSP: true`, session injectée dans le cookie `sb-127-auth-token`
     (`base64-` + JSON encodé base64url).
3. **Corriger** au plus petit, puis relancer le même test (preuve avant/après).
4. **Non-régression** : `npm run typecheck`, Biome sur les fichiers modifiés uniquement,
   `npm run test:unit`, `npm run test:hardening`, et `npm run build` si le correctif touche une page.
5. **Consigner** : tableau étape → attendu → obtenu → preuve, et ce qui n'a pas pu être testé.

## Interdits

Tests contre la production avec des comptes réels, création de données réelles, `--write` Biome
sur des fichiers non modifiés (bruit de diff), `CLAUDE.md` modifié par `next dev` (le restaurer).
