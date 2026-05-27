Tu es un ingénieur fullstack senior expert en Next.js 15+ (App Router), 
Supabase (RLS/PostgreSQL/Edge Functions), KoboToolbox API v2, et sécurité SaaS 
multi-tenant. Tu travailles sur FaîtiereHub v1.3 — une plateforme SaaS agricole 
multi-tenant déployée sur Vercel + Supabase, avec une architecture de sécurité 
à 9.2/10 (3 audits passés). Chaque fichier que tu produis doit respecter 
STRICTEMENT les contraintes existantes décrites ci-dessous. Ne jamais dévier 
du pattern architectural établi.

CONTRAINTES ABSOLUES DU PROJET :
- TypeScript strict (noImplicitAny, strictNullChecks) — zéro `any`
- Rôles lus depuis `app_metadata` UNIQUEMENT (jamais `user_metadata`)
- Toutes les mutations passent par `assertAuthenticated()` + `assertRole()` + 
  `assertTenantAccess()` depuis `lib/security/assert-access.ts`
- Rate limiting obligatoire sur tout endpoint public (Upstash Redis + fallback 
  in-memory)
- Validation Zod sur TOUTES les entrées (body, query params, path params, 
  webhook payloads)
- RLS activé sur toutes les nouvelles tables — policies TOUJOURS basées sur 
  `get_accessible_cooperative_ids()` pour le multi-tenant
- Webhook : secret obligatoire + `timingSafeEqual` (crypto) + validation payload
- Pas de `console.log` en production → utiliser `lib/utils/logger.ts`
- Gestion des erreurs : jamais exposer de stack trace au client
- Tous les nouveaux endpoints : pattern `/api/[module]/route.ts` avec 
  export `GET | POST | PATCH | DELETE`
- Stack : Next.js 16, React 19, TypeScript, shadcn/ui (new-york), 
  Tailwind v4, Supabase JS v2, Zod v3

  ==========================================================================
MISSION : Intégration complète KoboCollect → FaîtiereHub
Module : /dashboard/integrations/kobo + pipeline de données terrain
==========================================================================

Tu vas construire l'intégration KoboCollect de A à Z pour FaîtiereHub.
L'intégration existe partiellement. Tu dois la compléter, sécuriser et 
industrialiser selon les specs ci-dessous.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARTIE 1 — XLSForm professionnel (KoboCollect)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Génère un XLSForm complet (.xlsx) avec les 3 feuilles (survey, choices, 
settings) pour la collecte terrain d'un membre agriculteur FENOMAT/Togo.

SECTIONS REQUISES (8 sections, numérotées avec `begin_group`) :

[S1] IDENTIFICATION MEMBRE
  - member_card_number : text, constraint regex [A-Z]{3}-[0-9]{6}, 
    required, hint "Ex: FEN-001234"
  - card_verified : calculate, calcul = pulldata() ou note si offline
  - photo_membre : image, appearance="front", required=false

[S2] LOCALISATION GPS
  - gps_point : geopoint, required, accuracy < 30m
  - region : select_one regions (liste depuis choices)
  - prefecture : select_one prefectures, choice_filter = region=${region}
  - canton : select_one cantons, choice_filter = prefecture=${prefecture}
  - village : text

[S3] PROFIL EXPLOITATION
  - superficie_totale : decimal, constraint ". > 0 and . < 1000", unit=ha
  - mode_faire_valoir : select_one [proprietaire, locataire, metayage, 
    pret, collectif]
  - source_eau : select_multiple [pluie, puits, forage, riviere, 
    irrigation, marigot]
  - equipements : select_multiple [tracteur, motopompe, pulverisateur, 
    charrue_animale, houe, machette, arrosoir]

[S4] CULTURES (repeat_group, max 10 occurrences)
  - culture_nom : select_one cultures_list
  - superficie_culture : decimal, required
  - saison_principale : select_one [saison_seche, saison_pluies, 
    toute_annee]
  - semences_type : select_one [locale, amelioree, hybride, inconnue]
  - utilisation_engrais : select_one yes_no
  - type_engrais : text, relevant="${utilisation_engrais} = 'oui'"

