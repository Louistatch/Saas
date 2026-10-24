# Marché de proximité et travail agricole

Deux produits sur une seule base d'annonces (`producer_announcements`) :

- **Marché** (`/marche`) : récoltes à vendre et préventes, missions de conseil, services.
- **Travail** (`/travail`) : offres de travail à la journée et ouvriers disponibles.
- **Mon suivi** (`/marche/suivi`) : ce que l'on a publié, les réponses reçues, ses propres
  réponses et les invitations.

## Le mécanisme

```
Annonce publiée ──► « Je suis intéressé / disponible »  ─► réponse envoyée ─┐
      │                                                                    ├─► retenue  ─► numéros échangés
      └──► (offre de travail) l'auteur invite un ouvrier ─► invitation ────┘   déclinée / retirée
```

1. **Publier** : tout compte connecté. Une offre de travail porte un salaire par jour, un
   nombre de postes, une date de début et une durée ; une récolte, une culture, une quantité
   (en kg, saisie possible en sacs de 100 kg), un prix au kg et une date de disponibilité.
   Chaque annonce expire : à la fin du travail pour une offre, 30 jours après la récolte pour
   une prévente, 45 jours sinon.
2. **Répondre** : un compte connecté répond une fois par annonce, avec un message court, une
   quantité (acheteur) et le numéro où le rappeler (prérempli depuis son profil Haroo). 20
   réponses par 24 h au plus.
3. **Inviter** (offres de travail) : l'auteur parcourt les ouvriers disponibles près du lieu
   (prénom et initiale, compétences, note, cantons — jamais de nom de famille ni de téléphone)
   et les invite. 30 invitations par 24 h au plus.
4. **Décider** : l'auteur retient ou décline une réponse ; l'ouvrier accepte ou décline une
   invitation. **Les numéros ne s'échangent qu'à ce moment-là.** Chacun peut retirer ce qu'il
   a lancé tant que l'autre n'a pas répondu (le répondant peut aussi se retirer après).
5. **Suivre** : « Mon suivi » compte les décisions à prendre et les nouvelles (réponse
   retenue, invitation acceptée…), sur la page et dans l'espace Haroo.

Le numéro affiché sur une annonce reste accessible à qui veut appeler directement, mais
seulement à la demande (« Afficher le numéro »), une annonce à la fois, avec une limite par
adresse IP. Il ne figure plus dans la liste des annonces, et le rôle anonyme ne pourra plus le
lire dans la table une fois `20261023_150100_market_anon_phone.sql` appliquée (voir plus bas).

## Ce qui n'est pas fait (et pourquoi)

- **Paiement, séquestre, transport** : pas avant d'avoir vu des mises en relation réelles.
- **SMS et WhatsApp automatiques** : l'envoi existe (Africa's Talking) mais chaque message
  coûte ; à brancher avec l'accord du responsable, sur les décisions (réponse retenue,
  invitation).
- **Langues locales** : les textes sont courts et regroupés pour être traduits ensuite.

## Données personnelles

- Prénom + initiale, compétences, note et cantons d'un ouvrier disponible : visibles des
  comptes connectés uniquement.
- Téléphone d'un répondant : visible de l'auteur seulement après « Retenir ».
- Téléphone de l'auteur : visible du répondant retenu, ou de qui le demande sur l'annonce.

## Base de données

Deux migrations, dans cet ordre :

1. `20261023_150000_market_work.sql` (additive, **appliquée en production le 24/10/2026**) :
   colonnes d'offre de travail, expiration par défaut, table `market_responses` fermée aux
   rôles API (tout passe par des fonctions `SECURITY DEFINER`), fonctions `market_*`. Les
   droits existants ne changent pas : le code déjà en ligne continue de fonctionner.
2. `20261023_150100_market_anon_phone.sql` : retire le téléphone, l'auteur et la fiche membre
   de la lecture anonyme. **À appliquer juste après le déploiement de ce code** : la liste des
   annonces de l'ancien code lit `contact_phone` en anonyme et échouerait.

Retours arrière (dans l'ordre inverse) : `supabase/rollbacks/20261023_150100_market_anon_phone.rollback.sql`
puis `supabase/rollbacks/20261023_150000_market_work.rollback.sql`.
Tests : `tests/market-work-sql.test.mjs` (PGlite).
