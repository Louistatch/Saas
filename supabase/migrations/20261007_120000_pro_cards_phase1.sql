-- ─────────────────────────────────────────────────────────────────────────────
-- Cartes professionnelles — Phase 1
--
-- 1. Nouveau périmètre de mandat 'professionals.validate' : un Opérateur
--    officier (Partenaire certifié) dont le mandat sur une faîtière porte ce
--    périmètre valide/rejette les professionnels rattachés à cette faîtière.
--    has_partner_org_access() ne gère PAS de hiérarchie (a.cooperative_id =
--    target_coop strict) : le mandat vaut pour la faîtière elle-même, pas pour
--    ses unions/coopératives filles.
-- 2. Rattachement et traçabilité de la validation sur haroo_agronome_profiles.
-- 3. Cycle de vie des cartes (suspension / révocation) et jeton de
--    vérification opaque sur member_cards. Le jeton est généré côté serveur
--    (lib/professionals/verify-token.ts) à l'émission ou au renouvellement ;
--    aucun backfill ici : les cartes existantes gardent leur QR
--    /verify/<NUMERO>, qui continue de fonctionner.
--
-- Migration ADDITIVE et idempotente : aucune donnée existante n'est modifiée.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Périmètre de mandat ───────────────────────────────────────────────────
-- NB : un label d'enum Postgres ne peut pas être supprimé. Le DOWN ne retire
-- que les lignes de périmètre, le label reste (inutilisé).
ALTER TYPE public.partner_access_scope ADD VALUE IF NOT EXISTS 'professionals.validate';

-- ── 2. Profils agronomes : faîtière et traçabilité de la décision ───────────
ALTER TABLE public.haroo_agronome_profiles
  ADD COLUMN IF NOT EXISTS faitiere_id uuid NULL
    REFERENCES public.cooperatives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_by uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL;

CREATE INDEX IF NOT EXISTS idx_haroo_agronome_faitiere_statut
  ON public.haroo_agronome_profiles (faitiere_id, statut_validation);

COMMENT ON COLUMN public.haroo_agronome_profiles.faitiere_id IS
  'Faîtière de rattachement : détermine quel Opérateur officier (mandat + périmètre professionals.validate) peut valider le dossier. NULL = seul le super_admin valide.';

-- Le titulaire ne peut ni s'auto-valider ni effacer la trace de la décision.
-- Il peut choisir sa faîtière tant que le dossier n'est pas validé (sinon il
-- pourrait changer de juridiction après coup). Même corps que
-- 20261003_150000_haroo_stats_trigger_depth.sql, complété.
CREATE OR REPLACE FUNCTION public.protect_haroo_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  new.user_id        := old.user_id;
  new.card_number    := old.card_number;
  new.member_card_id := old.member_card_id;

  if tg_table_name = 'haroo_ouvrier_profiles' then
    new.note_moyenne := old.note_moyenne;
    new.nombre_avis  := old.nombre_avis;
  elsif tg_table_name = 'haroo_agronome_profiles' then
    if pg_trigger_depth() <= 1 then
      new.note_moyenne    := old.note_moyenne;
      new.nombre_missions := old.nombre_missions;
    end if;
    new.badge_valide      := old.badge_valide;
    new.statut_validation := old.statut_validation;
    new.validated_by      := old.validated_by;
    new.validated_at      := old.validated_at;
    new.rejection_reason  := old.rejection_reason;
    if old.statut_validation = 'VALIDE' then
      new.faitiere_id := old.faitiere_id;
    end if;
  end if;

  return new;
end;
$function$;

-- ── 3. Cartes : jeton opaque et cycle de vie ─────────────────────────────────
ALTER TABLE public.member_cards
  ADD COLUMN IF NOT EXISTS verify_token text NULL,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS revoked_reason text NULL,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS member_cards_verify_token_key
  ON public.member_cards (verify_token)
  WHERE verify_token IS NOT NULL;

-- Statuts : l'existant ('active','pending','expired','revoked') + 'suspended'.
-- On remplace toute contrainte CHECK portant sur status par une version nommée.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.member_cards'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
      AND con.conname <> 'member_cards_status_check_v2'
  LOOP
    EXECUTE format('ALTER TABLE public.member_cards DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.member_cards'::regclass
      AND conname = 'member_cards_status_check_v2'
  ) THEN
    ALTER TABLE public.member_cards ADD CONSTRAINT member_cards_status_check_v2
      CHECK (status IN ('active', 'pending', 'expired', 'revoked', 'suspended'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (manuel — pas de dossier down/ dans ce dépôt)
-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE FROM public.partner_assignment_scopes WHERE scope = 'professionals.validate';
-- -- le label d'enum 'professionals.validate' ne peut pas être supprimé.
-- UPDATE public.member_cards SET status = 'revoked' WHERE status = 'suspended';
-- ALTER TABLE public.member_cards DROP CONSTRAINT IF EXISTS member_cards_status_check_v2;
-- ALTER TABLE public.member_cards ADD CONSTRAINT member_cards_status_check
--   CHECK (status IN ('active', 'pending', 'expired', 'revoked'));
-- DROP INDEX IF EXISTS public.member_cards_verify_token_key;
-- ALTER TABLE public.member_cards
--   DROP COLUMN IF EXISTS verify_token, DROP COLUMN IF EXISTS revoked_at,
--   DROP COLUMN IF EXISTS revoked_reason, DROP COLUMN IF EXISTS suspended_at;
-- DROP INDEX IF EXISTS public.idx_haroo_agronome_faitiere_statut;
-- -- puis ré-appliquer protect_haroo_privileges() de 20261003_150000 AVANT de
-- -- supprimer les colonnes qu'il référence :
-- ALTER TABLE public.haroo_agronome_profiles
--   DROP COLUMN IF EXISTS faitiere_id, DROP COLUMN IF EXISTS validated_by,
--   DROP COLUMN IF EXISTS validated_at, DROP COLUMN IF EXISTS rejection_reason;
