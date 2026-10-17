# Arrivée HarooLife : vérification anti-robot

## Incident constaté le 17 octobre 2026

À l’étape Logement, « Emménager » pouvait renvoyer « Vérification anti-robot à refaire » sans
contrôle visible pour récupérer. La configuration de production a été vérifiée en lecture seule :
Supabase exige Turnstile, les connexions anonymes sont autorisées et la clé publique est bien
présente dans le bundle du site.

Un premier diagnostic direct à Siteverify a renvoyé `invalid-input-secret` avec la valeur renvoyée
par l’API de gestion. Ce résultat n’a pas été retenu : cette valeur n’est pas une preuve du secret
réellement utilisé par Auth. Le diagnostic fait ensuite par le véritable service Supabase Auth,
avec un identifiant fictif et un jeton volontairement invalide, a renvoyé le refus attendu
`captcha_failed / invalid-input-response`. Aucun compte n’a été créé, aucune clé n’a été modifiée.
Il n’est donc pas établi qu’un changement de secret soit nécessaire. La demande initiale de le
remplacer a été retirée ; la correction porte sur le cycle de vérification du client.

Le hook client considérait une erreur Cloudflare comme une autorisation de soumettre sans jeton.
Supabase refusait alors la demande. De plus, un chargement de script en échec ne pouvait pas
être relancé par le joueur. Ces défauts expliquent une boucle d’erreurs ; la capture seule ne
permet pas de déterminer l’erreur Cloudflare précise du téléphone.

## Correction

- La demande protégée attend un jeton valide. Une panne de Cloudflare ne contourne jamais
  l’anti-robot, y compris lors d’une soumission par Entrée.
- Le contrôle, son état et « Relancer la vérification » restent visibles au-dessus du bouton.
  Le pied de l’assistant occupe sa place dans la mise en page : il ne masque pas les logements.
- Un téléchargement du script bloqué expire après 45 secondes et peut être retenté. L’ancien
  délai de 15 secondes pouvait interrompre un chargement légitime sur une connexion lente.
- Une expiration, un délai de challenge dépassé ou un refus Supabase déclenche un nouveau contrôle.
  Un jeton est aussi renouvelé après 4 min 30 ; sa date est revérifiée juste avant Auth, pour les
  onglets suspendus dont les temporisateurs et callbacks peuvent être retardés.
- Les choix de l’assistant restent dans le composant pendant toutes ces reprises. Aucun compte,
  nom d’utilisateur ou logement n’est créé tant que l’authentification n’a pas réussi.
- Une interruption réseau pendant la création du visiteur rend la main au joueur.

La connexion, le renvoi de confirmation et le mot de passe oublié utilisent le même contrôle.
Les comptes déjà connectés n’ont pas à refaire un CAPTCHA pour reprendre leur partie.

## Seconde capture : le fournisseur échoue toujours

La seconde capture montre que le widget échoue avant l’envoi à Supabase. L’amélioration de
reprise initiale n’a donc pas suffi. Il ne faut pas présenter les tests simulés comme une preuve
de réussite sur le téléphone concerné.

Le code exact renvoyé par Cloudflare est désormais visible et signalé à `/api/errors`, donc
consultable dans le suivi administrateur (`app_errors`). Le message ne contient que la catégorie
et le code public, jamais le jeton, les clés, l’identité ou les choix du joueur. Les répétitions
du même code dans le même écran sont dédupliquées.

Les codes suivent la documentation officielle :
<https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/>.

| Code | Intervention |
| --- | --- |
| `110200`, `400021` | Vérifier le domaine autorisé dans le widget Cloudflare. |
| `110100`, `110110`, `400020`, `400070` | Vérifier la clé publique et l’état du widget. |
| `200100`, `110600` | Vérifier l’heure du téléphone, le cache et les délais du challenge. |
| `200500`, `script-load`, `script-timeout` | Vérifier le chargement du script/iframe et les blocages réseau. |
| `300…`, `600…` | Refus du challenge : étudier le contexte navigateur et la configuration du widget. |

Le blocage n’est pas déclaré résolu tant qu’une vérification réelle du téléphone n’a pas abouti
ou fourni le code permettant de corriger la configuration concernée. Les options d’affichage du
client ne rendent pas visible un widget configuré « Invisible » chez Cloudflare : ce mode se
change dans le tableau de bord Cloudflare, pas en changeant `appearance` dans React.

La bibliothèque Cloudflare réelle a aussi été chargée sur le serveur local, avec la clé publique
officielle de test : le vrai widget a terminé la vérification et activé le bouton de connexion.
Aucun formulaire n’a été soumis. Ce contrôle valide le contrat JavaScript réel, mais ne valide
pas le widget de production ni la connexion du téléphone du joueur.

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
