# FaîtièreHub PAYG : architecture cible

Refonte des parcours commerciaux et opérationnels (octobre 2026). Rien n'est recréé : le
domaine Partenaire existant (`partners`, `partner_memberships` owner / manager / agent,
`partner_organization_assignments` et leurs périmètres, `partner_wallets`, grand livre en
ajout seul, `billing_rules` versionnées) porte le nouveau modèle. Une seule migration
additive : `supabase/migrations/20261021_100000_payg_operators.sql`.

## 1. Modèle économique

| Prestation | Prix | Où il vit |
|---|---|---|
| Commission numérique par carte commerciale | 250 FCFA = 1 crédit | `billing_rules.card_commission` |
| Crédits offerts à un nouvel opérateur | 10, une seule fois par opérateur | `platform_settings.payg_welcome_credits` |
| Packs de crédits | 20 = 5 000 · 40 = 10 000 · 100 = 25 000 | `billing_rules.credit_pack_*` |
| Formation | 15 000 FCFA par personne, ou 5 × 3 000 | `billing_rules.training_fee` |
| Carte plastifiée / PVC (indicatif) | 1 200 / 2 500 FCFA, fixés par l'opérateur | affichage seulement |
| Fabrication et livraison FaîtièreHub Print | sur devis, distinct de la commission | `faitierehub_print_orders` |

Aucun abonnement. L'ancien plan « Professional 99 000 FCFA/mois » et l'ancienne carte à
2 000 FCFA (500 coopérative / 1 500 partenaire) sont retirés des pages publiques ; la règle
`physical_card_fee` est close (`effective_to`), l'historique reste lisible.

## 2. Crédits

- L'unité est le **crédit**, pas le franc : un crédit acheté reste « une carte » même si la
  commission change un jour. Le solde vit dans `partner_wallets.credit_balance` (cache) et
  la vérité dans `payg_credit_ledger` (ajout seul, mêmes déclencheurs que
  `partner_wallet_ledger`).
- `welcome_credits` suit la part offerte restante : un débit consomme d'abord les crédits
  offerts. Les commissions **réellement acquises** sont les crédits achetés consommés.
- Un crédit n'appartient qu'à un opérateur (individuel ou institution) ; il n'existe
  aucune fonction de transfert.

### Une carte, un crédit, jamais deux

`payg_issue_member_card()` fait tout dans **une** transaction, sous verrou du portefeuille :

1. rejoue la réponse si la clé d'idempotence est déjà connue (double clic, réseau) ;
2. vérifie l'acteur : membre actif, opérateur actif, mandat `cards.manage` sur la coopérative
   et, pour un agent, affectation personnelle à cette coopérative ;
3. refuse si le producteur a déjà une carte active (aucun crédit pris) ;
4. réserve le crédit (écriture `CONSUME`), crée `card_commissions` puis la carte.

`card_commissions.member_card_id` est **UNIQUE** : une carte ne peut porter qu'une
commission. Toute erreur (numéro déjà pris, crédit insuffisant, droits) annule la
transaction entière : aucun crédit n'est consommé par une opération échouée. Une carte émise
par erreur peut être annulée par un super_admin (`payg_release_card_commission`) : la carte
est révoquée et le crédit rendu par une écriture `RELEASE`.

Ne sont jamais facturés : consulter, scanner un QR, enregistrer un producteur, réimprimer.

### Quota historique de 10 cartes gratuites par coopérative

Conservé tel quel pour les cartes numériques gratuites (services de base). Le déclencheur
`private.enforce_cooperative_card_allowance` laisse désormais passer une carte qui porte une
commission : la 11ᵉ carte commerciale n'est plus bloquée. Une carte est **soit** gratuite au
titre du quota, **soit** payée par un crédit (offert ou acheté), jamais les deux.

## 3. Opérateurs

`partners.operator_kind` : `individual` ou `institutional`.

- **Individuel** : un compte propriétaire, son portefeuille, ses 10 crédits offerts, ses
  coopératives (mandats), son historique, sa formation.
- **Institutionnel** (FENOMAT, MAPTO…) : un portefeuille unique ; 10 crédits offerts à
  l'institution, une fois ; des agents (`partner_memberships.membership_role = 'agent'`)
  qui débitent ce portefeuille. Chaque agent a son identifiant, ses coopératives
  (`partner_agent_cooperatives`, avec ses périmètres), son historique
  (`partner_activity_log`) et sa formation (`training_fee_accounts`).

