# Registre des preuves de traction

Relevé du 11 octobre 2026 sur la base de production (requêtes en lecture seule, skill
`traction-tracking`). Exclus : organisation de démonstration, fiches archivées, doublons fusionnés.

Étiquettes : **FAIT** (requête exécutée), **DÉCLARATION** (fondateur), **MANQUANT**.

| Indicateur | Valeur | Étiquette | Source |
|---|---|---|---|
| Revenus encaissés par FaîtiereHub | **0** | FAIT | `payments`, `card_print_orders`, `organization_earnings`, `partner_payment_intents`, `partner_wallet_ledger`, `partner_wallets`, `cotisations` : 0 ligne chacune |
| Cotisations encaissées via la plateforme | 0 | FAIT | `cotisations` vide |
| Organisations réelles enregistrées | 16 : 1 faîtière (FENOMAT), 5 unions, 10 coopératives | FAIT | `cooperatives` (non archivées, hors démo) |
| … dont avec au moins un membre | 4 : HAROFEMA (6), Espoir de Kpèlèwouaï (5), COOMARA-Kpalimé (2), FENOMAT (2) | FAIT | `members` non archivés |
| Membres inscrits | 15 | FAIT | `members` |
| Cartes membres | 12 émises : 10 actives, 1 révoquée, 1 carte agronome | FAIT | `member_cards` |
| Scans de cartes | 143 au total : juin 88, juillet 6, septembre 7, octobre 42 (au 11) | FAIT | `member_access_logs` |
| Organisations dont un administrateur s'est connecté sur 30 jours | 0 organisation réelle (seule la coopérative de démonstration) | FAIT | `auth.users.last_sign_in_at` |
| Dernière connexion d'un administrateur de FENOMAT | 5 juin 2026 | FAIT | idem |
| Comptes utilisateurs | 18, dont 8 connectés sur 30 jours (inclut le super_admin et les comptes de démonstration) | FAIT | `auth.users` |
| Professionnels Haroo | 7 (2 ouvriers, 2 acheteurs, 3 agronomes) | FAIT | profils Haroo |
| Demandes d'accès reçues | 1 (28/09/2026, traitée) | FAIT | `contact_messages` |
| « 1 organisation active » | — | DÉCLARATION | Non confirmé par la définition retenue (connexion d'un administrateur + action métier sur 30 jours). Si l'organisation visée est FENOMAT : aucune connexion d'administrateur depuis le 5 juin. |
| Partenariat FENOMAT (convention, contrat) | — | MANQUANT | cité dans `docs/monetization/plan-1m-fcfa-decembre.md`, sans pièce |
| Lettres d'intention, contrats, factures | — | MANQUANT | |

## Lecture honnête

Le produit est en place et a été utilisé sur le terrain : des cartes sont scannées depuis juin, et
le pic de juin correspond aux premières inscriptions par Kobo. Mais aucune organisation n'a payé,
aucune cotisation ne passe par la plateforme, et aucun administrateur de coopérative réelle ne s'est
connecté depuis 30 jours. Le premier jalon à démontrer est **l'usage récurrent par des
organisations**, avant même le revenu.

## À tenir chaque mois

Relancer les requêtes du skill `traction-tracking` le 1er du mois et ajouter une colonne datée.
Joindre les pièces (conventions, factures, relevés FedaPay/CinetPay) dans la data room.
