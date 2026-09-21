# Allocation de cartes gratuites

L’offre Starter comprend 10 cartes numériques par coopérative, au total (pas par mois ni par utilisateur). Les cartes physiques restent soumises à leur tarification d’impression distincte. Les profils Haroo indépendants, sans coopérative, ne consomment pas ce quota.

Le compteur privé `private.cooperative_card_allowances` est initialisé avec toutes les cartes existantes, même révoquées ou supprimées logiquement. Aucun enregistrement métier n’est supprimé. Les coopératives ayant déjà dépassé 10 gardent leurs cartes mais ne peuvent pas en émettre davantage sans extension.

Chaque insertion consomme une unité dans la même transaction. Un échec annule la consommation. Le compteur est mis à jour sous verrou de ligne par un UPDATE conditionnel, y compris pour les appels privilégiés. Les suppressions ne rendent pas de crédit. Le renouvellement par mise à jour de la date ne consomme rien ; la création d’une nouvelle ligne consomme une unité. L’identité d’une carte émise est immuable pour empêcher son transfert vers un autre membre ou une autre organisation.

## Extension validée

La plateforme n’a pas encore de souscriptions organisationnelles reliées à un prestataire de paiement. Ne jamais déduire un droit payant du texte affiché, du navigateur ou d’un paramètre utilisateur. Après validation administrative d’une extension, un administrateur de base peut augmenter `card_limit` pour l’identifiant de coopérative vérifié et enregistrer `adjustment_reason` et `updated_at`. Aucun accès client à cette table n’est accordé. Une future intégration de facturation devra mettre à jour ce droit après confirmation du paiement côté serveur.

## Déploiement

Déployer d’abord le code qui affiche les erreurs de création par lot, puis appliquer `free_card_allowance`. Le script prend un verrou pendant l’initialisation pour éviter que des émissions échappent au compteur. Vérifier la présence du trigger, les permissions de la table privée et l’absence de baisse des effectifs des cartes. Les tests PostgreSQL isolés couvrent 10/11, les lots, l’échec transactionnel, les données historiques, le renouvellement et les extensions.
