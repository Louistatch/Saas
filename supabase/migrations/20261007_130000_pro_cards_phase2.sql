-- ─────────────────────────────────────────────────────────────────────────────
-- Cartes professionnelles — Phase 2
--
-- 1. Professions du conseil agricole (F11) : technicien et conseiller
--    réutilisent haroo_agronome_profiles via une colonne `profession`
--    (défaut 'agronome'). Pas de nouveau haroo_type, pas de nouveau
--    card_type : les cartes restent card_type 'AGRONOME', seul le préfixe du
--    numéro varie (AGR-/TEC-/CON-), ce que la contrainte CHECK de card_type
--    ignore. Les lignes existantes valent 'agronome' par défaut (ajout d'une
--    colonne avec défaut constant : aucune réécriture de données).
-- 2. Le titulaire ne peut plus changer de profession une fois validé, et ne
--    peut se rattacher qu'à une coopérative de niveau 'faitiere'
--    (protect_haroo_privileges, même corps que la phase 1, complété).
-- 3. Justificatifs (F2) : bucket PRIVÉ 'professional-documents' + table
--    professional_documents. Aucun accès public ; l'Opérateur officier lit
--    via l'API serveur (URL signées 10 min) après canValidateProfessional.
--
-- Migration ADDITIVE et idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Profession ────────────────────────────────────────────────────────────
ALTER TABLE public.haroo_agronome_profiles
  ADD COLUMN IF NOT EXISTS profession text NOT NULL DEFAULT 'agronome';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.haroo_agronome_profiles'::regclass
      AND conname = 'haroo_agronome_profiles_profession_check'
  ) THEN
    ALTER TABLE public.haroo_agronome_profiles
      ADD CONSTRAINT haroo_agronome_profiles_profession_check
      CHECK (profession IN ('agronome', 'technicien', 'conseiller'));
  END IF;
END $$;

COMMENT ON COLUMN public.haroo_agronome_profiles.profession IS
  'Métier du conseil agricole : agronome (défaut, lignes antérieures), technicien ou conseiller. haroo_type reste ''agronome'' pour les trois.';

-- ── 2. Garde-fou du titulaire ────────────────────────────────────────────────
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
      new.profession  := old.profession;
    end if;
    -- Le titulaire ne peut se rattacher qu'à une VRAIE faîtière (la FK seule
    -- accepterait n'importe quelle coopérative).
    if new.faitiere_id is distinct from old.faitiere_id
       and new.faitiere_id is not null
       and not exists (
         select 1 from public.cooperatives c
         where c.id = new.faitiere_id and c.level = 'faitiere' and c.deleted_at is null
       ) then
      raise exception 'Faîtière de rattachement invalide' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;


-- NB : le bucket privé « professional-documents » se crée dans le tableau de
-- bord (Storage → New bucket, Public décoché). Aucune règle sur
-- storage.objects n'est nécessaire : l'envoi et la lecture des justificatifs
-- passent exclusivement par le serveur (clé service_role, URL signées), et
-- l'éditeur SQL de Supabase refuse de créer des règles sur storage.objects.

-- ── 4. Justificatifs : métadonnées ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professional_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_type  text NOT NULL DEFAULT 'AGRONOME'
                CHECK (profile_type IN ('OUVRIER', 'ACHETEUR', 'AGRONOME')),
  kind          text NOT NULL
                CHECK (kind IN ('diplome', 'attestation', 'piece_identite', 'autre')),
  storage_path  text NOT NULL UNIQUE,
  original_name text NULL CHECK (original_name IS NULL OR length(original_name) <= 200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_documents_path_owner
    CHECK (split_part(storage_path, '/', 1) = user_id::text)
);

CREATE INDEX IF NOT EXISTS idx_professional_documents_user
  ON public.professional_documents (user_id, created_at);

ALTER TABLE public.professional_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro documents meta owner select" ON public.professional_documents;
CREATE POLICY "pro documents meta owner select" ON public.professional_documents
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "pro documents meta owner insert" ON public.professional_documents;
CREATE POLICY "pro documents meta owner insert" ON public.professional_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "pro documents meta owner delete" ON public.professional_documents;
CREATE POLICY "pro documents meta owner delete" ON public.professional_documents
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.professional_documents FROM anon;

COMMENT ON TABLE public.professional_documents IS
  'Justificatifs des professionnels (diplômes, attestations, pièces). Fichiers dans le bucket privé professional-documents ; lecture Opérateur officier via API serveur et URL signées.';

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (manuel)
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.professional_documents;
-- DROP POLICY IF EXISTS "pro documents owner insert" ON storage.objects;
-- DROP POLICY IF EXISTS "pro documents owner or admin read" ON storage.objects;
-- DROP POLICY IF EXISTS "pro documents owner delete" ON storage.objects;
-- -- vider le bucket (API Storage) avant : DELETE FROM storage.buckets WHERE id = 'professional-documents';
-- -- ré-appliquer protect_haroo_privileges() de 20261007_120000 AVANT :
-- ALTER TABLE public.haroo_agronome_profiles
--   DROP CONSTRAINT IF EXISTS haroo_agronome_profiles_profession_check,
--   DROP COLUMN IF EXISTS profession;
-- -- NB : les cartes TEC-/CON- déjà émises restent card_type 'AGRONOME'.