### Cloisonnement

`has_partner_org_access()` (utilisée par les politiques RLS de `members` et `member_cards`)
garde toutes les règles de production : adhésion active, opérateur certifié ou actif,
**certification de ce compte**, mandat actif dans sa période, périmètre du mandat. Elle en
apprend une : un **agent** n'agit que sur les coopératives qui lui sont affectées, avec les
périmètres de cette affectation ; owner et manager gardent tout le portefeuille de
l'opérateur. Les comptes existants (quatre propriétaires en production) ne changent pas
d'accès. Deux institutions ne partagent jamais rien : tout est filtré par `partner_id`.

Conséquence : chaque agent de FENOMAT doit être certifié (formation soldée, évaluation
réussie) avant de voir les producteurs et d'émettre des cartes. Le gérant de l'institution
pilote agents, crédits et rapports sans accéder aux fiches des producteurs.

Invitations : `partner_agent_invitations` (jeton à usage unique, haché, expiration 14 jours).

## 4. Formation

`training_fee_accounts` (un par personne formée) et `training_fee_payments` (ajout seul).
Montant accepté : un multiple de 3 000 FCFA qui ne dépasse pas le reste dû (donc 15 000
d'un coup ou 5 × 3 000). Le payeur est la personne ou son institution. Payer la formation ne
touche jamais aux crédits PAYG, et réciproquement. Quand le compte est soldé **et**
l'évaluation réussie, la certification est enregistrée (`recordCertificationFeePaid`).

## 5. Impression

- **Self-print** : l'opérateur télécharge la carte (moteur existant `lib/card-engine`) et
  l'imprime. Chaque impression est tracée (`card_print_events`), aucune n'est facturée.
- **FaîtièreHub Print** : commande de cartes déjà commissionnées ; FaîtièreHub établit un
  devis (fabrication + livraison), l'opérateur paie, puis production, expédition,
  livraison. La commission n'est jamais reprise ; la livraison n'est jamais promise gratuite.

## 6. Données personnelles

- `partner_data_agreements` : convention opérateur–coopérative et mandat d'accès,
  information des producteurs, politique photo, signataires, référence du document.
- `data_rectification_requests` : demandes de rectification, de leur dépôt à leur
  résolution.
- `partner_activity_log` : historique des accès et des actions (consultation des
  producteurs, émission, impression).
- La vérification publique d'une carte ne montre plus le village ni le canton (préfecture
  et région suffisent à lever une homonymie).
- Les cartes ne sont pas des pièces d'identité officielles : c'est écrit sur les pages
  publiques et dans les consoles.
- Avant un déploiement réel : examiner les formalités auprès de l'IPDCP (Instance de
  protection des données à caractère personnel, Togo) — déclaration ou autorisation du
  traitement, transfert hors du pays (Supabase), durée de conservation des photos.

## 7. Paiements

Packs de crédits, formation et commandes FaîtièreHub Print passent par
`partner_payment_intents` (nouveaux motifs `credit_pack`, `training_fee`, `print_order`) et
la page FedaPay existante (`createCheckout`). Le règlement relit toujours la transaction
auprès de FedaPay (retour et notification), contrôle montant et devise, puis applique une
seule fois (clé d'idempotence = intention). Un super_admin peut enregistrer un paiement reçu
hors ligne (espèces, virement), avec une note gardée au grand livre.

## 8. Écrans

| Écran | Pour qui | Route |
|---|---|---|
| Accueil, Tarifs | public | `/`, `/pricing` |
| Espace opérateur (parcours) | candidat, opérateur | `/operator` |
| Console de terrain | opérateur individuel, agent, gérant | `/console` |
| Console institutionnelle | owner / manager d'une institution | `/institution` |
| Invitation d'agent | invité | `/invitation/[token]` |
| PAYG super-admin | super_admin | `/admin/payg` |

## 9. Décisions à confirmer par l'équipe

1. Le renouvellement d'une carte active (nouvelle date d'expiration) reste gratuit.
2. Un agent n'émet des cartes qu'une fois certifié (règle de production conservée). Pour un
   lancement rapide, le super_admin peut enregistrer formation, évaluation et paiement.
3. L'accès aux leçons reste ouvert avant paiement ; la certification exige la formation
   soldée et l'évaluation réussie.
4. La convention de données est enregistrée et affichée, mais ne bloque pas encore
   l'émission (`payg_require_data_agreement = false`) : à activer avant le déploiement réel.
