# Audit de l'espace super administrateur (11/10/2026) et Admin 5.0

## Ce qui est solide
- Accès : `app/admin/layout.tsx` exige `super_admin` côté serveur (`requireRole`) avant tout rendu, en plus du middleware et de la RLS.
- Validation des dossiers, cartes et PIN, opérateurs et mandats, comptes d'exploitation, gains, suivi du site : écrans présents.

## Manques constatés
| Constat | Gravité | Statut |
|---|---|---|
| Messages de contact et demandes d'accès (`contact_messages`) : aucun écran pour les lire (1 message « nouveau » en attente) | Haute | **Corrigé** : `/admin/messages` |
| Pas de vue « ce qui attend une action » : il fallait ouvrir chaque page | Haute | **Corrigé** : centre de pilotage `/admin` |
| Validation des dossiers absente du menu admin | Haute | Corrigé (menu « Dossiers à valider ») |
| Lien « Statistiques » mort (redirige vers `/admin`) | Moyenne | **Corrigé** : retiré |
| Menu plat de 16 entrées, sans regroupement | Moyenne | **Corrigé** : 5 thèmes |
| Commandes de cartes (`card_print_orders`), demandes de crédit, paiements opérateurs bloqués, notifications en échec : aucun compteur admin | Moyenne | **Corrigé** : comptés dans le centre de pilotage (lien vers la page la plus proche) |
| Rôles : la page Utilisateurs modifie `role` et coopérative, pas le type Haroo (ouvrier, acheteur, agronome) | Moyenne | **Corrigé** : type Haroo modifiable, fiche créée si besoin |
| Changements de rôle écrits depuis le navigateur, sans journal d'audit dédié | Moyenne | **Corrigé** : `PATCH /api/admin/users/[id]`, journal `audit_logs` et historique dans la fiche ; pas de retrait de son propre rôle ni du dernier super_admin |
| Coopératives : **suppression définitive depuis le navigateur**, avec effacement en cascade des membres, exploitations et cartes | **Critique** | **Corrigé** : archivage réversible (`deleted_at`) par `/api/admin/cooperatives`, journalisé, refusé tant que des organisations rattachées sont actives ; filtre « Archivées » avec restauration |
| Coopératives : création et modification depuis le navigateur, sans contrôle de hiérarchie ni journal | Moyenne | **Corrigé** : routes serveur, contrôle faîtière → union → coopérative, journal |
| Paramètres : interrupteurs sans effet (maintenance, HTTPS, 2FA, liste IP, limitation de débit) enregistrés mais lus par aucun code | Haute (fausse sécurité) | **Corrigé** : remplacés par l'état réel de la sécurité ; seule la note d'examen des opérateurs (réellement utilisée) reste réglable, par `/api/admin/settings`, journalisée |
| Pas d'écran dédié aux commandes d'impression de cartes ni aux demandes de crédit | Basse | **Corrigé** : `/admin/commandes-cartes` (progression demande → livraison) et `/admin/credits`, en lecture seule |
| Un dossier « rejeté » (pièces demandées) ne repasse peut-être pas seul en attente quand il est complété | À vérifier | À vérifier |

## Admin 5.0
- `/admin` : centre de pilotage. File « À traiter » classée par urgence (`/api/admin/inbox`), pouls de la plateforme, état du pilote HarooLife. Actualisation toutes les 2 min.
- `/admin/messages` : boîte de réception (répondre par e-mail, marquer comme traité).
- Menu en 5 thèmes avec pastilles de compteurs : Pilotage, Organisations et comptes, Haroo et cartes, Économie, Plateforme.
- L'ancienne vue d'ensemble (panneaux AgriTogo/Agrismat, performance des coopératives) reste dans l'historique Git ; ces informations sont sur leurs pages respectives.

## Encore ouvert
- Double authentification des super administrateurs : à activer dans Supabase Auth (MFA).
- Pages AgriTogo, Agrismat, Haroo, Opérateurs, Comptes d'exploitation, Gains : lectures et écritures passent déjà par des routes serveur ; restyle 5.0 non fait.
- Repasser automatiquement en attente un dossier complété après une demande de pièces : à vérifier.
