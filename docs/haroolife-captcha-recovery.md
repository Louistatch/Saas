# Arrivée HarooLife : vérification anti-robot

## Incident constaté le 17 octobre 2026

À l’étape Logement, « Emménager » pouvait renvoyer « Vérification anti-robot à refaire » sans
contrôle visible pour récupérer. La configuration de production a été vérifiée en lecture seule :
Supabase exige Turnstile, les connexions anonymes sont autorisées et la clé publique est bien
présente dans le bundle du site.

Un appel de diagnostic serveur à Siteverify, avec une réponse volontairement invalide et sans
création de compte, a également renvoyé `invalid-input-secret` : Cloudflare refuse le secret
actuellement enregistré dans Supabase. Le propriétaire doit y remettre le secret du widget
correspondant à la clé publique Vercel ; une modification du code ne peut pas remplacer ce secret.

Le hook client considérait une erreur Cloudflare comme une autorisation de soumettre sans jeton.
Supabase refusait alors la demande. De plus, un chargement de script en échec ne pouvait pas
être relancé par le joueur. Ces défauts expliquent une boucle d’erreurs ; la capture seule ne
permet pas de déterminer l’erreur Cloudflare précise du téléphone.

## Correction

- La demande protégée attend un jeton valide. Une panne de Cloudflare ne contourne jamais
  l’anti-robot, y compris lors d’une soumission par Entrée.
- Le contrôle, son état et « Relancer la vérification » restent visibles au-dessus du bouton.
  Le pied de l’assistant occupe sa place dans la mise en page : il ne masque pas les logements.
- Un téléchargement du script bloqué expire après 15 secondes et peut être retenté.
- Une expiration, un délai de challenge dépassé ou un refus Supabase déclenche un nouveau contrôle.
  Un jeton est aussi renouvelé après 4 min 30 ; sa date est revérifiée juste avant Auth, pour les
  onglets suspendus dont les temporisateurs et callbacks peuvent être retardés.
- Les choix de l’assistant restent dans le composant pendant toutes ces reprises. Aucun compte,
  nom d’utilisateur ou logement n’est créé tant que l’authentification n’a pas réussi.
- Une interruption réseau pendant la création du visiteur rend la main au joueur.

La connexion, le renvoi de confirmation et le mot de passe oublié utilisent le même contrôle.
Les comptes déjà connectés n’ont pas à refaire un CAPTCHA pour reprendre leur partie.

## Configuration à conserver

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` est une clé publique intégrée au build Vercel. Toute modification
nécessite un redéploiement. Le secret correspondant reste exclusivement dans les paramètres
Auth/CAPTCHA de Supabase. Le widget Cloudflare doit autoriser `faitierehub.com` et
`www.faitierehub.com`. Ne pas désactiver le CAPTCHA pour résoudre un problème de domaine ou
de paire de clés ; ne pas créer de visiteurs via un contournement avec la clé service.

Le réseau de test cloud ne permet pas de prouver la réussite d’un challenge humain réel : un
appel interne Cloudflare est refusé par le proxy. La vérification publique n’a créé aucun compte.
Les tests de panne, reprise, jeton refusé et expiration utilisent un double local et un faux
Supabase qui exige aussi le jeton quand le CAPTCHA est activé.

## Tests reproductibles

```bash
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
HAROOLIFE_TEST_PORT=3212 HAROOLIFE_SUPABASE_PORT=54378 \
PW_CHROMIUM_PATH=/usr/bin/chromium \
npx playwright test --config=e2e/lome-captcha.config.ts \
  lome-captcha.spec.ts --project=desktop --project=mobile-android
```

La clé indiquée est la clé officielle de test Cloudflare ; aucun secret ni compte de production
n’est utilisé. Le script Cloudflare est remplacé dans le navigateur par le double de test.
