# Guide de Tests — KoboCollect Integration

## 1. Tests du Webhook (`/api/webhooks/kobo`)

### Tests fonctionnels

| # | Scénario | Payload | Code | Résultat attendu |
|---|----------|---------|------|-----------------|
| 1 | Création membre réussie | `{ first_name: "Kofi", last_name: "Mensah", phone: "90123456", cooperative: "Espoir" }` | 200 | `{ success: true, action: 'created', member_id: '...' }` |
| 2 | Mise à jour doublon (même phone) | Même phone, nom différent | 200 | `{ success: true, action: 'updated' }` |
| 3 | Sans secret header | Pas de `x-kobo-secret` | 401 | `{ error: 'Unauthorized' }` |
| 4 | Mauvais secret | `x-kobo-secret: wrong` | 401 | `{ error: 'Unauthorized' }` |
| 5 | Secret non configuré (env) | `KOBO_WEBHOOK_SECRET` absent | 503 | `{ error: 'Webhook not configured' }` |
| 6 | Nom manquant | `{ phone: "90123456" }` | 400 | `{ error: 'Nom et prénom sont obligatoires' }` |
| 7 | Coopérative non trouvée | `{ first_name: "A", last_name: "B", cooperative: "Inexistante" }` | 400 | `{ error: 'Coopérative non trouvée' }` |
| 8 | JSON invalide | Body non-JSON | 400 | `{ error: 'Invalid JSON' }` |
| 9 | Données imbriquées (groups) | `{ "group_id/first_name": "Ama" }` | 200 | Flatten fonctionne, membre créé |
| 10 | Avec parcelle | `{ ..., culture: "Maïs", superficie_ha: 2.5 }` | 200 | Membre + parcelle créés |
| 11 | Avec cooperative_id param | `?cooperative_id=uuid` | 200 | Utilise le param comme fallback |
| 12 | Phone formaté Togo | `{ phone: "90123456" }` | 200 | Stocké comme `+228 90 12 34 56` |

### Tests de sécurité

| # | Test | Méthode | Résultat attendu |
|---|------|---------|-----------------|
| 1 | Timing-safe comparison | Mesurer temps réponse avec secret correct vs incorrect | Temps similaire (±5ms) |
| 2 | ILIKE injection | `cooperative: "%_\\%"` | Caractères échappés, pas d'injection |
| 3 | Payload massif | Body > 1MB | Rejeté par Next.js (413) |
| 4 | Champs XSS | `first_name: "<script>alert(1)</script>"` | Stocké tel quel (pas de HTML dans la DB) |

---

## 2. Tests du Sync Service (`lib/kobo/sync-service.ts`)

### `fetchKoboSubmissions()`

| # | Scénario | Entrée | Résultat attendu |
|---|----------|--------|-----------------|
| 1 | Fetch réussi | Token valide, form_id valide | Array de submissions |
| 2 | Token invalide | Token expiré | Throw Error avec status 401 |
| 3 | Form non trouvé | form_id inexistant | Throw Error avec status 404 |
| 4 | Timeout réseau | API ne répond pas en 30s | Throw AbortError |
| 5 | Avec filtre since | `since='2025-01-01'` | Seules les submissions après cette date |
| 6 | Réponse vide | Aucune nouvelle submission | Array vide `[]` |
| 7 | Réponse > 1000 | Plus de 1000 submissions | Limité à 1000 (param limit) |

### `processKoboSubmissions()`

| # | Scénario | Entrée | Résultat attendu |
|---|----------|--------|-----------------|
| 1 | Batch de 10 nouveaux | 10 submissions uniques | `{ created: 10, updated: 0, failed: 0 }` |
| 2 | Doublons (même phone) | 5 avec phone existant | `{ updated: 5 }` |
| 3 | Déjà traité (queue completed) | submission_id déjà completed | `{ skipped: N }` |
| 4 | Nom manquant | Submission sans first_name | `{ failed: 1, errors: [...] }` |
| 5 | Erreur DB insert | Contrainte violée | `{ failed: 1 }`, ajouté à la queue |
| 6 | Avec parcelle | culture + superficie présents | Parcelle créée en plus du membre |
| 7 | Audit log | Chaque création | Entrée dans audit_logs |
| 8 | Queue tracking | Chaque submission | Entrée dans kobo_sync_queue |

### `retryFailedSubmissions()`

| # | Scénario | État queue | Résultat attendu |
|---|----------|-----------|-----------------|
| 1 | Aucun failed | Queue vide | `{ total: 0 }` |
| 2 | 5 failed, < max attempts | attempts < 5 | Retraitement des 5 |
| 3 | Failed, max attempts atteint | attempts = 5 | Non retraité |
| 4 | next_retry_at dans le futur | Backoff pas encore écoulé | Non retraité |
| 5 | Retry réussit | Erreur temporaire résolue | Status → completed |