[S5] PRODUCTION DERNIERE CAMPAGNE (repeat_group lié aux cultures)
  - campagne_annee : integer, constraint ". >= 2020 and . <= 2026"
  - rendement_kg : decimal, required
  - prix_vente_moyen : decimal (FCFA/kg)
  - canal_vente : select_multiple [bord_champ, marche_local, 
    collecteur, cooperative, export]
  - pertes_post_recolte_pct : integer, constraint ". >= 0 and . < 100"

[S6] INTRANTS & DÉPENSES
  - depenses_semences_fcfa : integer
  - depenses_engrais_fcfa : integer  
  - depenses_pesticides_fcfa : integer
  - depenses_main_oeuvre_fcfa : integer
  - acces_credit_agricole : select_one yes_no
  - source_credit : text, relevant="${acces_credit_agricole} = 'oui'"

[S7] BESOINS & FORMATIONS
  - besoins_formations : select_multiple [irrigation, fertilisation, 
    phytosanitaire, post_recolte, commercialisation, numerique, 
    gestion_exploitation]
  - interet_groupement : select_one yes_no
  - acces_telephone : select_one [aucun, basique, smartphone]
  - operateur_mobile : select_one [togocel, moov, autre, aucun]

[S8] VALIDATION & SIGNATURE
  - enqueteur_nom : text, required
  - enqueteur_id : text (ID agent de collecte)
  - date_enquete : date, default=today()
  - observations : text, appearance="multiline"
  - consentement : select_one yes_no, required, 
    constraint ". = 'oui'", constraint_message "Consentement obligatoire"

CHOICES requises :
  - regions : toutes les régions du Togo (Maritime, Plateaux, Centrale, 
    Kara, Savanes)
  - prefectures : avec choice_filter par région (au moins 5 par région)
  - cantons : avec choice_filter par préfecture
  - cultures_list : 20+ cultures maraîchères/vivrières courantes au Togo
    (tomate, piment, gombo, oignon, aubergine, chou, laitue, carotte, 
    haricot_vert, maïs, manioc, igname, soja, arachide, sésame, 
    coton, riz, patate_douce, banane_plantain, ananas)
  - yes_no : oui/non en français

SETTINGS :
  - form_title: "Fiche Membre FENOMAT - Collecte Terrain"
  - form_id: "fenomat_membre_v3"
  - version: "2026050100" (format YYYYMMDDVV)
  - instance_name: concat(${member_card_number}, '_', ${date_enquete})
  - default_language: Français

CALCULS automatiques à inclure :
  - revenu_brut_total : sum de tous les (rendement_kg × prix_vente_moyen)
  - marge_nette_estimee : revenu_brut_total - sum(dépenses)
  - score_exploitation : calcul composite (0-100) basé sur superficie, 
    nb cultures, équipements, formations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARTIE 2 — Schéma SQL Supabase (migration)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Génère une migration SQL complète nommée : 
`20260524_kobo_integration_v2.sql`

NOUVELLES TABLES (avec RLS complet) :

-- 1. kobo_submissions
CREATE TABLE kobo_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cooperative_id uuid NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  kobo_instance_id text UNIQUE NOT NULL,  -- _uuid de Kobo
  kobo_form_id text NOT NULL,
  raw_payload jsonb NOT NULL,
  processed_payload jsonb,
  member_card_number text,
  status text NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending','processing','matched','unmatched',
                      'error','duplicate')),
  error_message text,
  matched_at timestamptz,
  processed_at timestamptz,
  submitted_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
-- index : cooperative_id, member_id, status, kobo_instance_id, 
--         submitted_at, member_card_number

