-- Kobo — sécurité de integrations.config et cohérence des statuts.
--
-- MIGRATION ADDITIVE, NON APPLIQUÉE : à relire puis appliquer par l'équipe.
-- Le code de l'application fonctionne AVANT comme APRÈS cette migration :
--   * toutes les routes /api/integrations/kobo* et le webhook lisent/écrivent
--     integrations.config avec le client service_role (admin), après leurs contrôles
--     d'accès — le rôle `authenticated` n'en a plus besoin ;
--   * le trigger de mise à jour, l'index et le CHECK ci-dessous n'ont aucun effet sur le
--     code tant qu'ils ne sont pas appliqués ; le code n'écrit aucune colonne nouvelle.
--
-- ── kobo-04 · integrations.config exposé et réécrivable par PostgREST ─────────────────
-- La policy `integrations_admin_all` (20261004_100000_audit_critical_rls.sql) donne à TOUT
-- cooperative_admin de la hiérarchie, coopérative de base comprise, la lecture ET l'écriture
-- de la ligne entière : token Kobo chiffré, form_id (qu'il pouvait réécrire pour détourner
-- les soumissions d'une autre coopérative), statut. La règle « faîtière seulement » et le test
-- de connexion n'existaient que dans les routes API.
--
-- Colonnes lisibles par les rôles de l'API : tout sauf `config`.
REVOKE ALL ON public.integrations FROM anon;
REVOKE SELECT ON public.integrations FROM authenticated;
GRANT SELECT (id, cooperative_id, type, status, last_sync_at, created_at, updated_at)
  ON public.integrations TO authenticated;

COMMENT ON COLUMN public.integrations.config IS
  'Secrets d''intégration (token chiffré, hash du secret de webhook…). Lecture/écriture réservées au service_role.';

-- PRÉREQUIS À L'APPLICATION : le bouton « Déconnecter » de /dashboard/integrations
-- (app/dashboard/integrations/page.tsx, handleToggle) fait un UPSERT PostgREST
-- (`ON CONFLICT … SET config = EXCLUDED.config`), qui exige le privilège SELECT sur `config`
-- retiré ci-dessus : il échouera avec « permission denied ». Il doit appeler
-- `DELETE /api/integrations/kobo?cooperativeId=…` (ou, au minimum, un UPDATE simple) AVANT
-- d'appliquer cette migration. KoboConfigForm propose désormais ce bouton « Déconnecter ».
--
-- Écritures depuis le navigateur (anon/authenticated) : sur une intégration Kobo, seule la
-- DÉCONNEXION par UPDATE simple reste possible (statut « disconnected » + config vidée).
-- Connexion, config, form_id, statut et last_sync_at passent obligatoirement par l'API
-- (service_role, current_user = 'service_role'). Vérifié sur un PostgreSQL 16 jetable.
CREATE OR REPLACE FUNCTION public.guard_kobo_integration_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- service_role, propriétaire (migrations) et fonctions SECURITY DEFINER : non concernés.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.type, OLD.type) <> 'kobo' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'connected' OR NEW.config <> '{}'::jsonb OR NEW.last_sync_at IS NOT NULL THEN
      RAISE EXCEPTION 'kobo_integration_api_only: la configuration Kobo passe par /api/integrations/kobo'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.cooperative_id IS DISTINCT FROM OLD.cooperative_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.last_sync_at IS DISTINCT FROM OLD.last_sync_at
     OR (NEW.config IS DISTINCT FROM OLD.config AND NEW.config <> '{}'::jsonb)
     OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'disconnected')
  THEN
    RAISE EXCEPTION 'kobo_integration_api_only: la configuration Kobo passe par /api/integrations/kobo'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_integrations_guard_kobo ON public.integrations;
CREATE TRIGGER trg_integrations_guard_kobo
  BEFORE INSERT OR UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.guard_kobo_integration_writes();

-- ── kobo-35 · integrations.updated_at figé (aucun trigger) ───────────────────────────
CREATE OR REPLACE FUNCTION public.touch_integrations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Nom > « trg_integrations_guard_kobo » : le garde s'exécute en premier (ordre alphabétique).
DROP TRIGGER IF EXISTS trg_integrations_touch_updated_at ON public.integrations;
CREATE TRIGGER trg_integrations_touch_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_integrations_updated_at();

-- ── kobo-37 · vocabulaire de statuts sans source de vérité ───────────────────────────
-- La base de production n'a aucun CHECK sur kobo_submissions.status (la migration 20260524
-- en déclarait un qui n'a jamais été appliqué). Ensemble partagé avec le type TS
-- (KOBO_SUBMISSION_STATUSES), le validateur Zod, l'interface et get_kobo_stats.
-- NOT VALID : n'examine pas les lignes existantes, ne bloque que les nouvelles écritures.
ALTER TABLE public.kobo_submissions DROP CONSTRAINT IF EXISTS kobo_submissions_status_check;
ALTER TABLE public.kobo_submissions
  ADD CONSTRAINT kobo_submissions_status_check
  CHECK (status IN ('pending', 'processing', 'matched', 'unmatched', 'error', 'duplicate'))
  NOT VALID;
-- Après avoir vérifié qu'aucune ligne héritée n'a un autre statut :
--   ALTER TABLE public.kobo_submissions VALIDATE CONSTRAINT kobo_submissions_status_check;

-- ── kobo-15 · journal de sync : curseur de reprise ────────────────────────────────────
-- kobo_sync_logs.details existe en production (ajoutée hors dépôt) mais pas dans les migrations
-- versionnées : on la déclare ici, sans effet là où elle existe déjà. Le code retombe sur un
-- UPDATE sans `details` si la colonne est absente.
ALTER TABLE public.kobo_sync_logs ADD COLUMN IF NOT EXISTS details jsonb;

-- ── kobo-18 · file de relance : tri par dernière tentative ───────────────────────────
-- retryFailedSubmissions() lit par (cooperative_id, status) triés par updated_at ; une ligne
-- qui échoue est replacée en fin de file (updated_at), les échecs permanents n'affament plus
-- les plus récentes.
CREATE INDEX IF NOT EXISTS idx_kobo_submissions_coop_status_updated
  ON public.kobo_submissions (cooperative_id, status, updated_at);