---

## 3. Tests de la Sync API (`/api/integrations/kobo/sync`)

| # | Scénario | Requête | Code | Résultat |
|---|----------|---------|------|----------|
| 1 | Sync complète réussie | Admin authentifié, Kobo connecté | 200 | `{ success: true, sync: {...}, retries: {...} }` |
| 2 | Non authentifié | Pas de session | 401 | Error |
| 3 | Mauvais rôle (member) | role=member | 403 | Error |
| 4 | Admin d'une autre coop | Admin coop A, sync coop B | 403 | Error |
| 5 | Kobo non connecté | status=disconnected | 400 | Error |
| 6 | API key manquante | config.api_key=null | 400 | Error |
| 7 | Erreur API Kobo | Token expiré | 500 | `{ error: 'Sync failed' }`, status→error |
| 8 | cooperative_id invalide | `{ cooperative_id: 'abc' }` | 400 | Error |

---

## 4. Tests XLSForm (KoboCollect Android)

### Scénarios terrain

| # | Test | Procédure | Validation |
|---|------|-----------|-----------|
| 1 | Formulaire complet | Remplir toutes les sections | Soumission réussie |
| 2 | Champs obligatoires | Laisser prénom vide, soumettre | Message d'erreur inline |
| 3 | Validation téléphone | Entrer "abc" | Rejeté, message "Entrez un numéro valide" |
| 4 | Validation âge | Entrer 5 | Rejeté, message "entre 15 et 100" |
| 5 | Repeat group parcelles | Ajouter 3 parcelles | Les 3 sont enregistrées |
| 6 | Calcul superficie totale | 2 parcelles de 1.5ha et 2ha | Affiche 3.5 ha |
| 7 | Calcul rendement | 1000kg sur 2ha | Affiche 500 kg/ha |
| 8 | Logique conditionnelle | cooperative_id='autre' | Champ "Nom coopérative" apparaît |
| 9 | Logique cotisation | cotisation_a_jour='oui' | Champs montant et date apparaissent |
| 10 | Photo | Prendre une photo | Photo attachée à la soumission |
| 11 | GPS | Capturer position | Coordonnées enregistrées |
| 12 | QR code | Scanner un QR | Valeur capturée |
| 13 | Signature | Signer | Image signature attachée |
| 14 | Résumé final | Fin du formulaire | Note avec résumé correct |

### Tests offline

| # | Test | Procédure | Validation |
|---|------|-----------|-----------|
| 1 | Remplissage offline | Mode avion activé, remplir formulaire | Formulaire sauvegardé localement |
| 2 | Sync au retour | Désactiver mode avion | Soumission envoyée à KoboToolbox |
| 3 | Multiple offline | 5 formulaires en offline | Les 5 sont envoyés au retour |
| 4 | Interruption sync | Couper connexion pendant sync | Retry automatique |
| 5 | Appareil bas de gamme | Android 8, 2GB RAM | Formulaire fluide, pas de crash |
| 6 | Photos offline | Prendre photos sans connexion | Photos uploadées au sync |

### Tests d'import massif

| # | Test | Volume | Validation |
|---|------|--------|-----------|
| 1 | Import 50 membres | 50 soumissions simultanées | Tous créés, pas de doublon |
| 2 | Import 200 membres | 200 soumissions | Traitement < 2min |
| 3 | Import 1000 membres | 1000 soumissions | Traitement < 10min, retry queue gère les échecs |
| 4 | Doublons dans le batch | 10 avec même phone | 1 créé + 9 updated |
| 5 | Erreurs réseau pendant import | Couper connexion à 50% | Queue retry reprend |

---

## 5. Tests de la Retry Queue

### Scénarios de résilience

| # | Scénario | Simulation | Résultat attendu |
|---|----------|-----------|-----------------|
| 1 | Erreur temporaire DB | Simuler timeout Supabase | Retry après 30s |
| 2 | Erreur permanente | Contrainte FK violée | Max 5 attempts puis abandon |
| 3 | Backoff exponentiel | Échecs successifs | Délais: 30s, 60s, 120s, 240s, 300s |
| 4 | Dédupliquation | Même submission_id 2 fois | Une seule entrée dans la queue |
| 5 | Concurrent processing | 2 syncs simultanées | Pas de doublon grâce à UNIQUE index |
| 6 | Recovery après panne | Redémarrage serveur | Queue reprend au prochain sync |

---

## 6. Tests du Field Mapping

