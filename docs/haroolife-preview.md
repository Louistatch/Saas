# HarooLife — préversion Vercel du projet `haroolife-lome`

État au 12/10/2026. Ce dépôt est connecté à deux projets Vercel qui partagent le même
`vercel.json` :

| Projet | Équipe Vercel | Rôle |
|---|---|---|
| `saas` | issodo052-7639's projects | production FaîtiereHub (`www.faitierehub.com`) |
| `haroolife-lome` | louis-issodo-tatchidas-projects (compte `tatchida`) | préversion du jeu |

## Effet du `ignoreCommand` partagé

`vercel.json` contient une étape « Ignored Build Step » qui s'applique aux deux projets :

```
if [ "$VERCEL_ENV" = "production" ] || [ "$HAROOLIFE_PREVIEWS" = "1" ]; then exit 1; else exit 0; fi
```

- sortie `1` = construire ; sortie `0` = ignorer ;
- en production (`VERCEL_ENV=production`, donc un push sur `main`) : toujours construit, inchangé ;
- sur une branche : construit seulement si le projet définit la variable `HAROOLIFE_PREVIEWS=1`.
  Le projet `saas` ne la définit pas : ses préversions restent ignorées comme avant (les
  déploiements `CANCELED` visibles dans son tableau de bord sont ce comportement attendu).

Avant cette modification, la règle ignorait toute préversion pour les deux projets, ce qui
explique les statuts « Ignored » du bot Vercel sur la PR.

## Activer la préversion (à faire dans le compte `tatchida`, non accessible depuis la session)

1. Vercel → projet `haroolife-lome` → Settings → Environment Variables → ajouter
   `HAROOLIFE_PREVIEWS` = `1` pour l'environnement **Preview** uniquement.
2. Même écran : les variables nécessaires au jeu pour l'environnement Preview :
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `HAROOLIFE_ENABLED=true`, `NEXT_PUBLIC_HAROOLIFE_ENABLED=true`, `AGRITOGO_API_URL` si
   nécessaire. Utiliser les secrets déjà configurés, ne rien coller dans une conversation.
3. Settings → Git : vérifier que la branche de production est `main` et que le projet suit
   bien ce dépôt ; ne pas cocher de déploiement automatique supplémentaire.
4. Pousser (ou re-déclencher via « Redeploy ») la branche `feat/haroolife-lome-city` : le bot
   Vercel de la PR passe de « Ignored » à « Building » pour `haroolife-lome` seulement.

## Accès depuis un téléphone Android

Par défaut, Vercel protège les préversions par « Vercel Authentication » (le projet `saas`
l'a activée : `all_except_custom_domains`). Un téléphone non connecté à Vercel voit alors une
page de connexion. Deux options, au choix du propriétaire du projet :

- Settings → Deployment Protection → Vercel Authentication : **Only Production Deployments**
  (ou désactivé) pour `haroolife-lome` ; l'URL `https://haroolife-lome-git-feat-haroolife-lome-city-<équipe>.vercel.app`
  devient publique ;
- ou garder la protection et créer un **Shareable Link** depuis le déploiement (menu « Share »),
  valable jusqu'à révocation, à ouvrir sur le téléphone.

URL à tester sur Android une fois le déploiement prêt : `/haroolife/territoire/lome`.

## Ce que la session a pu vérifier

- Compte Vercel relié à la session : `issodo052@gmail.com` (plan Hobby), équipe
  « issodo052-7639's projects », projet `saas` uniquement ; le projet `haroolife-lome`
  répond 403 (autre équipe). Aucun déploiement n'a été déclenché depuis la session.
- `vercel.json` modifié et poussé sur la branche ; sa prise en compte ne peut être observée
  qu'après l'étape 1 ci-dessus.