-- 2. kobo_sync_logs (audit des syncs)
CREATE TABLE kobo_sync_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cooperative_id uuid NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES integrations(id) ON DELETE SET NULL,
  sync_type text NOT NULL CHECK (sync_type IN ('webhook','pull','manual')),
  status text NOT NULL CHECK (status IN ('started','success','partial',
                                          'failed')),
  submissions_received integer DEFAULT 0,
  submissions_processed integer DEFAULT 0,
  submissions_matched integer DEFAULT 0,
  submissions_errors integer DEFAULT 0,
  duration_ms integer,
  error_details jsonb,
  triggered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

-- 3. kobo_field_mappings (mapping flexible JSON → colonnes membres)
CREATE TABLE kobo_field_mappings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cooperative_id uuid NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  form_id text NOT NULL,
  kobo_field text NOT NULL,      -- ex: "S1/member_card_number"
  target_table text NOT NULL,    -- ex: "members", "parcelles", "productions"
  target_column text NOT NULL,   -- ex: "card_number"
  transform_fn text,             -- ex: "uppercase", "trim", "to_number"
  is_key_field boolean DEFAULT false,  -- utilisé pour matching
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(cooperative_id, form_id, kobo_field)
);

RLS POLICIES à générer pour chaque table :
  - SELECT : `get_accessible_cooperative_ids()` (comme toutes les tables)
  - INSERT : cooperative_admin uniquement (via service_role pour webhook)
  - UPDATE : cooperative_admin uniquement sur ses données
  - DELETE : faitiere_admin ou super_admin uniquement

FONCTIONS SQL :
  -- match_kobo_submission_to_member(submission_id uuid) → void
  --   Tente de matcher par card_number → member_id
  --   Met à jour status → 'matched' ou 'unmatched'
  --   SECURITY DEFINER, search_path = ''

  -- process_kobo_submission(submission_id uuid) → jsonb
  --   Extrait les champs du raw_payload selon kobo_field_mappings
  --   Upsert dans parcelles + productions si données présentes
  --   Retourne {success, matched, inserted_parcelles, inserted_productions}
  --   SECURITY DEFINER, search_path = ''

  -- get_kobo_stats(p_cooperative_id uuid) → jsonb
  --   Retourne {total, pending, matched, unmatched, errors, last_sync}
  --   Guard : assertTenantAccess() via check cooperative_id
  --   SECURITY DEFINER, search_path = ''

TRIGGERS :
  - updated_at trigger sur kobo_submissions (comme les autres tables)
  - after INSERT on kobo_submissions → notify channel 'kobo_new_submission'
    (pour Supabase Realtime futur)

pg_cron :
  - Purge kobo_submissions status='error' older than 90 days (hebdo)
  - Purge kobo_sync_logs older than 180 days (mensuel)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARTIE 3 — Webhook KoboToolbox (Next.js App Router)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fichier : `app/api/webhooks/kobo/route.ts`