| # | Config mapping | Données Kobo | Résultat |
|---|---------------|-------------|----------|
| 1 | `{ first_name: 'prenom' }` | `{ prenom: 'Ama' }` | first_name = 'Ama' |
| 2 | `{ first_name: 'nom_complet' }` | `{ nom_complet: 'Ama Koffi' }` | first_name = 'Ama Koffi' |
| 3 | `{ phone: 'tel' }` | `{ tel: '90123456' }` | phone = '+228 90 12 34 56' |
| 4 | Mapping par défaut | `{ prenom: 'X', nom: 'Y' }` | Fonctionne sans config |
| 5 | Champ manquant | Mapping vers champ inexistant | null, pas d'erreur |
| 6 | Données imbriquées | `{ "group/prenom": "Ama" }` | Flatten puis mapping |

---

## 7. Tests de monitoring

### Logs à vérifier

| Événement | Log attendu | Niveau |
|-----------|-------------|--------|
| Submission reçue | `KoboCollect submission received` + keys | INFO |
| Membre créé | `Member created from KoboCollect` + id + name | INFO |
| Membre mis à jour (doublon) | `Member updated (duplicate phone)` + id | INFO |
| Sync démarrée | `Fetched Kobo submissions` + count | INFO |
| Erreur sync | `Kobo sync failed` + error | ERROR |
| Webhook non configuré | `KOBO_WEBHOOK_SECRET is not configured` | ERROR |
| Erreur processing | `Webhook processing error` | ERROR |

### Audit logs à vérifier

| Action | entity_type | metadata |
|--------|-------------|----------|
| `member.create.kobo` | member | `{ source: 'kobocollect', submission_id }` |
| `member.sync.kobo` | member | `{ submission_id, source: 'kobo_sync' }` |

---

## 8. Procédure de test complète

### Pré-requis

1. Compte KoboToolbox avec formulaire déployé
2. `KOBO_WEBHOOK_SECRET` configuré dans `.env.local`
3. `INTEGRATION_SECRET_KEY` configuré (pour chiffrement API key)
4. Au moins une coopérative avec intégration Kobo configurée
5. KoboCollect installé sur un appareil Android

### Étapes

```
1. CONFIGURATION
   □ Aller sur /dashboard/integrations/kobo
   □ Entrer API token KoboToolbox
   □ Entrer Form ID
   □ Configurer le field mapping
   □ Sauvegarder → status "Connected"

2. WEBHOOK (temps réel)
   □ Configurer le webhook dans KoboToolbox:
     URL: https://app.faitierehub.com/api/webhooks/kobo?cooperative_id=XXX
     Headers: x-kobo-secret: VOTRE_SECRET
   □ Soumettre un formulaire depuis KoboCollect
   □ Vérifier: membre créé dans /dashboard/members
   □ Vérifier: audit_log créé

3. SYNC MANUELLE
   □ Aller sur /dashboard/kobo-setup
   □ Cliquer "Sync Now" (ou appeler POST /api/integrations/kobo/sync)
   □ Vérifier: nouveaux membres importés
   □ Vérifier: doublons mis à jour (pas dupliqués)
   □ Vérifier: last_sync_at mis à jour

4. RETRY QUEUE
   □ Simuler une erreur (ex: supprimer la coopérative temporairement)
   □ Envoyer une soumission → doit échouer
   □ Vérifier: entrée dans kobo_sync_queue avec status='failed'
   □ Corriger l'erreur
   □ Relancer sync → retry queue traitée
   □ Vérifier: status='completed'

5. OFFLINE
   □ Activer mode avion sur l'appareil
   □ Remplir 3 formulaires
   □ Désactiver mode avion
   □ Vérifier: les 3 soumissions arrivent
   □ Vérifier: les 3 membres sont créés

6. IMPORT MASSIF
   □ Préparer 50 soumissions (via API KoboToolbox ou terrain)
   □ Lancer sync
   □ Vérifier: 50 membres créés en < 2min
   □ Vérifier: pas de doublons
   □ Vérifier: parcelles créées si données présentes
```

---

## 9. Commandes utiles

```bash
# Vérifier la queue de sync
SELECT status, count(*) FROM kobo_sync_queue 
WHERE cooperative_id = 'XXX' GROUP BY status;

# Voir les erreurs récentes
SELECT submission_id, error_message, attempts, created_at 
FROM kobo_sync_queue 
WHERE status = 'failed' AND cooperative_id = 'XXX'
ORDER BY created_at DESC LIMIT 20;

# Membres créés par Kobo (dernières 24h)
SELECT id, first_name, last_name, created_at 
FROM members 
WHERE cooperative_id = 'XXX' 
AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;

# Audit logs Kobo
SELECT action, entity_id, metadata, created_at 
FROM audit_logs 
WHERE action LIKE '%kobo%' 
ORDER BY created_at DESC LIMIT 20;
```
