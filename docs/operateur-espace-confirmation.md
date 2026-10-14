# Espace Opérateur : arrivée après la confirmation d'e-mail, nouvel écran, partage

Date : 14 octobre 2026. Branche `fix/operator-espace-confirmation` (à partir de `main` 8212af2).
Rien n'est fusionné ni déployé.

## Le bug

Un candidat opérateur crée son compte, reçoit « Confirmez votre compte FaîtiereHub », clique,
et arrive sur le **tableau de bord coopérative, vide**, comme si rien ne s'était passé. Ce n'est
qu'à la connexion suivante qu'il voit son Espace Opérateur.

Cause : les deux routes qui reçoivent le lien de confirmation envoyaient tout compte sans
organisation vers `/dashboard`.

- `app/auth/confirm/route.ts` (modèle Supabase « Confirm signup ») lisait `profiles` mais ne
  connaissait que les couches organisation et Haroo ; un compte opérateur a `role = none` et
  `haroo_type = NULL`, donc `/dashboard`.
- `app/auth/callback/route.ts` (lien avec `code`, utilisé par le renvoi d'e-mail) envoyait
  `type=signup` directement sur `/dashboard?welcome=1`, sans rien lire.

La page de connexion, elle, interrogeait déjà le dossier opérateur (`/api/account/partner-status`),
d'où la différence entre le premier passage et le second.

## La correction

- `lib/account/journey.ts` : `accountHomeUrl(user, { operator })` connaît l'espace Opérateur,
  après l'organisation et Haroo (même ordre que la page de connexion et le middleware).
- `lib/account/confirmed-home.ts` (serveur) : lit `profiles` puis `partner_memberships`
  (adhésion active) et rend le chemin de l'espace. Utilisé par les deux routes de confirmation.
- `app/dashboard/layout.tsx` : un compte sans organisation ni Haroo qui arrive quand même sur le
  tableau de bord (ancien lien, favori) est renvoyé vers `/operator` s'il a un dossier opérateur,
  avec le même écran d'attente que la redirection Haroo.

Aucune migration, aucune donnée modifiée, aucun changement pour les comptes d'organisation ou
Haroo (tests unitaires sur la règle d'accueil : organisation, Haroo, super_admin, opérateur).

## Le nouvel écran (`app/operator/page.tsx`)

Dessiné pour la question que se pose l'opérateur sur son téléphone : « où j'en suis, et je
fais quoi maintenant ? ».

- **Carte d'opérateur** en vert profond (celui de la console de validation installée sur le
  téléphone), avec le nom du dossier, le code imprimé comme sur une carte physique, l'état en
  une phrase et la prochaine action en une phrase.
- **Le parcours tracé comme une route** (`components/operator/journey.tsx`) : étapes faites
  (coche, date), étape en cours (numéro cerclé, action juste dessous : commencer la formation,
  payer), étapes à venir. Une seule liste, pas d'empilement de cartes ; le portefeuille et la
  file d'impression n'apparaissent qu'une fois certifié ou actif.
- **Faire connaître la formation** (`components/operator/share-training.tsx`) : « Partager sur
  WhatsApp » ouvre le partage natif du téléphone quand il existe, sinon `wa.me` avec le message
  prêt ; « Copier le lien ». Le lien mène à l'inscription publique `/auth/signup/operator`.
  Présent sur l'espace et sur la page de formation. Pas de code de parrainage : la certification
  ne se gagne pas en recrutant.
- Textes : phrases simples, pas d'étiquettes en capitales, pas de jargon (« PAYG » reste sur le
  portefeuille existant).

### Mouvement (skill `ui-motion`, `.claude/skills/ui-motion/SKILL.md`)

Une skill projet a été écrite pour que toute animation du produit suive les mêmes règles :
tw-animate-css et Tailwind seulement, quatre familles de mouvement (arrivée, progression,
réponse à une action, attente), durées, propriétés autorisées, `prefers-reduced-motion`.
Appliquée ici : une seule entrée orchestrée (carte, puis parcours, puis partage, 70 ms
d'écart), la ligne du parcours qui se trace jusqu'à l'étape en cours (800 ms), le point de
l'étape en cours qui respire. Avec « réduire les animations », tout est dessiné d'emblée
(capture `candidat-android-mouvement-reduit.png`). La boucle d'évaluation de la skill
(skill-creator) n'a pas été exécutée : la skill a été appliquée directement à cet écran.

## Validation

| Contrôle | Résultat |
|---|---|
| Typecheck | 0 erreur |
| Biome | 0 erreur sur les fichiers touchés (3 erreurs préexistantes sur `main` dans ces mêmes fichiers disparaissent) |
| Tests unitaires | 185 / 185, dont 3 nouveaux (`tests/account-home.test.ts` : règle d'accueil, message WhatsApp) |
| Captures (build de production local, API opérateur simulée) | `docs/captures/operateur/` : candidat et certifié, Android et bureau, mouvement réduit |

Ce qui n'a **pas** été vérifié ici : le clic réel sur un e-mail de confirmation en production
(nécessite un compte de test et `REQUIRE_EMAIL_CONFIRMATION=true`). À faire après fusion avec une
inscription opérateur de test : le lien doit ouvrir directement l'Espace Opérateur.
