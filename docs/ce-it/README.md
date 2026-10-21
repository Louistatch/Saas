# Module CE / itinéraires techniques — lot isolé

Ce lot implémente un catalogue public et un studio de production distincts, sous
`/ce-it` et `/ce-it/studio`. Le DG a autorisé l'intégration dans `main` le
21 octobre 2026. Le module reste **désactivé par défaut**, sans branchement
FedaPay ni migration de production exécutée. La fusion du code ne vaut pas
autorisation d'activation du module, des paiements ou des reversements.

Coordination préalable : [contrat](../agents/ce-it-contract.md), PR documentaire
[#50](https://github.com/Louistatch/Saas/pull/50). Claude a répondu dans sa PR PAYG
[#51](https://github.com/Louistatch/Saas/pull/51), branche `claude/lucid-pascal-fwb714`
à `282ec833` : `partners.id` est conservé, les espaces CE/IT sont réservés à Codex,
Claude garde le webhook et l’intégration financière. Les échanges sont référencés
dans le registre et ces PR, sans importer le code PAYG dans ce lot. Les ajouts Codex
utilisent des ancres distinctes des blocs PAYG actifs pour éviter les conflits
documentaires pendant le développement parallèle.

## Parcours implémentés

- **Public** : culture, propriétaire, région, préfecture et canton ; aucune saisie
  de données de production. Chaque ensemble CE + IT annonce 1 500 XOF. Le bouton
  d’achat reste indisponible tant que le paiement n’est pas branché.
- **Faîtière** : gratuité réservée à son arbre (faîtière, unions, coopératives),
  après PIN et contrôle de la carte agricole, du titulaire et de leur état actuel.
  Compte connecté, carte professionnelle Haroo et simple numéro de carte ne
  remplacent pas cette preuve. Les autres faîtières paient le tarif normal.
- **Opérateur / administration** : aucun accès gratuit lié à une carte.
  Les habilitations CE/IT et mandats sont explicites, révocables et datés ; ils
  ne consomment aucun crédit PAYG et ne changent pas la certification.
- **Production** : charges, rendements, prix, pertes, étapes techniques et sources
  saisis dans un formulaire ; calcul existant `enterprise-budget` réutilisé en
  lecture, génération de deux PDF. Dépôt alternatif des deux PDF existants, au
  maximum 2 Mio chacun, pour rester compatible avec les limites HTTP de Vercel.
- **Science** : contributeur Haroo vérifié invité par le gestionnaire, expertise
  approuvée séparément par l’administration, évaluateur indépendant de l’auteur
  et des contributeurs. Soumission → revue motivée → approbation → publication
  éditoriale. Refus : nouvelle version. Fichiers, empreintes et données d’une
  version sont immuables, y compris contre un UPDATE de service accidentel.
- **Agronomes** : recherche après accès autorisé, culture et toutes les compétences
  requises, puis classement canton / préfecture / région / autre territoire.
  Une disponibilité déclarée ne crée pas de compétence certifiée. Une proposition
  doit être acceptée par l’agronome ; capacité verrouillée pour éviter la double
  acceptation. Le prix des documents ne garantit aucune consultation illimitée.

Les formulaires conservent les champs après un refus : un mauvais PIN n’efface
pas le numéro de carte, une erreur de dépôt n’efface pas le travail agronomique.

## Sécurité et stockage

Tables et fonctions neuves `ceit_*`, droits RLS et RPC bornées. Les mutations de
propriété, habilitation et validation ne sont pas accessibles par UPDATE direct
depuis le navigateur. `profiles` reste la source d’autorisation ; les adhésions
d’opérateur sont relues dans `partner_memberships`, avec le statut de `partners`.

Bucket privé `ceit-documents`, chemins immuables `produit/version/ce.pdf` et
`produit/version/it.pdf`. Une politique **restrictive** bloque les accès directs
anon/authenticated au bucket CE/IT, même en présence d’une politique historique
trop large, sans modifier les droits des autres buckets.

Le serveur vérifie la taille, le type et l’en-tête PDF ; il n’exécute pas les
fichiers. Ce n’est pas un antivirus ni une certification du contenu PDF. Les liens
sont délivrés en téléchargement, après autorisation, pour cinq minutes. Les fichiers
existants sont examinés dans le circuit scientifique avant publication.

L’accès gratuit utilise un jeton aléatoire limité à quinze minutes, jamais dans une
URL ou localStorage ; seule son empreinte est enregistrée. Carte, appartenance et
révocation sont relues pour chaque nouvelle délivrance de liens. Le PIN est traité
par `loginWithCardPin`, avec son verrouillage existant, et n’est ni stocké ni journalisé
par ce module. Les liens déjà signés restent valides pendant leur courte durée.

## Adaptateur de paiement proposé à Claude

`lib/ce-it/payment-adapter.ts` exporte `settleVerifiedCeItPurchase`. Il est réservé
au serveur, **après une relecture FedaPay par Claude**, avec :

```ts
{
  productId, versionId, purchaseId, buyerUserId,
  providerTransactionId, // identifiant de transaction relu chez FedaPay
  amount: 1500,
  currency: 'XOF'
}
```

La RPC `ceit_confirm_purchase` n’est exécutable que par `service_role`. Elle refuse
un montant/devise différent, une version non publiée, un changement de bénéficiaire
ou la réutilisation de la transaction pour un autre achat. Elle renvoie le même
droit pour le même reçu. Son verrou et les contraintes UNIQUE empêchent le double
octroi. Un identifiant d’achat n’est jamais une preuve de téléchargement : la route
`access` exige le compte du bénéficiaire pour `purchased` / `propose-purchased`.

**Aucune transaction ni intention FedaPay n’est créée ici.** Claude doit préparer
le checkout, l’intention dédiée et la quatrième branche de son webhook. Il conserve
l’ordre achats historiques → certification → PAYG ; aucune de ces branches n’est
modifiée par Codex. Le catalogue reste non achetable jusqu’à l’intégration convenue.

`ceit_financial_policy.payment_adapter_enabled` est `false`, de même que
`payouts_enabled`. La commission numérique en points de base est `NULL`, sans
montant implicite de 250 FCFA. L’activation de reversements impose configuration
et approbation ; **aucun exécuteur de reversement n’existe dans ce lot**. La fonction
`digitalSettlement` calcule seulement une répartition configurée ; elle ne verse rien.

## Migrations et activation à valider

Les nouvelles migrations sont :

1. `20261021_160000_ceit_documents.sql` : propriétaires, droits, versions, revue,
   politique financière, catalogue et stockage privé.
2. `20261021_161000_ceit_access_missions.sql` : accès, reçu futur, disponibilité,
   propositions et acceptations de missions.

Elles s’appliquent après les migrations déjà présentes dans `main`. Elles n’altèrent
ni `fiches_techniques`, ni `purchases`, ni les tables PAYG, partenaires ou cartes.
Elles ne dépendent pas de la migration PAYG `20261021_100000`. La nouvelle politique
Storage ne vise que le nouveau bucket. Aucun backfill des documents historiques,
aucun taux de commission approuvé et aucune habilitation ne sont présupposés.

La fusion du code est autorisée. Avant une activation, restent à valider les
migrations sur les cibles de préproduction et de production, le raccordement
des paiements en sandbox et les règles de commission. Les migrations ont été
testées uniquement sur une base locale jetable. `CE_IT_MODULE_ENABLED=true`
ne doit être défini qu’après ces étapes.
Ne pas changer ce réglage en production dans le cadre de cette PR.

La connexion par PIN réutilise le secret **CARD_AUTH_SECRET existant**, nécessaire
au mécanisme de cartes. Ne pas le remplacer ou en créer un autre pour CE/IT : il
sert aussi au hachage des PIN déjà émis. Les essais ci-dessous n’en ont pas besoin,
car ils isolent cette frontière avec des fixtures. Le PIN réel et la connexion au
stockage de préproduction restent à vérifier après autorisation.

Les catalogues et accès historiques `lib/fiches` restent inchangés. Leur règle de
gratuité de plateforme ne doit pas être prise pour celle du nouveau module ; une
migration de catalogue ou un remplacement de liens demande une PR d’intégration.
Navigation, layouts, `package.json`, types Supabase et paiements existants ne sont
pas modifiés. Les types CE/IT générés pourront être ajoutés sans écraser ceux de PAYG.

## Validation locale

```bash
node --test tests/ce-it-sql.test.mjs
node --import tsx --test tests/ce-it-domain.test.ts tests/ce-it-http.test.ts
npx biome check lib/ce-it components/ce-it app/ce-it app/api/ce-it tests/ce-it-* e2e/ce-it*
npm run typecheck
HAROOLIFE_TEST_PORT=3265 HAROOLIFE_SUPABASE_PORT=54425 \
NEXT_PUBLIC_TURNSTILE_SITE_KEY='' PW_CHROMIUM_PATH=/usr/bin/chromium \
npx playwright test --config=e2e/ce-it.config.ts
```

Résultats du 21 octobre 2026 : **15 tests SQL, 20 tests domaine/HTTP**, **6 parcours
d’interface** (3 sur PC, 3 au format Android), typecheck et Biome réussis.
La suite existante passe aussi : **763 tests** (41 + 722), **34 tests de durcissement**,
contrôles statiques de sécurité et compilation de production locale réussis.
Le workflow `ce-it.yml` lance ces tests séparément, sans changer les scripts partagés.

PGlite exécute les vraies migrations CE/IT sur une base locale jetable avec fixtures
du schéma existant : propriétaires, mandats, auto-validation, carte/PIN à la frontière
HTTP, mauvais arbre, cartes invalides, accès expiré, stockage privé, contenu immuable,
double reçu, capacité d’agronome. La concurrence est simulée sur cette instance
embarquée ; elle ne remplace pas une répétition multi-connexions en préproduction.
Les tests navigateur utilisent des réponses API simulées et le stand-in Supabase
local : ils vérifient les interactions et la mise en page, sans transaction réelle,
sans preuve de performance sur téléphone physique ni paiement de production.

[Catalogue mobile](captures/catalogue-mobile.png) · [Studio PC](captures/studio-pc.png).
Toutes les données de ces captures sont des fixtures techniques, non des
référentiels agronomiques validés. Les régions / cantons réels sont lus par le hook
existant ; les cultures, prix et références doivent être renseignés et revus.