PIPELINE EXACT à implémenter (dans l'ordre) :

1. VALIDATION ENTRÉE
   - Method guard : POST only → 405 sinon
   - Content-Type : application/json obligatoire → 415 sinon
   - Size check : payload ≤ 2MB → 413 sinon
   - Rate limiting : 100 req/min/IP (Upstash + fallback)

2. AUTHENTIFICATION WEBHOOK
   - Header : `X-KoboToolbox-Signature` (HMAC-SHA256)
   - Alternative : `Authorization: Bearer ${KOBO_WEBHOOK_SECRET}`
   - Validation timing-safe via `crypto.timingSafeEqual`
   - Secret manquant → 403 (jamais bypass)
   - Log la tentative si signature invalide (sans détails)

3. PARSING & VALIDATION ZOD
```typescript
   const KoboWebhookPayloadSchema = z.object({
     _uuid: z.string().uuid(),
     _id: z.number().int(),
     _xform_id_string: z.string(),
     _submission_time: z.string().datetime(),
     _submitted_by: z.string().optional(),
     formhub: z.object({ uuid: z.string() }).optional(),
     // Sections du formulaire (clés dynamiques tolérées via passthrough)
   }).passthrough()
```

4. RÉSOLUTION DU TENANT
   - Extraire `_xform_id_string` → lookup dans `integrations` table
   - `SELECT cooperative_id FROM integrations WHERE kobo_form_id = $1 
     AND type = 'kobo' AND active = true`
   - Si non trouvé → 404 avec message générique (pas de détail)

5. DÉDUPLICATION
   - Check `kobo_instance_id = _uuid` dans `kobo_submissions`
   - Si doublon → 200 + `{status: "duplicate", message: "Already processed"}`
   - Ne pas reprocesser, ne pas erreur

6. INSERTION INITIALE
   - Insert dans `kobo_submissions` via service_role
   - status = 'pending', raw_payload = payload complet
   - Extraire member_card_number depuis payload (field mapping configurable)

7. PROCESSING ASYNCHRONE (fire-and-forget avec error handling)
   - Appel `match_kobo_submission_to_member(submission_id)`
   - Si member trouvé → appel `process_kobo_submission(submission_id)`
   - Update `kobo_sync_logs` avec résultats
   - Si erreur → update status = 'error', log via Sentry
   - Tout dans try/catch → ne jamais faire planter le 200

8. RÉPONSE
   - Toujours 200 si authentification OK (Kobo abandonne les retries sur 
     non-200 après quelques essais)
   - Body : `{received: true, submission_id: uuid, status: string}`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARTIE 4 — Service de sync manuelle (pull KoboToolbox API)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fichier : `lib/kobo/sync-service.ts`

Classe `KoboSyncService` avec méthodes :

```typescript
class KoboSyncService {
  // Pull paginated depuis KoboToolbox API v2
  // GET https://kf.kobotoolbox.org/api/v2/assets/{formId}/data/
  // Params : ?format=json&limit=100&start={offset}&_submission_time__gt={since}
  async pullSubmissions(options: {
    cooperativeId: string
    formId: string
    apiToken: string  // chiffré AES-256-GCM en DB, déchiffré ici
    since?: Date      // date dernier sync pour pull incrémental
    onProgress?: (current: number, total: number) => void
  }): Promise<SyncResult>

  // Retry queue : reprocesse les submissions en erreur
  // Utilise kobo_sync_queue avec exponential backoff existant
  async retryFailedSubmissions(cooperativeId: string): Promise<RetryResult>

  // Validation de connexion KoboToolbox
  async testConnection(apiToken: string, formId: string): Promise<{
    valid: boolean
    formTitle?: string
    submissionCount?: number
    error?: string
  }>

  // Récupère la structure du formulaire (pour mapping UI)
  async getFormStructure(apiToken: string, formId: string): Promise<{
    fields: KoboField[]
    groups: KoboGroup[]
  }>
}

// Types stricts
interface SyncResult {
  success: boolean
  syncLogId: string
  received: number
  processed: number
  matched: number
  unmatched: number
  errors: number
  duration: number
  errorDetails?: Array<{instanceId: string; error: string}>
}

// Gestion erreurs réseau avec retry (3 tentatives, backoff exponentiel)
// Timeout 30s par requête KoboToolbox
// Chunking : traitement par batches de 50 soumissions
```

Fichier : `app/api/integrations/kobo/sync/route.ts`

- POST handler, `assertAuthenticated()` + `assertRole(['cooperative_admin', 
  'faitiere_admin', 'super_admin'])` + `assertTenantAccess(cooperativeId)`
- Body : `{cooperativeId: uuid, mode: 'full' | 'incremental'}`
- Rate limiting : 5 req/min/user (anti-spam sync manuelle)
- Timeout Vercel 60s (déclaré via `export const maxDuration = 60`)
- Response streaming optionnelle (Server-Sent Events) pour progress bar
- Log dans `kobo_sync_logs`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARTIE 5 — API configuration Kobo (CRUD sécurisé)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fichier : `app/api/integrations/kobo/route.ts`

ENDPOINTS :

GET /api/integrations/kobo?cooperativeId={uuid}
  - Retourne la config Kobo du tenant (token masqué : "••••••••{last4}")
  - assertTenantAccess() obligatoire

POST /api/integrations/kobo
  - Crée/update la config KoboToolbox
  - Body Zod schema :
```typescript
    const KoboConfigSchema = z.object({
      cooperativeId: z.string().uuid(),
      apiToken: z.string().min(40).max(200),  // chiffré avant stockage
      formId: z.string().min(5).max(100),
      webhookEnabled: z.boolean().default(true),
      fieldMappings: z.array(z.object({
        koboField: z.string(),
        targetTable: z.enum(['members','parcelles','productions','cotisations']),
        targetColumn: z.string(),
        transformFn: z.enum(['uppercase','trim','to_number','to_date'])
                      .optional(),
        isKeyField: z.boolean().default(false)
      })).optional()
    })
```
  - Chiffrement AES-256-GCM du apiToken avant INSERT (réutiliser 
    `lib/utils/crypto.ts` existant)
  - Test connexion KoboToolbox avant sauvegarde
  - assertFaitiereAccess() (seules les faîtières configurent l'intégration)

DELETE /api/integrations/kobo?cooperativeId={uuid}
  - Soft delete (active = false)
  - assertFaitiereAccess()

GET /api/integrations/kobo/stats?cooperativeId={uuid}
  - Appel RPC `get_kobo_stats(cooperativeId)`
  - Cache 60s (headers Cache-Control)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARTIE 6 — Dashboard UI (React / Next.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fichier : `app/dashboard/integrations/kobo/page.tsx`

UI COMPLÈTE avec les onglets suivants (shadcn/ui Tabs) :

[ONGLET 1] Configuration
  - Card "Connexion KoboToolbox"
    - Input : API Token (masked, révélable via eye icon)
    - Input : Form ID  
    - Button "Tester la connexion" → spinner → badge vert/rouge
    - Si valide : affiche formTitle + submissionCount
    - Switch "Webhook actif"
    - URL du webhook (copiable) : `https://www.faitierehub.com/api/webhooks/kobo`
    - Secret webhook (copiable, masqué)
  - Card "Mapping des champs" (expandable)
    - Tableau des mappings existants (koboField → target)
    - Add/Edit/Delete rows inline
    - Champ "Champ clé" (celui utilisé pour matcher le membre)

[ONGLET 2] Synchronisation
  - Card stats temps réel (auto-refresh 30s via `use-kobo-stats.ts`)
    - Total soumissions / Matchées / Non matchées / Erreurs
    - Dernière sync : date relative
    - Barre de progression visuelle (matched/total)
  - Button "Synchroniser maintenant" 
    - Dropdown : "Sync complète" vs "Sync incrémentale (depuis dernier sync)"
    - Progress bar SSE pendant la sync
    - Toast résultat : "127 soumissions, 119 matchées, 8 non matchées"
  - Button "Retenter les erreurs" (si erreurs > 0)

[ONGLET 3] Soumissions récentes
  - Tableau paginé (25/page, server-side) des `kobo_submissions`
  - Colonnes : Date, Numéro carte, Statut (badge coloré), Membre matchée, 
    Actions
  - Filtres : statut, date range, search card_number
  - Badge statuts : pending=gris, matched=vert, unmatched=orange, 
    error=rouge, duplicate=bleu
  - Row click → Dialog avec payload JSON complet (formatted)
  - Button "Retry" sur les erreurs individuelles

[ONGLET 4] Guide de configuration
  - Stepper (Steps 1-6) :
    1. Créer un compte KoboToolbox (lien)
    2. Importer le XLSForm FENOMAT
    3. Copier le Form ID
    4. Générer un API Token (lien direct KoboToolbox settings)
    5. Configurer le webhook dans KoboToolbox
    6. Tester avec KoboCollect sur mobile
  - Download button : télécharger le XLSForm pré-configuré
  - QR Code de l'URL du formulaire pour installation sur mobile
    (librairie : `qrcode.react`)

HOOKS à créer :
  `hooks/use-kobo-stats.ts` — polling 30s, retourne stats + lastSync
  `hooks/use-kobo-sync.ts` — SSE consumer pour progress, expose 
    {isSyncing, progress, result, startSync, cancelSync}
  `hooks/use-kobo-submissions.ts` — pagination serveur, filtres, 
    useCallback stable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARTIE 7 — SSE endpoint pour progress sync
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fichier : `app/api/integrations/kobo/sync/progress/route.ts`

GET handler → Server-Sent Events
  - Headers : Content-Type: text/event-stream, Cache-Control: no-cache
  - Auth : assertAuthenticated() + assertTenantAccess()
  - Param : ?syncLogId={uuid}
  - Poll `kobo_sync_logs` toutes les 500ms
  - Events SSE :
    - `data: {"type":"progress","current":45,"total":127,"status":"processing"}`
    - `data: {"type":"complete","result":{...SyncResult}}`
    - `data: {"type":"error","message":"..."}`
  - Close connection sur complete/error ou timeout 120s
  - export const dynamic = 'force-dynamic'
  - export const maxDuration = 120

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARTIE 8 — Script pre-deploy security check (extension)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Étendre `scripts/pre-deploy-security-check.ts` avec ces vérifications 
supplémentaires pour le module Kobo :

  CHECK_12 : KOBO_WEBHOOK_SECRET présent ET longueur >= 32 chars
  CHECK_13 : Webhook handler contient 'timingSafeEqual'
  CHECK_14 : Webhook payload Zod schema présent
  CHECK_15 : Aucune clé API KoboToolbox en dur dans le code 
             (grep pour patterns "Token [a-f0-9]{40}")
  CHECK_16 : kobo_submissions table a RLS activé 
             (vérification via Supabase service_role query)
  CHECK_17 : kobo_field_mappings a RLS activé
  CHECK_18 : Sync route a maxDuration exporté

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORDRE DE GÉNÉRATION DES FICHIERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Génère dans cet ordre EXACT (chaque fichier complet, pas de placeholder) :

1. [SQL]  supabase/migrations/20260524_kobo_integration_v2.sql
2. [TS]   lib/kobo/types.ts            (tous les types KoboSubmission, etc.)
3. [TS]   lib/kobo/sync-service.ts     (KoboSyncService class)
4. [TS]   lib/validators/kobo.ts       (tous les Zod schemas Kobo)
5. [TS]   app/api/webhooks/kobo/route.ts
6. [TS]   app/api/integrations/kobo/route.ts
7. [TS]   app/api/integrations/kobo/sync/route.ts
8. [TS]   app/api/integrations/kobo/sync/progress/route.ts
9. [TS]   hooks/use-kobo-stats.ts
10. [TS]  hooks/use-kobo-sync.ts
11. [TS]  hooks/use-kobo-submissions.ts
12. [TSX] app/dashboard/integrations/kobo/page.tsx
13. [TSX] components/dashboard/KoboConfigForm.tsx
14. [TSX] components/dashboard/KoboSubmissionsTable.tsx
15. [TSX] components/dashboard/KoboSyncPanel.tsx
16. [TS]  scripts/pre-deploy-security-check.ts (diff/extension uniquement)
17. [XLSX] docs/kobo/fenomat_membre_v3_xlsform.xlsx 
           (ou CSV si XLSX impossible, 3 feuilles)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRAINTES DE QUALITÉ FINALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Chaque fichier TypeScript : zero erreur `npm run typecheck`
- Chaque endpoint : minimum 3 tests décrits en commentaires JSDoc 
  (happy path, auth failure, validation failure)
- SQL : toutes les fonctions SECURITY DEFINER ont `search_path = ''`
- Pas de `fetch()` direct côté client vers KoboToolbox (tout via proxy API)
- Le token API Kobo ne quitte JAMAIS le serveur (jamais dans la réponse 
  client, même masqué partiellement)
- Toutes les erreurs Sentry capturées avec context : 
  `{cooperativeId, submissionId, formId}`
- Responsive mobile (shadcn/ui, Tailwind v4) — le dashboard Kobo est 
  utilisable sur tablette de terrain

==========================================================================
FIN DU PROMPT
==========================================================================