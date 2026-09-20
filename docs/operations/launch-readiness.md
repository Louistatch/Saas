# Exploitation FaîtiereHub — correctifs de lancement

## Architecture conservée

Next.js, Supabase, la hiérarchie faîtière/union/coopérative et les capacités Partenaire restent en place. Les corrigés restent côté serveur. Les paiements utilisent une fonction SQL transactionnelle et la file de notifications existante. Aucun nouveau prestataire n’est requis.

## Déploiement en deux phases

1. Exécuter `npm run typecheck`, `npm run test:hardening`, `npm run security:check -- --static` et le build.
2. Appliquer `atomic_payments_and_notification_claims` avant le code : fonction de règlement, colonnes de bail et créateur des demandes (modifications additives).
3. Déployer le code et attendre READY.
4. Appliquer `launch_access_hardening`, puis `related_member_data_scope`. Ne pas fermer les tables publiques avant que la vérification QR utilise le serveur.
5. Vérifier les politiques et grants depuis Supabase, les pages publiques et le refus 401 des sous-services privés sans session. Tester un QR valide connu, les sessions des différents rôles et un paiement de test dans un environnement isolé.

Les fixtures de tests proviennent du schéma, jamais des données personnelles. PGlite exécute réellement les règles PostgreSQL, mais ne simule pas plusieurs connexions simultanées ni la livraison d’un prestataire externe.

## Notifications

La cadence actuelle reste celle de `vercel.json` (quotidienne), compatible avec l’hébergement existant. Pour un délai inférieur à une journée, choisir et configurer une planification compatible avec l’offre souscrite ; aucun changement payant automatique.

Le worker possède une durée bornée, des baux de cinq minutes, trois tentatives maximum et un contrôle du statut destinataire. `sent` signifie accepté par le prestataire, pas reçu sur le téléphone. Une réponse réseau ambiguë est mise en échec pour rapprochement manuel avant tout renvoi. Un crash après acceptation externe mais avant acquittement local peut toujours créer un doublon à la reprise : l’API d’envoi utilisée n’offre pas ici de clé d’idempotence.

Surveiller les logs `[notifications]`, la taille et l’ancienneté de la file, les échecs terminaux, et configurer une alerte externe. Une réponse HTTP réussie du cron ne constitue pas une preuve de réception d’un SMS.

## Paiements et rapprochement

Les nouveaux règlements enregistrent le statut, la cotisation et les notifications dans une même transaction. Les callbacks vérifient le prestataire ; CinetPay vérifie également montant et devise. Un callback en double ne crée pas de nouvelle notification.

Contrôle historique en lecture seule (ne pas relancer aveuglément des paiements) :

```sql
select count(*) as cotisations_a_rapprocher
from public.payments p join public.cotisations c on c.id=p.cotisation_id
where p.status='success' and c.status not in ('paid','waived');
```

Vérifier chaque anomalie auprès du prestataire, puis corriger la cotisation avec une trace administrative. Ne jamais créditer un paiement uniquement à partir d’un retour navigateur.

## Sauvegarde et récupération

Avant une ouverture publique : vérifier dans Supabase les sauvegardes réellement disponibles, la rétention et l’activation éventuelle de PITR. Restaurer dans un projet isolé ; ne jamais faire un exercice sur la production. Désactiver les cron, webhooks, emails et SMS de cet environnement. Contrôler les volumes, les liens entre tables et les pièces Storage (une sauvegarde SQL ne prouve pas la récupération des fichiers). Consigner date, durée, périmètre restauré et responsable. Définir ensuite les objectifs de perte de données et de durée d’interruption avec l’exploitant.

Le code ne certifie pas que ces opérations ont été réalisées. Ne pas afficher une rétention de 30 jours sans configuration et preuve de restauration.

## Retour arrière

Conserver les trois migrations et la version précédente des fonctions/politiques avant application. Les changements sont additifs et ne suppriment aucune ligne métier. Ne pas rétablir les anciennes policies permissives en cas de problème. Un ancien déploiement qui utilisait les tables publiques ne peut pas être restauré seul : préparer un correctif compatible avec les permissions fermées. Les colonnes nouvelles peuvent rester présentes pendant un retour arrière applicatif.

## Quota Vercel et budget

La suppression de déploiements n’est pas une preuve de baisse de Function Storage. Vérifier Usage > Function Storage, les fonctions volumineuses et les déploiements encore actifs. Le moteur PostgreSQL de tests et les dossiers tests/e2e sont exclus du traçage des fonctions. Ne supprimer aucun déploiement de production ou sauvegarde sans avoir validé un remplaçant. Mesurer la consommation après déploiement ; ne pas promettre un chiffre de réduction non mesuré.

## Validations externes encore nécessaires

- Envoi et réception email/SMS avec des destinataires de test consentants.
- Paiement de test, notification, doublon et rapprochement côté prestataire.
- Protection contre les mots de passe compromis dans Supabase Auth, selon l’offre disponible.
- Planification plus fréquente si requise ; sauvegardes, restauration et alertes de disponibilité.
- Vérification des engagements contractuels, de l’identité de l’éditeur, du contact support et des justificatifs de certification.
- Mesures sur téléphone réel et réseau terrain ; test de charge sur environnement isolé.

## Vérification locale et Sentry

`FAITIERE_LOCAL_VERIFY=1 NEXT_TELEMETRY_DISABLED=1 npm run build -- --webpack` construit sans plugin d’envoi. Les envois de source maps et créations de releases Sentry sont aussi désactivés dans la configuration normale ; la surveillance d’erreurs à l’exécution reste configurée. Le contrôle complet `npm run security:check` doit être lancé dans un environnement disposant des secrets de déploiement. La CI utilise `--static`, qui ne prétend pas vérifier ces secrets.
